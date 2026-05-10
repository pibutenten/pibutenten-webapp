"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  FACE_SHAPES,
  SKIN_TYPES,
  SKIN_CONCERNS,
  PROCEDURES,
  type FieldVisibility,
} from "@/lib/profile-options";

type Initial = {
  displayName: string;
  marketingConsent: boolean;
  birthdate: string;
  gender: "male" | "female" | "other" | null;
  faceShape: string | null;
  skinType: string | null;
  skinConcerns: string[];
  interestedProcedures: string[];
  likedProcedures: string[];
  bio: string;
  avatarUrl: string | null;
  fieldVisibility: FieldVisibility;
};

type Props = {
  userId: string;
  currentEmail: string;
  /** 로그인 방식 표시용 — 'email' | 'google' | 'kakao' 등 */
  loginProviders: string[];
  initial: Initial;
};

type Status =
  | { type: "idle" }
  | { type: "ok"; msg: string }
  | { type: "err"; msg: string };

const SELECTED = "#9CA3AF"; // 더 연한 회색
const CHECK_ACCENT = "#9CA3AF";

/** 클라이언트 리사이징 — 256x256 center-crop, JPEG 0.82 */
async function resizeImage(file: File): Promise<Blob> {
  const SIZE = 256;
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
    if (!ctx) throw new Error("canvas 컨텍스트 실패");
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, SIZE, SIZE);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("blob 변환 실패"))),
        "image/jpeg",
        0.82,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PROVIDER_LABEL: Record<string, string> = {
  email: "이메일",
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
};

export default function ProfileEditClient({
  userId,
  currentEmail,
  loginProviders,
  initial,
}: Props) {
  const router = useRouter();
  const sb = createSupabaseBrowserClient();

  // ── 프로필 사진 ──
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  async function uploadAvatar(file: File) {
    setUploading(true);
    try {
      const blob = await resizeImage(file);
      const path = `${userId}/${Date.now()}.jpg`;
      const { error: upErr } = await sb.storage
        .from("avatars")
        .upload(path, blob, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (upErr) {
        alert("업로드 실패: " + upErr.message);
        return;
      }
      const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
      const newUrl = pub.publicUrl;
      const { error: dbErr } = await sb
        .from("profiles")
        .update({ avatar_url: newUrl })
        .eq("id", userId);
      if (dbErr) {
        alert("DB 저장 실패: " + dbErr.message);
        return;
      }
      setAvatarUrl(newUrl);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  // ── 닉네임 ──
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [nameStatus, setNameStatus] = useState<Status>({ type: "idle" });
  const [namePending, startName] = useTransition();
  function saveDisplayName() {
    setNameStatus({ type: "idle" });
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameStatus({ type: "err", msg: "닉네임을 입력해주세요." });
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      setNameStatus({ type: "err", msg: "닉네임은 2~20자로 입력해주세요." });
      return;
    }
    startName(async () => {
      const { error } = await sb
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", userId);
      if (error) {
        setNameStatus({ type: "err", msg: error.message });
        return;
      }
      setNameStatus({ type: "ok", msg: "닉네임이 변경되었어요." });
      router.refresh();
    });
  }

  // ── 피부 정보 ──
  const [faceShape, setFaceShape] = useState<string | null>(initial.faceShape);
  const [skinType, setSkinType] = useState<string | null>(initial.skinType);
  const [skinConcerns, setSkinConcerns] = useState<string[]>(
    initial.skinConcerns,
  );
  const [interestedProcedures, setInterestedProcedures] = useState<string[]>(
    initial.interestedProcedures,
  );
  const [likedProcedures, setLikedProcedures] = useState<string[]>(
    initial.likedProcedures,
  );
  const [likedInput, setLikedInput] = useState("");
  const [bio, setBio] = useState(initial.bio);
  const [visibility, setVisibility] = useState<FieldVisibility>(
    initial.fieldVisibility,
  );
  const [skinStatus, setSkinStatus] = useState<Status>({ type: "idle" });
  const [skinPending, startSkin] = useTransition();

  function toggleArr(arr: string[], k: string): string[] {
    return arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k];
  }
  function addLikedProcedure() {
    const v = likedInput.trim();
    if (!v) return;
    if (likedProcedures.includes(v)) {
      setLikedInput("");
      return;
    }
    if (likedProcedures.length >= 10) {
      setSkinStatus({
        type: "err",
        msg: "좋아하는 시술은 최대 10개까지 추가할 수 있어요.",
      });
      return;
    }
    setLikedProcedures([...likedProcedures, v]);
    setLikedInput("");
  }
  function saveSkinInfo() {
    setSkinStatus({ type: "idle" });
    startSkin(async () => {
      const { error } = await sb
        .from("profiles")
        .update({
          face_shape: faceShape,
          skin_type: skinType,
          skin_concerns: skinConcerns,
          interested_procedures: interestedProcedures,
          liked_procedures: likedProcedures,
          bio: bio.trim() || null,
          field_visibility: visibility,
        })
        .eq("id", userId);
      if (error) {
        setSkinStatus({ type: "err", msg: error.message });
        return;
      }
      setSkinStatus({ type: "ok", msg: "정보가 저장되었어요." });
      router.refresh();
    });
  }

  // ── 마케팅 동의 ──
  const [marketing, setMarketing] = useState(initial.marketingConsent);
  const [mktPending, startMkt] = useTransition();
  function saveMarketing(next: boolean) {
    setMarketing(next);
    startMkt(async () => {
      const { error } = await sb
        .from("profiles")
        .update({ marketing_email_consent: next })
        .eq("id", userId);
      if (error) setMarketing(!next);
      router.refresh();
    });
  }

  // ── 로그아웃 / 탈퇴 ──
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  async function performDelete() {
    setDeletePending(true);
    try {
      const r = await fetch("/api/me/delete", { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "탈퇴 실패");
        return;
      }
      window.location.assign("/");
    } finally {
      setDeletePending(false);
      setDeleteOpen(false);
    }
  }
  const [logoutPending, setLogoutPending] = useState(false);
  async function performLogout() {
    setLogoutPending(true);
    try {
      await sb.auth.signOut();
      window.location.assign("/");
    } finally {
      setLogoutPending(false);
    }
  }

  // 표시용 — 생년월일은 'XX대'로만, 성별과 결합 ('40대 여성')
  const ageBucket = (() => {
    if (!initial.birthdate) return null;
    const y = parseInt(initial.birthdate.split("-")[0] ?? "", 10);
    if (!Number.isFinite(y)) return null;
    const age = new Date().getFullYear() - y;
    if (age < 10) return "10대 미만";
    return `${Math.floor(age / 10) * 10}대`;
  })();
  const genderDisplay =
    initial.gender === "female"
      ? "여성"
      : initial.gender === "male"
        ? "남성"
        : null;
  const ageGenderLabel =
    [ageBucket, genderDisplay].filter(Boolean).join(" ") || "—";
  const providerLabel =
    loginProviders
      .map((p) => PROVIDER_LABEL[p] ?? p)
      .filter(Boolean)
      .join(" · ") || "—";

  return (
    <div className="space-y-5">
      {/* 1. 프로필 사진 — 큰 원, 사진 변경 / 사진 찍기 */}
      <Card title="프로필 사진">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="relative h-32 w-32 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-soft)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 sm:h-36 sm:w-36"
            aria-label="프로필 사진 변경"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl text-[var(--text-muted)]">
                👤
              </div>
            )}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
            >
              {uploading ? "업로드 중…" : "사진 변경"}
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={uploading}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
            >
              📷 사진 찍기
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
              if (cameraRef.current) cameraRef.current.value = "";
            }}
          />
        </div>
      </Card>

      {/* 2. 닉네임 */}
      <Card title="닉네임">
        <div className="flex items-stretch gap-1.5">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={saveDisplayName}
            disabled={
              namePending || displayName.trim() === initial.displayName
            }
            className={btnPrimaryClass}
          >
            {namePending ? "저장 중…" : "저장"}
          </button>
        </div>
        <Msg status={nameStatus} />
      </Card>

      {/* 3. 자기소개 (닉네임 바로 밑) */}
      <SectionWithVisibility
        title="본인을 소개해주세요!"
        visField="bio"
        visibility={visibility}
        setVisibility={setVisibility}
      >
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={200}
          className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[14px] focus:border-[var(--primary)] focus:outline-none"
        />
        <p className="mt-1 text-right text-[11px] text-[var(--text-muted)]">
          {bio.length} / 200
        </p>
      </SectionWithVisibility>

      {/* 4. 기본 정보 (읽기 전용 — 공개/비공개 toggle 없음) */}
      <Card title="기본 정보" subtitle="가입 시 입력 — 변경 불가">
        <dl className="space-y-1.5 text-[13px]">
          <Row label="이메일" value={currentEmail} />
          <Row label="간편로그인" value={providerLabel} />
          <Row label="나이·성별" value={ageGenderLabel} />
        </dl>
      </Card>

      {/* 5. 얼굴형 */}
      <SectionWithVisibility
        title="얼굴형"
        visField="face_shape"
        visibility={visibility}
        setVisibility={setVisibility}
      >
        <div className="flex flex-wrap gap-1.5">
          {FACE_SHAPES.map((f) => (
            <Chip
              key={f.key}
              active={faceShape === f.key}
              onClick={() => setFaceShape(faceShape === f.key ? null : f.key)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </SectionWithVisibility>

      {/* 6. 피부타입 */}
      <SectionWithVisibility
        title="피부타입"
        visField="skin_type"
        visibility={visibility}
        setVisibility={setVisibility}
      >
        <div className="flex flex-wrap gap-1.5">
          {SKIN_TYPES.map((s) => (
            <Chip
              key={s.key}
              active={skinType === s.key}
              onClick={() => setSkinType(skinType === s.key ? null : s.key)}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </SectionWithVisibility>

      {/* 7. 피부고민 */}
      <SectionWithVisibility
        title="피부고민"
        visField="skin_concerns"
        visibility={visibility}
        setVisibility={setVisibility}
        subtitle="복수 선택 가능"
      >
        <div className="flex flex-wrap gap-1.5">
          {SKIN_CONCERNS.map((c) => (
            <Chip
              key={c.key}
              active={skinConcerns.includes(c.key)}
              onClick={() => setSkinConcerns(toggleArr(skinConcerns, c.key))}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </SectionWithVisibility>

      {/* 8. 관심시술 */}
      <SectionWithVisibility
        title="관심시술"
        visField="interested_procedures"
        visibility={visibility}
        setVisibility={setVisibility}
        subtitle="복수 선택 가능"
      >
        <div className="flex flex-wrap gap-1.5">
          {PROCEDURES.map((p) => (
            <Chip
              key={p.key}
              active={interestedProcedures.includes(p.key)}
              onClick={() =>
                setInterestedProcedures(toggleArr(interestedProcedures, p.key))
              }
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </SectionWithVisibility>

      {/* 9. 본인이 좋아하는 시술 (자유 입력) */}
      <SectionWithVisibility
        title="본인이 좋아하는 시술이 있다면?"
        visField="liked_procedures"
        visibility={visibility}
        setVisibility={setVisibility}
        subtitle="자유 입력 — Enter로 추가"
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          {likedProcedures.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() =>
                setLikedProcedures(likedProcedures.filter((x) => x !== k))
              }
              className="inline-flex items-center gap-1 rounded-full border border-[#D1D5DB] bg-[#F9FAFB] px-2.5 py-0.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[#F3F4F6]"
            >
              {k} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={likedInput}
            onChange={(e) => setLikedInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLikedProcedure();
              }
            }}
            placeholder="예: 보톡스, 필러, 울쎄라, 써마지, 티타늄, 리쥬란 등"
            className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={addLikedProcedure}
            className="h-9 rounded-md border border-[var(--border)] px-3 text-[12px] hover:bg-[var(--bg-soft)]"
          >
            추가
          </button>
        </div>
      </SectionWithVisibility>

      {/* 일괄 저장 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={saveSkinInfo}
          disabled={skinPending}
          className={btnPrimaryClass + " px-6"}
        >
          {skinPending ? "저장 중…" : "정보 저장"}
        </button>
      </div>
      <Msg status={skinStatus} />

      {/* 마케팅 동의 — 맨 밑 */}
      <Card title="마케팅 이메일 수신 동의">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => saveMarketing(e.target.checked)}
            disabled={mktPending}
            style={{ accentColor: CHECK_ACCENT }}
            className="h-4 w-4"
          />
          <span className="text-[var(--text-secondary)]">
            새 글·이벤트 등의 안내를 이메일로 받을게요
          </span>
        </label>
      </Card>

      {/* 로그아웃·탈퇴 footer */}
      <div className="mt-10 border-t border-[var(--border)] pt-6">
        <div className="flex items-center justify-end gap-3 text-[12px] text-[var(--text-muted)]">
          <button
            type="button"
            onClick={performLogout}
            disabled={logoutPending}
            className="hover:text-[var(--text-secondary)] hover:underline disabled:opacity-50"
          >
            {logoutPending ? "로그아웃 중…" : "로그아웃"}
          </button>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="hover:text-red-700 hover:underline"
          >
            회원 탈퇴
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="정말 탈퇴할까요?"
        description={
          "회원 탈퇴 시 계정이 영구 삭제되며, 작성한 글·댓글·좋아요·저장 등 모든 활동 기록이 함께 사라집니다.\n\n이 작업은 되돌릴 수 없어요."
        }
        confirmLabel={deletePending ? "탈퇴 처리 중…" : "탈퇴"}
        cancelLabel="취소"
        onConfirm={performDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 작은 컴포넌트
// ──────────────────────────────────────────────────────────

const btnPrimaryClass =
  "h-9 shrink-0 whitespace-nowrap rounded-md border border-[var(--primary)] bg-transparent px-3 text-[12px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:text-[var(--text-muted)] disabled:hover:bg-transparent";

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <h3 className="mb-1.5 text-sm font-bold text-[var(--text)]">{title}</h3>
      {subtitle && (
        <p className="mb-2 text-[11.5px] text-[var(--text-muted)]">
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-[13px]">
      <dt className="shrink-0 text-[var(--text-muted)]">{label}</dt>
      <dd className="truncate text-right text-[var(--text)]">{value}</dd>
    </div>
  );
}

function SectionWithVisibility({
  title,
  subtitle,
  visField,
  visibility,
  setVisibility,
  children,
}: {
  title: string;
  subtitle?: string;
  visField: keyof FieldVisibility;
  visibility: FieldVisibility;
  setVisibility: (v: FieldVisibility) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text)]">
          {title}
          {subtitle && (
            <span className="ml-1.5 text-[11px] font-normal text-[var(--text-muted)]">
              {subtitle}
            </span>
          )}
        </h3>
        <label className="flex shrink-0 items-center gap-1 text-[11.5px] text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={visibility[visField]}
            onChange={(e) =>
              setVisibility({ ...visibility, [visField]: e.target.checked })
            }
            style={{ accentColor: CHECK_ACCENT }}
            className="h-3.5 w-3.5"
          />
          공개
        </label>
      </div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        active ? { backgroundColor: SELECTED, color: "#fff" } : undefined
      }
      className={
        "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors " +
        (active
          ? ""
          : "bg-[#F3F4F6] text-[var(--text-secondary)] hover:bg-[#E5E7EB] hover:text-[var(--text)]")
      }
    >
      {children}
    </button>
  );
}

function Msg({ status }: { status: Status }) {
  if (status.type === "idle") return null;
  return (
    <p
      className={
        "mt-1.5 text-[11.5px] " +
        (status.type === "ok" ? "text-emerald-600" : "text-red-600")
      }
    >
      {status.msg}
    </p>
  );
}
