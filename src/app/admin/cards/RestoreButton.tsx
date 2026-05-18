"use client";

/**
 * RestoreButton — 삭제(soft) 된 카드를 복구.
 *
 * 0132 (260518) soft-delete 도입과 함께. admin 만 사용 (admin/cards?status=deleted 페이지).
 * 클릭 → `cards.deleted_at = NULL` UPDATE → RLS 가 다시 모든 화면에서 카드 노출.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { showToast } from "@/lib/toast";

type Props = {
  cardId: number;
};

export default function RestoreButton({ cardId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function onClick() {
    startTransition(async () => {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb
        .from("cards")
        .update({ deleted_at: null })
        .eq("id", cardId);
      if (error) {
        showToast("복구 실패: " + error.message, { tone: "danger" });
        return;
      }
      setDone(true);
      showToast("카드가 복구되었습니다.");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || done}
      className="inline-flex h-7 items-center rounded-md border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
      title="이 카드를 복구합니다 (deleted_at 을 비웁니다)"
    >
      {done ? "복구됨" : pending ? "복구 중…" : "복구"}
    </button>
  );
}
