import test from "node:test";
import assert from "node:assert/strict";
import { superviseServer } from "./local-supervisor.mjs";

function harness() {
  const h = { time: 0, ticks: 0, stopping: false, started: [], stopped: [], ready: [], recovered: [] };
  h.deps = {
    now: () => h.time,
    delay: async (ms) => { h.time += ms; h.ticks++; await h.afterDelay?.(ms); },
    start: async () => { const s = { id: h.started.length + 1, alive: true }; h.started.push(s); return s; },
    stop: async (s) => { s.alive = false; h.stopped.push(s.id); },
    isRunning: (s) => s.alive,
    isHealthy: async () => true,
    shouldStop: async () => h.stopping,
    onReady: async (s, first) => { h.ready.push({ id: s.id, first }); },
    onRecover: async (s, attempt) => { h.recovered.push({ id: s.id, attempt }); },
  };
  return h;
}

test("a transient bad response resets the failure count, without restart", async () => {
  const h = harness();
  const health = [true, false, false, true, false];
  h.deps.isHealthy = async () => health.shift() ?? true;
  h.afterDelay = () => { if (h.ticks === 5) h.stopping = true; };
  await superviseServer(h.deps);
  assert.equal(h.started.length, 1);
  assert.equal(h.recovered.length, 0);
  assert.deepEqual(h.stopped, [1]);
});

test("three consecutive HTTP failures restart once and do not reopen the browser", async () => {
  const h = harness();
  const health = [true, false, false, false, true];
  h.deps.isHealthy = async () => health.shift() ?? true;
  h.deps.onReady = async (s, first) => { h.ready.push({ id: s.id, first }); if (!first) h.stopping = true; };
  await superviseServer(h.deps);
  assert.deepEqual(h.ready, [{ id: 1, first: true }, { id: 2, first: false }]);
  assert.deepEqual(h.recovered, [{ id: 1, attempt: 1 }]);
  assert.deepEqual(h.stopped, [1, 2]);
});

test("an exited server recovers without waiting for three HTTP failures", async () => {
  const h = harness();
  h.afterDelay = () => { if (h.ticks === 1) h.started[0].alive = false; };
  h.deps.onReady = async (s, first) => { if (!first) h.stopping = true; };
  await superviseServer(h.deps);
  assert.equal(h.started.length, 2);
  assert.equal(h.recovered.length, 1);
});

test("startup timeout stops the child rather than leaving an orphan or retrying forever", async () => {
  const h = harness();
  h.deps.isHealthy = async () => false;
  await assert.rejects(superviseServer(h.deps, { startupTimeoutMs: 20, startupPollMs: 5 }), /未能正常启动/);
  assert.deepEqual(h.stopped, [1]);
  assert.equal(h.ready.length, 0);
  assert.equal(h.recovered.length, 0);
});

test("intentional stop during startup cleans up and never restarts", async () => {
  const h = harness();
  h.deps.isHealthy = async () => false;
  h.afterDelay = () => { h.stopping = true; };
  await superviseServer(h.deps);
  assert.equal(h.started.length, 1);
  assert.deepEqual(h.stopped, [1]);
  assert.equal(h.ready.length, 0);
});

test("repeated failures are bounded to three recoveries per window", async () => {
  const h = harness();
  let calls = 0;
  h.deps.isHealthy = async () => calls++ % 4 === 0;
  await assert.rejects(superviseServer(h.deps, { intervalMs: 1 }), /自动恢复已暂停/);
  assert.equal(h.started.length, 4);
  assert.equal(h.recovered.length, 3);
  assert.deepEqual(h.stopped, [1, 2, 3, 4]);
});

test("stop during recovery backoff prevents the next spawn", async () => {
  const h = harness();
  let calls = 0;
  h.deps.isHealthy = async () => calls++ === 0;
  h.deps.onRecover = async () => { h.stopping = true; };
  await superviseServer(h.deps);
  assert.equal(h.started.length, 1);
  assert.deepEqual(h.stopped, [1]);
});

test("old recoveries expire, so a later isolated failure is still recoverable", async () => {
  const h = harness();
  h.afterDelay = () => { h.started.at(-1).alive = false; };
  h.deps.onReady = async () => { if (h.started.length === 5) h.stopping = true; };
  await superviseServer(h.deps, { restartWindowMs: 1000, intervalMs: 2000 });
  assert.equal(h.started.length, 5);
  assert.equal(h.recovered.length, 4);
});
