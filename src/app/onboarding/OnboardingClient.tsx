"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────
// 옵션 정의 — 한글 라벨은 UI 전용, DB에는 영문 key 저장
// ─────────────────────────────────────────────────────────────

// 파스텔 톤 배경색 10개 — 옅고 부드러운 톤
const BG_COLORS = [
  "#FFF1F3", // 코랄
  "#ECEFF5", // 스카이블루
  "#E6F5EC", // 민트
  "#FFF1E6", // 살구
  "#EFEAF6", // 라벤더
  "#FFFAE2", // 레몬
  "#FFE9EC", // 핑크
  "#E0EBEB", // 청록
  "#F9EFE2", // 베이지
  "#EBE7E0", // 차분 베이지
];
const DEFAULT_BG = "#FFF1F3";

const DEFAULT_AVATARS = [
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
const GENDERS: { key: "male" | "female" | "other"; label: string }[] = [
  { key: "female", label: "여성" },
  { key: "male", label: "남성" },
];

const FACE_SHAPES: { key: string; label: string }[] = [
  { key: "oval", label: "달걀형" },
  { key: "peanut", label: "땅콩형" },
  { key: "oblong", label: "장방형" },
  { key: "square", label: "각진형" },
  { key: "round", label: "둥근형" },
];

const SKIN_TYPES: { key: string; label: string }[] = [
  { key: "extreme_dry", label: "극건성" },
  { key: "dry", label: "건성" },
  { key: "normal", label: "중성" },
  { key: "combination", label: "복합성" },
  { key: "dehydrated_oily", label: "수부지" },
  { key: "oily", label: "지성" },
  { key: "extreme_oily", label: "극지성" },
];

const SKIN_CONCERNS: { key: string; label: string }[] = [
  { key: "elasticity", label: "탄력" },
  { key: "volume", label: "볼륨" },
  { key: "wrinkle", label: "주름" },
  { key: "tone", label: "피부톤" },
  { key: "pores", label: "모공" },
  { key: "contour", label: "윤곽" },
  { key: "texture", label: "피부결" },
  { key: "aging", label: "노안" },
  { key: "trouble", label: "트러블" },
  { key: "sensitive", label: "민감성" },
];

const PROCEDURES: { key: string; label: string }[] = [
  { key: "lifting", label: "리프팅" },
  { key: "laser", label: "피부레이저" },
  { key: "booster", label: "스킨부스터" },
  { key: "botox", label: "보톡스" },
  { key: "filler", label: "필러" },
  { key: "cosmetic", label: "화장품" },
];

type Initial = {
  birthdate: string;
  gender: "male" | "female" | "other" | null;
  faceShape: string | null;
  skinType: string | null;
  skinConcerns: string[];
  interestedProcedures: string[];
  bio: string;
  avatarUrl: string | null;
  avatarBgColor: string | null;
};

type Props = {
  userId: string;
  initial: Initial;
};

// 클라이언트 리사이징 — 256x256 center-crop, JPEG quality 0.82 → 보통 30~80KB
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
    // 부드러운 다운스케일
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

// 생년월일 select용 옵션 — 1920부터 현재년까지 역순(최근 우선)
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 1920 + 1 },
  (_, i) => CURRENT_YEAR - i,
);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

function parseBirthdate(s: string): {
  year: string;
  month: string;
  day: string;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return { year: "", month: "", day: "" };
  return {
    year: m[1],
    month: String(parseInt(m[2], 10)),
    day: String(parseInt(m[3], 10)),
  };
}

export default function OnboardingClient({ userId, initial }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const initialDate = parseBirthdate(initial.birthdate);
  const [birthYear, setBirthYear] = useState(initialDate.year);
  const [birthMonth, setBirthMonth] = useState(initialDate.month);
  const [birthDay, setBirthDay] = useState(initialDate.day);
  // birthdate 합성 (YYYY-MM-DD) — DB 저장 시 사용
  const birthdate =
    birthYear && birthMonth && birthDay
      ? `${birthYear}-${birthMonth.padStart(2, "0")}-${birthDay.padStart(2, "0")}`
      : "";

  const [gender, setGender] = useState<Initial["gender"]>(initial.gender);
  const [faceShape, setFaceShape] = useState<string | null>(initial.faceShape);
  const [skinType, setSkinType] = useState<string | null>(initial.skinType);
  const [skinConcerns, setSkinConcerns] = useState<string[]>(
    initial.skinConcerns,
  );
  const [procedures, setProcedures] = useState<string[]>(
    initial.interestedProcedures,
  );
  const [bio, setBio] = useState(initial.bio);

  // 아바타 — 기본 20개 중 선택 또는 직접 업로드
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [avatarBgColor, setAvatarBgColor] = useState<string>(
    initial.avatarBgColor ?? DEFAULT_BG,
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  function toggle(arr: string[], v: string): string[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  async function handleFileUpload(f: File) {
    if (!f.type.startsWith("image/")) {
      setErr("이미지 파일만 업로드 가능해요.");
      return;
    }
    setErr(null);
    setUploading(true);
    try {
      const blob = await resizeImage(f);
      const sb = createSupabaseBrowserClient();
      const path = `${userId}/${Date.now()}.jpg`;
      const { error: upErr } = await sb.storage
        .from("avatars")
        .upload(path, blob, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        });
      if (upErr) {
        setErr(`업로드 실패: ${upErr.message}`);
        return;
      }
      const { data } = sb.storage.from("avatars").getPublicUrl(path);
      // 캐시 우회용 v= 쿼리 (재업로드 시 즉시 반영)
      setAvatarUrl(`${data.publicUrl}?v=${Date.now()}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function save() {
    setErr(null);

    // 필수값 검증
    if (!birthdate) {
      setErr("생년월일을 입력해주세요.");
      return;
    }
    const t = new Date(birthdate).getTime();
    if (!Number.isFinite(t) || t > Date.now()) {
      setErr("올바른 생년월일을 입력해주세요.");
      return;
    }
    if (!gender) {
      setErr("성별을 선택해주세요.");
      return;
    }
    if (!faceShape) {
      setErr("얼굴형을 선택해주세요.");
      return;
    }
    if (!skinType) {
      setErr("피부타입을 선택해주세요.");
      return;
    }

    start(async () => {
      const sb = createSupabaseBrowserClient();
      // avatar_url에는 ?v= 캐시버스터 떼고 저장 (DB는 깨끗하게)
      const cleanAvatar = avatarUrl
        ? avatarUrl.split("?")[0] || avatarUrl
        : null;
      const { error } = await sb
        .from("profiles")
        .update({
          birthdate,
          gender,
          face_shape: faceShape,
          skin_type: skinType,
          skin_concerns: skinConcerns,
          interested_procedures: procedures,
          bio: bio.trim() || null,
          avatar_url: cleanAvatar,
          // 누끼 PNG일 때만 배경색 저장 (직접 업로드한 사진은 색 무관)
          avatar_bg_color:
            cleanAvatar && cleanAvatar.startsWith("/avatars/")
              ? avatarBgColor
              : null,
        })
        .eq("id", userId);
      if (error) {
        setErr(`저장 실패: ${error.message}`);
        return;
      }
      // middleware의 온보딩 가드 캐시 — 즉시 통과시키기 위해 클라이언트에서 set
      try {
        document.cookie = `pibutenten_onboarded=${userId}; Path=/; Max-Age=${60 * 60 * 12}; SameSite=Lax`;
      } catch {
        /* ignore — 인앱 sandbox */
      }
      router.push("/me");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 0. 프로필 사진 */}
      <Section title="프로필 사진" hint="기본 아바타 중 선택하거나 직접 업로드">
        <div className="flex items-start gap-4">
          {/* 미리보기 — 누끼 PNG 위에 배경색 합성 */}
          <div
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[var(--border)]"
            style={{
              backgroundColor:
                avatarUrl && avatarUrl.startsWith("/avatars/")
                  ? avatarBgColor
                  : "var(--bg-soft)",
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="프로필 미리보기"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--text-muted)]">
                👤
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {/* 업로드 / 사진 찍기 버튼 */}
            <div className="mb-3 flex flex-wrap gap-2">
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
                📷 사진 찍기
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl(null)}
                  className="rounded-md px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-red-600"
                >
                  선택 해제
                </button>
              )}
              <span className="ml-1 self-center text-[11px] text-[var(--text-muted)]">
                또는 기본 아바타에서 고르기
              </span>
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

            {/* 기본 아바타 그리드 */}
            <div className="mt-1.5 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {DEFAULT_AVATARS.map((url) => {
                const selected = avatarUrl === url;
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setAvatarUrl(url)}
                    className={
                      "relative aspect-square overflow-hidden rounded-full transition-all " +
                      (selected
                        ? "ring-2 ring-[var(--primary)] ring-offset-2"
                        : "ring-1 ring-[var(--border)] hover:ring-[var(--primary)]/40")
                    }
                    style={{ backgroundColor: avatarBgColor }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                );
              })}
            </div>

            {/* 배경색 선택 — 기본 아바타용 (직접 업로드 사진일 때만 숨김) */}
            {(!avatarUrl || avatarUrl.startsWith("/avatars/")) && (
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] text-[var(--text-muted)]">
                  배경색 고르기
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BG_COLORS.map((color) => {
                    const sel = avatarBgColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setAvatarBgColor(color)}
                        className={
                          "h-7 w-7 rounded-full transition-all " +
                          (sel
                            ? "ring-2 ring-[var(--primary)] ring-offset-2"
                            : "ring-1 ring-[var(--border)] hover:ring-[var(--primary)]/40")
                        }
                        style={{ backgroundColor: color }}
                        aria-label={`배경색 ${color}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* 1. 기본정보 */}
      <Section title="기본정보" required>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>생년월일</Label>
            <div className="flex gap-1.5">
              <select
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                className="h-10 flex-[1.3] rounded-md border border-[var(--border)] bg-white px-2 text-[13px] focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">년</option>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
              <select
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
                className="h-10 flex-1 rounded-md border border-[var(--border)] bg-white px-2 text-[13px] focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">월</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
              <select
                value={birthDay}
                onChange={(e) => setBirthDay(e.target.value)}
                className="h-10 flex-1 rounded-md border border-[var(--border)] bg-white px-2 text-[13px] focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">일</option>
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}일
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label>성별</Label>
            <div className="flex flex-wrap gap-1.5">
              {GENDERS.map((g) => (
                <Chip
                  key={g.key}
                  active={gender === g.key}
                  onClick={() => setGender(g.key)}
                >
                  {g.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 2. 얼굴형 */}
      <Section title="얼굴형" required hint="택 1">
        <div className="flex flex-wrap gap-1.5">
          {FACE_SHAPES.map((f) => (
            <Chip
              key={f.key}
              active={faceShape === f.key}
              onClick={() => setFaceShape(f.key)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </Section>

      {/* 3. 피부타입 */}
      <Section title="피부타입" required hint="택 1">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {SKIN_TYPES.map((s) => (
            <Chip
              key={s.key}
              active={skinType === s.key}
              onClick={() => setSkinType(s.key)}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </Section>

      {/* 4. 피부고민 */}
      <Section title="피부고민" hint="복수 선택">
        <div className="flex flex-wrap gap-1.5">
          {SKIN_CONCERNS.map((c) => (
            <Chip
              key={c.key}
              active={skinConcerns.includes(c.key)}
              onClick={() => setSkinConcerns(toggle(skinConcerns, c.key))}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </Section>

      {/* 5. 관심시술 */}
      <Section title="관심시술" hint="복수 선택">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {PROCEDURES.map((p) => (
            <Chip
              key={p.key}
              active={procedures.includes(p.key)}
              onClick={() => setProcedures(toggle(procedures, p.key))}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>

      {/* 6. 자기소개 */}
      <Section title="간단한 자기소개">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="한 줄로 나를 소개해 주세요"
          className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[14px] focus:border-[var(--primary)] focus:outline-none"
        />
        <div className="mt-1 text-right text-[11px] text-[var(--text-muted)]">
          {bio.length}/200
        </div>
      </Section>

      {/* 액션 */}
      <div className="mt-2 flex flex-col items-center gap-2">
        {err && (
          <span className="text-[12px] font-medium text-red-600">{err}</span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-10 rounded-full bg-transparent px-7 text-[14px] font-semibold text-[var(--primary)] underline-offset-4 transition-all hover:underline disabled:opacity-50"
        >
          {pending ? "저장 중…" : "✨ 피부 예뻐지기 시작하기 →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 하위 컴포넌트
// ─────────────────────────────────────────────────────────────

function Section({
  title,
  required,
  hint,
  children,
}: {
  title: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 sm:p-5">
      <div className="mb-2.5 flex items-baseline gap-1.5">
        <h2 className="text-sm font-bold text-[var(--text)]">{title}</h2>
        {required ? (
          <span className="text-[11px] font-semibold text-[var(--primary)]">
            필수
          </span>
        ) : (
          <span className="text-[11px] text-[var(--text-muted)]">선택</span>
        )}
        {hint && (
          <span className="text-[11px] text-[var(--text-muted)]">· {hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
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
      className={
        "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors sm:text-[12px] " +
        (active
          ? "bg-[var(--primary)] text-white"
          : "bg-[var(--bg-soft)] text-[var(--text-secondary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]")
      }
    >
      {children}
    </button>
  );
}
