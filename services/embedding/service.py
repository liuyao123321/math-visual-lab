"""Loopback-only query encoder. Loaded from project cache; never downloads on start."""
import json
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from runtime import MODEL, INSTRUCTION, INDEX_PATH, load_encoder

state = {}


@asynccontextmanager
async def lifespan(app):
    import torch
    torch.set_num_threads(2)
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    if not index.get("ready") or index.get("model") != MODEL or index.get("queryInstruction") != INSTRUCTION:
        raise RuntimeError("Run build-rag-index.py before starting the encoder.")
    state["index"] = index
    state["model"] = load_encoder(index["revision"])
    # Warm up before reporting readiness.
    state["model"].encode([INSTRUCTION + "导数"], normalize_embeddings=True)
    yield
    state.clear()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


class Query(BaseModel):
    text: str = Field(min_length=2, max_length=2000)


@app.get("/health")
def health():
    index = state["index"]
    return {"service": "mathlab-embedding", "ready": True, "model": MODEL,
            "revision": index["revision"], "dimensions": index["dimensions"],
            "sourceHash": index["sourceHash"]}


@app.post("/embed")
def embed(query: Query):
    model = state["model"]
    text = INSTRUCTION + query.text.strip()
    if len(model.tokenizer.encode(text)) > model.max_seq_length:
        # Retrieval may fall back to BM25; never silently cut off math conditions.
        raise HTTPException(status_code=422, detail="query_too_long_for_encoder")
    vector = model.encode([text], normalize_embeddings=True)[0]
    return {"vector": [float(value) for value in vector], "model": MODEL,
            "revision": state["index"]["revision"], "dimensions": int(len(vector))}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning", access_log=False)
