/**
 * 상대 시간 표시 — "방금 전 / 1분 전 / 3시간 전 / 어제 / N달 전" 등.
 *
 * 순수 함수 (React 의존성 없음) — 서버 컴포넌트에서도 안전하게 사용 가능.
 * 클라이언트 컴포넌트는 `<RelativeTime iso=...>` 를 사용해 60초 주기 자동 갱신.
 *
 * 여러 곳에 미세하게 다른 buyer-side local 구현이 있던 것을 통합 (보고서 §3):
 *   - src/app/doctors/[slug]/page.tsx 의 local relativeTime
 *   - src/app/notifications/NotificationsClient.tsx 의 local relativeTime
 *   - (NotificationsBell.tsx 의 timeAgo 는 compact 표기 — "분" only — 별도 유지)
 */
export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 0) return "방금 전";
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 7) {
    const d = Math.floor(diffSec / 86400);
    return d === 1 ? "어제" : `${d}일 전`;
  }
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / (86400 * 7))}주 전`;
  if (diffSec < 86400 * 365) {
    // "0달 전" 어색 — 30일 미만은 위 분기에서 처리됨. 30~365일은 1달 이상이라 0달 안 나옴.
    return `${Math.floor(diffSec / (86400 * 30))}달 전`;
  }
  return `${Math.floor(diffSec / (86400 * 365))}년 전`;
}
