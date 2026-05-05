import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebase-admin";

// These are the prompts that simulate real user queries
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
  let position = -1;
  let rank = -1;

  if (mentioned) {
    // Find all tools/items mentioned in the response
    // Split by common list patterns: numbered lists, bullet points, newlines
    const lines = response.split(/\n|(?:\d+\.\s)|(?:[-•*]\s)/);

    // Find which line/item the brand appears in
    rank = lines.findIndex(line =>
      line.toLowerCase().includes(brandLower)
    );

    // Score based on rank position
    if (rank === 0 || rank === 1) visibilityScore = 95;
    else if (rank === 2) visibilityScore = 80;
    else if (rank === 3) visibilityScore = 65;
    else if (rank === 4) visibilityScore = 50;
    else if (rank === 5) visibilityScore = 40;
    else if (rank <= 8) visibilityScore = 30;
    else visibilityScore = 20;

    // Character position as fallback reference
    position = lower.indexOf(brandLower);
  }

  // Sentiment detection — look in a window around the brand mention
  const positiveWords = [
    "best", "great", "excellent", "popular", "recommended",
    "top", "leading", "powerful", "versatile", "intuitive",
    "widely used", "go-to", "favorite", "robust", "reliable"
  ];
  const negativeWords = [
    "avoid", "poor", "bad", "slow", "expensive", "complicated",
    "difficult", "limited", "outdated", "overpriced", "buggy"
  ];

  let sentiment = "neutral";
  if (mentioned) {
    const charPos = lower.indexOf(brandLower);
    const snippet = lower.slice(Math.max(0, charPos - 150), charPos + 300);
    const hasPositive = positiveWords.some(w => snippet.includes(w));
    const hasNegative = negativeWords.some(w => snippet.includes(w));
    if (hasPositive && !hasNegative) sentiment = "positive";
    if (hasNegative && !hasPositive) sentiment = "negative";
    if (hasPositive && hasNegative) sentiment = "mixed";
  }

  return { mentioned, visibilityScore, sentiment, position, rank };
}

export async function POST(req: NextRequest) {
  try {
    const { brands, category } = await req.json();

    // Support both single brand (old) and multiple brands (new)
    const brandList: string[] = Array.isArray(brands)
      ? brands
      : [brands];

    const allBrandResults: Record<string, any> = {};

    for (const brand of brandList) {
      const results = [];

      for (const promptTemplate of PROMPTS) {
        const prompt = promptTemplate.replace("{category}", category);

        const completion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "llama-3.3-70b-versatile",
          temperature: 0.8,
        });

        const response = completion.choices[0]?.message?.content || "";
        const parsed = parseVisibility(response, brand);

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
    }

    return NextResponse.json({
      category,
      brands: allBrandResults,
      // Keep backward compat for single brand
      ...(brandList.length === 1 ? allBrandResults[brandList[0]] : {}),
    });

  } catch (err: any) {
    console.error("FULL ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}