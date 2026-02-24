# CIS Advisor Backend

### Gemini-Powered Academic Q&A API with RAG

This backend powers the chatbot functionality for the **CIS Advisor Chatbot** for the University of Delaware Graduate Computer Science program.

It provides:

- A secure proxy layer for interacting with the Google Gemini API
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
  ├─ Fetch relevant context via embeddings
  │      ▼
  │   Python FastAPI Embedding Backend
  │      (vector search + similarity ranking)
  │
  └─ Send retrieved context + query to Gemini
          ▼
       Gemini API
```

This design cleanly separates:

- **LLM orchestration** (Node backend)
- **Embedding + retrieval logic** (Python backend)

---

## How It Works

### Endpoints

| Endpoint                | Method | Description                      |
| ----------------------- | ------ | -------------------------------- |
| `/api/data-source-json` | GET    | Displays the raw Q&A dataset     |
| `/api/ask-gemini`       | POST   | Runs RAG + sends query to Gemini |
| `/`                     | GET    | Basic server health check        |

### Retrieval-Augmented Generation (RAG)

This backend uses a **class-based RAG implementation** to ensure that all Gemini responses are grounded in University of Delaware CIS program data.

RAG responsibilities are encapsulated in a dedicated class that handles:

- Query preprocessing
- Context retrieval via embeddings
- Prompt construction and constraint enforcement
- Gemini request orchestration
- Deterministic rejection of out-of-scope queries

Rather than scattering this logic across route handlers, the RAG pipeline is centralized behind a single abstraction.

#### RAG Class Design

A full breakdown of the RAG class, including method-level responsibilities and control flow, is documented here:

👉 **RAG Class Documentation** [https://github.com/Hairum-Qureshi/cis-advisor-backend/blob/main/api/RAGClass.md](https://github.com/Hairum-Qureshi/cis-advisor-backend/blob/main/api/RAGClass.md)

This document explains:

- How retrieved context is selected and formatted
- How domain constraints are enforced
- How prompts are constructed before being sent to Gemini
- Where future improvements (confidence thresholds, intent gating, caching) can be added cleanly

If you are modifying retrieval behavior, prompt strategy, or grounding logic, **start with the RAG class** rather than the API routes.

---

### Embedding Backend

- Implemented using **Python + FastAPI**
- Responsible for:
  - Generating embeddings
  - Performing similarity search
  - Returning the most relevant context chunks

**Repository:** [https://github.com/Hairum-Qureshi/embedding-python-backend](https://github.com/Hairum-Qureshi/embedding-python-backend)

The Node backend invokes this service as part of the RAG pipeline before any request is sent to Gemini.

---

If you delete `data_with_embeddings.json` and request updated embeddings, the Python backend **will regenerate the embeddings**.

> This process **can take a minute or two** depending on dataset size. The new `data_with_embeddings.json` will appear once generation is complete. Be patient—do **not** interrupt the request.

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

## Folder Structure

```
CIS-ADVISOR-BACKEND/
│
├── api/                     # Vercel serverless directory
│   ├── index.ts             # Main Express entry point
│   ├── vercel.json          # Vercel deployment config
│   ├── tsconfig.json        # TypeScript configuration
│   ├── package.json
│   ├── package-lock.json
│   └── .gitignore
│
├── json/                    # Embedding-related JSON files
│   ├── Fall_25_Spr26_Q&A_For_Model_Training.json.json     # Original Q&A data
│   └── data_with_embeddings.json      # Generated embedding vectors
```

---

## ⚠️ Important Notes on the `json/` Folder

- `Fall_25_Spr26_Q&A_For_Model_Training.json.json` is the **authoritative dataset**
- `data_with_embeddings.json` is **derived data**

### Updating the Data Source

If you **change even a single value** in `Fall_25_Spr26_Q&A_For_Model_Training.json.json`:

1. **Delete** `data_with_embeddings.json`
2. Regenerate embeddings using the Python backend
3. Commit the newly generated embeddings file

If **no changes** are made to the original dataset:

- **Do not touch** the embeddings file
- Reusing it is expected and correct

This avoids silent embedding/data mismatches.

---

## Environment Variables

| Variable             | Required | Description                               |
| -------------------- | -------- | ----------------------------------------- |
| `GEMINI_API_KEY`     | ✅       | Google Generative AI API key              |
| `PYTHON_BACKEND_URL` | ✅       | Base URL of the embedding FastAPI service |
| `PORT`               | ❌       | Local dev port (default: 3000)            |

### `.env` Example

```env
GEMINI_API_KEY=your_key_here
PYTHON_BACKEND_URL=http://localhost:8000
PORT=3000
```

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

The API will be available at:

```
http://localhost:3000
```

⚠️ Ensure the **Python embedding backend is running** before making requests to `/api/ask-gemini`. You don't necessarily need the Python backend running if your original data set is unchanged and there's no need to get an updated embeddings JSON file. However, if you need updated embeddings, delete the `data_with_embeddings.json` file and run your `/api/ask-gemini` endpoint (via Postman) and it will automatically generate a new `data_with_embeddings.json` for oyu.

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
	"answer": "Submit your admission deferral request to the CIS Graduate Academic Advisor II for review."
}
```

Responses are HTML-formatted for direct frontend rendering.

---

## CORS Policy

Current configuration:

```js
origin: "*";
```

This is acceptable for internal or academic deployment.

If exposed publicly:

- Restrict allowed origins
- Prevent third-party sites from abusing the LLM proxy

---

## Security Considerations

| Concern                 | Current State  | Recommendation            |
| ----------------------- | -------------- | ------------------------- |
| API key exposure        | ✅ Server-only | Keep it that way          |
| RAG grounding           | ✅ Implemented | Add confidence thresholds |
| Client input validation | ⚠️ Minimal     | Validate schema strictly  |
| Rate limiting           | ❌ None        | Add before public release |
| CORS                    | `*`            | Lock down domains         |

---

## Future Improvements

- Move embeddings from JSON → external vector database (JSON files grow quickly and do not scale)
- Add batch embedding regeneration tooling
- Implement request-level caching
- Add automated dataset / embedding consistency checks
