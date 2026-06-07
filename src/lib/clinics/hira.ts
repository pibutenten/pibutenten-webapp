import "server-only";
import { XMLParser } from "fast-xml-parser";

/**
 * 건강보험심사평가원 병원정보서비스 클라이언트 (server-only).
 *
 * 공공데이터포털 `getHospBasisList` 를 호출해 **피부과 의원** 목록을 가져온다.
 * 관리자 운영 페이지 "병원 정보 가져오기" → /api/admin/clinics/sync 및
 * 일회성 적재 스크립트 scripts/sync-clinics.mjs 에서 사용.
 *
 * ── 인증 ──────────────────────────────────────────────────────────────────
 * process.env.DATA_GO_KR_SERVICE_KEY (Decoding 키, 특수문자 +,/,== 포함).
 * URL 에 실을 때 encodeURIComponent 1회 적용. (이미 인코딩된 Encoding 키가 아님)
 *
 * ── 응답 형식 ─────────────────────────────────────────────────────────────
 * XML 전용(JSON 미지원). fast-xml-parser 로 파싱. (정규식 파싱 지양)
 *
 * ── 피부과 필터 방식 (2026-06-07 디렉터 검증 확정) ─────────────────────────
 * 진료과목코드 dgsbjtCd 는 정상 동작한다. 서울(clCd=31) 기준 totalCount 비교:
 *   dgsbjtCd 없음=10638, 01=4752(내과), 08=2001(성형외과),
 *   14=4845(피부과), 20=61(결핵과) → 심평원 진료과목코드표와 정확히 일치.
 * → **clCd=31(의원) + dgsbjtCd=14(피부과 진료과목)** 을 기준으로 채택한다.
 *   "진료과목으로 피부과를 표방한 의원" 전부가 대상 (병원명에 '피부과'가 없어도 포함).
 *   병원명(yadmNm) 필터는 더 이상 사용하지 않음.
 * 전국 단일 조회(sidoCd 미지정) 정상 — totalCount 16964건, 17페이지로 전수 수집 가능.
 */

/** 심평원 getHospBasisList item 에서 우리가 쓰는 필드만 정규화한 객체. */
export type HiraClinic = {
  ykiho: string;
  yadmNm: string;
  addr: string | null;
  telno: string | null;
  hospUrl: string | null;
  sidoCd: string | null;
  sgguCd: string | null;
  xPos: number | null;
  yPos: number | null;
  clCdNm: string | null;
  /** 원본 item 전체 (raw jsonb 보존용) */
  raw: Record<string, unknown>;
};

export type FetchDermatologyOptions = {
  /** 한 페이지당 행 수 (기본 1000, 심평원 최대 권장). */
  numOfRows?: number;
  /** 최대 페이지 수 안전상한 (일일 트래픽 10000 보호, 기본 100 → 최대 10만 행). */
  maxPages?: number;
  /** 진료과목코드 (기본 14=피부과). */
  dgsbjtCd?: string;
  /** 종별코드 (기본 31=의원). */
  clCd?: string;
  /** 페이지 호출 간 지연(ms). 심평원 부하 완화 (기본 120ms). */
  delayMs?: number;
};

export type FetchDermatologyResult = {
  clinics: HiraClinic[];
  /** 심평원이 보고한 totalCount (필터 적용 후 전체 건수). */
  totalCount: number;
  /** 실제 호출한 페이지 수. */
  pages: number;
  /** 사용한 필터 방식 설명 (보고용). */
  mode: string;
};

const ENDPOINT =
  "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  // 숫자/불리언 자동 변환 끔 — ykiho/코드가 숫자처럼 보여도 문자열 유지(앞 0 보존).
  parseTagValue: false,
  numberParseOptions: { hex: false, leadingZeros: false, eNotation: false },
});

/** null/빈문자 정리 후 문자열 반환. */
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** 좌표 문자열 → number | null. */
function num(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 심평원 응답 1페이지를 fetch + 파싱. */
async function fetchPage(opts: {
  serviceKey: string;
  pageNo: number;
  numOfRows: number;
  dgsbjtCd: string;
  clCd: string;
}): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const params = [
    `ServiceKey=${encodeURIComponent(opts.serviceKey)}`,
    `pageNo=${opts.pageNo}`,
    `numOfRows=${opts.numOfRows}`,
    `clCd=${encodeURIComponent(opts.clCd)}`,
    `dgsbjtCd=${encodeURIComponent(opts.dgsbjtCd)}`,
    "_type=xml",
  ].join("&");
  const url = `${ENDPOINT}?${params}`;

  const res = await fetch(url, {
    // 외부 API — 캐시 비활성화(항상 최신).
    cache: "no-store",
    headers: { Accept: "application/xml" },
  });
  if (!res.ok) {
    throw new Error(`HIRA HTTP ${res.status}`);
  }
  const xml = await res.text();
  const parsed = parser.parse(xml) as {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: {
        totalCount?: string | number;
        items?: { item?: unknown } | "" | null;
      };
    };
  };

  const header = parsed?.response?.header;
  const resultCode = str(header?.resultCode);
  // 정상 코드는 "00". 그 외(키 오류 03/30, 트래픽 초과 22 등)는 메시지와 함께 throw.
  if (resultCode && resultCode !== "00") {
    const msg = str(header?.resultMsg) ?? "알 수 없는 오류";
    throw new Error(`HIRA error ${resultCode}: ${msg}`);
  }

  const body = parsed?.response?.body;
  const totalCount = Number(body?.totalCount ?? 0) || 0;
  const rawItem = body?.items ? (body.items as { item?: unknown }).item : null;
  // item 이 0건이면 undefined, 1건이면 객체, 다수면 배열 — 항상 배열로 정규화.
  const items: Record<string, unknown>[] = Array.isArray(rawItem)
    ? (rawItem as Record<string, unknown>[])
    : rawItem
      ? [rawItem as Record<string, unknown>]
      : [];

  return { items, totalCount };
}

/** item(raw) → HiraClinic 정규화. ykiho/yadmNm 없는 row 는 호출자에서 제외. */
function normalize(item: Record<string, unknown>): HiraClinic | null {
  const ykiho = str(item.ykiho);
  const yadmNm = str(item.yadmNm);
  if (!ykiho || !yadmNm) return null;
  return {
    ykiho,
    yadmNm,
    addr: str(item.addr),
    telno: str(item.telno),
    hospUrl: str(item.hospUrl),
    sidoCd: str(item.sidoCd),
    sgguCd: str(item.sgguCd),
    xPos: num(item.XPos),
    yPos: num(item.YPos),
    clCdNm: str(item.clCdNm),
    raw: item,
  };
}

/**
 * 피부과 의원 전체를 페이지네이션으로 수집 (전국 단일 조회).
 *
 * 기준: clCd=31(의원) + dgsbjtCd=14(피부과 진료과목). sidoCd 미지정 = 전국.
 * 1페이지로 totalCount 를 받아 numOfRows 단위로 페이지 반복.
 * maxPages 안전상한으로 일일 트래픽(10000) 폭주 방지. 페이지 간 delayMs 지연.
 */
export async function fetchDermatologyClinics(
  opts: FetchDermatologyOptions = {},
): Promise<FetchDermatologyResult> {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey || serviceKey.trim().length === 0) {
    throw new Error("DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.");
  }

  const key = serviceKey.trim();
  const numOfRows = Math.min(Math.max(opts.numOfRows ?? 1000, 1), 1000);
  const maxPages = Math.min(Math.max(opts.maxPages ?? 100, 1), 200);
  const dgsbjtCd = opts.dgsbjtCd ?? "14";
  const clCd = opts.clCd ?? "31";
  const delayMs = Math.max(opts.delayMs ?? 120, 0);

  // 1페이지 호출 → totalCount 로 전체 페이지 수 결정.
  const first = await fetchPage({
    serviceKey: key,
    pageNo: 1,
    numOfRows,
    dgsbjtCd,
    clCd,
  });

  const byYkiho = new Map<string, HiraClinic>();
  for (const it of first.items) {
    const c = normalize(it);
    if (c) byYkiho.set(c.ykiho, c);
  }

  const totalPages = Math.max(1, Math.ceil(first.totalCount / numOfRows));
  const pagesToFetch = Math.min(totalPages, maxPages);

  for (let p = 2; p <= pagesToFetch; p++) {
    if (delayMs > 0) await sleep(delayMs);
    const page = await fetchPage({
      serviceKey: key,
      pageNo: p,
      numOfRows,
      dgsbjtCd,
      clCd,
    });
    for (const it of page.items) {
      const c = normalize(it);
      if (c) byYkiho.set(c.ykiho, c); // 중복 ykiho 자동 dedup
    }
    if (page.items.length === 0) break; // 빈 페이지면 조기 종료
  }

  return {
    clinics: [...byYkiho.values()],
    totalCount: first.totalCount,
    pages: pagesToFetch,
    mode: `clCd=${clCd} + dgsbjtCd=${dgsbjtCd} (진료과목 피부과, 전국 단일 조회)`,
  };
}
