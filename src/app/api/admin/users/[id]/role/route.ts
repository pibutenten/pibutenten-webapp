import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  role?: "admin" | "doctor" | "user";
  doctor_id?: string | null;
};

/**
 * POST /api/admin/users/{id}/role
 * - admin만 호출 가능
 * - role 변경 + doctor 매핑 동시 처리
 *   - 'doctor' → doctor_accounts upsert (다른 사람이 그 doctor에 매핑되어 있으면 거부)
 *   - 'doctor' 아님 → doctor_accounts 매핑 제거
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // 호출자 admin 검증
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json(
      { error: "관리자 권한이 필요합니다" },
      { status: 403 },
    );
  }

  const body = (await req.json()) as Body;
  const role = body.role;
  if (!role || !["admin", "doctor", "user"].includes(role)) {
    return NextResponse.json(
      { error: "올바른 역할이 아닙니다" },
      { status: 400 },
    );
  }
  const doctorId = role === "doctor" ? body.doctor_id : null;
  if (role === "doctor" && !doctorId) {
    return NextResponse.json(
      { error: "원장 매핑을 선택해주세요" },
      { status: 400 },
    );
  }

  // 대상 user 존재 확인
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .maybeSingle();
  if (!targetProfile) {
    return NextResponse.json(
      { error: "대상 회원을 찾을 수 없습니다" },
      { status: 404 },
    );
  }

  // doctor 매핑이 다른 사람에게 있는지 확인 (자기 자신은 OK)
  if (role === "doctor" && doctorId) {
    const { data: existing } = await supabase
      .from("doctor_accounts")
      .select("profile_id")
      .eq("doctor_id", doctorId)
      .maybeSingle()
      .returns<{ profile_id: string } | null>();
    if (existing && existing.profile_id !== id) {
      return NextResponse.json(
        {
          error:
            "해당 원장은 이미 다른 회원에게 매핑되어 있습니다. 먼저 해제해주세요.",
        },
        { status: 409 },
      );
    }
  }

  // 1. profiles.role 업데이트
  const { error: updErr } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // 2. doctor_accounts 처리
  if (role === "doctor" && doctorId) {
    // 기존 매핑이 있으면 doctor_id만 변경, 없으면 신규 insert
    const { data: myMapping } = await supabase
      .from("doctor_accounts")
      .select("profile_id")
      .eq("profile_id", id)
      .maybeSingle()
      .returns<{ profile_id: string } | null>();
    if (myMapping) {
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
  } else {
    // doctor가 아니면 매핑 제거
    await supabase.from("doctor_accounts").delete().eq("profile_id", id);
  }

  return NextResponse.json({ ok: true });
}
