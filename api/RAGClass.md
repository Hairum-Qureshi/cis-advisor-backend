# RAG (Retrieval-Augmented Generation) Class

This class implements a **lightweight Retrieval-Augmented Generation (RAG) pipeline** using:

- A local JSON Q&A dataset
- Precomputed vector embeddings (cached to disk)
- Cosine similarity for semantic search
- A Python backend for embedding generation
- Google Gemini for final response generation

The goal is to retrieve the most relevant answer from a curated dataset and optionally pass it as grounded context to a generative model.

---

## High-Level Overview

The RAG flow implemented here consists of four main stages:

1. **Dataset Preparation**
   - Converts a structured Q&A JSON dataset into a format suitable for embedding.

2. **Embedding Generation & Caching**
   - Generates vector embeddings for each dataset entry via a Python service.
   - Stores embeddings locally to avoid recomputation.

3. **Semantic Similarity Search**
   - Embeds the user query and compares it against stored embeddings using cosine similarity.
   - Selects the most semantically similar dataset entry.

4. **LLM Answer Generation (Optional)**
   - Sends the retrieved answer as strict context to Gemini for final response generation.

---

## Dependencies

### External Libraries

- `axios` – HTTP client for communicating with the Python embedding server
- `fs` – File system access for embedding cache
- `compute-cosine-similarity` – Computes similarity between embeddings
- `@google/generative-ai` – Gemini API SDK

### Internal Imports

- `JSON_DATASET` – Local Q&A dataset
- Interfaces:
  - `RawEmbed`
  - `Embedding`
  - `SimilarityResult`

---

## Environment Variables

The class relies on the following environment variables:

| Variable            | Description                                      |
| ------------------- | ------------------------------------------------ |
| `GEMINI_API_KEY`    | API key for Google Gemini                        |
| `PYTHON_SERVER_URL` | Base URL of the Python FastAPI embedding service |

---

## Dataset Format

The input dataset (`Fall_25_Spr26_Q&A_For_Model_Training.json`) is expected to contain objects with the following shape:

```ts
{
	Question: string;
	Answer: string;
}
```

Each dataset entry is converted internally into a combined text format:

```
Question: <question> Answer: <answer>
```

---

## Class: `RAG`

The `RAG` class encapsulates the entire retrieval and generation pipeline.

---

## Constructor

```ts
constructor();
```

### Responsibilities

- Iterates over the JSON dataset and constructs an in-memory array of raw embedding inputs.
- Assigns each entry a stable ID (`p0`, `p1`, `p2`, …).
- Initializes the Gemini client.
- Instantiates the Gemini generative model (`gemini-2.5-flash-lite`).

### Internal State Initialized

- `rawEmbedArray: RawEmbed[]`
- `genAI: GoogleGenerativeAI`
- `model: GenerativeModel`

---

## Method: `createAndGetEmbeddings`

```ts
async createAndGetEmbeddings(): Promise<Embedding[]>
```

### Purpose

Creates vector embeddings for the dataset and caches them to disk for reuse.

### Behavior

1. Attempts to read `./JSON/data_with_embeddings.json`.
2. If the file exists:
   - Parses and returns the cached embeddings.

3. If the file does not exist:
   - Iterates over all dataset entries.
   - Sends each entry to the Python embedding server.
   - Collects returned embeddings.
   - Writes them to `data_with_embeddings.json`.
   - Returns the newly generated embeddings.

### Output

```ts
{
  id: string;
  embeddings: number[];
}[]
```

### Notes

- Acts as a **simple persistent cache** to prevent repeated embedding generation.
- Must be run at least once before similarity search.

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

### Parameters

| Name        | Type      | Description                           |
| ----------- | --------- | ------------------------------------- |
| `userQuery` | `string`  | The user’s natural-language query     |
| `debug`     | `boolean` | Whether to return raw similarity data |

### Behavior

1. Sends the user query to the Python service to generate an embedding.
2. Loads cached dataset embeddings from disk.
3. Computes cosine similarity between the query embedding and each dataset embedding.
4. Passes similarity scores to `getMostSimilarDocument`.

### Return Value

- If `debug === true`:
  - Returns an array containing the top similarity result.

- If `debug === false`:
  - Returns the matched dataset answer **or**
  - A fallback string if similarity is below threshold.

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
- Applies a similarity threshold.
- Maps the internal ID back to the original dataset index.

### Threshold Logic

- If similarity score `< 0.6`, returns:

  ```
  "No valid results found for this query."
  ```

- Otherwise returns the matched dataset answer.

---

## Method: `debug`

```ts
async debug(userQuery: string): Promise<SimilarityResult[]>
```

### Purpose

Provides enriched debugging information for similarity search.

### Behavior

- Calls `computeSimilarity` with `debug = true`.
- Attaches:
  - Original dataset question
  - Original dataset answer

- Returns the augmented similarity result.

### Use Case

Useful for validating:

- Embedding correctness
- Similarity scoring
- Dataset alignment

---

## Method: `queryGemini`

```ts
async queryGemini(
  ragQueryResult: string,
  userQuery: string
): Promise<{ reply: string }>
```

### Purpose

Generates a final LLM response grounded strictly in retrieved data.

### Parameters

| Name             | Type     | Description              |
| ---------------- | -------- | ------------------------ |
| `ragQueryResult` | `string` | Retrieved dataset answer |
| `userQuery`      | `string` | Original user question   |

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
	reply: string;
}
```

If the model response is missing or malformed, a fallback message is returned.

---

## Typical Usage Flow

```ts
const rag = new RAG();

await rag.createAndGetEmbeddings();

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
- Deterministic dataset grounding
- Cached embedding generation
- Semantic search via cosine similarity
- Optional LLM synthesis with strict context control

It is designed to be straightforward, inspectable, and extensible while keeping all retrieval logic explicit and local.
