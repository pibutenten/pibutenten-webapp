/**
 * scripts/sync-clinics.mjs
 *
 * 일회성 적재 스크립트 — 건강보험심사평가원 병원정보서비스(getHospBasisList)에서
 * 전국 **피부과 의원**(clCd=31 + dgsbjtCd=14)을 받아 production clinics 테이블에
 * upsert(onConflict: ykiho).
 *
 * 사용:
 *   node scripts/sync-clinics.mjs
 *
 * 환경변수(.env.local):
 *   - DATA_GO_KR_SERVICE_KEY     : 심평원 Decoding 키
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  : RLS 우회 upsert
 *
 * 주의: clinics 외 다른 테이블 건드리지 않음. DROP/TRUNCATE 없음. 순수 upsert.
 * src/lib/clinics/hira.ts 와 동일한 호출/매핑 규칙을 자립 구현 (server-only import 불가).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { XMLParser } from "fast-xml-parser";

// ── .env.local 로딩 (기존 스크립트와 동일 패턴) ─────────────────────────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const SERVICE_KEY = env.DATA_GO_KR_SERVICE_KEY;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) throw new Error("DATA_GO_KR_SERVICE_KEY 없음 (.env.local)");
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음 (.env.local)");
if (!SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음 (.env.local)");

const ENDPOINT =
  "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const CL_CD = "31"; // 의원
const DGSBJT_CD = "14"; // 피부과 진료과목
const NUM_OF_ROWS = 1000;
const MAX_PAGES = 100;
const DELAY_MS = 150;

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
  numberParseOptions: { hex: false, leadingZeros: false, eNotation: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const str = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};
const num = (v) => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

async function fetchPage(pageNo) {
  const params = [
    `ServiceKey=${encodeURIComponent(SERVICE_KEY)}`,
    `pageNo=${pageNo}`,
    `numOfRows=${NUM_OF_ROWS}`,
    `clCd=${encodeURIComponent(CL_CD)}`,
    `dgsbjtCd=${encodeURIComponent(DGSBJT_CD)}`,
    "_type=xml",
  ].join("&");
  const res = await fetch(`${ENDPOINT}?${params}`, {
    cache: "no-store",
    headers: { Accept: "application/xml" },
  });
  if (!res.ok) throw new Error(`HIRA HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml);
  const header = parsed?.response?.header;
  const code = str(header?.resultCode);
  if (code && code !== "00") {
    throw new Error(`HIRA error ${code}: ${str(header?.resultMsg) ?? ""}`);
  }
  const body = parsed?.response?.body;
  const totalCount = Number(body?.totalCount ?? 0) || 0;
  const rawItem = body?.items ? body.items.item : null;
  const items = Array.isArray(rawItem) ? rawItem : rawItem ? [rawItem] : [];
  return { items, totalCount };
}

function normalize(item) {
  const ykiho = str(item.ykiho);
  const yadmNm = str(item.yadmNm);
  if (!ykiho || !yadmNm) return null;
  return {
    ykiho,
    name: yadmNm,
    addr: str(item.addr),
    tel: str(item.telno),
    url: str(item.hospUrl),
    sido_cd: str(item.sidoCd),
    sgu_cd: str(item.sgguCd),
    x_pos: num(item.XPos),
    y_pos: num(item.YPos),
    clinic_type: str(item.clCdNm),
    raw: item,
  };
}

async function main() {
  console.log("[sync-clinics] 시작 — clCd=31 + dgsbjtCd=14 (피부과 의원, 전국)");
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) 전 페이지 수집 + dedup(ykiho)
  const byYkiho = new Map();
  const first = await fetchPage(1);
  for (const it of first.items) {
    const c = normalize(it);
    if (c) byYkiho.set(c.ykiho, c);
  }
  const totalPages = Math.max(1, Math.ceil(first.totalCount / NUM_OF_ROWS));
  const pagesToFetch = Math.min(totalPages, MAX_PAGES);
  console.log(
    `[sync-clinics] totalCount=${first.totalCount} → ${pagesToFetch}페이지 호출 예정`,
  );

  for (let p = 2; p <= pagesToFetch; p++) {
    await sleep(DELAY_MS);
    const page = await fetchPage(p);
    for (const it of page.items) {
      const c = normalize(it);
      if (c) byYkiho.set(c.ykiho, c);
    }
    if (p % 5 === 0 || p === pagesToFetch) {
      console.log(`[sync-clinics]   ...${p}/${pagesToFetch}페이지 (누적 ${byYkiho.size}곳)`);
    }
    if (page.items.length === 0) break;
  }

  const rows = [...byYkiho.values()];
  const fetched = rows.length;
  console.log(`[sync-clinics] 수집 완료 — dedup 후 ${fetched}곳`);

  // 2) clinics upsert (청크 500). synced_at 갱신.
  const now = new Date().toISOString();
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, synced_at: now }));
    const { data, error } = await admin
      .from("clinics")
      .upsert(chunk, { onConflict: "ykiho" })
      .select("id");
    if (error) {
      console.error(
        `[sync-clinics] upsert 실패 (chunk ${i}~${i + chunk.length}) — 부분 적재 ${upserted}곳까지 완료`,
      );
      console.error("[sync-clinics] 원인:", error.message ?? error);
      process.exit(1);
    }
    upserted += data?.length ?? 0;
    console.log(`[sync-clinics]   upsert ${upserted}/${fetched}곳`);
  }

  // 3) 최종 검증 — clinics 총 row 수
  const { count, error: cntErr } = await admin
    .from("clinics")
    .select("id", { count: "exact", head: true });
  if (cntErr) console.error("[sync-clinics] count 조회 실패:", cntErr.message);

  console.log("──────────────────────────────────────────");
  console.log(`[sync-clinics] 완료`);
  console.log(`  심평원 totalCount : ${first.totalCount}`);
  console.log(`  수집(dedup)       : ${fetched}곳`);
  console.log(`  upsert            : ${upserted}곳`);
  console.log(`  clinics 총 row 수 : ${count ?? "조회실패"}`);
  // 샘플 5곳
  const sample = rows.slice(0, 5).map((r) => r.name);
  console.log(`  샘플              : ${sample.join(" | ")}`);
}

main().catch((e) => {
  console.error("[sync-clinics] 치명 오류:", e?.message ?? e);
  process.exit(1);
});
