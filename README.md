# CIS Advisor Backend (Gemini-Powered Academic Q&A API)

This backend powers the **CIS Advisor Chatbot** for the University of Delaware Graduate Computer Science program.
It provides a secure proxy layer for interacting with the Google Gemini API and ensures that no API keys are exposed in the client application.

Unlike many student AI projects that call LLMs directly from the browser (a rookie and insecure move), this backend enforces proper API separation and key protection.

However — it currently runs a full Express server **on Vercel**, which is functional for a capstone but not the most efficient architecture for Vercel’s serverless runtime model. This README explains both *usage* and *limitations* transparently.

---

## 🎯 Core Goals

* Serve Gemini responses securely (no API keys in client code)
* Fetch structured UD CS program Q&A data
* Constrain model behavior to domain-specific content
* Reject irrelevant queries cleanly
* Output HTML-formatted responses for frontend rendering

This system is intentionally narrow, which is correct for academic advising — minimizing hallucination risk matters more than creative freedom.

---

## 🧠 How It Works

### Endpoints

| Endpoint                | Method | Description                                  |
| ----------------------- | ------ | -------------------------------------------- |
| `/api/data-source-json` | GET    | Fetches official UD CS Q&A JSON dataset      |
| `/api/ask-gemini`       | POST   | Sends user query + dataset context to Gemini |
| `/`                     | GET    | Basic server check                           |

### Prompt Strategy

Gemini receives structured instructions to:

* Answer **only** UD Grad CS questions
* Reject unrelated topics
* Format response in HTML (no headers)

This is a prompt-control strategy — **not** a substitute for full safety enforcement. For production you’d add intent filters, stricter validation, and possibly a retrieval pipeline.

---

## 📁 Folder Structure

```
CIS-ADVISOR-BACKEND/
│
├── api/                # Vercel serverless dir (currently unused but reserved)
│   └── node_modules/   # Auto-created dependency folder for Vercel builds
│
├── index.ts            # Main Express server entry point
├── vercel.json         # Vercel deployment configuration
├── tsconfig.json       # TypeScript configuration
├── package.json
├── package-lock.json
├── .env                # Environment variables (never commit)
└── .gitignore
```

> ⚠️ **Note on architecture:**
> Vercel is optimized for serverless functions, not persistent Express servers. This works for a capstone but has trade-offs (cold starts, unnecessary process spin-ups, less efficient scaling).
> If this evolves beyond academic/demo use, migrate to **Railway, Render, or Fly.io**, or convert endpoints into Vercel serverless functions.

---

## ⚙️ Environment Variables

| Variable         | Required | Description                            |
| ---------------- | -------- | -------------------------------------- |
| `GEMINI_API_KEY` | ✅        | Google Generative AI API key           |
| `PORT`           | ❌        | Optional (default: 3000 for local dev) |

`.env` example:

```env
GEMINI_API_KEY=your_key_here
PORT=3000
```

Only one critical secret — good discipline.

---

## 🏗️ Installation & Local Development

```bash
git clone <repo-url>
cd CIS-ADVISOR-BACKEND
npm install
```

Start dev server:

```bash
npm run dev
```

The API runs by default at:

```
http://localhost:3000
```

---

## 📡 API Usage

### POST `/api/ask-gemini`

**Request body:**

```json
{
  "query": "What are the MS CS credit requirements at UD?",
  "jsonData": { /* dataset returned from /api/data-source-json */ }
}
```

**Response:**

```json
{
  "reply": "<p>Valid HTML response...</p>"
}
```

> ✅ Safe proxy behavior
> ⚠️ `jsonData` comes from client — acceptable in capstone but consider validation later

---

## 🌐 CORS Policy

Current config:

```js
origin: "*"
```

Acceptable for academic deployment.
If public, restrict origins to prevent external sites from hitting your LLM proxy.

---

## 🛡️ Security Considerations

| Concern              | Current State     | Recommendation                        |
| -------------------- | ----------------- | ------------------------------------- |
| API key safety       | ✅ Backend secured | Good discipline — keep it server-side |
| Client-supplied JSON | ✔️ but unchecked  | Validate structure before injection   |
| Rate limiting        | ❌                 | Add if going public                   |
| CORS                 | `*`               | Lock down domains for production      |

For a capstone, this setup is responsible and sufficient.
For production, you'd harden request filtering and apply usage throttling.

---

## 🚀 Deployment Notes (Vercel)

You have a `vercel.json` and a root-level Express entry, which Vercel **can run**, but it's not its preferred pattern.

Better long-term options:

* Convert each endpoint to `api/*.ts` serverless functions **OR**
* Move to a platform meant for long-running servers

Nothing is “wrong” here — the README simply acknowledges platform trade-offs instead of pretending they're invisible.

---

## 🧭 Future Improvements (Realistic Roadmap)

| Area                                                       | Why It Matters                              |
| ---------------------------------------------------------- | ------------------------------------------- |
| Switch to serverless handlers OR migrate to a backend host | Align compute with use case                 |
| Add schema validation to JSON dataset                      | Prevent prompt injection                    |
| Add rate limiting                                          | Prevent abuse if public                     |
| Add logs + analytics                                       | Understand failure modes and model behavior |
| Introduce retrieval layer (RAG-lite)                       | More predictable outputs                    |

Again — not required for a capstone, but useful if you scale this beyond classwork.
