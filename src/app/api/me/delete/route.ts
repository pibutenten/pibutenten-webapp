import { NextResponse } from "next/server";
import type { AuthError } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorResponse } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";

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
    return errorResponse(null, "unauthorized", "[me/delete] auth required", 401);
  }

  // Phase 6-5: typed confirmation 검증
  let body: { confirmation?: string } = {};
  try {
    body = (await req.json()) as { confirmation?: string };
  } catch (e) {
    return errorResponse(e, "invalid_input", "[me/delete] body parse", 400, undefined, {
      userMessage: "요청 형식이 올바르지 않습니다.",
    });
  }
  const input = (body.confirmation ?? "").trim();
  if (input !== REQUIRED_CONFIRMATION) {
    return errorResponse(null, "invalid_input", "[me/delete] confirmation mismatch", 400, undefined, {
      userMessage: `탈퇴를 진행하려면 정확히 "${REQUIRED_CONFIRMATION}" 라고 입력해야 합니다.`,
    });
  }

  // service role client (auth.admin.deleteUser 권한)
  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return errorResponse(e, "generic", "[me/delete] admin client init", 500, undefined, {
      userMessage: "서버 설정 오류 (관리자에게 문의)",
    });
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
    return errorResponse(e, "generic", "[me/delete] anonymize RPC threw", 500, { user_id: user.id }, {
      userMessage: "익명화 처리 중 오류",
    });
  }

  // 트랜잭션 갭 완화 (2026-07-04): 익명화 RPC(0332, 묶음 전체)는 이미 성공했다.
  //   여기서 deleteUser 가 실패하면 PII 는 스크럽됐으나 auth.users 가 남는 반쪽 상태가
  //   되어, 사용자가 로그인은 되나 모든 명함 auth_user_id 가 NULL 이라 active identity 를
  //   못 얻는 잠금 상태가 된다. 익명화는 deleted_at IS NULL 필터로 멱등이므로 deleteUser
  //   만 짧게 재시도해 반쪽 창을 좁힌다. 최종 실패해도 PII 는 이미 보호된 상태.
  let delErr: AuthError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      // 짧은 백오프 — 일시 장애 시 재시도 실효 확보 (탈퇴는 저빈도라 UX 영향 없음).
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
    const res = await admin.auth.admin.deleteUser(user.id);
    delErr = res.error;
    if (!delErr) break;
  }
  if (delErr) {
    return errorResponse(delErr, "generic", "[me/delete] admin deleteUser", 500, { user_id: user.id });
  }

  // 보안 2.5차 F묶음 — 감사 로그 기록 (PIPA §8).
  await logAudit({
    action: "profile.delete",
    actorAuthUserId: user.id,
    targetTable: "profiles",
    targetId: user.id,
    request: req,
  });

  // 현재 sign out
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
