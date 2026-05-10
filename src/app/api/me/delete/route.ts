import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 회원 탈퇴 — 본인 계정 영구 삭제.
 *
 * POST /api/me/delete
 *
 * - 인증된 본인만 삭제 가능
 * - service role로 auth.users.delete → profiles cascade로 자동 삭제
 * - 글·댓글은 author_id가 set null 또는 cascade (DB 설정에 따름)
 * - 성공 시 sign out + 클라이언트는 / 로 이동
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  // service role client (auth.admin.deleteUser 권한)
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return NextResponse.json(
      { error: "서버 설정 오류 (관리자에게 문의)" },
      { status: 500 },
    );
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    return NextResponse.json(
      { error: `탈퇴 실패: ${delErr.message}` },
      { status: 500 },
    );
  }

  // 현재 sign out
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
