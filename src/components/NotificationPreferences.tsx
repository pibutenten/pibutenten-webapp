"use client";

import { useEffect, useState } from "react";
import { ROLES } from "@/lib/identity-shared";

/**
 * 알림 종류별 on/off 설정.
 *
 * /settings/profile 페이지의 한 섹션으로 들어감.
 * - admin/doctor 만 review_request·published 항목 노출
 *   (회원에겐 의미 없는 항목)
 * - 모든 사용자 공통: comment / reply / like
 */

type Prefs = {
  pref_comment: boolean;
  pref_reply: boolean;
  pref_like: boolean;
  pref_review_request: boolean;
  pref_published: boolean;
};

const DEFAULTS: Prefs = {
  pref_comment: true,
  pref_reply: true,
  pref_like: true,
  pref_review_request: true,
  pref_published: true,
};

type Row = {
  key: keyof Prefs;
  emoji: string;
  label: string;
  desc: string;
  /** 일반 회원 노출 여부 — false면 doctor/admin role 한정 */
  visibleToUser: boolean;
};

const ROWS: Row[] = [
  {
    key: "pref_comment",
    emoji: "💬",
    label: "내 글에 댓글",
    desc: "내가 쓴 글에 누군가 댓글을 남기면 알림",
    visibleToUser: true,
  },
  {
    key: "pref_reply",
    emoji: "↳",
    label: "내 댓글에 답글",
    desc: "내가 단 댓글에 누군가 답글을 달면 알림",
    visibleToUser: true,
  },
  {
    key: "pref_like",
    emoji: "❤",
    label: "내 글에 좋아요",
    desc: "누군가 내 글에 좋아요를 누르면 알림 (24시간에 1회)",
    visibleToUser: true,
  },
  {
    key: "pref_review_request",
    emoji: "🩺",
    label: "검수 요청",
    desc: "관리자가 내 카드 검수를 요청하면 알림 (원장님 한정)",
    visibleToUser: false,
  },
  {
    key: "pref_published",
    emoji: "🚀",
    label: "내 카드 발행됨",
    desc: "검수 후 내 카드가 발행되면 알림",
    visibleToUser: true,
  },
];

export default function NotificationPreferences({
  role,
}: {
  role: "admin" | "doctor" | "user";
}) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notifications/preferences", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Prefs;
        if (!cancelled) setPrefs(data);
      } catch {
        if (!cancelled) setPrefs(DEFAULTS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(k: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
      // 실패 시 롤백
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = ROWS.filter(
    (r) => r.visibleToUser || role === ROLES.DOCTOR || role === ROLES.ADMIN,
  );

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-[var(--text)]">🔔 알림 설정</h2>
        <span className="text-[11px] text-[var(--text-muted)]">
          {saving
            ? "저장 중…"
            : error
              ? `에러: ${error}`
              : saved
                ? "저장됨"
                : ""}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)]/60">
        {visibleRows.map((r) => {
          const value = prefs ? prefs[r.key] : true;
          return (
            <li
              key={r.key}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--text)]">
                  <span className="mr-1.5">{r.emoji}</span>
                  {r.label}
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {r.desc}
                </p>
              </div>
              {/* 토글 — 박스 44x24, thumb 20x20 / 좌우 2px 여백 (ON: left 22, OFF: left 2).
                  옛 코드는 translate-x-[22px] arbitrary + Tailwind 'shadow' 사용했는데
                  v4 환경에서 thumb 이 박스 밖으로 튀어나오고 그림자도 약해 깨져 보임.
                  → 핵심 좌표/크기/그림자 모두 inline style 로 명시 (Tailwind 의존성 제거). */}
              <button
                type="button"
                role="switch"
                aria-checked={value}
                disabled={!prefs || saving}
                onClick={() => toggle(r.key)}
                className="relative shrink-0 rounded-full transition-colors"
                style={{
                  width: 44,
                  height: 24,
                  backgroundColor: value
                    ? "var(--primary)"
                    : "var(--border)",
                }}
              >
                <span
                  aria-hidden
                  className="absolute rounded-full bg-white ring-1 ring-black/10"
                  style={{
                    width: 20,
                    height: 20,
                    top: 2,
                    left: value ? 22 : 2,
                    boxShadow:
                      "0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1)",
                    transition: "left 200ms ease",
                  }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
