# RAG (Retrieval-Augmented Generation) Class

This class implements a **lightweight Retrieval-Augmented Generation (RAG) pipeline** using:

- A dataset retrieved from MongoDB (or any external source) and passed into the constructor
- Vector embeddings stored and retrieved from MongoDB
- Cosine similarity for semantic search
- A Python backend for embedding generation
- Google Gemini for final response generation

The goal is to retrieve the most relevant answer from a curated dataset and optionally pass it as grounded context to a generative model.

---

## High-Level Overview

The RAG flow consists of four main stages:

1. **Dataset Preparation**
   - Accepts a pre-fetched dataset and converts it into a format suitable for embedding.

2. **Embedding Generation & Caching**
   - Generates vector embeddings for each dataset entry via a Python service.
   - Stores embeddings in MongoDB for efficient retrieval and reuse.

3. **Semantic Similarity Search**
   - Embeds the user query and compares it against stored embeddings using cosine similarity.
   - Selects the most semantically similar dataset entry.

4. **LLM Answer Generation (Optional)**
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

| Variable            | Description                                      |
| ------------------- | ------------------------------------------------ |
| `GEMINI_API_KEY`    | API key for Google Gemini                        |
| `PYTHON_SERVER_URL` | Base URL of the Python FastAPI embedding service |

---

## Dataset Format

The dataset passed to the `RAG` constructor must contain objects with the following shape:

```ts
{
	Question: string;
	Answer: string;
}
```

Each entry is internally converted to a combined text format:

```
Question: <question> Answer: <answer>
```

and assigned a stable ID (`p0`, `p1`, …).

> **Note:** The dataset must be retrieved from your external source (e.g., MongoDB) prior to instantiating the `RAG` class.

---

## Class: `RAG`

The `RAG` class encapsulates the entire retrieval and generation pipeline.

---

## Constructor

```ts
constructor(dataSet: DataSet[])
```

### Responsibilities

- Accepts a dataset (retrieved externally) and constructs an internal array of raw embedding inputs.
- Assigns each entry a stable ID (`p0`, `p1`, …) for embedding and retrieval.
- Initializes the Gemini client.
- Instantiates the Gemini generative model (`gemini-2.5-flash-lite`).

### Internal State Initialized

- `rawEmbedArray: RawEmbed[]` – prepared embedding inputs
- `genAI: GoogleGenerativeAI` – Gemini SDK client
- `model: GenerativeModel` – Gemini model instance
- `JSON_DATASET: DataSet[]` – reference to the passed dataset

---

## Method: `createEmbeddings`

```ts
async createEmbeddings(): Promise<Vector[]>
```

### Purpose

Creates vector embeddings for the dataset and caches them in MongoDB for reuse.

### Behavior

1. Checks whether embeddings already exist in MongoDB.
2. If they exist, returns the existing embeddings.
3. Otherwise, iterates over all dataset entries, sending each to the Python embedding server.
4. Stores the returned embeddings in MongoDB via `VectorEmbed.create()`.
5. Returns the newly created embeddings.

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

- Sends the user query to the Python service to generate an embedding.
- Loads stored embeddings from MongoDB.
- Computes cosine similarity between the query embedding and each dataset embedding.
- Passes similarity scores to `getMostSimilarDocument`.

### Return Value

- If `debug === true`: returns an array containing the top similarity result.
- If `debug === false`: returns the matched dataset answer or a fallback string if similarity is below threshold.

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
- Selects the top match.
- Applies a similarity threshold (default 0.6).
- Maps the internal ID back to the original dataset index.

---

## Method: `debug`

```ts
async debug(userQuery: string): Promise<SimilarityResult[]>
```

### Purpose

Provides enriched debugging information for similarity search.

- Calls `computeSimilarity` with `debug = true`.

- Attaches:
  - Original dataset question
  - Original dataset answer

- Useful for validating embedding correctness, similarity scoring, and dataset alignment.

---

## Method: `queryGemini`

```ts
async queryGemini(
  ragQueryResult: string,
  userQuery: string
): Promise<{ answer: string }>
```

### Purpose

Generates a final LLM response grounded strictly in retrieved data.

### Behavior

- Constructs a strict prompt that:
  - Limits answers to UD CS–related topics
  - Enforces HTML-only formatting
  - Disallows external knowledge

- Sends the prompt to Gemini.

- Extracts and returns the generated response.

- Optionally logs token usage.

### Return Value

```ts
{
	answer: string;
}
```

---

## Typical Usage Flow

```ts
// Assume `dataSet` is fetched from MongoDB first
const rag = new RAG(dataSet);

await rag.createEmbeddings();

const retrievedAnswer = await rag.computeSimilarity(userQuestion);

const finalResponse = await rag.queryGemini(
	retrievedAnswer as string,
	userQuestion
);
```

---

## Summary

This module provides:

- A self-contained RAG pipeline
- Deterministic dataset grounding from MongoDB
- Cached embedding generation
- Semantic search via cosine similarity
- Optional LLM synthesis with strict context control

It is designed to be straightforward, inspectable, and extensible, while keeping all retrieval logic explicit and database-backed.
