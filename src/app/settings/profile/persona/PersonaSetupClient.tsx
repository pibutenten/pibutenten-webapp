"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  initialName: string;
  /** 기존에 사용자가 페르소나용으로 저장해둔 사진 (없으면 null) */
  initialAvatar: string | null;
  /** SNS 간편로그인에서 가져온 프로필 이미지 — 디폴트 fallback */
  oauthAvatar: string | null;
  initialBio: string;
};

/**
 * 사진을 256×256 정사각형으로 다운스케일 (jpeg).
 * onboarding 흐름과 동일한 압축 정책 — 페르소나 사진도 동일 규격으로 통일.
 */
async function resizeImage(file: File): Promise<Blob> {
  const SIZE = 256;
  const Q = 0.82;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("이미지 로드 실패"));
      el.src = url;
    });
    const minSide = Math.min(img.width, img.height);
    const sx = (img.width - minSide) / 2;
    const sy = (img.height - minSide) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context 생성 실패");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, SIZE, SIZE);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("blob 생성 실패"))),
        "image/jpeg",
        Q,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PersonaSetupClient({
  userId,
  initialName,
  initialAvatar,
  oauthAvatar,
  initialBio,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  // 디폴트 우선순위: 사용자가 이전에 저장한 페르소나 아바타 → OAuth 프로필 → null
  const [avatar, setAvatar] = useState<string | null>(
    initialAvatar ?? oauthAvatar ?? null,
  );
  const [bio, setBio] = useState(initialBio);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileUpload(f: File) {
    if (!f.type.startsWith("image/")) {
      setMsg({ type: "err", text: "이미지 파일만 업로드 가능해요." });
      return;
    }
    setMsg(null);
    setUploading(true);
    try {
      const blob = await resizeImage(f);
      const sb = createSupabaseBrowserClient();
      const path = `${userId}/persona-${Date.now()}.jpg`;
      const { error: upErr } = await sb.storage
        .from("avatars")
        .upload(path, blob, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        });
      if (upErr) {
        setMsg({ type: "err", text: `업로드 실패: ${upErr.message}` });
        return;
      }
      const { data } = sb.storage.from("avatars").getPublicUrl(path);
      // 캐시 우회용 v= 쿼리 (재업로드 시 즉시 반영)
      setAvatar(`${data.publicUrl}?v=${Date.now()}`);
    } catch (e) {
      setMsg({
        type: "err",
        text: e instanceof Error ? e.message : "업로드 실패",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function save() {
    setMsg(null);
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setMsg({ type: "err", text: "닉네임은 2~20자로 입력해주세요." });
      return;
    }
    start(async () => {
      const sb = createSupabaseBrowserClient();
      // ?v= 캐시버스터는 DB에 저장하지 않음 (깔끔하게)
      const cleanAvatar = avatar ? avatar.split("?")[0] || avatar : null;
      const { error } = await sb
        .from("profiles")
        .update({
          alt_display_name: trimmed,
          alt_avatar_url: cleanAvatar,
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

      {/* 아바타 — SNS 프로필 디폴트 + 직접 업로드 */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <h2 className="mb-2 text-sm font-bold text-[var(--text)]">
          개인 아바타
        </h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          기본은 가입 시 사용한 SNS 프로필 사진이에요. 바꾸고 싶으면 직접
          업로드하거나 사진을 찍으세요. (자동으로 256×256으로 줄여서 저장)
        </p>
        <div className="flex items-center gap-4">
          {/* 미리보기 — 큰 원형 */}
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-soft)]">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt="페르소나 아바타 미리보기"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--text-muted)]">
                👤
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
              >
                {uploading ? "업로드 중…" : "사진 업로드"}
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
              >
                사진 찍기
              </button>
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar(null)}
                  className="rounded-md px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-red-600"
                >
                  선택 해제
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
              }}
            />
          </div>
        </div>
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
