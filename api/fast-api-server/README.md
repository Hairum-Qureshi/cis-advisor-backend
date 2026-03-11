# Embedding Service (FastAPI + Hugging Face)

This repository contains a lightweight **Python FastAPI microservice** responsible for converting user queries into vector embeddings for the UD CIS advisor chatbot’s **RAG (Retrieval-Augmented Generation)** pipeline.

The service was intentionally separated from the Node.js backend due to **performance and concurrency limitations** when generating embeddings directly in Node. Python’s async HTTP stack and FastAPI provide lower latency and cleaner isolation for embedding workloads.

---

## Why a Separate Python Service?

**Design rationale:**

- Embedding generation is **compute-and latency-sensitive**
- Node.js showed slower response times when handling embedding requests
- Python has better ecosystem maturity for:
  - ML inference
  - Async HTTP pipelines
  - Future on-device embedding fallback if Hugging Face is replaced

This service:

- Is **stateless**
- Only concerns itself with **text → embedding**
- Is easy to scale independently from the main app

---

## Architecture Overview

```
[ Express.js Backend ]
            |
            |  POST /query-to-embedding
            v
[ FastAPI Embedding Service ]
            |
            |  Hugging Face Inference API
            v
[ sentence-transformers/all-MiniLM-L6-v2 ]
            |
            |
            v
[ Express.js Backend ]
```

---

## Model Used

- **Model:** `sentence-transformers/all-MiniLM-L6-v2`
- **Embedding size:** 384
- **Hosted via:** Hugging Face Inference API

This model offers a strong balance between:

- Semantic quality
- Low latency
- Low token cost

---

## Requirements

- Python **3.9+**
- Hugging Face account (free tier is sufficient)

---

## Setup

### 1. Clone the Repository

```bash
git clone <repo-url>
cd embedding-service
```

### 2. Install Dependencies

```bash
pip install fastapi uvicorn httpx pydantic
```

---

### 3. Set Environment Variables

Create a Hugging Face access token:

👉 [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) Make sure to check 'Make calls to Inference Providers' under 'Inference'.

Then add it to your `/api/.env` `.env` file:

```bash
HF_TOKEN=your_token_here
```

---

## Running the Server

```bash
uvicorn main:app --reload --port 8000
```

By default, the service will be available at:

```
http://localhost:8000
```

---

## API Endpoints

### `GET /`

Health check / welcome endpoint.

**Response**

```json
{
	"message": "Welcome to the Embedding API for the CIS advisor chat bot!"
}
```

---

### `POST /embed`

Used when embedding text tied to a known document or record ID.

**Request**

```json
{
	"id": "doc_123",
	"text": "What classes are required for the CIS major?"
}
```

**Response**

```json
{
  "id": "doc_123",
  "embedding": [0.0123, -0.0456, ...]
}
```

---

### `POST /query-to-embedding`

Used for ad-hoc user queries where no ID is needed.

**Request**

```json
{
	"text": "How do I declare a CIS minor?"
}
```

**Response**

```json
{
  "embedding": [0.0345, -0.0678, ...]
}
```

---

## Error Handling

- If Hugging Face returns a non-200 response, the service responds with:

```json
{
	"detail": "Hugging Face API Error"
}
```

HTTP Status Code: **500**

This keeps failure handling simple and pushes retry logic to the caller.

---

## Performance Notes

- Uses `httpx.AsyncClient` for non-blocking requests
- No in-memory caching (by design)
- Embeddings are generated **on demand**

## Security Considerations

- **HF_TOKEN must never be exposed to clients**
