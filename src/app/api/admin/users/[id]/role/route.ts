import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-guard";
import { logAudit } from "@/lib/audit-log";
import { getDoctorIdForProfile } from "@/lib/doctor-mapping";

export const dynamic = "force-dynamic";

type Body = {
  /** 신규 정책: 'user' 또는 'admin' 만 허용. 'doctor' 는 legacy. */
  role?: "admin" | "doctor" | "user";
  /** 매핑할 doctor_id (있으면 doctor_accounts 추가/교체, null 이면 매핑 해제). */
  doctor_id?: string | null;
};

/**
 * POST /api/admin/users/{id}/role
 *
 * 정책 (2026-05-17):
 *   role 과 doctor_id 를 **독립적으로** 처리.
 *
 *   - role: profiles.role 변경. 'user'/'admin' 만 허용 (신규).
 *           legacy doctor 본 profile 은 role='doctor' 그대로 유지 (변경 요청 안 들어옴).
 *   - doctor_id: doctor_accounts 매핑 추가/교체/해제 (null = 해제).
 *
 *   매핑은 role 변경을 트리거하지 않음. display_name 자동 sync 도 없음.
 *   매핑된 user 계정은 그대로 user 등급으로 표시되고, 원장 모드 활동은
 *   IdentitySwitcher 에서 명시 전환할 때만.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 호출자 admin 검증 (auth_user_id 묶음 기준)
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const supabase = await createSupabaseServerClient();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const role = body.role;
  if (!role || !["admin", "doctor", "user"].includes(role)) {
    return NextResponse.json(
      { error: "올바른 역할이 아닙니다" },
      { status: 400 },
    );
  }
  const doctorId = body.doctor_id ?? null;

  // 대상 user 존재 확인
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id, role, auth_user_id")
    .eq("id", id)
    .maybeSingle()
    .returns<{ id: string; role: string; auth_user_id: string | null } | null>();
  if (!targetProfile) {
    return NextResponse.json(
      { error: "대상 회원을 찾을 수 없습니다" },
      { status: 404 },
    );
  }

  // ── 자기 자신 강등 차단 (A7, 2026-05-17) ────────────────────────────────
  // 본인(같은 auth_user_id 묶음) 이 본인의 role 을 'admin' 이 아닌 값으로 바꾸려는
  // 시도를 차단. admin 부재 상태 방지. 다른 admin 이 강등하는 것은 의도된 동작.
  if (
    targetProfile.auth_user_id === guard.userId &&
    role !== "admin"
  ) {
    return NextResponse.json(
      {
        error:
          "본인의 admin 권한은 본인이 강등할 수 없습니다. 다른 관리자에게 요청해 주세요.",
      },
      { status: 400 },
    );
  }

  // ── 1. 매핑 충돌 확인 (자기 자신 제외) ────────────────────────────────
  // doctor_id 값이 들어오면, 그 doctor 가 이미 다른 회원에게 매핑돼 있는지 확인.
  // SSOT (profiles.doctor_id) 기준 역조회.
  if (doctorId) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, display_name, handle")
      .eq("doctor_id", doctorId)
      .maybeSingle()
      .returns<{
        id: string;
        display_name: string | null;
        handle: string | null;
      } | null>();
    if (existing && existing.id !== id) {
      const exName = existing.display_name ?? "(이름 없음)";
      const exHandle = existing.handle
        ? `@${existing.handle}`
        : "(handle 없음)";
      return NextResponse.json(
        {
          error: `해당 원장은 이미 가입 회원 "${exName}" ${exHandle} 에게 매핑되어 있습니다. 먼저 그 회원의 매핑을 해제해주세요.`,
          existing_profile_id: existing.id,
          existing_display_name: exName,
          existing_handle: existing.handle ?? null,
        },
        { status: 409 },
      );
    }
  }

  // ── 2. profiles.role 업데이트 (변경된 경우에만) ──────────────────────────
  //   display_name 자동 sync 없음. role 변경만.
  if (role !== targetProfile.role) {
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  // ── 3. doctor_accounts 매핑 처리 ────────────────────────────────────────
  //   doctor_id 가 있으면 upsert (기존 매핑은 갱신, 없으면 insert).
  //   doctor_id 가 null 이면 매핑 해제.
  if (doctorId) {
    // SSOT (profiles.doctor_id) 헬퍼로 기존 매핑 존재 여부 확인.
    const existingDoctorId = await getDoctorIdForProfile(supabase, id);
    if (existingDoctorId) {
      const { error: mapErr } = await supabase
        .from("doctor_accounts")
        .update({ doctor_id: doctorId })
        .eq("profile_id", id);
      if (mapErr) {
        return NextResponse.json({ error: mapErr.message }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabase
        .from("doctor_accounts")
        .insert({ profile_id: id, doctor_id: doctorId });
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }
    // ── 묶음(bundle) 동기화 ──────────────────────────────────────────
    // doctor primary profile (handle = doctor.slug) 의 auth_user_id 를 매핑되는
    // user profile 에도 복사 → 둘이 같은 auth_user_id 묶음이 되어 IdentitySwitcher
    // 에서 doctor 모드로 전환 가능. (사용자 정책 2026-05-17)
    //
    // doctor primary 의 auth_user_id 가 NULL 이면 (의사 미가입) 묶음 형성 불가 — skip.
    const { data: doctorRow } = await supabase
      .from("doctors")
      .select("slug")
      .eq("id", doctorId)
      .maybeSingle()
      .returns<{ slug: string } | null>();
    if (doctorRow?.slug) {
      const { data: doctorPrimary } = await supabase
        .from("profiles")
        .select("id, auth_user_id")
        .eq("handle", doctorRow.slug)
        .maybeSingle()
        .returns<{ id: string; auth_user_id: string | null } | null>();
      if (
        doctorPrimary?.auth_user_id &&
        doctorPrimary.id !== id // 자기 자신이면 skip
      ) {
        await supabase
          .from("profiles")
          .update({ auth_user_id: doctorPrimary.auth_user_id })
          .eq("id", id);
      }
    }

    // post 백필 — author_id=id 인 post 글에 doctor_id 자동 채움.
    await supabase
      .from("cards")
      .update({ doctor_id: doctorId })
      .eq("author_id", id)
      .eq("type", "post")
      .is("doctor_id", null);
    // Q&A 백필 — doctor_id 가 매핑된 doctor 인데 author_id 가 NULL 인 글에 author 채움.
    await supabase
      .from("cards")
      .update({ author_id: id })
      .eq("doctor_id", doctorId)
      .is("author_id", null);
  } else {
    // doctor_id 가 null → 매핑 해제 (기존에 매핑이 있었으면 삭제, 없으면 no-op).
    await supabase.from("doctor_accounts").delete().eq("profile_id", id);
  }

  // 보안 2.5차 F묶음 — 감사 로그 기록.
  await logAudit({
    action: "admin.role_change",
    actorAuthUserId: guard.userId,
    targetTable: "profiles",
    targetId: id,
    request: req,
    metadata: {
      from_role: targetProfile.role,
      to_role: role,
      doctor_id: doctorId ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
