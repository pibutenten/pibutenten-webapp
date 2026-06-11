"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-context";
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";

const C = "#4cbff2";
const KIND_LABEL: Record<string, string> = { doctor: "원장", user: "회원", admin: "관리자" };

function Avatar({ src, size = 44 }: { src: string | null; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ width: size, height: size, background: "#e8f6fd", color: C }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: "50% 12%", transform: "scale(1.18)", transformOrigin: "50% 30%" }} />
      ) : (
        <svg width={Math.round(size * 0.46)} height={Math.round(size * 0.46)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
      )}
    </span>
  );
}

/**
 * 계정(명함) 스위처 카드 — 마이페이지·관리자/원장 대시보드 공용.
 *   활성 명함 표시 + (2개 이상이면) 다른 명함으로 전환. 전환 성공 시 /my 로 reload →
 *   /my 가 새 활성 역할에 맞게 재라우팅(관리자→/admin, 원장→/doctor, 회원→마이페이지).
 */
export default function AccountSwitcherCard({ compact = false }: { compact?: boolean }) {
  const session = useSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  if (!mounted || !session) {
    return <div className="mb-4 h-[72px] animate-pulse rounded-[var(--radius)] bg-white" />;
  }

  const identities = session.identities ?? [];
  const active = identities.find((i) => i.id === session.activeIdentityId) ?? null;
  const displayName = active?.displayName || session.displayName || "내 계정";
  const handle = active?.handle ?? session.handle ?? null;
  const kind = active?.kind || session.role;
  const avatarUrl = active?.avatarUrl ?? session.avatarUrl ?? null;
  const multi = identities.length > 1;

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
      window.location.assign("/my"); // /my 가 새 역할로 재라우팅
    } catch {
      showToast("네트워크 오류", { tone: "danger" });
      setSwitching(null);
    }
  }

  return (
    <div className="mb-4 overflow-hidden rounded-[var(--radius)] bg-white">
      {/* 활성 계정 */}
      <div className="flex items-center gap-3 p-4">
        <Avatar src={avatarUrl} size={compact ? 40 : 44} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-bold text-[var(--text)]">
            <span className="truncate">{displayName}</span>
            {KIND_LABEL[kind] && (
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#e8f6fd", color: C }}>{KIND_LABEL[kind]}</span>
            )}
          </p>
          <p className="truncate text-xs text-[var(--text-secondary)]">{handle ? `@${handle}` : "로그인됨"}</p>
        </div>
        {multi && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="shrink-0 cursor-pointer rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-soft)]">
            계정 전환 {open ? "▴" : "▾"}
          </button>
        )}
      </div>

      {/* 전환 목록 */}
      {multi && open && (
        <div className="border-t border-[var(--border)]">
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
                <Avatar src={i.avatarUrl} size={34} />
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
        </div>
      )}
    </div>
  );
}
