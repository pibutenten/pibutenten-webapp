/**
 * 빌드타임 태그 사전 스냅샷 생성기 (L2-4: DB 단독).
 *
 * SSOT = DB `tag_dictionary`(+ `tag_blacklist`, `tag_normalization`). 빌드 시 anon SELECT 로
 *   읽어 src/data/tag-dictionary.generated.json 스냅샷을 산출한다. procedure-mappings.json 의존 제거.
 *
 * procedure-dict/auto-tag 의 모든 lookup 이 이 스냅샷을 읽는다(동기·시그니처 불변). 스냅샷 필드:
 *   category·slug  — ko(+aliases) → 카테고리 슬러그 / 영문 slug
 *   pubmed         — ko → PubMed 영문 검색어 배열 (canonical, getPubmedDict 원본)
 *   pubmedLookup   — ko/alias → PubMed 배열 (pubmedKeywordsFor, ko 우선·first-wins)
 *   aliases        — ko → 동의어 배열
 *   blacklist      — 차단 태그 배열
 *   normalizations — 변형어 → 정규화 결과 배열
 *   autotag        — [{display:ko, variants:[ko,...aliases]}] — is_recommendable=true 만(회원 자동태깅 사전)
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
const OUT = join(ROOT, "src/data/tag-dictionary.generated.json");

const KR2SLUG = {
  피부고민: "concerns",
  리프팅: "lifting",
  스킨부스터: "injectables",
  홈케어: "homecare",
  피부상식: "knowledge",
  미지정: "knowledge", // 미존재 fallback 과 동일
};

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

function buildFromDb(rows, blacklistRows, normRows) {
  const category = {};
  const slug = {};
  const pubmed = {}; // ko → string[] (canonical, getPubmedDict)
  const aliases = {}; // ko → string[]
  const keyOwner = {}; // ko/alias → 소유 ko (ko 우선·first-wins)
  const autotag = []; // {display:ko, variants:[ko,...aliases]} — is_recommendable 만

  // pass 1 — canonical ko
  for (const row of rows) {
    const cat = KR2SLUG[row.category] ?? "knowledge";
    category[row.ko] = cat;
    if (row.en) slug[row.ko] = row.en;
    if (Array.isArray(row.pubmed_keywords) && row.pubmed_keywords.length > 0) {
      pubmed[row.ko] = row.pubmed_keywords;
    }
    const al = (row.aliases ?? []).filter((s) => typeof s === "string" && s.length > 0);
    if (al.length > 0) aliases[row.ko] = al;
    keyOwner[row.ko] = row.ko; // ko 우선
    if (row.is_recommendable) autotag.push({ display: row.ko, variants: [row.ko, ...al] });
  }
  // pass 2 — alias 는 소유 ko 의 category/slug 상속(ko 미선점 시에만)
  for (const row of rows) {
    const cat = KR2SLUG[row.category] ?? "knowledge";
    for (const a of row.aliases ?? []) {
      if (!a) continue;
      if (!(a in category)) category[a] = cat;
      if (row.en && !(a in slug)) slug[a] = row.en;
      if (!(a in keyOwner)) keyOwner[a] = row.ko;
    }
  }
  const blacklist = [];
  for (const r of blacklistRows) if (r.word && !blacklist.includes(r.word)) blacklist.push(r.word);
  const normalizations = {};
  for (const r of normRows) {
    if (r.canonical != null) normalizations[r.canonical] = Array.isArray(r.variants) ? r.variants : [];
  }
  // pubmedLookup: key 소유 ko 에 pubmed 있을 때만 (pubmedKeywordsFor 동치)
  const pubmedLookup = {};
  for (const [key, ownerKo] of Object.entries(keyOwner)) {
    const kws = pubmed[ownerKo];
    if (kws && kws.length > 0) pubmedLookup[key] = kws;
  }
  return { category, slug, pubmed, pubmedLookup, aliases, blacklist, normalizations, autotag };
}

async function main() {
  const env = loadEnv();
  let built;
  let dbCount = 0;
  try {
    const rows = await restFetch(
      env,
      "tag_dictionary?select=ko,category,en,aliases,pubmed_keywords,is_recommendable",
    );
    const blacklistRows = await restFetch(env, "tag_blacklist?select=word");
    const normRows = await restFetch(env, "tag_normalization?select=canonical,variants");
    dbCount = rows.length;
    built = buildFromDb(rows, blacklistRows, normRows);
  } catch (e) {
    if (existsSync(OUT)) {
      console.warn(`[gen-tag-dictionary] DB 조회 실패(${e.message}) → 기존 스냅샷 보존, 빌드 계속`);
      return;
    }
    console.error(`[gen-tag-dictionary] DB 조회 실패(${e.message}) + 스냅샷 없음 → 생성 불가`);
    return;
  }
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "tag_dictionary(DB) + tag_blacklist + tag_normalization",
    dbRows: dbCount,
    keywords: Object.keys(built.category).length,
    category: built.category,
    slug: built.slug,
    pubmed: built.pubmed,
    pubmedLookup: built.pubmedLookup,
    aliases: built.aliases,
    blacklist: built.blacklist,
    normalizations: built.normalizations,
    autotag: built.autotag,
  };
  writeFileSync(OUT, JSON.stringify(snapshot, null, 0) + "\n", "utf-8");
  console.log(
    `[gen-tag-dictionary] OK keywords=${snapshot.keywords} dbRows=${dbCount}` +
      ` pubmed=${Object.keys(built.pubmed).length} lookup=${Object.keys(built.pubmedLookup).length}` +
      ` aliases=${Object.keys(built.aliases).length} blacklist=${built.blacklist.length}` +
      ` norm=${Object.keys(built.normalizations).length} autotag=${built.autotag.length} → ${OUT}`,
  );
}

main().catch((e) => {
  // 어떤 예외도 빌드를 막지 않음(기존 스냅샷 있으면 그대로)
  console.warn(`[gen-tag-dictionary] 예외: ${e?.message ?? e} → 빌드 계속`);
  process.exit(0);
});
