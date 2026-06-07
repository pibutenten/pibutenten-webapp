"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";

type SyncResponse = {
  ok?: boolean;
  fetched?: number;
  upserted?: number;
  pages?: number;
  mode?: string;
  message?: string;
};

/**
 * "병원 정보 가져오기" 버튼 — POST /api/admin/clinics/sync.
 * 로딩 중 비활성화 + 결과 토스트. 성공 시 router.refresh() 로 상단 통계 갱신.
 */
export default function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function handleSync() {
    if (loading) return;
    setLoading(true);
    setLastResult(null);
    try {
      const r = await fetch("/api/admin/clinics/sync", { method: "POST" });
      const j = (await r.json().catch(() => null)) as SyncResponse | null;
      if (!r.ok || !j?.ok) {
        showToast(j?.message ?? `동기화 실패 (HTTP ${r.status})`, { tone: "danger" });
        setLastResult(j?.message ?? `동기화 실패 (HTTP ${r.status})`);
        return;
      }
      const summary = `받음 ${j.fetched ?? 0}곳 · 저장 ${j.upserted ?? 0}곳 (${j.pages ?? 0}페이지)`;
      showToast(`동기화 완료 — ${summary}`, { durationMs: 2500 });
      setLastResult(`${summary}${j.mode ? ` · ${j.mode}` : ""}`);
      // 상단 통계(총 병원 수·최근 동기화 시각) 갱신.
      startTransition(() => router.refresh());
    } catch {
      showToast("네트워크 오류로 동기화에 실패했어요.", { tone: "danger" });
      setLastResult("네트워크 오류로 동기화에 실패했어요.");
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || isPending;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={busy}
        className={
          "inline-flex h-10 items-center justify-center gap-2 self-start rounded-[var(--radius-sm)] px-5 text-sm font-semibold text-white transition-colors " +
          (busy
            ? "cursor-not-allowed bg-[var(--text-muted)]"
            : "bg-[var(--primary)] hover:bg-[var(--primary-dark)]")
        }
      >
        {busy ? (
          <>
            <span
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden
            />
            가져오는 중…
          </>
        ) : (
          "병원 정보 가져오기"
        )}
      </button>
      <p className="text-xs text-[var(--text-muted)]">
        심평원 병원정보서비스에서 피부과 의원을 받아 갱신합니다. 수천 건 처리로 수십 초 걸릴 수 있습니다.
      </p>
      {lastResult && (
        <p className="text-xs text-[var(--text-secondary)]">최근 결과: {lastResult}</p>
      )}
    </div>
  );
}
