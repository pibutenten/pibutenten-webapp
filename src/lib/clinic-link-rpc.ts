/**
 * 병원 계정 연결(clinic_member_links) RPC 공유 헬퍼 — B3 (마이그 0345).
 *
 * /api/clinic/* (병원측 5) · /api/member/clinic-links/* (회원측 4) 라우트가 같은
 * RPC 에러 어휘(not_authorized_* / match_failed / link_* / invalid_* / *_too_long /
 * rate limit exceeded)를 공유하므로 HTTP 매핑을 단일 출처로 통합
 * (visits 라우트의 mapVisitRpcError 패턴 계승 — 라우트별 사본 드리프트 방지).
 *
 * 주의: 0345 의 도메인 에러는 대부분 ERRCODE 22023 을 재사용하므로
 *   **메시지 매칭을 코드(22023/22001) 일반 분기보다 먼저** 검사해야 한다.
 */

import type { NextResponse } from "next/server";
import { errorResponse, type ErrorKind } from "@/lib/error-response";

/** path param(link id) 파싱 — 양수 정수만 (visits parseVisitId 동일 정책). */
export function parseLinkId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * 0345/0350 RPC 에러 → HTTP 응답 매핑.
 *
 *   42501 not_authorized_*      → 403
 *   54000 rate limit exceeded   → 429
 *   match_failed                → 400 (회원 없음/생일 불일치 비구분 — 열거 방지, 문구도 구분 금지)
 *   link_already_pending/active → 409
 *   link_not_found              → 404
 *   link_not_pending/active/editable → 409 (상태 안내)
 *   visit_not_found             → 404 (시술기록 편집·삭제, 0350)
 *   visit_has_linked_reviews    → 409 (후기 달린 기록 수정·삭제 차단 C5·§4.2-8)
 *   link_revoked                → 409 (연결 해제 회원 기록 수정·삭제 차단, C2 조회만)
 *   invalid_* / *_too_long (22023/22001) → 400
 *   그 외                        → 500 (fallbackKind — mutation 은 save_failed, 조회는 generic)
 */
export function mapClinicLinkRpcError(
  rpcErr: { code?: string; message?: string },
  ctx: string,
  fallbackKind: ErrorKind = "save_failed",
): NextResponse {
  const code = rpcErr.code ?? "";
  const msg = typeof rpcErr.message === "string" ? rpcErr.message : "";

  if (code === "42501" || msg.includes("not_authorized")) {
    return errorResponse(rpcErr, "forbidden", `${ctx} not_authorized`, 403, undefined, {
      userMessage: "권한이 없습니다.",
    });
  }
  if (code === "54000" || msg.includes("rate limit exceeded")) {
    return errorResponse(rpcErr, "rate_limited", `${ctx} rate limited`, 429, undefined, {
      userMessage: "요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
    });
  }
  if (msg.includes("match_failed")) {
    return errorResponse(rpcErr, "invalid_input", `${ctx} match_failed`, 400, undefined, {
      userMessage: "일치하는 회원을 찾지 못했어요. 아이디와 생년월일을 다시 확인해주세요.",
    });
  }
  if (msg.includes("link_already_pending")) {
    return errorResponse(rpcErr, "invalid_input", `${ctx} link_already_pending`, 409, undefined, {
      userMessage: "이미 동의 대기 중인 요청이 있어요.",
    });
  }
  if (msg.includes("link_already_active")) {
    return errorResponse(rpcErr, "invalid_input", `${ctx} link_already_active`, 409, undefined, {
      userMessage: "이미 연결된 회원이에요.",
    });
  }
  if (msg.includes("link_not_found")) {
    return errorResponse(rpcErr, "not_found", `${ctx} link_not_found`, 404, undefined, {
      userMessage: "연결을 찾을 수 없어요.",
    });
  }
  if (msg.includes("link_not_pending")) {
    return errorResponse(rpcErr, "invalid_input", `${ctx} link_not_pending`, 409, undefined, {
      userMessage: "이미 처리된 요청이에요.",
    });
  }
  if (msg.includes("link_not_active")) {
    return errorResponse(rpcErr, "invalid_input", `${ctx} link_not_active`, 409, undefined, {
      userMessage: "연결이 활성 상태가 아니에요.",
    });
  }
  if (msg.includes("link_not_editable")) {
    return errorResponse(rpcErr, "invalid_input", `${ctx} link_not_editable`, 409, undefined, {
      userMessage: "해지되었거나 거절된 연결은 수정할 수 없어요.",
    });
  }
  // 시술기록 편집(0350 clinic_update_visit / clinic_delete_visit) 도메인 에러 —
  //   전부 ERRCODE 22023 재사용이므로 아래 일반 22023 분기보다 먼저 메시지 매칭(주의 주석 참조).
  if (msg.includes("visit_not_found")) {
    return errorResponse(rpcErr, "not_found", `${ctx} visit_not_found`, 404, undefined, {
      userMessage: "기록을 찾을 수 없어요.",
    });
  }
  if (msg.includes("visit_has_linked_reviews")) {
    return errorResponse(rpcErr, "invalid_input", `${ctx} visit_has_linked_reviews`, 409, undefined, {
      userMessage: "회원이 후기를 남긴 기록은 수정·삭제할 수 없어요.",
    });
  }
  if (msg.includes("link_revoked")) {
    return errorResponse(rpcErr, "invalid_input", `${ctx} link_revoked`, 409, undefined, {
      userMessage: "연결이 해제된 회원의 기록은 수정·삭제할 수 없어요. 조회만 가능해요.",
    });
  }
  // invalid_* / *_too_long / procedures_not_array 등 잔여 입력 위반.
  if (code === "22023" || code === "22001") {
    return errorResponse(rpcErr, "invalid_input", `${ctx} rpc validation`, 400, undefined, {
      userMessage: "입력 형식이 올바르지 않습니다.",
    });
  }
  return errorResponse(rpcErr, fallbackKind, `${ctx} rpc`, 500, undefined, {
    userMessage: "처리에 실패했어요. 잠시 후 다시 시도해주세요.",
  });
}
