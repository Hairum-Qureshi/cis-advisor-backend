import os
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
load_dotenv()

app = FastAPI()

# Get a free token from: https://huggingface.co/settings/tokens
HF_TOKEN = os.getenv("HF_TOKEN")
MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
API_URL = f"https://router.huggingface.co/hf-inference/models/{MODEL_ID}/pipeline/feature-extraction"

class TextRequest(BaseModel):
    id: str
    text: str

class EmbeddingResponse(BaseModel):
    text: str

@app.get("/")
async def root():
    return {"message": "Welcome to the Embedding API for the CIS advisor chat bot!"}

@app.post("/embed")
async def embed_text(req: TextRequest):
    return {"id": req.id, "embedding": await get_hf_embedding(req.text)}

@app.post("/query-to-embedding")
async def query_to_embedding(req: EmbeddingResponse):
    return {"embedding": await get_hf_embedding(req.text)}

async def get_hf_embedding(text: str):
    if not HF_TOKEN:
        raise HTTPException(500, "HF_TOKEN not configured")

    headers = {"Authorization": f"Bearer {HF_TOKEN}"}

    # Use the simplest format possible for feature-extraction
    payload = {
        "inputs": text,
        "options": {"wait_for_model": True}
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            API_URL,
            headers=headers,
            json=payload,
        )

    if response.status_code != 200:
        # If it still complains about 'sentences', use this fallback payload:
        # payload = {"inputs": {"source_sentence": text, "sentences": [text]}}
        raise HTTPException(status_code=502, detail=response.text)

    return response.json()

# command to run the server: uvicorn main:app --reload