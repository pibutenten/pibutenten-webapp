/**
 * 원장 결정 반영 — 5개 단어 처리.
 *
 *   1. 마리오네트라인 으로 통일 (마리오네트주름 → 마리오네트라인)
 *   2. 시술후관리 entry 추가 (knowledge, PubMed)
 *   3. 가교제 / 분자량 / 섬유아세포 — 이미 entry 있음 (확인만)
 */
import fs from "node:fs";

const JSON_PATH = new URL(
  "../src/data/procedure-mappings/procedure-mappings.json",
  import.meta.url,
);
const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

// ── 1) "마리오네트라인" entry 추가 ────────────────────────────
const koIdx = new Map(json.mappings.map((m) => [m.ko, m]));
if (!koIdx.has("마리오네트라인")) {
  json.mappings.push({
    ko: "마리오네트라인",
    en: "marionette-line",
    category: "concerns",
    type: "medical",
    synonyms: ["마리오네트", "마리오네트주름"],
    pubmedKeywords: ["marionette lines", "perioral wrinkles"],
  });
  console.log("[1] 마리오네트라인 entry 추가됨");
} else {
  console.log("[1] 마리오네트라인 entry 이미 존재");
}

// ── 2) normalizations: 모든 "마리오네트주름" → "마리오네트라인" ────
let normFixed = 0;
for (const key of Object.keys(json.normalizations)) {
  const arr = json.normalizations[key];
  let changed = false;
  const newArr = arr.map((v) => {
    if (v === "마리오네트주름") {
      changed = true;
      return "마리오네트라인";
    }
    return v;
  });
  if (changed) {
    json.normalizations[key] = newArr;
    normFixed++;
  }
}
// "마리오네트라인" key 가 자기 자신만 가리키면 제거 (의미 없음)
if (
  json.normalizations["마리오네트라인"] &&
  json.normalizations["마리오네트라인"].length === 1 &&
  json.normalizations["마리오네트라인"][0] === "마리오네트라인"
) {
  delete json.normalizations["마리오네트라인"];
  console.log("[2] 자기참조 normalization '마리오네트라인' 제거");
}
console.log(`[2] normalizations 5건 중 ${normFixed}건 → 마리오네트라인으로 변경`);

// ── 3) "시술후관리" entry 추가 ────────────────────────────────
if (!koIdx.has("시술후관리")) {
  json.mappings.push({
    ko: "시술후관리",
    en: "post-procedure-care",
    category: "knowledge",
    type: "general",
    synonyms: ["시술후케어", "시술후"],
    pubmedKeywords: ["post-procedure care", "post-treatment care"],
  });
  console.log("[3] 시술후관리 entry 추가됨");
} else {
  console.log("[3] 시술후관리 entry 이미 존재");
}

// ── 4) 가교제/분자량/섬유아세포 확인 ──────────────────────────
const confirmed = ["가교제", "분자량", "섬유아세포"];
for (const t of confirmed) {
  const e = koIdx.get(t);
  console.log(
    `[4] ${t}: ${e ? "✅ entry 존재 (pubmed: " + JSON.stringify(e.pubmedKeywords) + ")" : "❌ 없음"}`,
  );
}

// ── 메타 업데이트 ─────────────────────────────────────────────
json.lastUpdated = "2026-05-17";

// ── 저장 ────────────────────────────────────────────────────
fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2) + "\n");
console.log(
  `\n✅ 저장 완료. mappings ${json.mappings.length}건 / normalizations ${Object.keys(json.normalizations).length}건`,
);
