import fs from "node:fs";
const j = JSON.parse(
  fs.readFileSync(
    new URL("../src/data/procedure-mappings/procedure-mappings.json", import.meta.url),
    "utf8",
  ),
);

console.log("=== 마리오네트 관련 mappings ===");
for (const m of j.mappings) {
  if (m.ko.includes("마리오네트")) console.log(JSON.stringify(m));
}

console.log("\n=== 마리오네트 관련 normalizations ===");
for (const [k, v] of Object.entries(j.normalizations)) {
  if (k.includes("마리오네트") || v.some((x) => x.includes("마리오네트"))) {
    console.log(`  ${k} -> ${JSON.stringify(v)}`);
  }
}

console.log("\n=== 추가 대상 5개 현재 상태 ===");
const targets = ["마리오네트라인", "마리오네트주름", "시술후관리", "가교제", "분자량", "섬유아세포"];
for (const t of targets) {
  const exists = j.mappings.find((m) => m.ko === t);
  const inNorm = j.normalizations[t];
  console.log(
    `  ${t}: entry=${exists ? "YES (" + JSON.stringify(exists) + ")" : "NO"}, normalization=${inNorm ? JSON.stringify(inNorm) : "NO"}`,
  );
}
