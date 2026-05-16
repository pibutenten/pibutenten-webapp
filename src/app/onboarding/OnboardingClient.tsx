"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────
// 옵션 정의 — 한글 라벨은 UI 전용, DB에는 영문 key 저장
// ─────────────────────────────────────────────────────────────

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
  { key: "laser", label: "레이저" },
  { key: "booster", label: "스킨부스터" },
  { key: "botox", label: "보톡스" },
  { key: "filler", label: "필러" },
  { key: "cosmetic", label: "화장품" },
];

type Initial = {
  legalName: string;
  birthdate: string;
  gender: "male" | "female" | "other" | null;
  faceShape: string | null;
  skinType: string | null;
  skinConcerns: string[];
  interestedProcedures: string[];
  bio: string;
  avatarUrl: string | null;
};

/** dedup 검사 결과 row */
type DuplicateRow = {
  profile_id: string;
  auth_user_id: string | null;
  handle: string | null;
  display_name: string | null;
  role: string;
  created_at: string;
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

  const [legalName, setLegalName] = useState(initial.legalName);
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

  // 아바타 — SNS(구글/카카오/네이버) 프로필 이미지가 디폴트, 변경 시 직접 업로드
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // dedup 다이얼로그 — 같은 이름+생년월일+성별 조합 발견 시 표시
  const [duplicates, setDuplicates] = useState<DuplicateRow[] | null>(null);

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

  /**
   * 폼 검증 + dedup 체크 (체크 통과 시 또는 무시 결정 시 실제 저장).
   * @param skipDedup true 면 다이얼로그에서 "그래도 진행" 선택 — dedup 검사 skip
   */
  function save(skipDedup = false) {
    setErr(null);

    // 필수값 검증
    if (!legalName.trim()) {
      setErr("이름을 입력해주세요.");
      return;
    }
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

      // dedup 검사 (skipDedup=false 일 때만)
      if (!skipDedup) {
        const { data: dups } = await sb.rpc("find_duplicate_profiles", {
          p_legal_name: legalName.trim(),
          p_birthdate: birthdate,
          p_gender: gender,
        });
        if (Array.isArray(dups) && dups.length > 0) {
          setDuplicates(dups as DuplicateRow[]);
          return; // 사용자 확인 후 다시 save(true) 호출됨
        }
      }

      // avatar_url에는 ?v= 캐시버스터 떼고 저장 (DB는 깨끗하게)
      const cleanAvatar = avatarUrl
        ? avatarUrl.split("?")[0] || avatarUrl
        : null;
      const { error } = await sb
        .from("profiles")
        .update({
          legal_name: legalName.trim(),
          birthdate,
          gender,
          face_shape: faceShape,
          skin_type: skinType,
          skin_concerns: skinConcerns,
          interested_procedures: procedures,
          bio: bio.trim() || null,
          avatar_url: cleanAvatar,
        })
        .eq("id", userId);
      if (error) {
        setErr(`저장 실패: ${error.message}`);
        return;
      }
      // middleware의 온보딩 가드 캐시 — 즉시 통과시키기 위해 클라이언트에서 set.
      // 첫 가입 강제 게이트 쿠키도 만료시켜 두 번 다시 강제 redirect 안 되게 한다.
      try {
        document.cookie = `pibutenten_onboarded=${userId}; Path=/; Max-Age=${60 * 60 * 12}; SameSite=Lax`;
        document.cookie = `pibutenten_must_onboard=; Path=/; Max-Age=0; SameSite=Lax`;
      } catch {
        /* ignore — 인앱 sandbox */
      }
      // 온보딩 완료 → 피드 화면 (콘텐츠 보기) — 캐시 확실히 비우기 위해 풀 reload
      window.location.assign("/");
    });
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 0. 프로필 사진 — SNS 프로필 디폴트 + 직접 업로드 옵션 */}
      <Section
        title="프로필 사진"
        hint="SNS 프로필 사진 그대로 또는 직접 업로드"
      >
        <div className="flex items-center gap-4">
          {/* 미리보기 — 큰 원형, OAuth 사진이거나 업로드한 사진 그대로 노출 */}
          <div
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-soft)]"
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
            {/* 업로드 / 사진 찍기 / 선택 해제 */}
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
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl(null)}
                  className="rounded-md px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-red-600"
                >
                  선택 해제
                </button>
              )}
            </div>
            <p className="mt-2 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
              기본은 가입 시 사용한 SNS 프로필 사진이에요. 바꾸고 싶으면 직접
              업로드하거나 사진을 찍으세요. (자동으로 256×256으로 줄여서 저장)
            </p>
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
      </Section>

      {/* 1. 기본정보 */}
      <Section title="기본정보" required>
        <p className="mb-3 rounded-md bg-[var(--bg-soft)] px-3 py-2 text-[12px] leading-[1.55] text-[var(--text-secondary)]">
          💡 <strong>이름·생년월일·성별은 중복 가입자 식별에만 사용됩니다.</strong>
          {" "}프로필 등 다른 곳에는 표시되지 않으며, 한 분이 부계정으로 가입하는
          경우 같은 분의 묶음으로 관리하기 위해 받습니다.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>이름 (실명)</Label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="홍길동"
              maxLength={40}
              className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
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
            <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
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
      <Section title="본인을 소개한다면?">
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
          onClick={() => save()}
          disabled={pending}
          className="h-10 rounded-full bg-[var(--primary-light)] px-7 text-[14px] font-semibold text-white transition-all hover:bg-[var(--primary-light-hover)] disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>

      {/* dedup 다이얼로그 — 같은 이름+생년월일+성별 조합 발견 시 */}
      {duplicates && duplicates.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius)] bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text)]">
              혹시 이미 가입하셨나요?
            </h3>
            <p className="mt-2 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
              입력하신 이름·생년월일·성별과 일치하는 계정이
              {" "}<strong>{duplicates.length}개</strong> 발견되었습니다.
              본인의 다른 계정이면 본계정으로 묶어드릴 수 있습니다.
            </p>
            <ul className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
              {duplicates.map((d) => (
                <li
                  key={d.profile_id}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-[12px] text-[var(--text)]"
                >
                  <div className="font-medium">
                    {d.display_name ?? "(이름 없음)"}
                    {d.handle && (
                      <span className="ml-1 text-[var(--text-muted)]">
                        @{d.handle}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    가입: {new Date(d.created_at).toLocaleDateString("ko-KR")}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
              본인의 다른 계정이 맞으면 관리자에게 문의(jminbae@gmail.com)해
              계정을 묶을 수 있습니다. 다른 분이거나 모르면 그냥 진행하세요.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicates(null)}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
              >
                다시 확인
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicates(null);
                  save(true); // skipDedup
                }}
                disabled={pending}
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
              >
                다른 사람이에요, 진행
              </button>
            </div>
          </div>
        </div>
      )}
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
        "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors sm:text-[13.5px] " +
        (active
          ? "bg-[#6B7280] text-white"
          : "bg-[var(--bg-soft)] text-[var(--text-secondary)] hover:bg-[#E5E7EB] hover:text-[var(--text)]")
      }
    >
      {children}
    </button>
  );
}
