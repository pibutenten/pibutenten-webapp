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
 * v4 multi-identity 헤더 스위치 (v5.2 — 클릭 영역 분리).
 *  - identities.length === 1: 단순 Link (현재 active identity 프로필/대시보드로 이동)
 *  - identities.length > 1:
 *      - 아바타+이름 클릭: 활성 identity의 대시보드(관리자/원장) 또는 프로필(개인)로 이동
 *      - ▾ 삼각형 클릭: dropdown 펼침 → 다른 identity 전환
 */
export default function IdentitySwitcher({
  identities,
  activeId,
  doctorSlug,
  // isAdmin은 현재 미사용 (kind 기반 분기로 대체). prop 호환성을 위해 유지.
  isAdmin: _isAdmin,
}: Props) {
  void _isAdmin;
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

  // 활성 identity의 진입 링크
  //  - admin: /admin (관리자 대시보드)
  //  - doctor: /doctors/{slug} (원장 대시보드 — 본인 접속 시 dashboard-only 화면)
  //  - 그 외: /{handle} (개인 프로필 피드)
  const profileHref =
    active.kind === "admin"
      ? "/admin"
      : (active.kind === "doctor" || active.kind === "primary") && doctorSlug
        ? `/doctors/${doctorSlug}`
        : `/${active.handle}`;

  // identity가 1개뿐이면 dropdown 무의미 — 단순 Link
  if (identities.length === 1) {
    return (
      <Link
        href={profileHref}
        aria-label="내 프로필"
        title="내 프로필"
        className="flex items-center gap-1.5 rounded-md p-1 outline-none transition-colors hover:bg-[var(--bg-soft)] focus:outline-none focus-visible:ring-0"
      >
        {/* 아바타 래퍼 — 텍스트 x-height와 시각적 중심을 맞추려 inline-flex + 살짝 아래로 (translate-y 1px) */}
        <span className="relative inline-flex items-center translate-y-px">
          <Avatar src={active.avatarUrl} />
          <NotificationBadge />
        </span>
        <span className="hidden max-w-[100px] truncate text-[13px] font-medium leading-none text-[var(--text)] sm:inline">
          {active.displayName}
        </span>
      </Link>
    );
  }

  // 복수 identity — 이름 클릭=Navigate, ▾ 클릭=Dropdown 분리
  async function switchTo(id: string) {
    setOpen(false);
    if (id === activeId) {
      // 같은 identity 재선택은 대시보드/프로필로 이동
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
    <div ref={wrapRef} className="relative flex items-center">
      {/* 이름·아바타 영역 — 활성 identity의 대시보드/프로필로 이동 */}
      <Link
        href={profileHref}
        aria-label={`${active.displayName} — ${
          active.kind === "admin"
            ? "관리자 대시보드"
            : active.kind === "doctor" || active.kind === "primary"
              ? "원장 대시보드"
              : "내 프로필"
        }`}
        title={
          active.kind === "admin"
            ? "관리자 대시보드"
            : active.kind === "doctor" || active.kind === "primary"
              ? "원장 대시보드"
              : "내 프로필"
        }
        className="flex items-center gap-1.5 rounded-md p-1 outline-none transition-colors hover:bg-[var(--bg-soft)] focus:outline-none focus-visible:ring-0"
      >
        {/* 아바타 래퍼 — 텍스트 x-height와 시각적 중심을 맞추려 inline-flex + 살짝 아래로 (translate-y 1px) */}
        <span className="relative inline-flex items-center translate-y-px">
          <Avatar src={active.avatarUrl} />
          <NotificationBadge />
        </span>
        <span className="hidden max-w-[100px] truncate text-[13px] font-medium leading-none text-[var(--text)] sm:inline">
          {active.displayName}
        </span>
      </Link>
      {/* ▾ 삼각형 — 별도 버튼. 클릭 시 identity 전환 dropdown 토글 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="ID 전환"
        title="다른 ID로 전환"
        aria-expanded={open}
        className="ml-0.5 flex h-7 w-6 items-center justify-center rounded-md text-[12px] text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-0"
      >
        ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-lg">
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
        </div>
      )}
    </div>
  );
}

function Avatar({ src, size = 28 }: { src: string | null; size?: number }) {
  return (
    <span
      // ⚠️ inline-flex 필수: span은 기본 inline 요소라 width/height 인라인 스타일이 무시됨.
      //    그러면 overflow-hidden·rounded-full도 무력화되어 원본 이미지가 그대로 노출됨.
      //    inline-flex로 강제하면 size 적용 + 내부 img가 h-full/w-full로 정확히 채워짐.
      className="inline-flex shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]"
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
