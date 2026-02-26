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
- Continuously verify embedding integrity via a golden Q&A benchmark

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
  ├─ Run golden Q&A embedding verification
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

| Endpoint | Method | Description | Auth Required |
| --- | --- | --- | --- |
| `/` | GET | Basic server health check | No |
| `/api/data-source-json` | GET | Returns the full Q&A dataset currently stored in MongoDB | No |
| `/api/ask-gemini` | POST | Runs the RAG pipeline and queries Gemini for a grounded answer | No |
| `/api/clear-data-source` | DELETE | Deletes all dataset entries **and embeddings** from MongoDB. Requires `ADMIN_KEY` query param | Yes |
| `/api/add-data-source` | POST | Adds new Q&A entries to the dataset and generates embeddings. Requires `ADMIN_KEY` in body | Yes |

---

### Request & Response Examples

#### GET `/api/data-source-json`

**Response:**

```json
[
	{
		"_id": "6421f5e7abc1234567890abc",
		"id": "p0",
		"Question": "Which courses are required for CIS?",
		"Answer": "The required courses are ...",
		"Category": "Program Requirements",
		"Notes": ""
	}
]
```

---

#### POST `/api/ask-gemini`

**Request Body:**

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

---

## Retrieval-Augmented Generation (RAG)

RAG responsibilities are encapsulated in a dedicated class that handles:

- Query preprocessing
- Context retrieval via embeddings from MongoDB
- Prompt construction and constraint enforcement
- Gemini request orchestration
- Deterministic rejection of out-of-scope queries
- Embedding integrity verification via a golden Q&A pair

The RAG pipeline is centralized behind a single abstraction rather than scattered across route handlers.

---

## Golden Q&A Embedding Verification

To ensure long-term embedding correctness, the system supports a **golden benchmark check**.

A known question–answer pair from the dataset is embedded and evaluated at runtime to confirm that vector similarity and retrieval behavior remain stable.

### Purpose

- Detect silent embedding drift
- Catch accidental dataset corruption
- Trigger automatic embedding regeneration when similarity falls below an acceptable threshold

This provides a deterministic signal that the vector store no longer reflects the source dataset accurately.

---

## Embedding Backend

- Implemented using **Python + FastAPI**
- Responsible for:
  - Generating embeddings for new queries or updated dataset entries
  - Performing similarity search
  - Returning the most relevant context

**Repository:** [https://github.com/Hairum-Qureshi/embedding-python-backend](https://github.com/Hairum-Qureshi/embedding-python-backend)

The Node backend invokes this service as part of the RAG pipeline **before any request is sent to Gemini**.

---

## Prompt Strategy

Gemini is explicitly instructed to:

- Answer **only** University of Delaware Graduate CS questions
- Reject unrelated or general-knowledge queries
- Use **only retrieved context** when forming answers
- Output HTML (no headers, frontend-safe markup)

This is a **prompt-control mechanism**, not a complete safety system.

---

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | ✅ | Google Generative AI API key |
| `PYTHON_SERVER_URL` | ✅ | Base URL of the Python FastAPI embedding service |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `ADMIN_KEY` | ✅ | Key to authorize admin endpoints |
| `GOLDEN_QUESTION` | ✅ | Verbatim question from the dataset used as an embedding benchmark |
| `GOLDEN_ANSWER` | ✅ | Verbatim answer corresponding to `GOLDEN_QUESTION` |
| `PORT` | ❌ | Local dev port (default: 3000) |

### `.env` Example

```env
GEMINI_API_KEY=your_key_here
PYTHON_SERVER_URL=http://localhost:8000
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/dbname
ADMIN_KEY=supersecret
GOLDEN_QUESTION="How do I request an admissions deferment?"
GOLDEN_ANSWER="Submit your admission deferral request to the CIS Graduate Academic Advisor II for review."
PORT=3000
```

---

## Installation & Local Development

```bash
git clone <repo-url>
cd api
npm install
npm run dev
```

API will be available at:

```
http://localhost:3000
```

⚠️ If running locally, ensure the **Python embedding backend is running** before calling `/api/ask-gemini`.
