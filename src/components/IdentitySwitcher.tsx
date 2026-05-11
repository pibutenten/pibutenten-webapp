"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionIdentity } from "./TopNav";
import NotificationBadge from "./NotificationBadge";

type Props = {
  identities: SessionIdentity[];
  activeId: string;
  /** 의사 official 진입 시 /doctors/{slug} 우선 (없으면 handle) */
  doctorSlug: string | null;
  isAdmin: boolean;
};

const KIND_LABEL: Record<string, string> = {
  primary: "기본",
  doctor: "원장",
  personal: "개인",
  admin: "관리자",
  other: "기타",
  // v5.1: 'developer' kind 폐기 → 'admin'으로 통일 (배정민 케이스: 개발자 = 관리자)
};

/**
 * v4 multi-identity 헤더 스위치.
 *  - identities.length === 1: 단순 Link (현재 active identity 프로필로 이동)
 *  - identities.length > 1: 클릭 시 dropdown 펼침 → 다른 identity 선택 가능
 *
 * 관리자(role === 'admin'): 항상 /admin으로 가도록 wrapper에서 처리
 */
export default function IdentitySwitcher({
  identities,
  activeId,
  doctorSlug,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  const active = identities.find((i) => i.id === activeId) ?? identities[0];
  if (!active) return null;

  // 활성 identity의 프로필 링크 — admin kind면 /admin, doctor면 /doctors/{slug}, 그 외 /{handle}
  const profileHref =
    active.kind === "admin"
      ? "/admin"
      : active.kind === "doctor" && doctorSlug
        ? `/doctors/${doctorSlug}`
        : `/${active.handle}`;

  // identity가 1개뿐이면 dropdown 무의미 — 단순 Link
  // (admin이어도 multi-identity가 있으면 dropdown 표시 — 배정민 케이스)
  if (identities.length === 1) {
    return (
      <Link
        href={profileHref}
        aria-label="내 프로필"
        title="내 프로필"
        className="flex items-center gap-1.5 rounded-md p-1 outline-none transition-colors hover:bg-[var(--bg-soft)] focus:outline-none focus-visible:ring-0"
      >
        <span className="relative">
          <Avatar src={active.avatarUrl} />
          <NotificationBadge />
        </span>
        <span className="hidden max-w-[100px] truncate text-[13px] font-medium text-[var(--text)] sm:inline">
          {active.displayName}
        </span>
      </Link>
    );
  }

  // 복수 identity — dropdown
  async function switchTo(id: string) {
    setOpen(false);
    if (id === activeId) {
      router.push(profileHref);
      return;
    }
    try {
      const r = await fetch("/api/identity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityId: id }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "스위치 실패");
        return;
      }
      // 풀 reload — layout의 session 캐시 확실히 비움
      window.location.assign("/");
    } catch {
      alert("네트워크 오류");
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="내 프로필 메뉴"
        title="내 프로필"
        className="flex items-center gap-1.5 rounded-md p-1 outline-none transition-colors hover:bg-[var(--bg-soft)] focus:outline-none focus-visible:ring-0"
      >
        <Avatar src={active.avatarUrl} />
        <span className="hidden max-w-[100px] truncate text-[13px] font-medium text-[var(--text)] sm:inline">
          {active.displayName}
        </span>
        <span
          aria-hidden
          className="hidden text-[10px] text-[var(--text-muted)] sm:inline"
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[200px] overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-lg">
          <div className="border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
            내 ID 전환
          </div>
          {identities.map((i) => {
            const isActive = i.id === activeId;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => switchTo(i.id)}
                className={
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors " +
                  (isActive
                    ? "bg-[var(--primary-soft)] text-[var(--text)]"
                    : "text-[var(--text)] hover:bg-[var(--bg-soft)]")
                }
              >
                <Avatar src={i.avatarUrl} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">
                      {i.displayName}
                    </span>
                    {isActive && (
                      <span className="text-[10px] text-[var(--primary)]">
                        ●
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                    @{i.handle}
                    {KIND_LABEL[i.kind] && (
                      <>
                        <span className="mx-1">·</span>
                        {KIND_LABEL[i.kind]}
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          <Link
            href={profileHref}
            onClick={() => setOpen(false)}
            className="block border-t border-[var(--border)] px-3 py-2 text-center text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
          >
            내 프로필 보기 →
          </Link>
        </div>
      )}
    </div>
  );
}

function Avatar({ src, size = 28 }: { src: string | null; size?: number }) {
  return (
    <span
      className="shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[12px]">
          👤
        </span>
      )}
    </span>
  );
}
