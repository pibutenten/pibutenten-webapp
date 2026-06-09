import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "마이페이지 — 피부텐텐 베타",
  robots: { index: false, follow: false },
};

const C = "#4cbff2";

export default async function BetaMyPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="pb-16 sm:pb-0">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-base font-bold text-[var(--text)]">마이페이지</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">로그인하면 내 정보가 표시됩니다.</p>
          <a href="/login" className="mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-white" style={{ background: C }}>로그인</a>
        </div>
      </div>
    );
  }

  const groups: { title: string; items: string[] }[] = [
    { title: "내 활동", items: ["알림", "내가 쓴 글", "저장한 글"] },
    { title: "설정", items: ["닉네임·계정", "알림 설정", "개인정보 설정"] },
  ];

  return (
    <div className="pb-16 sm:pb-0">
      <div className="mb-4 flex items-center gap-3 rounded-[var(--radius)] bg-white p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#e8f6fd", color: C }}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
        </div>
        <div><p className="font-bold text-[var(--text)]">내 계정</p><p className="text-xs text-[var(--text-secondary)]">로그인됨</p></div>
      </div>
      {groups.map((g) => (
        <div key={g.title} className="mb-3">
          <p className="mb-1.5 px-1 text-xs font-medium text-[var(--text-muted)]">{g.title}</p>
          <div className="overflow-hidden rounded-[var(--radius)] bg-white">
            {g.items.map((it, i) => (
              <div key={it} className="flex w-full items-center justify-between px-4 py-3.5 text-sm text-[var(--text)]" style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}>{it}<span className="text-[var(--text-muted)]">›</span></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
