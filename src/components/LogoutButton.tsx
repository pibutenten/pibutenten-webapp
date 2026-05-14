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
      window.location.assign("/");
    });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] hover:underline disabled:opacity-50"
    >
      {pending ? "로그아웃 중…" : "로그아웃"}
    </button>
  );
}
