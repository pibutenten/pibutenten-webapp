import "server-only";
import { XMLParser } from "fast-xml-parser";

/**
 * 건강보험심사평가원 병원정보서비스 클라이언트 (server-only).
 *
 * 공공데이터포털 `getHospBasisList` 를 호출해 **피부과 의원** 목록을 가져온다.
 * 관리자 운영 페이지 "병원 정보 가져오기" → /api/admin/clinics/sync 에서만 사용.
 *
 * ── 인증 ──────────────────────────────────────────────────────────────────
 * process.env.DATA_GO_KR_SERVICE_KEY (Decoding 키, 특수문자 +,/,== 포함).
 * URL 에 실을 때 encodeURIComponent 1회 적용. (이미 인코딩된 Encoding 키가 아님)
 *
 * ── 응답 형식 ─────────────────────────────────────────────────────────────
 * XML 전용(JSON 미지원). fast-xml-parser 로 파싱. (정규식 파싱 지양)
 *
 * ── 피부과 필터 방식 (2026-06-07 실호출 검증) ─────────────────────────────
 * 진료과목 코드 dgsbjtCd=14(피부과 추정)는 **무력**했다 — 서버가 해당 파라미터를
 * 무시하고 내과·외과·정형외과 등 비피부과 의원을 그대로 반환(서울 4845건에 혼재).
 * 반면 clCd=31(의원) + yadmNm="피부과" 는 totalCount 1553건이 전부 피부과 의원으로
 * 정확. → **폴백 방식(clCd=31 + yadmNm="피부과")** 을 기본 동작으로 채택한다.
 * yadmNm 은 병원명(UTF-8)에 "피부과"가 포함된 의원을 서버가 필터링해 준다.
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
  /** 최대 페이지 수 안전상한 (일일 트래픽 10000 보호, 기본 50 → 최대 5만 행). */
  maxPages?: number;
  /** 병원명 필터 키워드 (기본 "피부과"). */
  keyword?: string;
  /** 종별코드 (기본 31=의원). */
  clCd?: string;
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

/** 심평원 응답 1페이지를 fetch + 파싱. */
async function fetchPage(opts: {
  serviceKey: string;
  pageNo: number;
  numOfRows: number;
  keyword: string;
  clCd: string;
}): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const params = [
    `ServiceKey=${encodeURIComponent(opts.serviceKey)}`,
    `pageNo=${opts.pageNo}`,
    `numOfRows=${opts.numOfRows}`,
    `clCd=${encodeURIComponent(opts.clCd)}`,
    `yadmNm=${encodeURIComponent(opts.keyword)}`,
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
 * 피부과 의원 전체를 페이지네이션으로 수집.
 *
 * 기본: clCd=31(의원) + yadmNm="피부과". totalCount 를 받아 numOfRows 단위로 페이지 반복.
 * maxPages 안전상한으로 일일 트래픽(10000) 폭주 방지.
 */
export async function fetchDermatologyClinics(
  opts: FetchDermatologyOptions = {},
): Promise<FetchDermatologyResult> {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey || serviceKey.trim().length === 0) {
    throw new Error("DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.");
  }

  const numOfRows = Math.min(Math.max(opts.numOfRows ?? 1000, 1), 1000);
  const maxPages = Math.min(Math.max(opts.maxPages ?? 50, 1), 200);
  const keyword = opts.keyword ?? "피부과";
  const clCd = opts.clCd ?? "31";

  // 1페이지 호출 → totalCount 로 전체 페이지 수 결정.
  const first = await fetchPage({
    serviceKey: serviceKey.trim(),
    pageNo: 1,
    numOfRows,
    keyword,
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
    const page = await fetchPage({
      serviceKey: serviceKey.trim(),
      pageNo: p,
      numOfRows,
      keyword,
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
    mode: `clCd=${clCd} + yadmNm="${keyword}" (dgsbjtCd 무력 → 병원명 필터 폴백)`,
  };
}
