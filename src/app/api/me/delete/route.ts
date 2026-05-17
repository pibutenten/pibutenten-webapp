import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorResponse } from "@/lib/error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 회원 탈퇴 — 본인 계정 영구 삭제.
 *
 * POST /api/me/delete  body: { confirmation: "탈퇴에 동의합니다" }
 *
 * - 인증된 본인만 삭제 가능
 * - Phase 6-5 (2026-05-16): typed confirmation 강제 — 의도치 않은 자동 삭제 방지
 * - service role로 auth.users.delete → profiles cascade로 자동 삭제
 * - 글·댓글은 author_id가 set null 또는 cascade (DB 설정에 따름)
 * - 성공 시 sign out + 클라이언트는 / 로 이동
 */

/** UI 측 다이얼로그가 동일 문자열을 사용자에게 타이핑 요구 (대소문자 X, 공백·문장부호 trim 후 비교). */
const REQUIRED_CONFIRMATION = "탈퇴에 동의합니다";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  // Phase 6-5: typed confirmation 검증
  let body: { confirmation?: string } = {};
  try {
    body = (await req.json()) as { confirmation?: string };
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const input = (body.confirmation ?? "").trim();
  if (input !== REQUIRED_CONFIRMATION) {
    return NextResponse.json(
      {
        error: `탈퇴를 진행하려면 정확히 "${REQUIRED_CONFIRMATION}" 라고 입력해야 합니다.`,
      },
      { status: 400 },
    );
  }

  // service role client (auth.admin.deleteUser 권한)
  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return NextResponse.json(
      { error: "서버 설정 오류 (관리자에게 문의)" },
      { status: 500 },
    );
  }

  // Phase 7-extra (2026-05-16): soft-delete 익명화 — auth.users.delete 직전.
  //   sentinel 방식 폐기 (migration 0109).
  //   각 profile row 가 본인 자리에서 in-place 익명화:
  //     - handle → 'deleted-{12hex}', display_name → '(탈퇴한 사용자)'
  //     - 모든 PII NULL, auth_user_id NULL, deleted_at = now()
  //   cards/comments.author_id 는 그대로 — 가리키는 row 가 이미 익명화됨.
  //   user 본인 권한으로 RPC 호출 (SECURITY DEFINER + auth.uid() 검증).
  try {
    const { error: anonErr } = await supabase.rpc(
      "anonymize_user_content_before_delete",
    );
    if (anonErr) {
      // 익명화 실패 시 탈퇴 자체 중단 — 익명화 없이 auth.users 삭제하면
      // profile row 의 PII 가 그대로 남기 때문.
      // A10: 상세 메시지(RPC 내부 PG error) 노출 금지.
      return errorResponse(
        anonErr,
        "generic",
        "[me/delete] anonymize RPC",
        500,
        { user_id: user.id },
      );
    }
  } catch (e) {
    console.error("[me/delete] anonymize RPC threw:", e);
    return NextResponse.json(
      { error: "익명화 처리 중 오류" },
      { status: 500 },
    );
  }

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
