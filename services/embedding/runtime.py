"""Project-local, read-only model loading shared by index builder and service."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL = "BAAI/bge-small-zh-v1.5"
INSTRUCTION = "为这个句子生成表示以用于检索相关文章："
CACHE = ROOT / ".rag-runtime" / "hf"
INDEX_PATH = ROOT / "data" / "rag-index" / "vectors.json"
CORPUS_PATH = ROOT / "data" / "knowledge" / "derivatives.json"


def load_corpus():
    corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    canonical = json.dumps(corpus, ensure_ascii=False, separators=(",", ":"))
    return corpus, hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def search_text(card):
    return "\n".join([card["title"], *card["keywords"], card["statement"],
                      *card["formulas"], *[item["text"] for item in card["conditions"]], *card["pitfalls"]])


def load_encoder(revision, download=False):
    from huggingface_hub import snapshot_download
    from sentence_transformers import SentenceTransformer

    snapshot = snapshot_download(repo_id=MODEL, revision=revision, cache_dir=str(CACHE), token=False,
                                 local_files_only=not download,
                                 allow_patterns=["*.json", "*.txt", "*.safetensors", "README.md"])
    model = SentenceTransformer(snapshot, device="cpu", trust_remote_code=False, local_files_only=True)
    # No user code, no remote-code execution, no model fetch on service startup.
    return model

