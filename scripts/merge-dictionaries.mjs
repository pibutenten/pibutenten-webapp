/**
 * 사전 통합 스크립트 — procedure-mappings.json 을 마스터 SSOT 로 확장.
 *
 * 흡수 대상:
 *   1) src/lib/category-sets.ts 의 누락 키워드 → JSON entries 추가
 *   2) src/lib/tag-dictionary.ts 의 PUBMED_KEYWORD_DICT → entry.pubmedKeywords 필드
 *   3) src/lib/tag-dictionary.ts 의 TAG_MAPPINGS → JSON.normalizations 섹션
 *   4) src/lib/tag-dictionary.ts 의 TAG_BLACKLIST → JSON.blacklist 섹션
 *
 * 안전 가드:
 *   - 기존 mappings entry 의 ko/en/category/type/synonyms 절대 수정 X (추가만)
 *   - 신규 entry 추가 시 카테고리는 보수적으로 분류 (모호하면 "knowledge")
 *   - 실행 후 byte-level diff 확인 권장
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(
  ROOT,
  "..",
  "src/data/procedure-mappings/procedure-mappings.json",
);

const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

// ── 1) category-sets.ts 의 누락 키워드 (사전 조사 결과) ──────────
//   JSON 에 없지만 category-sets 가 분류해 둔 키워드 — 보수적으로 흡수
const MISSING_BY_CATEGORY = {
  lifting: [
    ["레이저토닝", "laser-toning", "general"],
    ["바늘RF", "needle-rf", "general"], // (이미 needle-rf 가 있을 수도 — synonyms 처리 보다 entry 추가가 단순)
    ["RF", "rf", "general"], // 동일 사유. 코드는 ko 단위로 검색하므로 별도 entry 안전
  ],
  injectables: [["보툴리늄", "botulinum", "general"]],
  concerns: [
    ["민감성", "sensitive", "general"],
    ["민감피부", "sensitive-skin", "general"],
    ["예민피부", "sensitive-skin-2", "general"],
    ["장벽손상", "barrier-damage", "general"],
    ["겨땀", "armpit-sweat", "general"],
    ["안티에이징", "anti-aging", "general"],
    ["민감", "sensitive-keyword", "general"],
  ],
  homecare: [
    ["선크림", "sunscreen", "general"],
    ["요소크림", "urea-cream", "general"],
  ],
};

const existingKo = new Set(json.mappings.map((m) => m.ko));
let addedCount = 0;
for (const [cat, items] of Object.entries(MISSING_BY_CATEGORY)) {
  for (const [ko, en, type] of items) {
    if (existingKo.has(ko)) continue;
    json.mappings.push({ ko, en, category: cat, type });
    existingKo.add(ko);
    addedCount++;
  }
}
console.log(`[1/4] 누락 키워드 추가: ${addedCount}건`);

// ── 2) PUBMED_KEYWORD_DICT → entry.pubmedKeywords 필드 ────────
const tagDictSrc = fs.readFileSync(
  path.join(ROOT, "..", "src/lib/tag-dictionary.ts"),
  "utf8",
);

// PUBMED_KEYWORD_DICT 블록 추출
const pubmedMatch = tagDictSrc.match(
  /PUBMED_KEYWORD_DICT[^=]*=\s*\{([\s\S]*?)^\};/m,
);
const pubmedDict = {};
if (pubmedMatch) {
  // 각 key 별로 값 배열 파싱
  const entryRe = /"([^"]+)":\s*\[([^\]]+)\]/g;
  let m;
  while ((m = entryRe.exec(pubmedMatch[1])) !== null) {
    const key = m[1];
    const values = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    pubmedDict[key] = values;
  }
}
console.log(`     PUBMED dict 파싱: ${Object.keys(pubmedDict).length}건`);

// 매칭되는 entry 에 pubmedKeywords 필드 추가, 매칭 안 되는 key 는 별도 보고
let matchedPubmed = 0;
const unmatchedPubmedKeys = [];
const koIdx = new Map(json.mappings.map((m) => [m.ko, m]));
for (const [key, vals] of Object.entries(pubmedDict)) {
  const entry = koIdx.get(key);
  if (entry) {
    entry.pubmedKeywords = vals;
    matchedPubmed++;
  } else {
    unmatchedPubmedKeys.push({ key, vals });
  }
}

// 매칭 안 된 키들 중 합성어가 아닌 단순 키워드는 knowledge 카테고리로 신규 entry 추가
// (합성어 정규화 결과는 normalizations 섹션에서 처리)
const isCompound = (k) => {
  // 합성어 휴리스틱: 4글자 이상 + 이미 다른 키워드의 prefix/suffix 와 겹침
  if (k.length < 4) return false;
  return Array.from(existingKo).some(
    (e) => e !== k && (k.startsWith(e) || k.endsWith(e)) && e.length >= 2,
  );
};

let addedFromPubmed = 0;
for (const { key, vals } of unmatchedPubmedKeys) {
  if (isCompound(key)) continue; // 합성어는 normalizations 가 처리
  // 단순 키워드 — 신규 entry 추가
  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9\u3131-\uD79D]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  json.mappings.push({
    ko: key,
    en: vals[0]?.split(" ")[0] ?? slug,
    category: "knowledge",
    type: "general",
    pubmedKeywords: vals,
  });
  existingKo.add(key);
  addedFromPubmed++;
}
console.log(
  `[2/4] PUBMED → entry.pubmedKeywords: 매칭 ${matchedPubmed}건, 신규 ${addedFromPubmed}건, 합성어 skip ${unmatchedPubmedKeys.length - addedFromPubmed}건`,
);

// ── 3) TAG_MAPPINGS → JSON.normalizations 섹션 ─────────────────
const mappingsBlock = tagDictSrc.match(
  /TAG_MAPPINGS[^=]*=\s*\{([\s\S]*?)^\};/m,
);
const normalizations = {};
if (mappingsBlock) {
  const entryRe = /"([^"]+)":\s*\[([^\]]*)\]/g;
  let m;
  while ((m = entryRe.exec(mappingsBlock[1])) !== null) {
    const key = m[1];
    const values = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    normalizations[key] = values;
  }
}
json.normalizations = normalizations;
console.log(
  `[3/4] TAG_MAPPINGS → normalizations: ${Object.keys(normalizations).length}건`,
);

// ── 4) TAG_BLACKLIST → JSON.blacklist 섹션 ─────────────────────
const blacklistBlock = tagDictSrc.match(
  /TAG_BLACKLIST[^=]*=\s*new Set[^[]*\[([\s\S]*?)\]\s*\)/,
);
const blacklist = [];
if (blacklistBlock) {
  for (const m of blacklistBlock[1].matchAll(/"([^"]+)"/g)) {
    blacklist.push(m[1]);
  }
}
json.blacklist = blacklist;
console.log(`[4/4] TAG_BLACKLIST → blacklist: ${blacklist.length}건`);

// ── 메타 업데이트 ─────────────────────────────────────────────
json.version = "2.0.0";
json.lastUpdated = "2026-05-17";
json.$comment =
  "피부텐텐 시술명·태그 통합 사전 SSOT — slug 생성 + 카테고리 분류 + PubMed 검색어 + 합성어 정규화 + 블랙리스트";

// ── 저장 ────────────────────────────────────────────────────
fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2) + "\n");
console.log(`\n✅ JSON 저장 완료. 총 ${json.mappings.length}개 entries.`);
console.log(`   normalizations: ${Object.keys(json.normalizations).length}`);
console.log(`   blacklist: ${json.blacklist.length}`);
