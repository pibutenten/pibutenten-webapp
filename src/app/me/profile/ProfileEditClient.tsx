"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/ConfirmDialog";

type Props = {
  userId: string;
  currentEmail: string;
  currentDisplayName: string;
  currentMarketingConsent: boolean;
};

type Status =
  | { type: "idle" }
  | { type: "ok"; msg: string }
  | { type: "err"; msg: string };

/**
 * /me/profile 통합 편집 client.
 *
 * v4 정책:
 *  - id(handle) 변경: 가입 시점에만 가능 (여기에서는 노출 안 함)
 *  - 이메일 변경: 노출 안 함 (auth provider별 복잡 — 별도 흐름)
 *  - 비밀번호 변경: 노출 안 함 (Account 메뉴에서 별도 처리)
 *  - 닉네임·마케팅 동의는 여기서
 *  - 피부 정보·아바타는 /onboarding 페이지에서 (링크 page.tsx에 있음)
 *  - 로그아웃·회원탈퇴는 footer에 숨김 처리
 */
export default function ProfileEditClient({
  userId,
  currentEmail,
  currentDisplayName,
  currentMarketingConsent,
}: Props) {
  const router = useRouter();
  const sb = createSupabaseBrowserClient();

  // 닉네임
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [nameStatus, setNameStatus] = useState<Status>({ type: "idle" });
  const [namePending, startName] = useTransition();

  function saveDisplayName() {
    setNameStatus({ type: "idle" });
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameStatus({ type: "err", msg: "닉네임을 입력해주세요." });
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      setNameStatus({
        type: "err",
        msg: "닉네임은 2~20자로 입력해주세요.",
      });
      return;
    }
    startName(async () => {
      const { error } = await sb
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", userId);
      if (error) {
        setNameStatus({ type: "err", msg: error.message });
        return;
      }
      setNameStatus({ type: "ok", msg: "닉네임이 변경되었어요." });
      router.refresh();
    });
  }

  // 마케팅 동의
  const [marketing, setMarketing] = useState(currentMarketingConsent);
  const [mktStatus, setMktStatus] = useState<Status>({ type: "idle" });
  const [mktPending, startMkt] = useTransition();

  function saveMarketing(next: boolean) {
    setMarketing(next);
    setMktStatus({ type: "idle" });
    startMkt(async () => {
      const { error } = await sb
        .from("profiles")
        .update({ marketing_email_consent: next })
        .eq("id", userId);
      if (error) {
        setMktStatus({ type: "err", msg: error.message });
        setMarketing(!next);
        return;
      }
      setMktStatus({
        type: "ok",
        msg: next ? "마케팅 이메일 수신 동의 완료" : "수신 동의 해제됨",
      });
      router.refresh();
    });
  }

  // 회원 탈퇴
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  async function performDelete() {
    setDeletePending(true);
    try {
      const r = await fetch("/api/me/delete", { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "탈퇴 실패");
        return;
      }
      // 탈퇴 성공 — 풀 reload로 / 이동
      window.location.assign("/");
    } finally {
      setDeletePending(false);
      setDeleteOpen(false);
    }
  }

  // 로그아웃
  const [logoutPending, setLogoutPending] = useState(false);
  async function performLogout() {
    setLogoutPending(true);
    try {
      await sb.auth.signOut();
      window.location.assign("/");
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 닉네임 */}
      <Card title="닉네임 변경">
        <div className="flex items-stretch gap-1.5">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={saveDisplayName}
            disabled={
              namePending || displayName.trim() === currentDisplayName
            }
            className="h-9 shrink-0 whitespace-nowrap rounded-md border border-[var(--primary)] bg-transparent px-3 text-[12px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:text-[var(--text-muted)] disabled:hover:bg-transparent"
          >
            {namePending ? "저장 중…" : "저장"}
          </button>
        </div>
        <Msg status={nameStatus} />
      </Card>

      {/* 마케팅 동의 — 맨 밑 (구분선 위) */}
      <Card title="마케팅 이메일 수신 동의">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => saveMarketing(e.target.checked)}
            disabled={mktPending}
            className="h-4 w-4"
          />
          <span className="text-[var(--text-secondary)]">
            새 글·이벤트 등의 안내를 이메일로 받을게요
            <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">
              (현재 이메일: {currentEmail})
            </span>
          </span>
        </label>
        <Msg status={mktStatus} />
      </Card>

      {/* 로그아웃·회원탈퇴 — footer에 작게 숨김 처리 */}
      <div className="mt-10 border-t border-[var(--border)] pt-6">
        <div className="flex items-center justify-end gap-3 text-[12px] text-[var(--text-muted)]">
          <button
            type="button"
            onClick={performLogout}
            disabled={logoutPending}
            className="hover:text-[var(--text-secondary)] hover:underline disabled:opacity-50"
          >
            {logoutPending ? "로그아웃 중…" : "로그아웃"}
          </button>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="hover:text-red-700 hover:underline"
          >
            회원 탈퇴
          </button>
        </div>
      </div>

      {/* 탈퇴 확인 다이얼로그 */}
      <ConfirmDialog
        open={deleteOpen}
        title="정말 탈퇴할까요?"
        description={
          "회원 탈퇴 시 계정이 영구 삭제되며, 작성한 글·댓글·좋아요·저장 등 모든 활동 기록이 함께 사라집니다.\n\n이 작업은 되돌릴 수 없어요."
        }
        confirmLabel={deletePending ? "탈퇴 처리 중…" : "탈퇴"}
        cancelLabel="취소"
        danger
        onConfirm={performDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <h3 className="mb-1.5 text-sm font-bold text-[var(--text)]">{title}</h3>
      {subtitle && (
        <p className="mb-2 text-[11.5px] text-[var(--text-muted)]">
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

function Msg({ status }: { status: Status }) {
  if (status.type === "idle") return null;
  return (
    <p
      className={
        "mt-1.5 text-[11.5px] " +
        (status.type === "ok" ? "text-emerald-600" : "text-red-600")
      }
    >
      {status.msg}
    </p>
  );
}
