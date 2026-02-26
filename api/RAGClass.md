# RAG (Retrieval-Augmented Generation) Class

This class implements a **lightweight but self-validating Retrieval-Augmented Generation (RAG) pipeline** using:

- A dataset passed into the constructor (retrieved externally, e.g. from MongoDB)
- Vector embeddings stored and validated in MongoDB
- Cosine similarity for semantic search
- A Python backend for embedding generation
- Google Gemini for grounded response generation

A key design goal of this implementation is **embedding correctness over time**. The class actively verifies cached embeddings against a known “golden” reference and regenerates them when drift or mismatch is detected.

---

## High-Level Overview

The RAG flow consists of five main stages:

1. **Dataset Preparation**
   - Accepts a pre-fetched dataset and converts it into embedding-ready inputs.

2. **Embedding Generation & Caching**
   - Generates vector embeddings via a Python FastAPI service.
   - Stores embeddings in MongoDB for reuse.

3. **Embedding Verification (Golden Check)**
   - Validates existing embeddings against a known reference question/answer.
   - Automatically clears and regenerates embeddings if inconsistencies are found.

4. **Semantic Similarity Search**
   - Embeds the user query and compares it against stored embeddings using cosine similarity.
   - Selects the most semantically similar dataset entry (with thresholding).

5. **LLM Answer Generation (Optional)**
   - Sends the retrieved answer as strict context to Gemini for final response generation.

---

## Dependencies

### External Libraries

- `axios` – HTTP client for communicating with the Python embedding server
- `compute-cosine-similarity` – Computes similarity between embeddings
- `@google/generative-ai` – Gemini API SDK

### Internal Imports

- `VectorEmbed` – MongoDB model for storing embeddings
- Interfaces:
  - `RawEmbed`
  - `Vector`
  - `SimilarityResult`
  - `DataSet`

---

## Environment Variables

| Variable | Description |
| --- | --- |
| `GEMINI_API_KEY` | API key for Google Gemini |
| `PYTHON_SERVER_URL` | Base URL of the Python FastAPI embedding service |
| `GOLDEN_QUESTION` | Reference question used to validate embedding correctness |
| `GOLDEN_ANSWER` | Reference answer used to validate embedding correctness |

---

## Dataset Format

The dataset passed to the `RAG` constructor must contain objects with the following shape:

```ts
{
	Question: string;
	Answer: string;
}
```
````

Each entry is internally converted into an embedding input of the form:

```
Question: <question>
```

and assigned a stable ID (`p0`, `p1`, …).

> **Note:** The dataset must be retrieved from your external source (e.g., MongoDB) before instantiating the `RAG` class.

---

## Class: `RAG`

The `RAG` class encapsulates the full retrieval, validation, and generation pipeline.

---

## Constructor

```ts
constructor(dataSet: DataSet[])
```

### Responsibilities

- Accepts an externally retrieved dataset.
- Converts each dataset entry into a `RawEmbed` with a stable ID.
- Initializes the Gemini client and generative model.
- Stores a reference to the original dataset for ID → index mapping.

### Internal State Initialized

- `rawEmbedArray: RawEmbed[]` – prepared embedding inputs
- `JSON_DATASET: DataSet[]` – reference dataset
- `genAI: GoogleGenerativeAI` – Gemini SDK client
- `model` – Gemini generative model (`gemini-2.0-flash`)

---

## Method: `createEmbeddings`

```ts
async createEmbeddings(userQuery: string)
```

### Purpose

Creates embeddings if they do not exist, or validates existing embeddings before reuse.

### Behavior

1. Queries MongoDB for existing embeddings.
2. If embeddings exist:
   - Calls `verifyEmbeddings(userQuery)` to ensure they still match the dataset.
   - Returns without regenerating unless verification fails.

3. If no embeddings exist:
   - Iterates over all prepared dataset entries.
   - Sends each entry to the Python embedding service.
   - Stores embeddings in MongoDB using `VectorEmbed.create()`.

### Key Property

This method **prevents silent embedding drift** by ensuring cached vectors always correspond to the current dataset.

---

## Method: `verifyEmbeddings` (Private)

```ts
private async verifyEmbeddings(userQuery: string)
```

### Purpose

Ensures cached embeddings in MongoDB are correct and up-to-date.

### Behavior

- Runs a similarity search using the user query.
- Retrieves the most similar dataset entry.
- Compares it against a known **golden question/answer pair**.
- If the comparison fails:
  - Deletes all existing embeddings.
  - Regenerates embeddings by calling `createEmbeddings`.

### Why This Exists

Without verification, stale or mismatched embeddings can silently corrupt retrieval quality. This check makes embedding validity explicit and self-healing.

---

## Method: `computeSimilarity`

```ts
async computeSimilarity(
	userQuery: string,
	debug: boolean = false
): Promise<string | SimilarityResult[]>
```

### Purpose

Finds the dataset entry most semantically similar to a user query.

### Behavior

- Sends the user query to the Python service for embedding.
- Loads all stored embeddings from MongoDB.
- Computes cosine similarity between the query and each embedding.
- Passes results to `getMostSimilarDocument`.

> **Important:** `createEmbeddings()` must be called before invoking this method.

### Return Value

- `debug === true` → top similarity results with scores
- `debug === false` → matched dataset answer or a fallback string

---

## Method: `getMostSimilarDocument` (Private)

```ts
private getMostSimilarDocument(
	results: SimilarityResult[],
	debug: boolean
): SimilarityResult[] | string
```

### Purpose

Selects and formats the final similarity result.

### Behavior

- Sorts results by descending similarity score.
- Selects the top 3 internally.
- Applies a similarity threshold (`0.3`).
- If below threshold, returns a fallback message.
- Otherwise, maps the embedding ID back to the dataset index and returns the answer.

---

## Method: `debug`

```ts
async debug(userQuery: string)
```

### Purpose

Provides enriched similarity diagnostics for development and validation.

### Behavior

- Calls `computeSimilarity(userQuery, true)`.
- Attaches:
  - Human-readable dataset question
  - Corresponding dataset answer

### Use Case

Helps verify:

- Embedding quality
- ID ↔ dataset alignment
- Similarity scoring behavior

---

## Method: `queryGemini`

```ts
async queryGemini(
	ragQueryResult: string,
	userQuery: string
): Promise<{ answer: string }>
```

### Purpose

Generates a final response grounded strictly in retrieved data.

### Behavior

- Constructs a strict prompt that:
  - Limits answers to UD CS–related questions
  - Enforces HTML-only formatting (`<p>`, `<b>`, `<i>`)
  - Disallows external knowledge

- Sends the prompt to Gemini.
- Extracts and returns the generated response.
- Logs token usage when available.

### Return Value

```ts
{
	answer: string;
}
```

---

## Typical Usage Flow

```ts
const rag = new RAG(dataSet);

await rag.createEmbeddings(userQuestion);

const retrievedAnswer = await rag.computeSimilarity(userQuestion);

const finalResponse = await rag.queryGemini(
	retrievedAnswer as string,
	userQuestion
);
```

---

## Summary

This module provides:

- A database-backed RAG pipeline
- Automatic embedding verification and regeneration
- Deterministic dataset grounding
- Semantic search via cosine similarity
- Optional LLM synthesis with strict context control

The design prioritizes **correctness, transparency, and long-term reliability** over opaque vector reuse, making it suitable for production systems where dataset drift is a real concern.
