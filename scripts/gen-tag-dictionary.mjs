/**
 * 빌드타임 태그 사전 스냅샷 생성기 (1단계 A).
 *
 * SSOT = DB `tag_dictionary`. 빌드 시 이 스크립트가:
 *   1) procedure-mappings.json 베이스라인(ko + synonyms → category 슬러그 / en)을 깔고
 *   2) tag_dictionary(DB, anon SELECT)로 override(겹치면 DB 승)하여
 *   3) src/data/tag-dictionary.generated.json 스냅샷을 산출한다.
 *
 * procedure-dict 의 categoryFor/slugFor 는 이 스냅샷을 읽는다(동기·시그니처 불변).
 * normalizeTag/pubmedKeywordsFor/blacklist 는 그대로 procedure-mappings.json 사용.
 *
 * DB 접근 실패(무네트워크/무env) 시: 경고만 남기고 기존 커밋된 스냅샷을 보존(exit 0) → 빌드 무중단.
 *
 * 실행: `node scripts/gen-tag-dictionary.mjs` (package.json prebuild 에 연결).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const JSON_SRC = join(ROOT, "src/data/procedure-mappings/procedure-mappings.json");
const OUT = join(ROOT, "src/data/tag-dictionary.generated.json");

const KR2SLUG = {
  피부고민: "concerns",
  리프팅: "lifting",
  스킨부스터: "injectables",
  홈케어: "homecare",
  피부상식: "knowledge",
  미지정: "knowledge", // 기존 미존재 fallback 과 동일
};
const VALID = new Set(["concerns", "lifting", "injectables", "homecare", "knowledge"]);

function loadEnv() {
  const out = {};
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}

function baseline() {
  // procedure-mappings.json: ko + synonyms → {category(슬러그), en}
  const data = JSON.parse(readFileSync(JSON_SRC, "utf-8"));
  const category = {};
  const slug = {};
  for (const m of data.mappings ?? []) {
    const c = VALID.has(m.category) ? m.category : "knowledge";
    const keys = [m.ko, ...(m.synonyms ?? [])].filter((s) => typeof s === "string" && s.length > 0);
    for (const k of keys) {
      if (!(k in category)) category[k] = c;
      if (m.en && !(k in slug)) slug[k] = m.en;
    }
  }
  return { category, slug };
}

async function fetchTagDictionary(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 공개 env 없음");
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${url}/rest/v1/tag_dictionary?select=ko,category,en`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!r.ok) throw new Error(`REST ${r.status}`);
    const chunk = await r.json();
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const env = loadEnv();
  const { category, slug } = baseline();
  let dbCount = 0;
  try {
    const rows = await fetchTagDictionary(env);
    for (const row of rows) {
      const c = KR2SLUG[row.category] ?? "knowledge";
      category[row.ko] = c; // DB override
      if (row.en) slug[row.ko] = row.en;
    }
    dbCount = rows.length;
  } catch (e) {
    if (existsSync(OUT)) {
      console.warn(`[gen-tag-dictionary] DB 조회 실패(${e.message}) → 기존 스냅샷 보존, 빌드 계속`);
      return;
    }
    console.warn(`[gen-tag-dictionary] DB 조회 실패(${e.message}) + 스냅샷 없음 → JSON 베이스라인만으로 생성`);
  }
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "tag_dictionary(DB) ⊕ procedure-mappings.json baseline",
    dbRows: dbCount,
    keywords: Object.keys(category).length,
    category,
    slug,
  };
  writeFileSync(OUT, JSON.stringify(snapshot, null, 0) + "\n", "utf-8");
  console.log(`[gen-tag-dictionary] OK keywords=${snapshot.keywords} dbRows=${dbCount} → ${OUT}`);
}

main().catch((e) => {
  // 어떤 예외도 빌드를 막지 않음(기존 스냅샷 있으면 그대로)
  console.warn(`[gen-tag-dictionary] 예외: ${e?.message ?? e} → 빌드 계속`);
  process.exit(0);
});
