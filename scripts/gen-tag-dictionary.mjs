/**
 * 빌드타임 태그 사전 스냅샷 생성기 (1단계 A).
 *
 * SSOT = DB `tag_dictionary`. 빌드 시 이 스크립트가:
 *   1) procedure-mappings.json 베이스라인(ko + synonyms → category 슬러그 / en)을 깔고
 *   2) tag_dictionary(DB, anon SELECT)로 override(겹치면 DB 승)하여
 *   3) src/data/tag-dictionary.generated.json 스냅샷을 산출한다.
 *
 * procedure-dict 의 categoryFor/slugFor/pubmedKeywordsFor/normalizeTag/isBlacklisted/getPubmedDict
 * 는 모두 이 스냅샷을 읽는다(동기·시그니처 불변). 스냅샷에 포함되는 필드:
 *   category·slug  — ko(+synonyms) → 카테고리 슬러그 / 영문 slug
 *   pubmed         — ko → PubMed 영문 검색어 배열 (canonical, getPubmedDict 원본)
 *   aliases        — ko → 동의어 배열 (pubmedKeywordsFor 의 alias 해석용)
 *   blacklist      — 차단 태그 배열
 *   normalizations — 변형어 → 정규화 결과 배열
 * 베이스라인(JSON) ⊕ DB(tag_dictionary.aliases·pubmed_keywords, tag_blacklist, tag_normalization)
 * union (겹치면 DB 승). JSON 제거(L2-4) 후엔 DB 단독.
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
  // procedure-mappings.json: ko + synonyms → {category(슬러그), en, pubmed, aliases, blacklist, normalizations}
  const data = JSON.parse(readFileSync(JSON_SRC, "utf-8"));
  const category = {};
  const slug = {};
  const pubmed = {}; // ko → string[] (canonical only, getPubmedDict 동일)
  const aliases = {}; // ko → string[] (synonyms, 문서·3단계 참고용)
  // keyOwner: 키(ko 또는 synonym) → 소유 ko. OLD KO_INDEX 의미 재현(ko 우선·first-wins).
  //   pubmedKeywordsFor(key) === pubmed[keyOwner[key]] 이 되도록 pubmedLookup 산출에 사용.
  const keyOwner = {};
  for (const m of data.mappings ?? []) {
    const c = VALID.has(m.category) ? m.category : "knowledge";
    const keys = [m.ko, ...(m.synonyms ?? [])].filter((s) => typeof s === "string" && s.length > 0);
    keyOwner[m.ko] = m.ko; // ko 무조건 덮어쓰기(OLD KO_INDEX.set(m.ko,m))
    for (const s of m.synonyms ?? []) if (s && !(s in keyOwner)) keyOwner[s] = m.ko; // synonym 조건부
    for (const k of keys) {
      if (!(k in category)) category[k] = c;
      if (m.en && !(k in slug)) slug[k] = m.en;
    }
    if (Array.isArray(m.pubmedKeywords) && m.pubmedKeywords.length > 0) {
      pubmed[m.ko] = m.pubmedKeywords; // last-wins (getPubmedDict 와 동일)
    }
    if (Array.isArray(m.synonyms) && m.synonyms.length > 0) {
      aliases[m.ko] = (aliases[m.ko] ?? []).concat(m.synonyms);
    }
  }
  const blacklist = Array.isArray(data.blacklist) ? [...data.blacklist] : [];
  const normalizations = {};
  for (const [k, v] of Object.entries(data.normalizations ?? {})) {
    normalizations[k] = Array.isArray(v) ? v : [];
  }
  return { category, slug, pubmed, aliases, blacklist, normalizations, keyOwner };
}

async function restFetch(env, query) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 공개 env 없음");
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!r.ok) throw new Error(`REST ${r.status} (${query})`);
    const chunk = await r.json();
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

const fetchTagDictionary = (env) =>
  restFetch(env, "tag_dictionary?select=ko,category,en,aliases,pubmed_keywords");

async function main() {
  const env = loadEnv();
  const { category, slug, pubmed, aliases, blacklist, normalizations, keyOwner } = baseline();
  let dbCount = 0;
  try {
    const rows = await fetchTagDictionary(env);
    for (const row of rows) {
      const c = KR2SLUG[row.category] ?? "knowledge";
      category[row.ko] = c; // DB override
      if (row.en) slug[row.ko] = row.en;
      if (Array.isArray(row.pubmed_keywords) && row.pubmed_keywords.length > 0) {
        pubmed[row.ko] = row.pubmed_keywords;
      }
      if (Array.isArray(row.aliases) && row.aliases.length > 0) {
        aliases[row.ko] = row.aliases;
        for (const a of row.aliases) if (a && !(a in keyOwner)) keyOwner[a] = row.ko;
      }
      if (!(row.ko in keyOwner)) keyOwner[row.ko] = row.ko;
    }
    dbCount = rows.length;
    // tag_blacklist (union, DB 승)
    for (const r of await restFetch(env, "tag_blacklist?select=word")) {
      if (r.word && !blacklist.includes(r.word)) blacklist.push(r.word);
    }
    // tag_normalization: canonical=변형어(JSON 키), variants=정규화 결과(JSON 값)
    for (const r of await restFetch(env, "tag_normalization?select=canonical,variants")) {
      if (r.canonical != null) normalizations[r.canonical] = Array.isArray(r.variants) ? r.variants : [];
    }
  } catch (e) {
    if (existsSync(OUT)) {
      console.warn(`[gen-tag-dictionary] DB 조회 실패(${e.message}) → 기존 스냅샷 보존, 빌드 계속`);
      return;
    }
    console.warn(`[gen-tag-dictionary] DB 조회 실패(${e.message}) + 스냅샷 없음 → JSON 베이스라인만으로 생성`);
  }
  // pubmedLookup: 키(ko/synonym/alias) → pubmed 배열. OLD KO_INDEX.get(key).pubmedKeywords 동치.
  //   key 소유 ko 에 pubmed 가 있을 때만 등록(ko 우선·first-wins → 동의어 선점 규칙 보존).
  const pubmedLookup = {};
  for (const [key, ownerKo] of Object.entries(keyOwner)) {
    const kws = pubmed[ownerKo];
    if (kws && kws.length > 0) pubmedLookup[key] = kws;
  }
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "tag_dictionary(DB) ⊕ procedure-mappings.json baseline",
    dbRows: dbCount,
    keywords: Object.keys(category).length,
    category,
    slug,
    pubmed,
    pubmedLookup,
    aliases,
    blacklist,
    normalizations,
  };
  writeFileSync(OUT, JSON.stringify(snapshot, null, 0) + "\n", "utf-8");
  console.log(
    `[gen-tag-dictionary] OK keywords=${snapshot.keywords} dbRows=${dbCount}` +
      ` pubmed=${Object.keys(pubmed).length} lookup=${Object.keys(pubmedLookup).length}` +
      ` aliases=${Object.keys(aliases).length} blacklist=${blacklist.length}` +
      ` norm=${Object.keys(normalizations).length} → ${OUT}`,
  );
}

main().catch((e) => {
  // 어떤 예외도 빌드를 막지 않음(기존 스냅샷 있으면 그대로)
  console.warn(`[gen-tag-dictionary] 예외: ${e?.message ?? e} → 빌드 계속`);
  process.exit(0);
});
