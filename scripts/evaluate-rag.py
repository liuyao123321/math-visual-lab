"""Measure real retrieval over HTTP; never calls a paid generation endpoint."""
import argparse
import datetime
import json
import math
import statistics
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:5173")
    parser.add_argument("--split", choices=["development", "test"], default="development")
    parser.add_argument("--modes", nargs="+", choices=["text", "vector", "hybrid"], default=["text", "vector", "hybrid"])
    parser.add_argument("--allow-fallback", action="store_true", help="Explicitly include degraded retrieval instead of aborting a vector comparison.")
    args = parser.parse_args()
    dataset = json.loads((ROOT / "evaluation/rag/questions.json").read_text(encoding="utf-8"))
    rows = []
    for mode in args.modes:
        for case in dataset[args.split]:
            data = json.dumps({"query": case["query"], "mode": mode}, ensure_ascii=False).encode("utf-8")
            request = urllib.request.Request(args.url.rstrip("/") + "/api/knowledge", data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=12) as response:
                snapshot = json.load(response)["data"]
            ids = [card["id"] for card in snapshot["cards"]]
            if mode != "text" and not case.get("outOfScope", False) and snapshot["vectorStatus"] != "ready" and not args.allow_fallback:
                raise RuntimeError("Vector retrieval is not ready. Start the encoder first, or use --modes text / --allow-fallback.")
            groups = case["groups"]
            covered = not case.get("outOfScope", False)
            recall = sum(any(item in ids for item in group) for group in groups) / len(groups) if groups else None
            rows.append({"id": case["id"], "query": case["query"], "requestedMode": mode, "actualMode": snapshot["retrievalMode"],
                         "vectorStatus": snapshot["vectorStatus"], "retrievedIds": ids, "recallAt4": recall,
                         "coverageCorrect": bool(ids) == covered, "retrievalMs": snapshot["retrievalMs"],
                         "knowledgeBaseVersion": snapshot["knowledgeBaseVersion"]})
    summary = {}
    for mode in args.modes:
        subset = [row for row in rows if row["requestedMode"] == mode]
        recalls = [row["recallAt4"] for row in subset if row["recallAt4"] is not None]
        times = sorted(row["retrievalMs"] for row in subset)
        actual = {value: sum(row["actualMode"] == value for row in subset) for value in sorted({row["actualMode"] for row in subset})}
        summary[mode] = {"cases": len(subset), "meanRecallAt4": round(statistics.mean(recalls), 4),
                         "coverageAccuracy": round(sum(row["coverageCorrect"] for row in subset) / len(subset), 4),
                         "actualModes": actual, "medianRetrievalMs": statistics.median(times),
                         "p95RetrievalMs": times[max(0, math.ceil(len(times) * .95) - 1)]}
    report = {"measuredAtUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(), "split": args.split,
              "scope": "retrieval only; no generated-answer accuracy measurement", "summary": summary, "rows": rows}
    output = ROOT / "evaluation" / "rag" / f"results-{args.split}.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Saved {output.name}; these are retrieval measurements, not answer-quality claims.")


if __name__ == "__main__":
    main()
