"use client";

/**
 * RelativeTime — "방금 전 / 1분 전 / 3시간 전 / 어제 / N달 전" 등 상대 시간 표시.
 *
 * Hydration mismatch (React #418) 방지:
 *   - SSR 단계에서는 Date.now() 의 서버 시각과 클라이언트 시각이 달라 텍스트 불일치
 *   - 그래서 첫 렌더에서는 빈 문자열 (또는 fallback) 반환
 *   - 마운트 후 useEffect 에서 실제 상대시간 계산해 setState
 *
 * 사용 예:
 *   <RelativeTime iso={comment.created_at} />
 *   <RelativeTime iso={card.created_at} fallback="—" />
 */
import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/relative-time";

// Phase 7-B: 함수 본체는 `@/lib/relative-time` 로 이동 — 서버/클라이언트 어디서나 사용 가능.
// 이 모듈은 호환성을 위해 동일 이름으로 re-export 유지 (기존 임포터 변경 불필요).
export { formatRelativeTime };

type Props = {
  iso: string | null | undefined;
  /** 마운트 전 표시 (default: 빈 문자열). SSR HTML 에 그대로 노출됨. */
  fallback?: string;
  className?: string;
};

export default function RelativeTime({
  iso,
  fallback = "",
  className,
}: Props) {
  const [label, setLabel] = useState(fallback);
  // hydration mismatch (React #418) 차단을 위해 마운트 후에만 실제 시간 계산:
  // 서버 시각 ≠ 클라이언트 시각 → 첫 렌더는 fallback (보통 빈 문자열) 으로 통일.
  // react-hooks/set-state-in-effect 룰은 이 hydration-safe 패턴에서 의도된 사용이므로 disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!iso) {
      setLabel(fallback);
      return;
    }
    setLabel(formatRelativeTime(iso));
    // 60초마다 갱신 — 분 단위 시간이 자연스럽게 흐르도록
    const timer = setInterval(() => setLabel(formatRelativeTime(iso)), 60_000);
    return () => clearInterval(timer);
  }, [iso, fallback]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <span suppressHydrationWarning className={className}>
      {label}
    </span>
  );
}
