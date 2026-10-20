import { mkdir, writeFile } from "node:fs/promises";

// Generate a small, dependency-free text PDF for the local import demonstration.
const lines = ["Math Visual Lab - Revision Practice", "1. Find the zeros and vertex of f(x)=x^2-4x+3.", "2. Find the extrema of f(x)=x^3-3x.", "3. Integrate (2x-x^2) from 0 to 2 and explain the area."];
const stream = `BT /F1 14 Tf 50 760 Td ${lines.map((line, index) => `${index ? "0 -30 Td " : ""}(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join("\n")} ET`;
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n ").join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await mkdir(new URL("../public/demos/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/demos/revision-sample.pdf", import.meta.url), pdf);
console.log("Created public/demos/revision-sample.pdf");
