"use client";
import { useState, useEffect } from "react";

interface PromptResult {
  prompt: string;
  mentioned: boolean;
  visibilityScore: number;
  sentiment: string;
  rank: number;
}

interface BrandResult {
  brand: string;
  category: string;
  avgVisibilityScore: number;
  mentionedIn: string;
  results: PromptResult[];
}

interface HistoryItem {
  brand: string;
  category: string;
  avgVisibilityScore: number;
  mentionedIn: string;
  createdAt: string | null;
}

export default function Home() {
  const [brands, setBrands] = useState(["", ""]);
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<Record<string, BrandResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"track" | "history">("track");
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [progressStep, setProgressStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

  useEffect(() => { fetchHistory(); }, []);

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      setHistory(data.history || []);
    } catch {
      console.error("Failed to fetch history");
    } finally {
      setHistoryLoading(false);
    }
  }

 async function handleTrack() {
  const filledBrands = brands.filter(b => b.trim());
  if (filledBrands.length === 0 || !category.trim()) {
    setError("Please enter at least one brand and a category.");
    return;
  }
  setError("");
  setLoading(true);
  setResults({});
  setProgressLogs([]);
  setProgressStep(0);

  try {
    const res = await fetch("/api/track-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brands: filledBrands, category }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));

          // Update progress log
          if (event.message) {
            setProgressLogs(prev => [...prev, event.message]);
          }

          if (event.type === "start") {
            setTotalSteps(event.total);
          }

          if (event.type === "prompt_done") {
            setProgressStep(event.completed);
          }

          if (event.type === "complete") {
            setResults(event.brands);
            fetchHistory();
          }

          if (event.type === "error") {
            setError(event.message);
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  } catch {
    setError("Something went wrong. Try again.");
  } finally {
    setLoading(false);
  }
}

  function updateBrand(index: number, value: string) {
    const updated = [...brands];
    updated[index] = value;
    setBrands(updated);
  }

  function getScoreColor(score: number) {
    if (score >= 70) return "text-green-400";
    if (score >= 40) return "text-yellow-400";
    return "text-red-400";
  }

  function getScoreBg(score: number) {
    if (score >= 70) return "bg-green-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-blue-500";
  }

  function getSentimentStyle(sentiment: string) {
    if (sentiment === "positive") return "bg-blue-900 text-blue-300";
    if (sentiment === "negative") return "bg-orange-900 text-orange-300";
    if (sentiment === "mixed") return "bg-purple-900 text-purple-300";
    return "bg-gray-700 text-gray-300";
  }

  const brandResultsList = Object.values(results);
  const sortedResults = [...brandResultsList].sort(
    (a, b) => b.avgVisibilityScore - a.avgVisibilityScore
  );

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto p-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">AI Brand Visibility Tracker</h1>
          <p className="text-gray-400">
            See how your brand appears across AI-generated search responses.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-800">
          {["track", "history"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as "track" | "history")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              {tab === "history" && history.length > 0
                ? `History (${history.length})`
                : tab === "history" ? "History" : "Track Brand"}
            </button>
          ))}
        </div>

        {/* Track Tab */}
        {activeTab === "track" && (
          <div>
            <div className="flex flex-col gap-3 mb-4">

              {/* Brand inputs */}
              <p className="text-sm text-gray-400">
                Enter up to 2 brands to compare
              </p>
              {brands.map((brand, i) => (
                <input
                  key={i}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3
                             text-white placeholder-gray-500 focus:outline-none
                             focus:border-blue-500"
                  placeholder={i === 0 ? "Brand 1 (e.g. Notion)" : "Brand 2 (e.g. Obsidian) — optional"}
                  value={brand}
                  onChange={e => updateBrand(i, e.target.value)}
                />
              ))}

              <input
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3
                           text-white placeholder-gray-500 focus:outline-none
                           focus:border-blue-500"
                placeholder="Category (e.g. note-taking apps)"
                value={category}
                onChange={e => setCategory(e.target.value)}
              />

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                onClick={handleTrack}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900
                           disabled:cursor-not-allowed rounded-lg px-4 py-3
                           font-semibold transition-colors"
              >
                {loading ? "Analyzing..." : "Track Visibility"}
              </button>
            </div>

            {/* Live Progress */}
            {loading && (
              <div className="mt-6 bg-gray-900 rounded-xl border border-gray-700 p-5">

                {/* Progress bar */}
                {totalSteps > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                      <span>Progress</span>
                      <span>{progressStep}/{totalSteps} prompts</span>
                    </div>
                    <div className="bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(progressStep / totalSteps) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Live log */}
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {progressLogs.map((log, i) => (
                    <div
                      key={i}
                      className="text-sm font-mono flex items-start gap-2"
                    >
                      <span className="text-gray-500 shrink-0 text-xs mt-0.5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className={
                        log.startsWith("✅") ? "text-green-400" :
                        log.startsWith("❌") ? "text-red-400" :
                        log.startsWith("Analysis complete") ? "text-blue-400" :
                        "text-gray-300"
                      }>
                        {log}
                      </span>
                    </div>
                  ))}

                  {/* Blinking cursor */}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs">
                      {String(progressLogs.length + 1).padStart(2, "0")}
                    </span>
                    <span className="w-2 h-4 bg-blue-400 animate-pulse" />
                  </div>
                </div>
              </div>
            )}

            {/* Comparison Summary */}
            {sortedResults.length > 0 && (
              <div className="flex flex-col gap-4 mt-6">

                {/* Leaderboard */}
                {sortedResults.length > 1 && (
                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase
                                   tracking-wider mb-4">
                      Visibility Ranking
                    </h2>
                    {sortedResults.map((r, i) => (
                      <div key={r.brand} className="flex items-center gap-4 mb-3 last:mb-0">
                        <span className="text-2xl font-bold text-gray-500 w-6">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="font-medium capitalize">{r.brand}</span>
                            <span className={`font-bold ${getScoreColor(r.avgVisibilityScore)}`}>
                              {r.avgVisibilityScore}/100
                            </span>
                          </div>
                          <div className="bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${getScoreBg(r.avgVisibilityScore)}`}
                              style={{ width: `${r.avgVisibilityScore}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Per brand breakdown */}
                {sortedResults.map(brandResult => (
                  <div key={brandResult.brand}>
                    <h3 className="font-semibold text-gray-300 mb-2 capitalize">
                      {brandResult.brand}
                      <span className="text-gray-500 font-normal text-sm ml-2">
                        {brandResult.mentionedIn} · avg {brandResult.avgVisibilityScore}/100
                      </span>
                    </h3>
                    {brandResult.results.map((r, i) => (
                      <div key={i} className="bg-gray-800 rounded-xl p-4 border
                                              border-gray-700 mb-2">
                        <div className="flex justify-between items-start mb-3">
                          <p className="text-sm text-gray-300 flex-1 pr-4">{r.prompt}</p>
                          <div className="flex gap-2 shrink-0">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              r.mentioned
                                ? "bg-green-900 text-green-300"
                                : "bg-red-900 text-red-300"
                            }`}>
                              {r.mentioned
                                ? r.rank >= 0 ? `Rank #${r.rank + 1}` : "Mentioned"
                                : "Not Mentioned"}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium
                                            ${getSentimentStyle(r.sentiment)}`}>
                              {r.sentiment}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${getScoreBg(r.visibilityScore)}`}
                              style={{ width: `${r.visibilityScore}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-300 w-12 text-right">
                            {r.visibilityScore}/100
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div>
            {historyLoading ? (
              <p className="text-gray-400">Loading history...</p>
            ) : history.length === 0 ? (
              <p className="text-gray-400">
                No searches yet. Track a brand to get started.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((item, i) => (
                  <div key={i} className="bg-gray-800 rounded-xl p-4 border
                                          border-gray-700 flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-white capitalize">{item.brand}</p>
                      <p className="text-sm text-gray-400">{item.category}</p>
                      {item.createdAt && (
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${getScoreColor(item.avgVisibilityScore)}`}>
                        {item.avgVisibilityScore}
                        <span className="text-sm text-gray-400">/100</span>
                      </p>
                      <p className="text-xs text-gray-400">{item.mentionedIn}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}