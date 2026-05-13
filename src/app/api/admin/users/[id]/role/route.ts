import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-guard";

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

  // 호출자 admin 검증 (auth_user_id 묶음 기준)
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const supabase = await createSupabaseServerClient();

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

  // 1. doctor 매핑이면 doctor 이름 미리 가져오기 (display_name 동기화용)
  let doctorName: string | null = null;
  if (role === "doctor" && doctorId) {
    const { data: dInfo } = await supabase
      .from("doctors")
      .select("name")
      .eq("id", doctorId)
      .maybeSingle()
      .returns<{ name: string } | null>();
    doctorName = dInfo?.name ?? null;
  }

  // 2. profiles.role 업데이트 (+ doctor면 닉네임도 doctor 이름으로 동기화)
  const profileUpdate: Record<string, unknown> = { role };
  if (role === "doctor" && doctorName) {
    profileUpdate.display_name = doctorName;
  }
  const { error: updErr } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // 3. doctor_accounts 처리
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
    // 4-A. post 백필 — author=id 인 post에 doctor_id 설정
    //      (매핑 전 본인이 쓴 post도 doctor 페이지에 노출되도록)
    await supabase
      .from("qas")
      .update({ doctor_id: doctorId })
      .eq("author_id", id)
      .eq("type", "post")
      .is("doctor_id", null);

    // 4-B. 기존 Q&A 백필 — doctor_id가 매핑된 doctor인데 author_id가 NULL인 글
    //      (정한미 doctor의 영상 Q&A들이 정한미 user의 "작성한 글"로 잡히도록)
    //      관리자/원장 본인이 이미 author로 작성한 글은 건드리지 않음 (author_id IS NULL 조건)
    await supabase
      .from("qas")
      .update({ author_id: id })
      .eq("doctor_id", doctorId)
      .is("author_id", null);
  } else {
    // doctor가 아니면 매핑 제거
    await supabase.from("doctor_accounts").delete().eq("profile_id", id);
  }

  return NextResponse.json({ ok: true });
}
