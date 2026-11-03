import { copyFile, mkdir, readdir } from "node:fs/promises";

// Keep the PDF parser and its worker at exactly the installed package version.
// Public assets bypass browser HMR transforms and are copied into the production build.
await mkdir(new URL("../public/vendor/", import.meta.url), { recursive: true });
await copyFile(new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), new URL("../public/vendor/pdf.worker.min.mjs", import.meta.url));
console.log("Prepared pinned PDF.js worker");
const ocr = new URL("../public/vendor/ocr/", import.meta.url);
await mkdir(new URL("core/", ocr), { recursive: true });
await mkdir(new URL("lang/", ocr), { recursive: true });
await copyFile(new URL("../node_modules/tesseract.js/dist/worker.min.js", import.meta.url), new URL("worker.min.js", ocr));
const core = new URL("../node_modules/tesseract.js-core/", import.meta.url);
for (const name of await readdir(core)) {
  if (/\.wasm(?:\.js)?$/.test(name)) await copyFile(new URL(name, core), new URL(`core/${name}`, ocr));
}
for (const language of ["chi_sim", "eng"]) {
  await copyFile(new URL(`../node_modules/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`, import.meta.url), new URL(`lang/${language}.traineddata.gz`, ocr));
}
console.log("Prepared local Chinese/English OCR assets");
