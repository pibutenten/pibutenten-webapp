"use client";

import { useState } from "react";
import { REPORT_REASONS, type ReportReason } from "@/lib/report-reasons";

// 신고 사유는 SSOT(@/lib/report-reasons)에서 가져온다 — 폼·앱모달·관리자·API 동일 출처.
type Reason = ReportReason;
const REASON_OPTIONS = REPORT_REASONS;

export function ReportForm() {
  const [reason, setReason] = useState<Reason | "">("");
  const [targetUrl, setTargetUrl] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultId, setResultId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!reason) {
      setErr("신고 사유를 선택해 주세요.");
      return;
    }
    if (!targetUrl.trim() && !detail.trim()) {
      setErr("신고 대상 URL 또는 상세 사유 중 하나는 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          target_url: targetUrl.trim() || null,
          reporter_email: reporterEmail.trim() || null,
          detail: detail.trim() || null,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        report_id?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        setErr(json.message || json.error || "신고 접수에 실패했어요.");
        setSubmitting(false);
        return;
      }
      setResultId(json.report_id ?? null);
    } catch {
      setErr("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
      setSubmitting(false);
    }
  }

  if (resultId !== null) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-5 text-[14px] text-green-900">
        <p className="mb-2 font-semibold">신고가 접수되었습니다.</p>
        <p className="mb-1">접수 번호: #{resultId}</p>
        <p>
          24~72시간 이내 검토 개시합니다. 추가 확인이 필요한 경우 입력하신
          이메일로 연락드리겠습니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="mb-1.5 block text-[13.5px] font-semibold text-[var(--text)]">
          신고 사유 <span className="text-[var(--accent)]">*</span>
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as Reason)}
          className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-[14px]"
          required
        >
          <option value="">선택해 주세요</option>
          {REASON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
              {opt.hint ? ` — ${opt.hint}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-[13.5px] font-semibold text-[var(--text)]">
          신고 대상 URL 또는 카드 번호
        </label>
        <input
          type="text"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://pibutenten.kr/... 또는 카드 ID(예: 2288)"
          className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-[14px]"
          maxLength={500}
        />
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          URL 을 모르시면 상세 사유에 신고 대상을 설명해 주세요.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[13.5px] font-semibold text-[var(--text)]">
          상세 사유 (선택)
        </label>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="구체적인 위반 내용을 적어 주시면 검토에 도움이 됩니다. (최대 2000자)"
          className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-[14px] leading-[1.6]"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[13.5px] font-semibold text-[var(--text)]">
          답변받을 이메일 (선택)
        </label>
        <input
          type="email"
          value={reporterEmail}
          onChange={(e) => setReporterEmail(e.target.value)}
          placeholder="example@example.com"
          className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-[14px]"
          maxLength={200}
        />
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          처리 결과를 통보받고 싶으시면 입력해 주세요. 신고 처리 외 용도로
          사용하지 않습니다.
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-10 rounded-full bg-[var(--primary)] px-6 text-[14px] font-semibold text-white transition hover:bg-[var(--primary-dark)] disabled:opacity-50"
      >
        {submitting ? "접수 중…" : "신고 접수"}
      </button>
    </form>
  );
}
