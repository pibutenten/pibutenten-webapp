"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  readPersonaClient,
  writePersonaClient,
  type Persona,
} from "@/lib/persona";

type Props = {
  /** 공식 페르소나 표시명 */
  officialName: string;
  officialAvatar: string | null;
  /** 개인 페르소나 (없으면 미설정 상태) */
  alt: { name: string; avatar: string | null } | null;
};

/**
 * 대시보드(/me) 상단의 페르소나 스위치.
 * - alt 미설정 → "+ 개인 페르소나 만들기" 링크 (/me/profile/persona)
 * - alt 있음 → 두 개의 페르소나 토글 칩 (현재 선택된 쪽 강조)
 * - 토글 시 쿠키 갱신 + router.refresh()
 */
export default function DashboardPersonaToggle({
  officialName,
  officialAvatar,
  alt,
}: Props) {
  const router = useRouter();
  const [persona, setPersona] = useState<Persona>("official");
  const [, start] = useTransition();

  useEffect(() => {
    setPersona(readPersonaClient());
  }, []);

  function switchTo(p: Persona) {
    if (p === persona) return;
    writePersonaClient(p);
    setPersona(p);
    start(() => router.refresh());
  }

  if (!alt) {
    // 개인 페르소나 미설정 — 만들기 링크
    return (
      <div className="mb-4 flex items-center justify-between rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white px-4 py-3">
        <div className="text-[13px] text-[var(--text-secondary)]">
          개인 페르소나를 만들어 일반 회원처럼 활동할 수 있어요.
        </div>
        <Link
          href="/me/profile/persona"
          className="shrink-0 rounded-md border border-[var(--primary)] bg-transparent px-3 py-1.5 text-[12px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]"
        >
          + 개인 페르소나 만들기
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2">
      <span className="mr-1 text-[11px] font-medium text-[var(--text-muted)]">
        모드
      </span>
      <PersonaChip
        active={persona === "official"}
        name={officialName}
        avatar={officialAvatar}
        sublabel="공식"
        onClick={() => switchTo("official")}
        isOfficial
      />
      <PersonaChip
        active={persona === "personal"}
        name={alt.name}
        avatar={alt.avatar}
        sublabel="개인"
        onClick={() => switchTo("personal")}
      />
      <Link
        href="/me/profile/persona"
        className="ml-auto text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)]"
      >
        페르소나 설정
      </Link>
    </div>
  );
}

function PersonaChip({
  active,
  name,
  avatar,
  sublabel,
  onClick,
  isOfficial,
}: {
  active: boolean;
  name: string;
  avatar: string | null;
  sublabel: string;
  onClick: () => void;
  isOfficial?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-full px-2.5 py-1 text-left transition-colors " +
        (active
          ? "bg-[var(--primary-soft)] ring-1 ring-[var(--primary)]"
          : "hover:bg-[var(--bg-soft)]")
      }
    >
      <span className="relative inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[12px] text-[var(--text-muted)]">
            {isOfficial ? "🏥" : "👤"}
          </span>
        )}
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[12px] font-semibold text-[var(--text)]">
          {name}
        </span>
        <span className="mt-0.5 text-[10px] text-[var(--text-muted)]">
          {sublabel}
        </span>
      </span>
      {active && (
        <span
          className="ml-0.5 text-[var(--primary)]"
          aria-label="현재 페르소나"
        >
          ✓
        </span>
      )}
    </button>
  );
}
