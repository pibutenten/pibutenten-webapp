"use client";

/**
 * /admin/reports — 클라이언트 부분 (액션 버튼 + state).
 *
 * 액션: hide / delete / dismiss → PATCH /api/admin/reports/[id].
 * 단순 라우터 refresh 로 다음 렌더 시 갱신된 status 반영.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminReportRowEnriched } from "./page";

type Props = {
  rows: AdminReportRowEnriched[];
  reasonLabel: Record<string, string>;
  statusLabel: Record<string, string>;
};

export default function ReportsClient({ rows, reasonLabel, statusLabel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function callAction(
    reportId: number,
    action: "hide" | "delete" | "dismiss",
  ) {
    setErrorMsg(null);
    setBusyId(reportId);
    try {
      let note: string | undefined;
      if (action === "delete") {
        const confirmed = confirm(
          "완전삭제는 soft-delete + 익명화 (복구 불가). 카드만 가능. 계속할까요?",
        );
        if (!confirmed) return;
      }
      if (action !== "dismiss") {
        const input = prompt(
          `메모(선택) — ${action === "hide" ? "숨김 사유" : "삭제 사유"}`,
          "",
        );
        note = input?.trim() ? input.trim() : undefined;
      }
      const r = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as
          | { message?: string }
          | null;
        setErrorMsg(j?.message ?? `처리 실패 (HTTP ${r.status})`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="mt-6 rounded-md border border-[var(--border)] bg-white p-4 text-sm text-[var(--text-muted)]">
        신고가 없습니다.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {errorMsg && (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-[13px] text-red-700">
          {errorMsg}
        </div>
      )}
      {rows.map((r) => {
        const isPending = r.status === "pending";
        const isBusy = busyId === r.id || pending;
        return (
          <div
            key={r.id}
            className="rounded-md border border-[var(--border)] bg-white p-3 text-[13px]"
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px]">
                #{r.id}
              </span>
              <span className="font-semibold text-[var(--text)]">
                {reasonLabel[r.reason] ?? r.reason}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {new Date(r.created_at).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </span>
              <span
                className={
                  "ml-auto rounded px-1.5 py-0.5 text-[11px] " +
                  (isPending
                    ? "bg-orange-100 text-orange-800"
                    : "bg-gray-100 text-gray-700")
                }
              >
                {statusLabel[r.status] ?? r.status}
              </span>
            </div>

            <div className="mb-1 text-[12px] text-[var(--text-muted)]">
              신고자:{" "}
              {r.reporter_profile_id ? (
                <code className="rounded bg-[var(--bg-soft)] px-1">
                  {r.reporter_profile_id.slice(0, 8)}…
                </code>
              ) : (
                "비로그인"
              )}
              {r.reporter_email && (
                <>
                  {" · "}
                  <span>{r.reporter_email}</span>
                </>
              )}
              {r.target_url && (
                <>
                  {" · "}
                  <a
                    href={r.target_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--primary)] hover:underline"
                  >
                    {r.target_url.slice(0, 50)}
                  </a>
                </>
              )}
            </div>

            {/* 대상 미리보기 */}
            {r.cardPreview && (
              <div className="mt-1 rounded border border-[var(--border)] bg-white p-2 text-[12px]">
                <span className="text-[11px] text-[var(--text-muted)]">카드 #{r.cardPreview.id}</span>
                <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-700">
                  {r.cardPreview.status}
                </span>
                {r.cardPreview.deleted_at && (
                  <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">
                    삭제됨
                  </span>
                )}
                <div className="mt-0.5 truncate">
                  {r.cardPreview.title ?? "(제목 없음)"}
                </div>
              </div>
            )}
            {r.commentPreview && (
              <div className="mt-1 rounded border border-[var(--border)] bg-white p-2 text-[12px]">
                <span className="text-[11px] text-[var(--text-muted)]">댓글 #{r.commentPreview.id}</span>
                <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-700">
                  {r.commentPreview.status}
                </span>
                <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap">
                  {r.commentPreview.body}
                </div>
              </div>
            )}
            {r.detail && (
              <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                <span className="font-semibold">사유 상세:</span> {r.detail}
              </div>
            )}
            {r.resolution_note && (
              <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                <span className="font-semibold">처리 메모:</span> {r.resolution_note}
              </div>
            )}

            {/* 액션 — pending 일 때만 노출 */}
            {isPending && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => callAction(r.id, "hide")}
                  className="rounded-md bg-orange-500 px-3 py-1 text-[12px] font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  숨김 (영구·복구가능)
                </button>
                {r.card_id && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => callAction(r.id, "delete")}
                    className="rounded-md bg-red-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    완전삭제 (익명화)
                  </button>
                )}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => callAction(r.id, "dismiss")}
                  className="rounded-md bg-gray-100 px-3 py-1 text-[12px] text-[var(--text)] hover:bg-gray-200 disabled:opacity-50"
                >
                  기각
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
