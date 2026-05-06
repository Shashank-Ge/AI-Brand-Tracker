import { NextRequest } from "next/server";
import { groq } from "@/lib/groq";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebase-admin";

// Strip leading superlatives so "top AI tools" → "AI tools" in prompts
// Avoids "Compare the top TOP AI tools platforms" type doubling
function normalizeCategory(raw: string): string {
  return raw
    .trim()
    .replace(/^(top|best|leading|popular|great|recommended)\s+/i, "");
}

// Search scenarios — each represents a real user intent
const SCENARIOS = [
  {
    label: "General recommendation",
    query: (category: string) => `What are the best ${category}?`,
  },
  {
    label: "Platform comparison",
    query: (category: string) => `Compare popular ${category} options`,
  },
  {
    label: "Beginner advice",
    query: (category: string) =>
      `I'm new to ${category}, what should I use?`,
  },
  {
    label: "Professional use case",
    query: (category: string) =>
      `What ${category} do professionals rely on?`,
  },
  {
    label: "2026 market leaders",
    query: (category: string) =>
      `Which products in the ${category} space are leading in 2026?`,
  },
];

// Build a structured scoring prompt asking the LLM directly
function buildScoringPrompt(brand: string, category: string, userQuery: string): string {
  return `You are an AI visibility analyst. A user just searched: "${userQuery}"

Evaluate how prominently the brand "${brand}" would appear in an AI assistant's response to that query in the context of "${category}".

Respond ONLY with a valid JSON object, no markdown, no explanation, exactly this shape:
{
  "mentioned": true or false,
  "rank": 1 to 10 (1 = first/most prominent mention, 10 = barely mentioned, null if not mentioned),
  "visibilityScore": 0 to 100,
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "reason": "one sentence explaining the score"
}

Scoring guide:
- 85–100: Dominant — almost always the #1 recommendation in this space
- 65–84: Strong — consistently top 3, widely trusted
- 45–64: Moderate — mentioned often but not the go-to choice
- 25–44: Weak — sometimes mentioned, easily overshadowed
- 1–24: Marginal — rarely appears, niche or outdated
- 0: Not mentioned at all in this context`;
}

// Extract and validate JSON from LLM output
function parseLLMScore(raw: string): {
  mentioned: boolean;
  visibilityScore: number;
  rank: number;
  sentiment: string;
  reason: string;
} {
  const defaults = {
    mentioned: false,
    visibilityScore: 0,
    rank: -1,
    sentiment: "neutral",
    reason: "Could not parse LLM response",
  };

  try {
    // Strip any markdown fences
    const cleaned = raw.replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(cleaned);

    const score = Math.min(100, Math.max(0, Number(parsed.visibilityScore) || 0));
    const rank = parsed.rank != null ? Number(parsed.rank) - 1 : -1; // convert to 0-indexed
    const mentioned = Boolean(parsed.mentioned) || score > 0;
    const sentiment = ["positive", "negative", "neutral", "mixed"].includes(parsed.sentiment)
      ? parsed.sentiment
      : "neutral";

    return {
      mentioned,
      visibilityScore: score,
      rank,
      sentiment,
      reason: String(parsed.reason || ""),
    };
  } catch {
    return defaults;
  }
}

// SSE helper
function sseMessage(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { brands, category } = await req.json();
  const brandList: string[] = Array.isArray(brands) ? brands : [brands];

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (data: object) =>
        controller.enqueue(new TextEncoder().encode(sseMessage(data)));

      try {
        const totalSteps = brandList.length * SCENARIOS.length;
        const cleanCategory = normalizeCategory(category);
        encode({
          type: "start",
          message: `Starting visibility analysis for: ${brandList.join(", ")}`,
          total: totalSteps,
        });

        const allBrandResults: Record<string, any> = {};
        let completedSteps = 0;

        for (const brand of brandList) {
          const results = [];

          encode({
            type: "brand_start",
            brand,
            message: `Analyzing "${brand}" across ${SCENARIOS.length} search scenarios...`,
          });

          for (let i = 0; i < SCENARIOS.length; i++) {
            const scenario = SCENARIOS[i];
            const userQuery = scenario.query(cleanCategory);
            const scoringPrompt = buildScoringPrompt(brand, cleanCategory, userQuery);

            encode({
              type: "prompt_start",
              brand,
              promptIndex: i,
              prompt: userQuery,
              message: `[${scenario.label}] Scoring "${brand}" for: "${userQuery}"`,
            });

            const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: scoringPrompt }],
              model: "llama-3.3-70b-versatile",
              temperature: 0.3, // lower = more consistent scoring
            });

            const rawResponse = completion.choices[0]?.message?.content || "";
            const parsed = parseLLMScore(rawResponse);
            completedSteps++;

            const result = {
              brand,
              category,
              prompt: userQuery,
              scenarioLabel: scenario.label,
              llmResponse: rawResponse,
              ...parsed,
            };

            await adminDb.collection("visibility_results").add({
              ...result,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            results.push(result);

            encode({
              type: "prompt_done",
              brand,
              promptIndex: i,
              prompt: userQuery,
              mentioned: parsed.mentioned,
              visibilityScore: parsed.visibilityScore,
              sentiment: parsed.sentiment,
              rank: parsed.rank,
              reason: parsed.reason,
              completed: completedSteps,
              message: parsed.mentioned
                ? `✅ "${brand}" — Score: ${parsed.visibilityScore}/100 (${scenario.label})`
                : `❌ "${brand}" not prominent — Score: 0 (${scenario.label})`,
            });
          }

          const avgScore = Math.round(
            results.reduce((sum, r) => sum + r.visibilityScore, 0) / results.length
          );
          const mentionCount = results.filter((r) => r.mentioned).length;

          allBrandResults[brand] = {
            brand,
            category,
            avgVisibilityScore: avgScore,
            mentionedIn: `${mentionCount}/${SCENARIOS.length} scenarios`,
            results,
          };

          encode({
            type: "brand_done",
            brand,
            avgVisibilityScore: avgScore,
            mentionedIn: `${mentionCount}/${SCENARIOS.length} scenarios`,
            message: `"${brand}" complete — avg score ${avgScore}/100`,
          });
        }

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
      Connection: "keep-alive",
    },
  });
}