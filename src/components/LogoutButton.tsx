"use client";

import { useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const [pending, start] = useTransition();
  function onClick() {
    if (pending) return;
    start(async () => {
      const sb = createSupabaseBrowserClient();
      await sb.auth.signOut();
      window.location.assign("/feed");
    });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-red-300 hover:text-red-600 disabled:opacity-50"
    >
      {pending ? "로그아웃 중…" : "로그아웃"}
    </button>
  );
}
