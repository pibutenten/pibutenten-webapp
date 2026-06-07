/**
 * POST /api/admin/clinics/sync
 *
 * 건강보험심사평가원 병원정보서비스(getHospBasisList)에서 **피부과 의원** 목록을 받아
 * clinics 테이블에 upsert(onConflict: ykiho). 관리자 운영 페이지의 "병원 정보 가져오기" 버튼.
 *
 * 권한: requireAdmin (ADR 0012 — active 명함 단위 super admin) + service_role upsert.
 *   다른 /api/admin/* 라우트(tag-dictionary/merge-dismiss 등)와 동일 가드 패턴.
 *
 * 응답: { ok, fetched, upserted, pages, mode }
 *   fetched   : 심평원에서 받은(dedup 후) 병원 수
 *   upserted  : clinics 에 insert/update 된 행 수
 *   pages     : 호출한 페이지 수
 *   mode      : 사용한 필터 방식 (피부과 코드 검증 결과 — 보고용)
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { fetchDermatologyClinics } from "@/lib/clinics/hira";

export const dynamic = "force-dynamic";
// 페이지네이션 + upsert 가 길어질 수 있어 라우트 타임아웃 확장 (Vercel: 최대값은 플랜 따름).
export const maxDuration = 300;

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // 외부 API 호출 + 대량 upsert 라 보수적 rate limit (분당 3회).
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "admin-clinics-sync",
    userId: guard.userId,
    max: 3,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 1) 심평원 호출 (키 없음/심평원 오류는 여기서 throw → catch).
  let result: Awaited<ReturnType<typeof fetchDermatologyClinics>>;
  try {
    result = await fetchDermatologyClinics();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // 환경변수 부재는 운영자에게 구체 안내, 그 외는 표준 외부서비스 실패 문구.
    if (msg.includes("DATA_GO_KR_SERVICE_KEY")) {
      return errorResponse(e, "network_failed", "[clinics/sync] missing key", 500, undefined, {
        userMessage: "심평원 API 키(DATA_GO_KR_SERVICE_KEY)가 설정되지 않았습니다.",
      });
    }
    return errorResponse(e, "network_failed", "[clinics/sync] HIRA fetch", 502, undefined, {
      userMessage: "심평원 병원정보 API 호출에 실패했어요. 잠시 후 다시 시도해 주세요.",
    });
  }

  const fetched = result.clinics.length;
  if (fetched === 0) {
    return NextResponse.json({
      ok: true,
      fetched: 0,
      upserted: 0,
      pages: result.pages,
      mode: result.mode,
    });
  }

  // 2) clinics 매핑 → service_role upsert (onConflict: ykiho).
  //    yadmNm→name, addr→addr, telno→tel, hospUrl→url, sidoCd→sido_cd, sgguCd→sgu_cd,
  //    XPos→x_pos, YPos→y_pos, clCdNm→clinic_type, 전체 item→raw. synced_at 갱신.
  const now = new Date().toISOString();
  const rows = result.clinics.map((c) => ({
    ykiho: c.ykiho,
    name: c.yadmNm,
    addr: c.addr,
    tel: c.telno,
    url: c.hospUrl,
    sido_cd: c.sidoCd,
    sgu_cd: c.sgguCd,
    x_pos: c.xPos,
    y_pos: c.yPos,
    clinic_type: c.clCdNm,
    raw: c.raw,
    synced_at: now,
  }));

  const admin = createSupabaseAdminClient();
  // 대량 upsert 는 청크로 분할 (PostgREST 단일 요청 페이로드 한도 보호).
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("clinics")
      .upsert(chunk, { onConflict: "ykiho" })
      .select("id");
    if (error) {
      return errorResponse(error, "save_failed", "[clinics/sync] upsert", 500, undefined, {
        userMessage: "병원 정보 저장 중 오류가 발생했어요.",
        bodyExtra: { fetched, upserted, pages: result.pages, mode: result.mode },
      });
    }
    upserted += data?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    fetched,
    upserted,
    pages: result.pages,
    mode: result.mode,
  });
}
