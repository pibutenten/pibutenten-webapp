"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { maybeBlockNavigation } from "@/lib/nav-guard";
import type { ComponentProps } from "react";

/**
 * GuardedLink — next/link 래퍼. 클릭 시 글쓰기 이탈 가드(nav-guard)를 자동 조회한다.
 *
 * 글쓰기 폼(CardEditor/ReviewForm)이 useUnsavedChangesGuard 로 등록한 상태에서 작성 중(dirty)이면
 * 이동을 가로채 "작성 중인 글쓰기를 종료하시겠습니까?" 모달을 띄우고, 아니면 정상 이동한다.
 * SPA 내부 <Link> 이동은 popstate/beforeunload 로 못 잡으므로, 셸의 각 내비 링크가 이 컴포넌트를 써야 한다.
 *
 * (옛 BottomNav 가 링크마다 인라인으로 복붙하던 onClick 가드를 단일 컴포넌트로 통일 — SSOT, 2026-06-26.
 *  href 는 문자열만 가정한다 — 앱 내 모든 내비 링크가 문자열 href 다.)
 */
export default function GuardedLink({
  href,
  onClick,
  ...rest
}: ComponentProps<typeof Link>) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        const target =
          typeof href === "string" ? href : (href as { toString(): string }).toString();
        if (maybeBlockNavigation(() => router.push(target))) {
          e.preventDefault();
        }
      }}
      {...rest}
    />
  );
}
