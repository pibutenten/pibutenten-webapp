import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError } from "@/lib/clinic-link-rpc";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/clinic/patients — 병원: 환자(연결) 목록/검색·정렬·필터 (Wave B1 v2).
 *
 * get_clinic_patients RPC(0352) 위임 — 자기 지점 연결만.
 *   검색 = p_search(이름·등록번호·핸들 ILIKE) OR p_birthdate(동등). 클라가 검색어 원문을
 *   q 로, 그 원문이 완전한 생일이면 birthdate(YYYY-MM-DD)로도 함께 보낸다(둘 중 하나 매칭).
 *   정렬·상태 필터·페이지네이션 파라미터를 RPC 로 전달(화이트리스트 재검, RPC 도 재검).
 *
 * 가드: active 명함 role=clinic + clinic_id 보유(인라인 검사 — API_POLICY 관례).
 * 응답 `{ items }` 형태 유지(기존 소비 호환).
 */

// 정렬 화이트리스트 — RPC(0352) 와 동일. 잘못된 값은 기본값으로 폴백.
const SORT_BY = new Set([
  "created_at",
  "patient_name",
  "last_visit_on",
  "visit_count",
  "status",
  "patient_birthdate",
]);
const STATUS_VALUES = new Set(["pending", "active", "rejected", "revoked"]);

/** "YYYY-MM-DD" 유효성 재검(클라가 보낸 값 신뢰 안 함). 유효하면 그대로, 아니면 null. */
function sanitizeBirthdate(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12) return null;
  const lastDay = new Date(y, mo, 0).getDate();
  if (d < 1 || d > lastDay) return null;
  return raw;
}

/** 정수 파싱 + 범위 clamp. 파싱 실패 시 fallback. */
function toInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[clinic/patients GET] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }
  if (idCtx.active.role !== ROLES.CLINIC || idCtx.active.clinicId == null) {
    return errorResponse(null, "forbidden", "[clinic/patients GET] clinic role required", 403, undefined, {
      userMessage: "병원 계정만 사용할 수 있어요.",
    });
  }

  const url = new URL(req.url);
  const sp = url.searchParams;

  // 검색어 — 공백 trim 후 빈 문자열이면 null. 과대 입력 방어로 100자 절단.
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  // 생일 — 클라가 parseFreeBirthdate 로 파싱해 보낸 YYYY-MM-DD. 서버에서 재검.
  const birthdate = sanitizeBirthdate(sp.get("birthdate"));
  // 상태 필터 — 화이트리스트 외면 null(전체).
  const statusRaw = sp.get("status") ?? "";
  const status = STATUS_VALUES.has(statusRaw) ? statusRaw : null;
  // 정렬 — 화이트리스트 재검, 잘못되면 기본값.
  const sortRaw = sp.get("sort") ?? "";
  const sort = SORT_BY.has(sortRaw) ? sortRaw : "created_at";
  const dirRaw = (sp.get("dir") ?? "").toLowerCase();
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : "desc";
  // 페이지네이션 — 정수 clamp(RPC 도 LEAST/GREATEST 로 재검).
  const limit = toInt(sp.get("limit"), 50, 1, 200);
  const offset = toInt(sp.get("offset"), 0, 0, 100000);

  const { data, error: rpcErr } = await supabase.rpc("get_clinic_patients", {
    p_clinic_profile_id: idCtx.active.profileId,
    p_search: q === "" ? null : q,
    p_birthdate: birthdate,
    p_status_filter: status,
    p_sort_by: sort,
    p_sort_dir: dir,
    p_limit: limit,
    p_offset: offset,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[clinic/patients GET]",
      "generic",
    );
  }

  return NextResponse.json(
    { items: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
