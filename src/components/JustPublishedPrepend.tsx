"use client";

/**
 * 배치 ⑤ H4 (2026-05-28) — "방금 쓴 글" 1회 노출.
 *
 * 정책:
 *  - WriteClient publish 성공 → sessionStorage 'pbtt:justPublished' = {id, ts}.
 *  - 홈 mount 시 본 컴포넌트가:
 *    (1) 5분 이내 (ts) 인지 확인.
 *    (2) sessionStorage 'pbtt:justPublished:shown' 마킹이 동일 id 와 다르면 → 1회 노출 + 마킹.
 *    (3) 그 외 (만료·이미 본 경우) → 미노출.
 *  - 새로고침·재방문 시 마킹이 일치해 미노출. 다른 사용자에겐 영향 0 (서버 fetch 없음).
 *
 * 카드 데이터는 `/api/cards?ids={id}` 단일 fetch — 본 컴포넌트가 mount 직후 1회 호출.
 * 카드는 일반 `<Card />` 로 렌더 (홈 피드 첫 카드와 동일 시각).
 */

import { useEffect, useState } from "react";
import Card, { type CardData } from "@/components/Card";

const STORAGE_KEY = "pbtt:justPublished";
const SHOWN_KEY = "pbtt:justPublished:shown";
const WINDOW_MS = 5 * 60 * 1000; // 5분

export default function JustPublishedPrepend() {
  const [card, setCard] = useState<CardData | null>(null);

  useEffect(() => {
    let aborted = false;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: unknown; ts?: unknown };
      const id =
        typeof parsed.id === "number" && Number.isFinite(parsed.id)
          ? parsed.id
          : null;
      const ts =
        typeof parsed.ts === "number" && Number.isFinite(parsed.ts)
          ? parsed.ts
          : null;
      if (id === null || ts === null) return;
      // 5분 윈도우 — 초과면 미노출 + 마킹 정리.
      if (Date.now() - ts > WINDOW_MS) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      // 이미 본 같은 id 면 미노출.
      const shown = window.sessionStorage.getItem(SHOWN_KEY);
      if (shown === String(id)) return;
      // fetch 단일 카드 — 응답 받기 전 lock 없이 setState 만.
      void fetch(`/api/cards?ids=${id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { cards?: CardData[] } | null) => {
          if (aborted) return;
          const c = j?.cards?.[0];
          if (!c) return;
          setCard(c);
          // 노출 마킹 — 다음 mount 부터 미노출.
          window.sessionStorage.setItem(SHOWN_KEY, String(id));
        })
        .catch(() => {
          /* 네트워크 실패 — 미노출, 마킹 변경 없음 */
        });
    } catch {
      /* sessionStorage 비활성 — 미노출 */
    }
    return () => {
      aborted = true;
    };
  }, []);

  if (!card) return null;
  return (
    <div className="mb-3" data-just-published>
      <Card card={card} />
    </div>
  );
}
