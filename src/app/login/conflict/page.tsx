/**
 * /login/conflict — 동일 email 이 다른 OAuth provider 로 이미 가입되었을 때 안내 페이지.
 *
 * 트리거: A5 (2026-05-17)
 *   Naver(또는 향후 다른 provider) 로그인 시도 시 같은 email 이 이미 다른 provider
 *   로 등록되어 있으면 자동 매칭하지 않고 이 페이지로 redirect — 계정 인수 방어.
 *
 * Query:
 *   existing_provider: 'google' | 'kakao' | 'email' | 'other'
 *   attempted_provider: 'naver' (현재) | 향후 추가
 */
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
  email: "이메일",
  other: "다른 채널",
};

export const metadata: Metadata = {
  title: "다른 채널로 가입된 이메일",
  robots: { index: false, follow: false },
};

type SP = Promise<{
  existing_provider?: string;
  attempted_provider?: string;
}>;

export default async function LoginConflictPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const existing = PROVIDER_LABEL[sp.existing_provider ?? "other"] ?? "다른 채널";
  const attempted = PROVIDER_LABEL[sp.attempted_provider ?? "other"] ?? "이 채널";

  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 text-4xl">🔐</div>
      <h1 className="mb-2 text-xl font-bold text-[var(--text)]">
        이미 {existing}(으)로 가입된 이메일이에요
      </h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        같은 이메일이 다른 채널로 먼저 가입되어 있어서,
        <br />
        {attempted} 로그인은 자동으로 연결되지 않습니다.
      </p>
      <p className="mb-6 text-xs text-[var(--text-muted)]">
        보안을 위해 기존 채널로 로그인하신 뒤,
        <br />
        설정에서 직접 연결해 주세요.
      </p>
      <div className="flex w-full flex-col gap-2">
        <Link
          href="/login"
          className="rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          {existing}(으)로 로그인하기
        </Link>
        <Link
          href="/"
          className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </section>
  );
}
