// Pure recovery decisions, testable without stopping a student's real server.
export async function superviseServer(deps, options = {}) {
  const config = { intervalMs: 5000, startupPollMs: 1000, startupTimeoutMs: 90000,
    failureThreshold: 3, restartLimit: 3, restartWindowMs: 600000, ...options };
  const now = deps.now ?? Date.now;
  const delay = deps.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let server;
  let firstReady = true;
  let restarts = [];
  try {
    for (;;) {
      if (await deps.shouldStop()) return;
      server = await deps.start();
      const deadline = now() + config.startupTimeoutMs;
      let ready = false;
      while (now() < deadline) {
        if (await deps.shouldStop()) return;
        if (!deps.isRunning(server)) break;
        if (await deps.isHealthy()) { ready = true; break; }
        await delay(config.startupPollMs);
      }
      if (!ready) throw new Error("服务器未能正常启动，请查看本地启动日志；不会无限重试。");
      await deps.onReady(server, firstReady);
      firstReady = false;
      let failures = 0;
      for (;;) {
        await delay(config.intervalMs);
        if (await deps.shouldStop()) return;
        const running = deps.isRunning(server);
        const healthy = running && await deps.isHealthy();
        failures = healthy ? 0 : failures + 1;
        if (!running || failures >= config.failureThreshold) break;
      }
      if (await deps.shouldStop()) return;
      restarts = restarts.filter((at) => now() - at < config.restartWindowMs);
      if (restarts.length >= config.restartLimit) {
        throw new Error("网站连续异常，自动恢复已暂停。请查看启动日志后重新启动，避免反复重启。");
      }
      restarts.push(now());
      await deps.onRecover(server, restarts.length);
      await deps.stop(server);
      server = undefined;
      await delay(Math.min(1000 * 2 ** (restarts.length - 1), 10000));
    }
  } finally {
    if (server) await deps.stop(server);
  }
}
