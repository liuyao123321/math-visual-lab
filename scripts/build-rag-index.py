"""Build checked course vectors once; never reads browser keys or learning data."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "embedding"))
from runtime import MODEL, INSTRUCTION, INDEX_PATH, load_corpus, load_encoder, search_text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--revision", help="Pinned model commit. Resolves current commit on first setup if omitted.")
    parser.add_argument("--offline", action="store_true", help="Use only already cached model files.")
    args = parser.parse_args()
    from huggingface_hub import HfApi
    import torch
    torch.set_num_threads(2)

    old = json.loads(INDEX_PATH.read_text(encoding="utf-8")) if INDEX_PATH.exists() else {}
    revision = args.revision or old.get("revision")
    if not revision:
        if args.offline:
            raise ValueError("Offline rebuild requires a previously pinned revision.")
        revision = HfApi().model_info(MODEL, token=False).sha
    model = load_encoder(revision, download=not args.offline)
    corpus, fingerprint = load_corpus()
    cards = [card for card in corpus["cards"] if card["reviewStatus"] != "draft"]
    ids = [card["id"] for card in cards]
    if len(ids) != len(set(ids)) or any(card["sourceId"] not in corpus["sources"] for card in cards):
        raise ValueError("Duplicate IDs or missing sources.")
    texts = [search_text(card) for card in cards]
    for card, text in zip(cards, texts):
        if len(model.tokenizer.encode(text)) > model.max_seq_length:
            raise ValueError(f"Card {card['id']} exceeds encoder limit; shorten it without losing conditions.")
    values = model.encode(texts, batch_size=8, normalize_embeddings=True, show_progress_bar=True)
    dimensions = int(values.shape[1])
    if dimensions != 512:
        raise ValueError("Unexpected encoder dimensions.")
    payload = {"ready": True, "model": MODEL, "revision": revision, "dimensions": dimensions,
               "sourceHash": fingerprint, "queryInstruction": INSTRUCTION,
               "vectors": [{"id": card["id"], "values": [round(float(value), 8) for value in vector]}
                           for card, vector in zip(cards, values)]}
    temporary = INDEX_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(INDEX_PATH)
    print(json.dumps({"cards": len(cards), "model": MODEL, "revision": revision,
                      "dimensions": dimensions, "sourceHash": fingerprint}, ensure_ascii=False))


if __name__ == "__main__":
    main()
