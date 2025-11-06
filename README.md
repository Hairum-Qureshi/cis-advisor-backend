# CIS Advisor Backend (Gemini-Powered Academic Q&A API)

This backend aims to power the chatbot functionality for the **CIS Advisor Chatbot** for the University of Delaware Graduate Computer Science program.
It provides a secure proxy layer for interacting with the Google Gemini API and ensures that no API keys are exposed in the client application.

However, it currently runs a full Express server **on Vercel**, which is functional for a capstone but not the most efficient architecture for Vercel’s serverless runtime model. This README explains both *usage* and *limitations* transparently.

**Note:** at this time (2025), Gemini-2.5-flash was utilized. If, in the future this version of Gemini gets voided or no longer maintained, you may need to change it if needed.

---

## Core Goals

* Serve Gemini responses securely (no API keys in client code)
* Fetch structured UD CS program Q&A data
* Constrain model behavior to domain-specific content
* Reject irrelevant queries cleanly
* Output HTML-formatted responses for frontend rendering

---

## How It Works

### Endpoints

| Endpoint                | Method | Description                                  |
| ----------------------- | ------ | -------------------------------------------- |
| `/api/data-source-json` | GET    | Displays the Q&A JSON dataset      |
| `/api/ask-gemini`       | POST   | Sends user query + dataset context to Gemini |
| `/`                     | GET    | Basic server check                           |

### Prompt Strategy

Gemini receives structured instructions to:

* Answer **only** UD Grad CS questions
* Reject unrelated topics
* Format response in HTML (no headers)

This is a prompt-control strategy — **not** a substitute for full safety enforcement. For production you’d add intent filters, stricter validation, and possibly a retrieval pipeline.

---

## Folder Structure

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
└── .gitignore
```

---

## Environment Variables

| Variable         | Required | Description                            |
| ---------------- | -------- | -------------------------------------- |
| `GEMINI_API_KEY` | ✅        | Google Generative AI API key           |
| `PORT`           | ❌        | Optional (default: 3000 for local dev) |

`.env` example:

```env
GEMINI_API_KEY=your_key_here
PORT=3000
```

---

## Installation & Local Development

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

## API Usage

### POST `/api/ask-gemini`

**Request body example:**

```json
{
  "query": "What are the MS CS credit requirements at UD?",
}
```

**Response example:**

```json
{
"Question": "How do I request an admissions deferment when I cannot attend during my expected enrollment term?",
"Answer": "Submit your admission deferral request to the CIS Graduate Academic Advisor II for review.",
"Category": "Advising"
}
```
---

## CORS Policy

Current config:

```js
origin: "*"
```

Acceptable for academic deployment.
If public, restrict origins to prevent external sites from hitting your LLM proxy.

---

## Security Considerations

| Concern              | Current State     | Recommendation                        |
| -------------------- | ----------------- | ------------------------------------- |
| API key safety       | ✅ Backend secured | Good discipline — keep it server-side |
| Client-supplied JSON | ✔️ but unchecked  | Validate structure before injection   |
| Rate limiting        | ❌                 | Add if going public                   |
| CORS                 | `*`               | Lock down domains for production      |
