/**
 * API 응답에서 사용자에게 보여줄 메시지를 안전하게 추출.
 *
 * 서버 (`errorResponse` 헬퍼) 표준 응답 형식:
 *   { error: <kind enum>, message: <한글 사용자 문구>, error_id: <UUID> }
 *
 * 클라이언트 일부 코드가 옛 패턴 `j.error` (kind enum, 예: "forbidden") 를 그대로
 * 토스트에 표시해 사용자에게 영문 enum 이 노출되던 회귀 (P1-F + B-2 forbidden 사례).
 *
 * 본 헬퍼는 우선순위에 따라 가장 친절한 문구를 선택:
 *   1) j.message (서버가 명시한 한글 사용자 문구) — 최우선
 *   2) j.error (kind enum) — fallback (메시지 누락 시 최소한의 단서)
 *   3) `HTTP {status}` (응답 body 파싱 자체가 실패한 경우)
 *   4) "오류가 발생했어요" (모든 fallback 도 실패한 극단 케이스)
 *
 * 사용 예:
 *   ```ts
 *   const r = await fetch("/api/comments", { ... });
 *   const j = (await r.json().catch(() => null)) as
 *     | { error?: string; message?: string } | null;
 *   if (!r.ok) {
 *     showToast(pickErrorMessage(j, r.status), { tone: "danger" });
 *     return;
 *   }
 *   ```
 *
 * Phase 1 (2026-05-29 / B-3): P1-F 가 지목한 4개 클라이언트 (CommentsBlock,
 *   WriteClient, EditClient, IdentitySwitcher) 의 옛 토스트 패턴을 본 헬퍼로 통일.
 */
export function pickErrorMessage(
  j: { error?: string | null; message?: string | null } | null | undefined,
  status?: number,
): string {
  return (
    j?.message ??
    j?.error ??
    (typeof status === "number" ? `HTTP ${status}` : "오류가 발생했어요")
  );
}
