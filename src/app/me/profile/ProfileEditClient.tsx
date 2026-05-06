"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  currentEmail: string;
  currentDisplayName: string;
  currentMarketingConsent: boolean;
  hasPassword: boolean; // email 가입자만 true (Google/Kakao OAuth는 false)
};

type Status = { type: "idle" } | { type: "ok"; msg: string } | { type: "err"; msg: string };

export default function ProfileEditClient({
  userId,
  currentEmail,
  currentDisplayName,
  currentMarketingConsent,
  hasPassword,
}: Props) {
  const router = useRouter();
  const sb = createSupabaseBrowserClient();

  // ── 1. 닉네임 ──
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
      setNameStatus({ type: "err", msg: "닉네임은 2~20자로 입력해주세요." });
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

  // ── 2. 마케팅 동의 ──
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
        setMarketing(!next); // 롤백
        return;
      }
      setMktStatus({
        type: "ok",
        msg: next ? "마케팅 이메일 수신 동의 완료" : "수신 동의 해제됨",
      });
      router.refresh();
    });
  }

  // ── 3. 비밀번호 ──
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwStatus, setPwStatus] = useState<Status>({ type: "idle" });
  const [pwPending, startPw] = useTransition();

  function savePassword() {
    setPwStatus({ type: "idle" });
    if (!pwOld) return setPwStatus({ type: "err", msg: "현재 비밀번호를 입력해주세요." });
    if (pwNew.length < 8) return setPwStatus({ type: "err", msg: "새 비밀번호는 8자 이상이어야 해요." });
    if (pwNew !== pwConfirm) return setPwStatus({ type: "err", msg: "새 비밀번호가 일치하지 않아요." });
    if (pwOld === pwNew) return setPwStatus({ type: "err", msg: "현재 비밀번호와 같습니다." });

    startPw(async () => {
      // 재인증
      const { error: signInErr } = await sb.auth.signInWithPassword({
        email: currentEmail,
        password: pwOld,
      });
      if (signInErr) {
        setPwStatus({ type: "err", msg: "현재 비밀번호가 일치하지 않아요." });
        return;
      }
      // 새 비밀번호 설정
      const { error: updateErr } = await sb.auth.updateUser({ password: pwNew });
      if (updateErr) {
        setPwStatus({ type: "err", msg: updateErr.message });
        return;
      }
      setPwOld("");
      setPwNew("");
      setPwConfirm("");
      setPwStatus({ type: "ok", msg: "비밀번호가 변경되었어요." });
    });
  }

  // ── 4. 이메일 ──
  const [emailNew, setEmailNew] = useState("");
  const [emailPwd, setEmailPwd] = useState("");
  const [emailStatus, setEmailStatus] = useState<Status>({ type: "idle" });
  const [emailPending, startEmail] = useTransition();

  function saveEmail() {
    setEmailStatus({ type: "idle" });
    const trimmed = emailNew.trim().toLowerCase();
    if (!trimmed) return setEmailStatus({ type: "err", msg: "새 이메일을 입력해주세요." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return setEmailStatus({ type: "err", msg: "올바른 이메일 형식이 아니에요." });
    }
    if (trimmed === currentEmail.toLowerCase()) {
      return setEmailStatus({ type: "err", msg: "현재 이메일과 같습니다." });
    }
    if (hasPassword && !emailPwd) {
      return setEmailStatus({ type: "err", msg: "현재 비밀번호로 재인증해주세요." });
    }

    startEmail(async () => {
      // 비밀번호 가입자는 재인증
      if (hasPassword) {
        const { error: signInErr } = await sb.auth.signInWithPassword({
          email: currentEmail,
          password: emailPwd,
        });
        if (signInErr) {
          setEmailStatus({ type: "err", msg: "현재 비밀번호가 일치하지 않아요." });
          return;
        }
      }
      const { error } = await sb.auth.updateUser({ email: trimmed });
      if (error) {
        setEmailStatus({ type: "err", msg: error.message });
        return;
      }
      setEmailNew("");
      setEmailPwd("");
      setEmailStatus({
        type: "ok",
        msg: `${trimmed} 로 인증 메일을 보냈어요. 확인하면 변경 완료됩니다.`,
      });
    });
  }

  return (
    <div className="space-y-5">
      {/* 닉네임 */}
      <Card title="닉네임 변경">
        <div className="flex gap-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            className="h-10 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={saveDisplayName}
            disabled={namePending || displayName.trim() === currentDisplayName}
            className="h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-40"
          >
            {namePending ? "저장 중…" : "저장"}
          </button>
        </div>
        <Msg status={nameStatus} />
      </Card>

      {/* 비밀번호 — OAuth 가입자는 숨김 */}
      {hasPassword && (
        <Card title="비밀번호 변경">
          <div className="space-y-2">
            <input
              type="password"
              value={pwOld}
              onChange={(e) => setPwOld(e.target.value)}
              placeholder="현재 비밀번호"
              autoComplete="current-password"
              className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              placeholder="새 비밀번호 (8자 이상)"
              autoComplete="new-password"
              className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              placeholder="새 비밀번호 확인"
              autoComplete="new-password"
              className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={savePassword}
            disabled={pwPending}
            className="mt-3 h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-40"
          >
            {pwPending ? "변경 중…" : "비밀번호 변경"}
          </button>
          <Msg status={pwStatus} />
        </Card>
      )}

      {/* 이메일 변경 */}
      <Card
        title="이메일 변경"
        subtitle={`현재: ${currentEmail}`}
      >
        <div className="space-y-2">
          <input
            type="email"
            value={emailNew}
            onChange={(e) => setEmailNew(e.target.value)}
            placeholder="새 이메일 주소"
            autoComplete="email"
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          {hasPassword && (
            <input
              type="password"
              value={emailPwd}
              onChange={(e) => setEmailPwd(e.target.value)}
              placeholder="현재 비밀번호 (재인증)"
              autoComplete="current-password"
              className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          새 주소로 인증 메일이 발송됩니다. 메일 안의 링크 클릭 시 변경 완료됩니다.
        </p>
        <button
          type="button"
          onClick={saveEmail}
          disabled={emailPending}
          className="mt-3 h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-40"
        >
          {emailPending ? "전송 중…" : "이메일 변경"}
        </button>
        <Msg status={emailStatus} />
      </Card>

      {/* 마케팅 동의 */}
      <Card title="마케팅 이메일 수신 동의">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => saveMarketing(e.target.checked)}
            disabled={mktPending}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--primary)]"
          />
          <span className="text-[var(--text-secondary)]">
            피부 미용 트렌드, 피부텐텐이 가장 먼저 전해드릴게요 ✨
            <span className="block text-xs text-[var(--text-muted)]">
              (이메일 수신, 광고성 정보 포함, 언제든지 해지 가능)
            </span>
          </span>
        </label>
        <Msg status={mktStatus} />
      </Card>
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
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-[var(--text)]">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Msg({ status }: { status: Status }) {
  if (status.type === "idle") return null;
  return (
    <p
      className={
        "mt-2 text-xs " +
        (status.type === "ok" ? "text-emerald-700" : "text-red-600")
      }
    >
      {status.msg}
    </p>
  );
}
