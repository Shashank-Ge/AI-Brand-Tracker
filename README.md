<div align="center">

# 🔍 AI Brand Visibility Tracker

### Track how your brand ranks across AI-generated search responses — in real time

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![Groq](https://img.shields.io/badge/Groq-LLaMA_3.3_70B-F55036?style=for-the-badge)](https://groq.com)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?style=for-the-badge&logo=vercel)](https://vercel.com)

<br/>

> Enter any brand and category — get a real AI visibility score based on how prominently that brand appears across 5 distinct search scenarios, scored directly by an LLM.

</div>

---

## 🎯 What It Does

**AI Brand Visibility Tracker** is a production-grade SEO intelligence tool that answers one question businesses actually care about: *"When someone asks an AI assistant about my category, does my brand get mentioned — and how prominently?"*

For each brand + category combination, it runs **5 independent search scenarios** through a Groq-powered LLM and collects:

- 📊 **Visibility score (0–100)** — LLM-assigned based on real-world prominence in the category
- 🏆 **Rank position** — how high in the AI response the brand would appear
- 🎭 **Sentiment classification** — positive / negative / neutral / mixed
- 💬 **LLM reasoning** — a one-sentence explanation for every score
- 📈 **Multi-brand comparison** — side-by-side leaderboard with average scores
- 🕓 **Search history** — all past analyses persisted in Firestore

---

## ⚙️ Engineering Highlights

| # | Decision | Why It Matters |
|---|----------|----------------|
| 1 | **Direct LLM scoring** | Instead of fragile string-matching on generic prompts, the LLM is asked to return a structured JSON score for each brand — accurate regardless of spelling variations ("Chat GPT" vs "ChatGPT") |
| 2 | **Scenario-based prompts** | 5 distinct search intents (general, comparison, beginner, professional, market leaders) give a multi-dimensional visibility picture, not a single data point |
| 3 | **Server-Sent Events (SSE) streaming** | Results stream to the UI prompt-by-prompt via a `ReadableStream` — the user sees progress in real time rather than waiting for all 5 queries to complete |
| 4 | **Category normalization** | User input like `"top AI tools"` is cleaned before insertion into prompts, preventing `"Compare the top top AI tools platforms"` — type confusion that caused 0/100 scores |
| 5 | **Firebase Admin SDK (server-side)** | All Firestore writes happen in Next.js API routes — the browser never touches the database directly, keeping credentials server-side only |
| 6 | **Stateless API design** | `/api/track-stream` and `/api/history` are fully stateless — independently deployable on Vercel's serverless infrastructure with no shared state |

---

## 🏗️ System Architecture

```
User Input (brand + category)
          │
          ▼
    POST /api/track-stream  (SSE)
          │
          ├── normalizeCategory()  →  strips "top", "best", etc.
          │
          ├── For each of 5 SCENARIOS:
          │       │
          │       ├── buildScoringPrompt(brand, category, query)
          │       │       └── Asks LLM to return { score, rank, sentiment, reason }
          │       │
          │       ├── Groq API  (LLaMA 3.3 70B, temp=0.3)
          │       │       └── Returns structured JSON score
          │       │
          │       ├── parseLLMScore()  →  validates & normalises response
          │       │
          │       └── Firestore write  (visibility_results collection)
          │
          └── SSE event  →  browser updates UI live
                                │
                                ▼
                    GET /api/history
                          │
                    Firestore query (last 20, ordered by createdAt desc)
                          │
                    Grouped by brand+category  →  avg score computed
```

All Groq and Firebase credentials live **server-side only** inside Next.js API routes. The browser never touches them directly.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript 5 |
| **LLM** | Groq SDK — LLaMA 3.3 70B Versatile |
| **Database** | Firebase Firestore (via Admin SDK) |
| **Streaming** | Web Streams API (Server-Sent Events) |
| **Deployment** | Vercel |

---

## 📂 Project Structure

```
ai-brand-tracker/
├── app/
│   ├── api/
│   │   ├── track-stream/route.ts   # SSE streaming — LLM scoring engine
│   │   └── history/route.ts        # Firestore history fetch & aggregation
│   ├── page.tsx                    # Main UI — live progress, results, history
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── firebase-admin.ts           # Firebase Admin SDK initialisation
│   ├── firebase.ts                 # Firebase client config
│   └── groq.ts                     # Groq client
```

---

## 🔐 Security Design

- **Groq API key** and **Firebase service account** are stored as environment variables — accessed exclusively in server-side API routes, never exposed to the client bundle
- **Firebase Admin SDK** is initialised server-side only — Firestore rules can be locked down to deny all direct client access
- **`.env.local`** and **`service-account.json`** are gitignored — no credentials are ever committed to source control
- API routes act as a **secure proxy layer** — the browser only calls internal Next.js endpoints

---

## 💡 Skills Demonstrated

`Full-Stack Development` · `LLM Integration` · `Prompt Engineering` · `Structured JSON Outputs` · `Server-Sent Events` · `Real-time Streaming UI` · `Firebase Firestore` · `Next.js App Router` · `Secure API Design` · `TypeScript` · `System Architecture` · `AI SEO Analytics`

---

<div align="center">

<br/>

Built by **[Shashank Goel](https://github.com/Shashank-Ge)**

<br/>

</div>
