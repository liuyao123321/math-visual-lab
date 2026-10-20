// Vite does not automatically honor every .gitignore entry. In particular the
// Python environment, downloaded model and pip caches can contain thousands of
// files. Watching them can monopolize fs.watch and stall HTTP startup on Windows.
const generatedDirectory = /(?:^|\/)(?:\.rag-runtime|\.local-server|\.sites-runtime|\.wrangler|dist|outputs)(?:\/|$)/;

export function isDevelopmentArtifact(filename) {
  return generatedDirectory.test(String(filename).replaceAll("\\", "/"));
}

export function developmentWatchOptions({ polling = false } = {}) {
  return {
    ignored: isDevelopmentArtifact,
    ...(polling ? { useFsEvents: false, usePolling: true } : {}),
  };
}
