"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readPersonaClient, type Persona } from "@/lib/persona";

type Props = {
  /** 공식 페르소나 (본명) */
  officialName: string;
  /** 공식 아바타 url (선택) */
  officialAvatar: string | null;
  /** 개인 페르소나 닉네임 — 있으면 personal 모드일 때 표시 */
  alt: { name: string; avatar: string | null } | null;
};

/**
 * 우상단 본인 아이콘 — 클릭 시 /me 대시보드로 바로 이동.
 * 표시되는 이름·아바타는 현재 페르소나에 맞춰 자동 전환됨.
 * 메뉴(내 정보 수정 등)는 /me 안에서 처리.
 */
export default function PersonaSwitcher({
  officialName,
  officialAvatar,
  alt,
}: Props) {
  const [persona, setPersona] = useState<Persona>("official");

  useEffect(() => {
    setPersona(readPersonaClient());
  }, []);

  const currentName =
    persona === "personal" && alt ? alt.name : officialName;
  const currentAvatar =
    persona === "personal" && alt ? alt.avatar : officialAvatar;

  return (
    <Link
      href="/settings"
      className="flex items-center gap-1.5 rounded-md p-1.5 text-[14px] font-medium transition-colors hover:bg-[var(--bg-soft)]"
      aria-label="내 페이지"
    >
      <span className="relative inline-flex h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]">
        {currentAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentAvatar}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-base text-[var(--text-muted)]">
            👤
          </span>
        )}
      </span>
      <span className="hidden sm:inline">{currentName}</span>
    </Link>
  );
}
