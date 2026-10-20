import test from "node:test";
import assert from "node:assert/strict";
import { monitorRagStartup } from "./rag-startup.mjs";

function harness() {
  const h = { time: 0, running: true, ready: false, stopped: 0, unavailable: [] };
  h.deps = {
    now: () => h.time,
    delay: async (ms) => { h.time += ms; await h.afterDelay?.(); },
    isRunning: () => h.running,
    isReady: () => h.ready,
    isHealthy: async () => false,
    stop: async () => { h.stopped++; h.running = false; },
    onReady: async () => { h.ready = true; },
    onUnavailable: async (reason) => { h.unavailable.push(reason); },
  };
  return h;
}

test("a slow encoder can become ready after the former 45-second deadline", async () => {
  const h = harness();
  h.deps.isHealthy = async () => h.time >= 60000;
  assert.equal(await monitorRagStartup(h.deps), true);
  assert.equal(h.ready, true);
  assert.equal(h.stopped, 0);
});

test("pending encoder readiness does not block the caller from starting the website", async () => {
  const h = harness();
  let finishProbe;
  h.deps.isHealthy = () => new Promise((resolve) => { finishProbe = resolve; });
  const readiness = monitorRagStartup(h.deps);
  assert.equal(h.ready, false);
  // The web runtime can proceed while the first health request is pending.
  assert.equal(h.stopped, 0);
  finishProbe(true);
  assert.equal(await readiness, true);
});

test("an unavailable encoder has a finite deadline and only its own stop callback runs", async () => {
  const h = harness();
  assert.equal(await monitorRagStartup(h.deps, { timeoutMs: 20, intervalMs: 5 }), false);
  assert.deepEqual(h.unavailable, ["timeout"]);
  assert.equal(h.stopped, 1);
});

test("an exited encoder falls back immediately without waiting for the deadline", async () => {
  const h = harness();
  h.afterDelay = () => { h.running = false; };
  assert.equal(await monitorRagStartup(h.deps), false);
  assert.deepEqual(h.unavailable, ["exited"]);
  assert.equal(h.time, 500);
});

test("an encoder exiting during a successful probe cannot be reported ready", async () => {
  const h = harness();
  h.deps.isHealthy = async () => { h.running = false; return true; };
  assert.equal(await monitorRagStartup(h.deps), false);
  assert.equal(h.ready, false);
  assert.deepEqual(h.unavailable, ["exited"]);
});

test("probe errors are handled without failing the website", async () => {
  const h = harness();
  h.deps.isHealthy = async () => { throw new Error("unavailable"); };
  assert.equal(await monitorRagStartup(h.deps), false);
  assert.deepEqual(h.unavailable, ["error"]);
  assert.equal(h.stopped, 1);
});
