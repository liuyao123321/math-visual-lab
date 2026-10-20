import { copyFile, mkdir } from "node:fs/promises";

// Keep the PDF parser and its worker at exactly the installed package version.
// Public assets bypass browser HMR transforms and are copied into the production build.
await mkdir(new URL("../public/vendor/", import.meta.url), { recursive: true });
await copyFile(new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), new URL("../public/vendor/pdf.worker.min.mjs", import.meta.url));
console.log("Prepared pinned PDF.js worker");
