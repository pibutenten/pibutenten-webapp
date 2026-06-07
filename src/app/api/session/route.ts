import { NextResponse } from "next/server";
import { getSessionInfo } from "@/lib/session-info";

/**
 * GET /api/session — 현재 active 세션 정보(SessionInfo) 반환.
 *
 * V-Phase(2026-06-07): layout 의 서버 세션읽기를 제거하면서, 클라이언트
 *   SessionProvider 가 마운트 후 이 엔드포인트로 리치 세션(role/avatar/identities 등)을
 *   보강한다. 로그인 여부·active id 의 즉시 판단은 클라가 onboarded/mirror 쿠키로
 *   동기 처리(네트워크 없음) → 이 호출은 "표시용 리치 데이터" 보강 전용이다.
 *
 * ⚠ 보안: 인가는 여기서 하지 않는다. 실제 권한(좋아요/저장/댓글)은 각 API 가
 *   서버에서 RLS + auth.getUser() 로 재검증한다(ADR 0005). 본 응답은 표시용일 뿐이며
 *   getSessionInfo() 자체가 auth.getUser() 로 실제 세션을 읽어 위조 불가.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionInfo();
  return NextResponse.json(session, {
    headers: { "cache-control": "private, no-store" },
  });
}
