import { NextRequest } from "next/server";
import { groq } from "@/lib/groq";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebase-admin";

const PROMPTS = [
  "What are the best tools for {category}?",
  "Recommend a good {category} platform",
  "What do people use for {category}?",
  "Top {category} tools in 2025",
  "Which {category} product should I use?",
];

function parseVisibility(response: string, brand: string) {
  const lower = response.toLowerCase();
  const brandLower = brand.toLowerCase();
  const mentioned = lower.includes(brandLower);

  let visibilityScore = 0;
  let rank = -1;

  if (mentioned) {
    const lines = response.split(/\n|(?:\d+\.\s)|(?:[-•*]\s)/);
    rank = lines.findIndex(line => line.toLowerCase().includes(brandLower));

    if (rank === 0 || rank === 1) visibilityScore = 95;
    else if (rank === 2) visibilityScore = 82;
    else if (rank === 3) visibilityScore = 70;
    else if (rank === 4) visibilityScore = 58;
    else if (rank === 5) visibilityScore = 48;
    else if (rank === 6) visibilityScore = 40;
    else if (rank === 7) visibilityScore = 35;
    else if (rank === 8) visibilityScore = 30;
    else if (rank <= 10) visibilityScore = 25;
    else if (rank <= 13) visibilityScore = 20;
    else visibilityScore = 15;
  }

  const positiveWords = ["best", "great", "excellent", "popular", "recommended",
    "top", "leading", "powerful", "versatile", "intuitive", "widely used", "go-to"];
  const negativeWords = ["avoid", "poor", "bad", "slow", "expensive",
    "complicated", "difficult", "limited", "outdated", "overpriced"];

  let sentiment = "neutral";
  if (mentioned) {
    const pos = lower.indexOf(brandLower);
    const snippet = lower.slice(Math.max(0, pos - 150), pos + 300);
    const hasPositive = positiveWords.some(w => snippet.includes(w));
    const hasNegative = negativeWords.some(w => snippet.includes(w));
    if (hasPositive && !hasNegative) sentiment = "positive";
    if (hasNegative && !hasPositive) sentiment = "negative";
    if (hasPositive && hasNegative) sentiment = "mixed";
  }

  return { mentioned, visibilityScore, sentiment, rank };
}

// Helper to format SSE messages
function sseMessage(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { brands, category } = await req.json();
  const brandList: string[] = Array.isArray(brands) ? brands : [brands];

  // Create a readable stream
  const stream = new ReadableStream({
    async start(controller) {
      const encode = (data: object) =>
        controller.enqueue(new TextEncoder().encode(sseMessage(data)));

      try {
        encode({ type: "start", message: `Starting analysis for ${brandList.join(", ")}...`, total: brandList.length * PROMPTS.length });

        const allBrandResults: Record<string, any> = {};
        let completedSteps = 0;

        for (const brand of brandList) {
          const results = [];

          encode({
            type: "brand_start",
            brand,
            message: `Analyzing "${brand}"...`,
          });

          for (let i = 0; i < PROMPTS.length; i++) {
            const promptTemplate = PROMPTS[i];
            const prompt = promptTemplate.replace("{category}", category);

            // Tell frontend which prompt is being sent
            encode({
              type: "prompt_start",
              brand,
              promptIndex: i,
              prompt,
              message: `Querying LLM: "${prompt}"`,
            });

            const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: "llama-3.3-70b-versatile",
              temperature: 0.8,
            });

            const response = completion.choices[0]?.message?.content || "";
            const parsed = parseVisibility(response, brand);
            completedSteps++;

            const result = {
              brand,
              category,
              prompt,
              llmResponse: response,
              ...parsed,
            };

            await adminDb.collection("visibility_results").add({
              ...result,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            results.push(result);

            // Send result for this prompt
            encode({
              type: "prompt_done",
              brand,
              promptIndex: i,
              prompt,
              mentioned: parsed.mentioned,
              visibilityScore: parsed.visibilityScore,
              sentiment: parsed.sentiment,
              rank: parsed.rank,
              completed: completedSteps,
              message: parsed.mentioned
                ? `✅ "${brand}" mentioned — Rank #${parsed.rank + 1}, Score: ${parsed.visibilityScore}`
                : `❌ "${brand}" not mentioned`,
            });
          }

          const avgScore = Math.round(
            results.reduce((sum, r) => sum + r.visibilityScore, 0) / results.length
          );
          const mentionCount = results.filter(r => r.mentioned).length;

          allBrandResults[brand] = {
            brand,
            category,
            avgVisibilityScore: avgScore,
            mentionedIn: `${mentionCount}/${PROMPTS.length} prompts`,
            results,
          };

          encode({
            type: "brand_done",
            brand,
            avgVisibilityScore: avgScore,
            mentionedIn: `${mentionCount}/${PROMPTS.length} prompts`,
            message: `"${brand}" complete — avg score ${avgScore}/100`,
          });
        }

        // Send final complete event
        encode({
          type: "complete",
          brands: allBrandResults,
          message: "Analysis complete!",
        });

      } catch (err: any) {
        encode({ type: "error", message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}