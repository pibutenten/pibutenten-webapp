// 사전 통합 사전조사 — category-sets.ts 의 키워드 중 JSON 에 없는 것 식별.
import fs from "node:fs";

const src = fs.readFileSync(
  new URL("../src/lib/category-sets.ts", import.meta.url),
  "utf8",
);

function extract(name) {
  const re = new RegExp(
    String.raw`${name}\s*=\s*new Set<string>\(\[([\s\S]*?)\]\)`,
  );
  const m = src.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const L = extract("LIFTING");
const I = extract("INJECTION");
const C = extract("CONDITION");
const H = extract("HOMECARE");
console.log("category-sets sizes:", {
  LIFTING: L.length,
  INJECTION: I.length,
  CONDITION: C.length,
  HOMECARE: H.length,
});

const json = JSON.parse(
  fs.readFileSync(
    new URL("../src/data/procedure-mappings/procedure-mappings.json", import.meta.url),
    "utf8",
  ),
);
const jset = new Set(json.mappings.map((m) => m.ko));

const missing = { lifting: [], skinbooster: [], concerns: [], homecare: [] };
for (const k of L) if (!jset.has(k)) missing.lifting.push(k);
for (const k of I) if (!jset.has(k)) missing.skinbooster.push(k);
for (const k of C) if (!jset.has(k)) missing.concerns.push(k);
for (const k of H) if (!jset.has(k)) missing.homecare.push(k);

console.log("\nJSON missing (category-sets has it but JSON doesn't):");
for (const cat of Object.keys(missing)) {
  console.log(
    `  ${cat} [${missing[cat].length}]: ${missing[cat].join(", ")}`,
  );
}

// PUBMED 사전 키도 확인
const tagSrc = fs.readFileSync(
  new URL("../src/lib/tag-dictionary.ts", import.meta.url),
  "utf8",
);
const pubmedKeys = [
  ...tagSrc.matchAll(/^  "([^"]+)":\s*\[/gm),
].map((m) => m[1]);
console.log(`\nPUBMED dict 항목 수: ${pubmedKeys.length}`);
const pubmedMissing = pubmedKeys.filter((k) => !jset.has(k));
console.log(`PUBMED 항목 중 JSON 에 없는 키: ${pubmedMissing.length}`);
if (pubmedMissing.length) console.log("  →", pubmedMissing.join(", "));
