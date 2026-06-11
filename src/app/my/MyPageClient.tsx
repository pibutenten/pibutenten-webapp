"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-context";
import AccountSwitcherCard from "@/components/AccountSwitcherCard";
import ProfileEditClient, { type ProfileEditProps } from "@/app/settings/profile/ProfileEditClient";
import ProfileTabs from "@/components/ProfileTabs";
import type { CardData } from "@/components/Card";

const C = "#4cbff2";

/** 프로필·계정 설정 폼(ProfileEditClient)의 props — 서버(/my/page.tsx)에서 채워 넘김. */
export type ProfileSettings = ProfileEditProps;

/** 내 활동(작성글·댓글·좋아요·저장) — 서버(/my/page.tsx)에서 prefetch. */
export type MyActivity = {
  profileId: string;
  posts: CardData[];
  postsCount: number;
  commentsCount: number;
  likesCount: number;
  savesCount: number;
};

function Row({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex w-full items-center justify-between px-4 py-3.5 text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-soft)]">
      <span>{label}</span>
      <span className="text-[var(--text-muted)]">›</span>
    </Link>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      {title && <p className="mb-1.5 px-1 text-xs font-medium text-[var(--text-muted)]">{title}</p>}
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] bg-white">{children}</div>
    </div>
  );
}

// 마이페이지(회원 전용 — 관리자/원장은 page.tsx 가 대시보드로 리다이렉트).
//   계정 스위처 + 내 활동 + '프로필·계정 설정'(아코디언). 펼치면 그 자리서 설정 폼을
//   바로 편집(별도 페이지 이동 X). settings 는 서버(page.tsx)에서 채워 넘김.
//   세션(아바타·identities)은 클라 출처라 클라 렌더.
export default function MyPageClient({
  settings,
  activity,
}: {
  settings?: ProfileSettings | null;
  activity?: MyActivity | null;
}) {
  const session = useSession();
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="mx-auto max-w-[680px] animate-pulse">
        <div className="mb-4 h-[72px] rounded-[var(--radius)] bg-white" />
        <div className="h-40 rounded-[var(--radius)] bg-white" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-[680px]">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-base font-bold text-[var(--text)]">마이페이지</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">로그인하면 내 정보가 표시됩니다.</p>
          <Link href="/login" className="mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-white" style={{ background: C }}>로그인</Link>
        </div>
      </div>
    );
  }

  const active = session.identities.find((i) => i.id === session.activeIdentityId) ?? null;
  const handle = active?.handle ?? session.handle ?? null;

  return (
    <div className="mx-auto max-w-[680px]">
      {/* 활성 계정 + 계정 전환 (공용 카드) */}
      <AccountSwitcherCard />

      {/* 바로가기 — 알림 / 내 프로필 */}
      <Section title="바로가기">
        <Row href="/notifications" label="알림" />
        {handle && <Row href={`/${handle}`} label="내 프로필" />}
      </Section>

      {/* 내 활동 — 작성글·댓글·좋아요·저장 4탭 (ProfileTabs 재사용, 본인분만 RLS) */}
      {activity && (
        <div className="mb-3">
          <p className="mb-1.5 px-1 text-xs font-medium text-[var(--text-muted)]">내 활동</p>
          <ProfileTabs
            activityOnly
            isOwner
            posts={activity.posts}
            reviews={[]}
            postsCount={activity.postsCount}
            reviewsCount={0}
            commentsCount={activity.commentsCount}
            likesCount={activity.likesCount}
            savesCount={activity.savesCount}
            profileId={activity.profileId}
          />
        </div>
      )}

      {/* 프로필·계정 설정 — 클릭 시 그 자리서 펼쳐 폼을 바로 편집(별도 페이지 이동 X). */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius)] bg-white px-4 py-3.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-soft)]"
        >
          프로필·계정 설정
          <span className="text-[var(--text-muted)]">{settingsOpen ? "▴" : "▾"}</span>
        </button>
        {settingsOpen &&
          (settings ? (
            <div className="mt-2">
              <ProfileEditClient {...settings} embedded />
            </div>
          ) : (
            <div className="mt-2 rounded-[var(--radius)] bg-white px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
              <p>설정을 불러올 수 없어요. 잠시 후 다시 시도해 주세요.</p>
              <Link href="/settings/profile" className="mt-2 inline-block text-[var(--text)] underline">
                설정 페이지로 이동
              </Link>
            </div>
          ))}
      </div>
    </div>
  );
}
