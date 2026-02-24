Here’s a fully updated README reflecting your new architecture with **MongoDB**, removal of the JSON folder, new environment variables, and updated endpoints:

---

# CIS Advisor Backend

### Gemini-Powered Academic Q&A API with RAG

This backend powers the chatbot functionality for the **CIS Advisor Chatbot** for the University of Delaware Graduate Computer Science program.

It provides:

- A secure backend layer for interacting with the Google Gemini API
- A Retrieval-Augmented Generation (RAG) pipeline for grounded answers
- Strict domain constraints to prevent off-topic responses
- Zero exposure of API keys to the client

At no point does the frontend directly communicate with Gemini or the embedding system.

---

## Model Versioning

**Initial version (2025):**

- `gemini-2.5-flash`

**Current version (February 2026):**

- `gemini-2.5-flash-lite`

If this model is deprecated or rate-limited in the future, update the model identifier in the Gemini client configuration accordingly.

---

## Core Goals

- Securely serve Gemini responses (no API keys in client code)
- Ground responses using UD CIS program data via RAG
- Constrain the model to **only** answer UD Grad CS questions
- Reject irrelevant or out-of-scope queries deterministically
- Output HTML-formatted responses for frontend rendering

---

## High-Level Architecture

```
Client
  │
  ▼
Node / Express API (this repo)
  │
  ├─ Fetch dataset & embeddings from MongoDB
  │
  ├─ Compute similarity via Python FastAPI embedding backend (optional)
  │
  └─ Send retrieved context + query to Gemini
          ▼
       Gemini API
```

This design cleanly separates:

- **LLM orchestration** (Node backend)
- **Embedding + retrieval logic** (Python backend)
- **Dataset persistence** (MongoDB)

---

## How It Works

### Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/data-source` | GET | Returns the full dataset stored in MongoDB |
| `/api/ask-gemini` | POST | Runs RAG + sends query to Gemini |
| `/api/debug` | POST | Returns similarity scores and matched dataset entries |
| `/api/admin/update-data` | POST | Admin endpoint to update dataset or regenerate embeddings |
| `/` | GET | Basic server health check |

> **Note:** The dataset and embeddings are now stored entirely in MongoDB. There is **no JSON folder** or local JSON files.

---

### Retrieval-Augmented Generation (RAG)

RAG responsibilities are encapsulated in a dedicated class that handles:

- Query preprocessing
- Context retrieval via embeddings from MongoDB
- Prompt construction and constraint enforcement
- Gemini request orchestration
- Deterministic rejection of out-of-scope queries

The RAG pipeline is centralized behind a single abstraction rather than scattered across route handlers.

#### RAG Class Design

Documentation: 👉 [RAG Class Documentation](https://github.com/Hairum-Qureshi/cis-advisor-backend/blob/main/api/RAGClass.md)

Explains:

- How retrieved context is selected and formatted
- How domain constraints are enforced
- How prompts are constructed before being sent to Gemini
- Future improvements (confidence thresholds, intent gating, caching)

---

### Embedding Backend

- Implemented using **Python + FastAPI**
- Responsible for:
  - Generating embeddings for new queries or updated dataset entries
  - Performing similarity search
  - Returning the most relevant context

**Repository:** [Embedding Backend](https://github.com/Hairum-Qureshi/embedding-python-backend)

The Node backend invokes this service as part of the RAG pipeline **before any request is sent to Gemini**.

---

## Prompt Strategy

Gemini is explicitly instructed to:

- Answer **only** University of Delaware Graduate CS questions
- Reject unrelated or general-knowledge queries
- Use **only retrieved context** when forming answers
- Output HTML (no headers, frontend-safe markup)

This is a **prompt-control mechanism**, not a complete safety system. For production-scale deployments, add:

- Intent classification
- Stricter request validation
- Rate limiting
- Abuse detection

---

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | ✅ | Google Generative AI API key |
| `PYTHON_SERVER_URL` | ✅ | Base URL of the Python FastAPI embedding service |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `ADMIN_KEY` | ✅ | Key to authorize admin endpoints |
| `PORT` | ❌ | Local dev port (default: 3000) |

### `.env` Example

```env
GEMINI_API_KEY=your_key_here
PYTHON_SERVER_URL=http://localhost:8000
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/dbname
ADMIN_KEY=supersecret
PORT=3000
```

If running locally, use `http://localhost:8000` for the `PYTHON_SERVER_URL`, otherwise feel free to set `PYTHON_SERVER_URL` to https://python-backend-rho.vercel.app

---

## Installation & Local Development

```bash
git clone <repo-url>
cd CIS-ADVISOR-BACKEND
npm install
```

Start the development server:

```bash
npm run dev
```

API will be available at:

```
http://localhost:3000
```

⚠️ If running locally, ensure the **Python embedding backend is running** before making requests to `/api/ask-gemini` or `/api/debug`.

> Embeddings are now stored in MongoDB; regenerating embeddings will update existing documents in the database.

---

## API Usage

### POST `/api/ask-gemini`

**Request body:**

```json
{
	"query": "How do I request an admissions deferment when I cannot attend during my expected enrollment term?"
}
```

**Response:**

```json
{
	"answer": "<p>Submit your admission deferral request to the CIS Graduate Academic Advisor II for review.</p>"
}
```

Responses are HTML-formatted for direct frontend rendering.

---

### POST `/api/debug`

Returns the similarity score and dataset entries matched for a query.

**Request body:**

```json
{
	"query": "What courses are required for the CIS graduate program?"
}
```

**Response:**

```json
[
	{
		"id": "p12",
		"score": 0.87,
		"readableQuestion": "Which courses are required for the CIS graduate program?",
		"readableAnswer": "The required courses are..."
	}
]
```

---

### POST `/api/admin/update-data`

Admin-only endpoint (requires `ADMIN_KEY`) to update dataset or regenerate embeddings.

**Request body:**

```json
{
	"adminKey": "supersecret",
	"updateType": "regenerateEmbeddings"
}
```

**Behavior:**

- Updates dataset entries in MongoDB if provided
- Regenerates embeddings for updated or new entries

---

## Security Considerations

| Concern                 | Current State  | Recommendation             |
| ----------------------- | -------------- | -------------------------- |
| API key exposure        | ✅ Server-only | Keep it that way           |
| RAG grounding           | ✅ Implemented | Add confidence thresholds  |
| Client input validation | ⚠️ Minimal     | Validate schema strictly   |
| Rate limiting           | ❌ None        | Add before public release  |
| CORS                    | `*`            | Restrict for public deploy |
