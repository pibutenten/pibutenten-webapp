import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError } from "@/lib/clinic-link-rpc";
import { ClinicVisitCreateSchema } from "@/lib/schema/api/clinic";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/clinic/visits — 병원: 지점 전체 시술기록 대장(목록 뷰, S4 · 계획 §2.5).
 *
 * get_clinic_visits RPC(0350) 위임 — source='clinic' AND clinic_id=자기(RPC 내부 2중 경계).
 *   쿼리 파라미터:
 *     q       — 환자·시술 통합 검색(ILIKE, RPC 내부).
 *     doctor_id — 원장 필터(uuid 재검, 아니면 무시).
 *     from·to — visited_on 범위(YYYY-MM-DD 재검, 둘 다 없으면 전체).
 *     sort    — visited_on | patient_name | total_price (화이트리스트).
 *     dir     — asc | desc.
 *     limit·offset — 페이지네이션(정수 clamp, RPC 도 재검).
 *   응답 `{ items }` (get_clinic_visits 반환 행 배열).
 *
 * 가드: active 명함 role=clinic + clinic_id 보유(POST 와 동일 인라인 검사).
 */

// 정렬 화이트리스트 — RPC(0350) get_clinic_visits 와 동일.
const SORT_BY = new Set(["visited_on", "patient_name", "total_price"]);

/** "YYYY-MM-DD" 유효성 재검(클라 값 신뢰 안 함). 유효하면 그대로, 아니면 null. */
function sanitizeDate(raw: string | null): string | null {
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

/** uuid 형식 재검 — 아니면 null(필터 무시). */
function sanitizeUuid(raw: string | null): string | null {
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
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
    return errorResponse(null, "unauthorized", "[clinic/visits GET] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }
  if (idCtx.active.role !== ROLES.CLINIC || idCtx.active.clinicId == null) {
    return errorResponse(null, "forbidden", "[clinic/visits GET] clinic role required", 403, undefined, {
      userMessage: "병원 계정만 사용할 수 있어요.",
    });
  }

  const url = new URL(req.url);
  const sp = url.searchParams;

  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const doctorId = sanitizeUuid(sp.get("doctor_id"));
  const from = sanitizeDate(sp.get("from"));
  const to = sanitizeDate(sp.get("to"));
  const sortRaw = sp.get("sort") ?? "";
  const sort = SORT_BY.has(sortRaw) ? sortRaw : "visited_on";
  const dirRaw = (sp.get("dir") ?? "").toLowerCase();
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : "desc";
  const limit = toInt(sp.get("limit"), 50, 1, 200);
  const offset = toInt(sp.get("offset"), 0, 0, 100000);

  const { data, error: rpcErr } = await supabase.rpc("get_clinic_visits", {
    p_clinic_profile_id: idCtx.active.profileId,
    p_search: q === "" ? null : q,
    p_doctor_id: doctorId,
    p_from: from,
    p_to: to,
    p_sort_by: sort,
    p_sort_dir: dir,
    p_limit: limit,
    p_offset: offset,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[clinic/visits GET]",
      "generic",
    );
  }

  return NextResponse.json(
    { items: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * POST /api/clinic/visits — 병원: 시술노트 대행 작성.
 *
 * clinic_add_visit RPC(0345) 위임 — active(동의 완료) 연결에만 diaries 1행(source='clinic')
 * + diary_procedures N행 원자 생성 + 회원에게 도착 알림. 병원 위치 스냅샷·담당 원장
 * 재직 검증·tag_dict FK 안전화(미등록 태그 NULL)·visited_on_precision='exact' 고정은
 * 전부 RPC 내부. 노트 소유는 회원(profile_id=연결 회원) — 수정·삭제는 회원측 기존 경로.
 *
 * 가드: active 명함 role=clinic + clinic_id 보유(인라인 검사 — API_POLICY 관례).
 * rate limit: 라우트(사용자 단위 분당 30회 — visits 관례) + RPC(지점 단위 분당 30건) 이중 방어.
 *
 * CSRF Origin 검증은 middleware.ts 가 모든 unsafe-method /api/* 요청에 적용(라우트 무중복).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[clinic/visits POST] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }
  if (idCtx.active.role !== ROLES.CLINIC || idCtx.active.clinicId == null) {
    return errorResponse(null, "forbidden", "[clinic/visits POST] clinic role required", 403, undefined, {
      userMessage: "병원 계정만 사용할 수 있어요.",
    });
  }

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "clinic-visits-post",
    userId: idCtx.user.id,
    max: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[clinic/visits POST] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = ClinicVisitCreateSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[clinic/visits POST] zod", 400, undefined, {
      userMessage: "입력 형식이 올바르지 않습니다.",
      devOnly: {
        issues: parsed.error.issues.slice(0, 5).map((iss) => ({
          path: iss.path.join("."),
          code: iss.code,
        })),
      },
    });
  }
  const p = parsed.data;

  // 시술명 → tag_dictionary(is_procedure) 매칭 — /api/visits(회원 경로)와 동일 로직.
  //   병원 폼은 tag_dict_ko 를 직접 보내지 않으므로 서버가 매칭해 채운다(사전 연결 정합 —
  //   미매칭 시 병원 대행 노트만 tag_dict_ko=NULL 이 되어 회원 노트와 데이터 품질이 갈라짐).
  const procKos = Array.from(new Set(p.procedures.map((pr) => pr.procedure_ko)));
  let validTags = new Set<string>();
  if (procKos.length > 0) {
    const { data: tagRows } = await supabase
      .from("tag_dictionary")
      .select("ko")
      .eq("is_procedure", true)
      .in("ko", procKos);
    validTags = new Set((tagRows ?? []).map((r) => (r as { ko: string }).ko));
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc("clinic_add_visit", {
    p_clinic_profile_id: idCtx.active.profileId,
    p_link_id: p.link_id,
    p_visited_on: p.visited_on,
    p_procedures: p.procedures.map((pr, i) => ({
      procedure_ko: pr.procedure_ko,
      // 클라 지정값 우선, 없으면 서버 매칭(사전 미등록은 RPC 가 최종 NULL 처리 — FK 이중 방어).
      tag_dict_ko: pr.tag_dict_ko ?? (validTags.has(pr.procedure_ko) ? pr.procedure_ko : null),
      unit_text: pr.unit_text ?? null,
      price: pr.price ?? null,
      note: pr.note ?? null,
      sort_order: pr.sort_order ?? i,
    })),
    p_doctor_id: p.doctor_id ?? null,
    p_doctor_name: p.doctor_name ?? null,
    p_manager_name: p.manager_name ?? null,
    p_diary_body: p.diary_body ?? null,
    p_total_price: p.total_price ?? null,
    p_next_appointment_date: p.next_appointment_date ?? null,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(rpcErr as { code?: string; message?: string }, "[clinic/visits POST]");
  }

  // 시술노트는 비공개(회원 본인 화면 전용) — 공개 피드·SEO revalidate 불필요.
  return NextResponse.json({ visit_id: Number(rpcData) }, { status: 201 });
}
