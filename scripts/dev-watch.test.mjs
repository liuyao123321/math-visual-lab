import test from "node:test";
import assert from "node:assert/strict";
import { developmentWatchOptions, isDevelopmentArtifact } from "./dev-watch.mjs";

test("skip runtime directories themselves, before recursively watching their contents", () => {
  for (const directory of [".rag-runtime", ".local-server", ".sites-runtime", ".wrangler", "dist", "outputs"]) {
    assert.equal(isDevelopmentArtifact(`C:\\project\\${directory}`), true);
    assert.equal(isDevelopmentArtifact(`C:\\project\\${directory}\\Lib\\site-packages\\torch\\file.py`), true);
    assert.equal(isDevelopmentArtifact(`/project/${directory}/cache/model.safetensors`), true);
  }
});
test("preserve application, knowledge and embedding-service source updates", () => {
  for (const file of ["app/page.tsx", "components/solve-workspace.tsx", "lib/rag/retrieve.ts", "data/knowledge/derivatives.json",
    "data/rag-index/vectors.json", "services/embedding/service.py", "build/sites-vite-plugin.ts", "scripts/run-framework.mjs"]) {
    assert.equal(isDevelopmentArtifact(`C:\\project\\${file.replaceAll("/", "\\")}`), false);
  }
});
test("do not confuse similarly named source directories with generated directories", () => {
  assert.equal(isDevelopmentArtifact("/project/outputs-view/component.tsx"), false);
  assert.equal(isDevelopmentArtifact("/project/distribution/source.ts"), false);
  assert.equal(isDevelopmentArtifact("/project/.rag-runtime-config.ts"), false);
});
test("retain the existing sandbox polling settings only when requested", () => {
  assert.equal(developmentWatchOptions().ignored("/project/.rag-runtime"), true);
  assert.equal(developmentWatchOptions().usePolling, undefined);
  assert.equal(developmentWatchOptions({ polling: true }).usePolling, true);
  assert.equal(developmentWatchOptions({ polling: true }).useFsEvents, false);
});
