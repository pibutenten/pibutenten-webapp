"use client";

import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  qaId: number;
  initial: boolean;
};

/**
 * 목록에서 별 클릭으로 Pick on/off.
 * 권한은 RLS + RPC SECURITY DEFINER에서 처리 (관리자/원장 본인).
 */
export default function PickToggle({ qaId, initial }: Props) {
  const [pick, setPick] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const next = !pick;
      const { error } = await supabase.rpc("toggle_card_pick", {
        p_card_id: qaId,
        p_pick: next,
      });
      if (error) {
        alert(`Pick 변경 실패: ${error.message}`);
        return;
      }
      setPick(next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={pick ? "Pick 해제" : "Pick으로 표시"}
      aria-label={pick ? "Pick 해제" : "Pick으로 표시"}
      className={
        "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-base transition-colors disabled:cursor-wait " +
        (pick
          ? "text-amber-500 hover:bg-amber-50"
          : "text-[var(--text-muted)] hover:text-amber-500 hover:bg-amber-50")
      }
    >
      {pick ? "⭐" : "☆"}
    </button>
  );
}
