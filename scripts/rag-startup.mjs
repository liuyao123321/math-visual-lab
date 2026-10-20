// The optional encoder must not hold up the website's own startup deadline.
// Keep readiness/lifecycle decisions independent of real Python processes.
export function monitorRagStartup(deps, { timeoutMs = 120000, intervalMs = 500 } = {}) {
  const now = deps.now ?? Date.now;
  const delay = deps.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const started = now();
  return (async () => {
    try {
      while (deps.isRunning() && now() - started < timeoutMs) {
        if (await deps.isHealthy()) {
          // The child can exit while its last health request is in flight.
          if (!deps.isRunning()) break;
          await deps.onReady(now() - started);
          return true;
        }
        await delay(intervalMs);
      }
      await deps.onUnavailable(deps.isRunning() ? "timeout" : "exited", now() - started);
      return false;
    } catch (error) {
      await deps.onUnavailable("error", now() - started, error);
      return false;
    } finally {
      // Once ready, the encoder is retained until the web process exits.
      // Failed startup stops only the child that this runtime created.
      if (!deps.isReady()) await deps.stop();
    }
  })();
}
