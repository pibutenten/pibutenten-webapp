"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-context";
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";

const C = "#4cbff2";

// 계정 역할 라벨 (ADR 0001 — 동등 독립). identities[].kind = profile.role.
const KIND_LABEL: Record<string, string> = { doctor: "원장", user: "회원", admin: "관리자" };

function Avatar({ src, size = 56 }: { src: string | null; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: "#e8f6fd", color: C }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          style={{ objectPosition: "50% 12%", transform: "scale(1.18)", transformOrigin: "50% 30%" }}
        />
      ) : (
        <svg width={Math.round(size * 0.46)} height={Math.round(size * 0.46)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )}
    </span>
  );
}

function Row({ href, label, onClick, right }: { href?: string; label: string; onClick?: () => void; right?: React.ReactNode }) {
  const cls = "flex w-full items-center justify-between px-4 py-3.5 text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-soft)]";
  const inner = (
    <>
      <span>{label}</span>
      <span className="text-[var(--text-muted)]">{right ?? "›"}</span>
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={`${cls} cursor-pointer text-left`}>{inner}</button>;
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      {title && <p className="mb-1.5 px-1 text-xs font-medium text-[var(--text-muted)]">{title}</p>}
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] bg-white">{children}</div>
    </div>
  );
}

export default function MyPageClient() {
  const session = useSession();
  const [mounted, setMounted] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  // 마운트 전 — 로그인 여부 미확정. 가벼운 스켈레톤(로그인 깜빡임 방지).
  if (!mounted) {
    return (
      <div className="mx-auto max-w-[680px] animate-pulse pb-16 sm:pb-0">
        <div className="mb-4 flex items-center gap-3 rounded-[var(--radius)] bg-white p-4">
          <div className="h-14 w-14 rounded-full bg-[var(--bg-soft)]" />
          <div className="flex-1 space-y-2"><div className="h-4 w-28 rounded bg-[var(--bg-soft)]" /><div className="h-3 w-20 rounded bg-[var(--bg-soft)]" /></div>
        </div>
        <div className="h-40 rounded-[var(--radius)] bg-white" />
      </div>
    );
  }

  // 로그아웃 상태
  if (!session) {
    return (
      <div className="mx-auto max-w-[680px] pb-16 sm:pb-0">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-base font-bold text-[var(--text)]">마이페이지</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">로그인하면 내 정보가 표시됩니다.</p>
          <Link href="/login" className="mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-white" style={{ background: C }}>로그인</Link>
        </div>
      </div>
    );
  }

  const identities = session.identities ?? [];
  const active = identities.find((i) => i.id === session.activeIdentityId) ?? null;
  const displayName = active?.displayName || session.displayName || "내 계정";
  const handle = active?.handle ?? session.handle ?? null;
  const kind = active?.kind || session.role;
  const avatarUrl = active?.avatarUrl ?? session.avatarUrl ?? null;
  // /api/session 리치 보강 전(쿠키 최소 세션)은 identities 가 빈 배열 → 이걸로 과도기 판정.
  //   (로그인 사용자는 리치 보강 후 본인 명함 1개 이상 포함되므로 length>0. displayName 유무로 판단하면
  //    표시이름 미설정 계정이 영구 스켈레톤에 갇힐 수 있어 identities 길이로 견고하게 판정.)
  const richLoading = identities.length === 0;

  // 활성 계정 진입(대시보드/프로필) — IdentitySwitcher 와 동일 규칙.
  const profileHref = kind === "admin" ? "/admin" : kind === "doctor" ? "/doctor" : handle ? `/${handle}` : "/";

  async function switchTo(id: string) {
    if (id === session?.activeIdentityId || switching) return;
    setSwitching(id);
    try {
      const r = await fetch("/api/identity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityId: id }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        showToast(pickErrorMessage(j, r.status) || "계정 전환 실패", { tone: "danger" });
        setSwitching(null);
        return;
      }
      // 풀 reload — layout 세션 캐시 확실히 비우고 전환 계정으로 마이페이지 재진입.
      window.location.assign("/my");
    } catch {
      showToast("네트워크 오류", { tone: "danger" });
      setSwitching(null);
    }
  }

  return (
    <div className="mx-auto max-w-[680px] pb-16 sm:pb-0">
      {/* 활성 계정 헤더 */}
      <div className="mb-4 flex items-center gap-3 rounded-[var(--radius)] bg-white p-4">
        <Avatar src={avatarUrl} />
        <div className="min-w-0 flex-1">
          {richLoading ? (
            <div className="space-y-2"><div className="h-4 w-28 rounded bg-[var(--bg-soft)]" /><div className="h-3 w-20 rounded bg-[var(--bg-soft)]" /></div>
          ) : (
            <>
              <p className="flex items-center gap-1.5 font-bold text-[var(--text)]">
                <span className="truncate">{displayName}</span>
                {KIND_LABEL[kind] && (
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#e8f6fd", color: C }}>{KIND_LABEL[kind]}</span>
                )}
              </p>
              <p className="truncate text-xs text-[var(--text-secondary)]">{handle ? `@${handle}` : "로그인됨"}</p>
            </>
          )}
        </div>
        {!richLoading && (
          <Link href={profileHref} className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-soft)]">
            {kind === "admin" || kind === "doctor" ? "대시보드" : "내 프로필"}
          </Link>
        )}
      </div>

      {/* 계정 전환 — identity 2개 이상일 때만 */}
      {identities.length > 1 && (
        <Section title="계정 전환">
          {identities.map((i) => {
            const isActive = i.id === session.activeIdentityId;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => switchTo(i.id)}
                disabled={isActive || !!switching}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? "bg-[var(--primary-soft,#eef9fe)]" : "cursor-pointer hover:bg-[var(--bg-soft)]"} ${switching && !isActive ? "opacity-50" : ""}`}
              >
                <Avatar src={i.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{i.displayName}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">@{i.handle}{KIND_LABEL[i.kind] ? ` · ${KIND_LABEL[i.kind]}` : ""}</p>
                </div>
                {isActive ? (
                  <span className="shrink-0 text-xs font-semibold" style={{ color: C }}>현재</span>
                ) : switching === i.id ? (
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">전환 중…</span>
                ) : (
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">전환 ›</span>
                )}
              </button>
            );
          })}
        </Section>
      )}

      {/* 관리자 — 운영 대시보드·도구 (admin 계정). /admin 이 전체 허브. */}
      {kind === "admin" && (
        <Section title="관리자">
          <Row href="/admin" label="관리자 대시보드" />
          <Row href="/admin/cards" label="전체 글 관리" />
          <Row href="/admin/cards?status=pending_review" label="검수 대기" />
          <Row href="/admin/users" label="회원 관리" />
          <Row href="/admin/doctors" label="의사 프로필 관리" />
          <Row href="/admin/reports" label="신고 검토" />
          <Row href="/admin/review-reports" label="시술 리포트" />
          <Row href="/write?tab=qa" label="Q&A 카드 작성" />
        </Section>
      )}

      {/* 원장 — 본인 대시보드·공개 프로필 (doctor 계정). */}
      {kind === "doctor" && (
        <Section title="원장">
          <Row href="/doctor" label="원장 대시보드" />
          {session.doctorSlug && <Row href={`/doctors/${session.doctorSlug}`} label="내 공개 프로필" />}
          <Row href="/write?tab=qa" label="Q&A 카드 작성" />
        </Section>
      )}

      {/* 내 활동 */}
      <Section title="내 활동">
        <Row href="/notifications" label="알림" />
        {handle && <Row href={`/${handle}`} label="내가 쓴 글" />}
        {handle && <Row href={`/${handle}?tab=saves`} label="저장한 글" />}
      </Section>

      {/* 설정 */}
      <Section title="설정">
        <Row href="/settings/profile" label="프로필·계정 설정" />
        <Row href="/settings" label="전체 설정" />
      </Section>
    </div>
  );
}
