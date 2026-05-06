"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const AVATAR_OPTIONS = [
  "/avatars/avatar-01.png",
  "/avatars/avatar-02.png",
  "/avatars/avatar-03.png",
  "/avatars/avatar-04.png",
  "/avatars/avatar-05.png",
  "/avatars/avatar-06.png",
  "/avatars/avatar-07.png",
  "/avatars/avatar-08.png",
  "/avatars/avatar-09.png",
  "/avatars/avatar-10.png",
  "/avatars/avatar-11.png",
  "/avatars/avatar-12.png",
  "/avatars/avatar-13.png",
  "/avatars/avatar-14.png",
  "/avatars/avatar-15.png",
  "/avatars/avatar-16.png",
  "/avatars/avatar-17.png",
  "/avatars/avatar-18.png",
  "/avatars/avatar-19.png",
  "/avatars/avatar-20.png",
];

type Props = {
  userId: string;
  initialName: string;
  initialAvatar: string | null;
  initialBio: string;
};

export default function PersonaSetupClient({
  userId,
  initialName,
  initialAvatar,
  initialBio,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<string | null>(initialAvatar);
  const [bio, setBio] = useState(initialBio);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function save() {
    setMsg(null);
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setMsg({ type: "err", text: "닉네임은 2~20자로 입력해주세요." });
      return;
    }
    start(async () => {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb
        .from("profiles")
        .update({
          alt_display_name: trimmed,
          alt_avatar_url: avatar,
          alt_bio: bio.trim() || null,
        })
        .eq("id", userId);
      if (error) {
        setMsg({ type: "err", text: error.message });
        return;
      }
      setMsg({ type: "ok", text: "저장되었어요." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* 닉네임 */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <h2 className="mb-2 text-sm font-bold text-[var(--text)]">
          개인 닉네임
        </h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          개인 모드에서 다른 사용자에게 보이는 이름입니다.
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="예: 힐백, 한미언니"
          className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none"
        />
      </div>

      {/* 아바타 */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <h2 className="mb-2 text-sm font-bold text-[var(--text)]">
          개인 아바타
        </h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          10개 중 마음에 드는 아바타를 선택하세요.
        </p>
        <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
          {AVATAR_OPTIONS.map((url) => {
            const selected = avatar === url;
            return (
              <button
                key={url}
                type="button"
                onClick={() => setAvatar(url)}
                className={
                  "relative aspect-square overflow-hidden rounded-full transition-all " +
                  (selected
                    ? "ring-2 ring-[var(--primary)] ring-offset-2"
                    : "ring-1 ring-[var(--border)] hover:ring-[var(--primary)]/40")
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
        {avatar && (
          <button
            type="button"
            onClick={() => setAvatar(null)}
            className="mt-3 text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            선택 해제
          </button>
        )}
      </div>

      {/* 소개 */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <h2 className="mb-2 text-sm font-bold text-[var(--text)]">
          개인 소개 (선택)
        </h2>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="개인 모드 프로필에 표시할 한 줄 소개"
          className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[13px] focus:border-[var(--primary)] focus:outline-none"
        />
        <div className="mt-1 text-right text-[11px] text-[var(--text-muted)]">
          {bio.length}/200
        </div>
      </div>

      {/* 저장 */}
      <div className="flex items-center justify-end gap-2">
        {msg && (
          <span
            className={
              "text-xs " +
              (msg.type === "ok" ? "text-emerald-700" : "text-red-600")
            }
          >
            {msg.text}
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-9 rounded-md border border-[var(--primary)] bg-transparent px-4 text-[12px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
