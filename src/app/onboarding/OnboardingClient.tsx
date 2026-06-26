"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  GENDERS,
  FACE_SHAPES,
  SKIN_TYPES,
  SKIN_CONCERNS,
} from "@/lib/profile-options";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import type { PopularByCategory } from "@/lib/popular-keywords";

const INTERESTS_MAX = 10;

type Initial = {
  email: string;
  birthdate: string;
  gender: "male" | "female" | "other" | null;
  faceShape: string | null;
  skinType: string | null;
  skinConcerns: string[];
  interestedProcedures: string[];
  bio: string;
  avatarUrl: string | null;
  /** 피부 정보 활용 동의 시점 — 이미 동의했으면 체크박스 기본 ON (보안 2.5차) */
  skinInfoConsentAt?: string | null;
};

/** dedup 검사 결과 — Phase 5-4 (2026-05-16): handle 등 식별 정보 노출 X.
 *  match_count + 가입 채널 힌트만 (예: ['google', 'kakao']) */
type DuplicateResult = {
  match_count: number;
  providers: string[];
};

/** OAuth provider 한글 라벨 매핑 */
const PROVIDER_LABEL: Record<string, string> = {
  google: "구글",
  kakao: "카카오",
  naver: "네이버",
  apple: "Apple",
  email: "이메일",
};

function formatProviders(providers: string[]): string {
  if (!providers || providers.length === 0) return "소셜 로그인";
  return providers
    .map((p) => PROVIDER_LABEL[p] ?? p)
    .join(" / ");
}

type Props = {
  /** base profile id (auth.users.id). avatar 업로드 경로용. */
  userId: string;
  /**
   * 온보딩 PII 저장 대상 명함 id.
   * B-2 (2026-05-29 / POLICY-1): active 명함 단위 저장.
   *   page.tsx 에서 IDENTITY_COOKIE 기반으로 묶음 검증 통과 시 candidate, 아니면 user.id.
   *   middleware 의 active 단위 검사와 정합 — 무한 루프 차단.
   */
  targetProfileId: string;
  initial: Initial;
  /** 발행된 카드 keywords 카테고리별 TOP N — 섹션 5 (관심 키워드 칩) 용. */
  popularByCategory: PopularByCategory;
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

export default function OnboardingClient({ userId, targetProfileId, initial, popularByCategory }: Props) {
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

  const [email, setEmail] = useState(initial.email);
  const [gender, setGender] = useState<Initial["gender"]>(initial.gender);
  const [faceShape, setFaceShape] = useState<string | null>(initial.faceShape);
  const [skinType, setSkinType] = useState<string | null>(initial.skinType);
  const [skinConcerns, setSkinConcerns] = useState<string[]>(
    initial.skinConcerns,
  );
  // 섹션 5 (관심 키워드) — 발행 카드 keywords 카테고리별 TOP N 에서 픽. 최대 10개.
  //   기존 PROCEDURES enum 키 데이터와의 호환: 초기값을 그대로 적재 (사용자가 새로 고를 때까지 유지).
  const [procedures, setProcedures] = useState<string[]>(
    initial.interestedProcedures,
  );
  // 섹션 5 카테고리 탭 활성 — 진입 시 'concerns' 디폴트.
  const [interestCategory, setInterestCategory] =
    useState<CategorySlug>("concerns");
  const [bio, setBio] = useState(initial.bio);

  // 피부 정보 활용 동의 (보안 2.5차 C묶음, 2026-05-19) — 필수.
  // PIPA 권고: 동의 시점 보존 → 저장 시 profiles.skin_info_consent_at = now().
  const [skinInfoConsent, setSkinInfoConsent] = useState<boolean>(
    Boolean(initial.skinInfoConsentAt),
  );

  // 아바타 — SNS(구글/카카오/네이버) 프로필 이미지가 디폴트, 변경 시 직접 업로드
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // dedup 다이얼로그 — 같은 이름+생년월일+성별 조합 발견 시 표시
  const [duplicate, setDuplicate] = useState<DuplicateResult | null>(null);

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
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErr("이메일을 입력해주세요.");
      return;
    }
    // 가벼운 형식 검증만 (RFC 완벽 X — 사용자가 다른 이메일 적어도 정책상 허용)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErr("이메일 형식이 올바르지 않아요.");
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
    // 만 14세 미만 차단 (A3, 2026-05-17).
    // 개인정보 보호법상 만 14세 미만은 법정대리인 동의 필수. 피부텐텐은 현재
    // 법정대리인 동의 프로세스가 없으므로 14세 미만 가입 자체를 차단.
    // 계산: 오늘 기준 - 14년 < 생일 이면 미만.
    // 'YYYY-MM-DD' 를 로컬 자정으로 파싱 — today(로컬)와 기준을 맞춰 경계일(생일 당일) 오판 방지.
    //   (new Date("YYYY-MM-DD") 는 UTC 자정 파싱이라 음수 오프셋 환경에서 하루 어긋날 수 있음.)
    const birthDateObj = new Date(`${birthdate}T00:00:00`);
    const today = new Date();
    let ageYears = today.getFullYear() - birthDateObj.getFullYear();
    const monthDiff = today.getMonth() - birthDateObj.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDateObj.getDate())
    ) {
      ageYears -= 1;
    }
    if (ageYears < 14) {
      setErr(
        "만 14세 미만은 가입할 수 없습니다. 법정대리인의 도움이 필요해요.",
      );
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
    if (skinConcerns.length === 0) {
      setErr("피부 고민을 한 개 이상 선택해주세요.");
      return;
    }
    if (procedures.length === 0) {
      setErr("관심 키워드를 한 개 이상 선택해주세요.");
      return;
    }
    if (!skinInfoConsent) {
      setErr(
        "피부 정보 활용에 동의해 주세요. 동의하지 않으시면 가입을 진행할 수 없어요.",
      );
      return;
    }

    start(async () => {
      const sb = createSupabaseBrowserClient();

      // dedup 검사 (skipDedup=false 일 때만)
      if (!skipDedup) {
        const { data: dups } = await sb.rpc("find_duplicate_profiles", {
          p_email: trimmedEmail.toLowerCase(),
          p_birthdate: birthdate,
          p_gender: gender,
        });
        // 새 반환 형식 (0102): TABLE(match_count int, providers text[]) — 한 row 반환.
        const row = (dups as DuplicateResult[] | null)?.[0];
        if (row && row.match_count > 0) {
          setDuplicate(row);
          return; // 사용자 확인 후 다시 save(true) 호출됨
        }
      }

      // avatar_url에는 ?v= 캐시버스터 떼고 저장 (DB는 깨끗하게)
      const cleanAvatar = avatarUrl
        ? avatarUrl.split("?")[0] || avatarUrl
        : null;
      // 미입력 시 디폴트 자기소개 ("만나서 반갑습니다.") 로 저장 (UI placeholder 와 동일 문구).
      const DEFAULT_BIO = "만나서 반갑습니다.";
      const finalBio = bio.trim() || DEFAULT_BIO;
      // B-2 (2026-05-29 / POLICY-1): active 명함 (targetProfileId) 에 저장.
      //   userId 는 avatar 업로드 경로 + onboarded 쿠키 값 용도. PII 저장은 active 명함에.
      const { error } = await sb
        .from("profiles")
        .update({
          contact_email: trimmedEmail.toLowerCase(),
          birthdate,
          gender,
          face_shape: faceShape,
          skin_type: skinType,
          skin_concerns: skinConcerns,
          interested_procedures: procedures,
          bio: finalBio,
          avatar_url: cleanAvatar,
          // 보안 2.5차 C묶음: PIPA 동의 시점 보존
          skin_info_consent_at: new Date().toISOString(),
        })
        .eq("id", targetProfileId);
      if (error) {
        setErr(`저장 실패: ${error.message}`);
        return;
      }
      // Phase 6-NEW (migration 0106): 묶음 내 다른 profile row 들에 온보딩 정보를 일괄 전파
      // (COALESCE — NULL 컬럼만 채움). 호출자 묶음 검증 (auth.uid()) 은 RPC 내부에서 처리.
      // source = targetProfileId (방금 채워진 active 명함). RPC 가 같은 묶음 다른 명함의 NULL 칸만
      // 복사 — 이미 채워진 명함은 보존. 의사 멀티 계정 묶음 아니면 0 반환 (무해).
      try {
        const { error: propErr } = await sb.rpc(
          "propagate_onboarding_to_doctor_bundle",
          { p_source_profile_id: targetProfileId },
        );
        if (propErr) {
          console.warn(
            "[onboarding] propagate RPC failed:",
            propErr.message,
          );
        }
      } catch (e) {
        console.warn("[onboarding] propagate RPC threw:", e);
      }
      // middleware의 온보딩 가드 캐시 — 즉시 통과시키기 위해 클라이언트에서 set.
      // 첫 가입 강제 게이트 쿠키도 만료시켜 두 번 다시 강제 redirect 안 되게 한다.
      // Secure flag: HTTPS 환경에서만 자동 부여 (A11, 2026-05-17).
      // window.location.protocol 로 현재 페이지가 HTTPS 인 경우에만 Secure 부여 —
      // localhost http 개발 환경에서는 Secure 빠져서 정상 동작.
      try {
        const secureAttr =
          typeof window !== "undefined" && window.location.protocol === "https:"
            ? "; Secure"
            : "";
        // B-2 (2026-05-29): 쿠키 값을 active 명함 id 로 set — middleware fast path 2b 가
        // 같은 명함 ID 매칭 시에만 통과. active 가 다른 명함으로 바뀌면 mismatch 감지 → 재검사.
        document.cookie = `pibutenten_onboarded=${targetProfileId}; Path=/; Max-Age=${60 * 60 * 12}; SameSite=Lax${secureAttr}`;
        document.cookie = `pibutenten_must_onboard=; Path=/; Max-Age=0; SameSite=Lax${secureAttr}`;
      } catch {
        /* ignore — 인앱 sandbox */
      }
      // 온보딩 완료 → 피드 화면 (콘텐츠 보기) — 캐시 확실히 비우기 위해 풀 reload
      showToast("프로필 설정 완료!");
      setTimeout(() => window.location.assign("/"), 800);
    });
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 0. 프로필 사진 — SNS 프로필 디폴트 + 직접 업로드 옵션 */}
      <Section title="프로필 사진을 선택해주세요!">
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
      <Section title="본인 확인을 위한 기본 정보를 알려주세요." required>
        <p className="mb-3 text-[13px] leading-[1.55] text-[var(--text-secondary)]">
          중복 가입자 식별에만 사용됩니다. 프로필에서는 연령대와 성별만
          노출되어요.
        </p>
        <div className="space-y-3">
          {/* 이메일 — 라벨 좌측, 입력 우측 (가로 정렬) */}
          <div className="flex items-center gap-3">
            <span className="w-[60px] shrink-0 text-[12px] font-medium text-[var(--text-secondary)]">
              이메일
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={120}
              inputMode="email"
              autoComplete="email"
              className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-[12px] focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          {/* 생년월일 — 라벨 좌측, select 3개 우측 */}
          <div className="flex items-center gap-3">
            <span className="w-[60px] shrink-0 text-[12px] font-medium text-[var(--text-secondary)]">
              생년월일
            </span>
            <div className="flex flex-1 gap-1.5">
              <select
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                className="h-9 flex-[1.3] rounded-md border border-[var(--border)] bg-white px-2 text-[12px] focus:border-[var(--primary)] focus:outline-none"
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
                className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-2 text-[12px] focus:border-[var(--primary)] focus:outline-none"
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
                className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-2 text-[12px] focus:border-[var(--primary)] focus:outline-none"
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

          {/* 성별 — 칩 그대로 (가로 정렬 적용 안 함, 칩이 폭에 따라 wrap) */}
          <div className="flex items-center gap-3">
            <span className="w-[60px] shrink-0 text-[12px] font-medium text-[var(--text-secondary)]">
              성별
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
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
      <Section title="얼굴형이 어떻게 되세요?" required hint="택 1">
        <div className="flex flex-wrap justify-center gap-2">
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
      <Section title="피부 타입은 어떤 편이세요?" required hint="택 1">
        <div className="flex flex-wrap justify-center gap-2">
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

      {/* 4. 피부고민 — 모바일은 정확히 5×2 grid (10개 균등), 데스크탑은 flex-wrap 가운데 */}
      <Section title="요즘 어떤 피부 고민이 있으세요?" required hint="복수 선택">
        <div className="grid grid-cols-5 place-items-center gap-1.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-2">
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

      {/* 5. 관심 키워드 — /search 의 CategoryWithChips 와 동일 UI (밑줄 탭 + 그라데이션 라인 + 작은 칩 + 더보기 토글). 최대 10개. */}
      <Section
        title="피부에 대해 궁금한 것을 골라주시면, 맞춤형 정보를 보여드릴게요."
        required
        hint={`최대 ${INTERESTS_MAX}개 · ${procedures.length}/${INTERESTS_MAX}`}
      >
        {/* 안내문 ("추후에도 언제든지 변경하실 수 있어요") 는 page.tsx 의
            상단 부제 아래로 이동 (사용자 요청 2026-05-23 IV). */}
        <InterestPicker
          popularByCategory={popularByCategory}
          activeCategory={interestCategory}
          onCategoryChange={setInterestCategory}
          picked={procedures}
          onToggle={(kw) => {
            const isPicked = procedures.includes(kw);
            if (!isPicked && procedures.length >= INTERESTS_MAX) return;
            setProcedures(toggle(procedures, kw));
          }}
          onRemove={(kw) =>
            setProcedures(procedures.filter((x) => x !== kw))
          }
          onAddCustom={(kw) => {
            const v = kw.trim();
            if (!v) return;
            if (procedures.includes(v)) return;
            if (procedures.length >= INTERESTS_MAX) return;
            setProcedures([...procedures, v]);
          }}
        />
      </Section>

      {/* 6. 자기소개 — 미입력 시 DEFAULT_BIO 로 자동 저장. required 아님. */}
      <Section title="본인을 한 줄로 소개해 주실래요?">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="만나서 반갑습니다."
          className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[14px] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-[var(--text-muted)]">
            미입력 시 &lsquo;만나서 반갑습니다.&rsquo; 로 표시됩니다.
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {bio.length}/200
          </span>
        </div>
      </Section>

      {/* 피부 정보 활용 동의 — 보안 2.5차 C묶음 (2026-05-19, PIPA) */}
      <div className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 sm:p-5">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={skinInfoConsent}
            onChange={(e) => setSkinInfoConsent(e.target.checked)}
            className="mt-[3px] h-4 w-4 cursor-pointer accent-[var(--primary)]"
          />
          <span className="text-[13px] leading-[1.6] text-[var(--text-secondary)]">
            <strong className="text-[var(--text)]">
              입력한 피부 정보(피부타입·피부고민·관심시술)
            </strong>
            를 피드 추천 및 서비스 개선에 활용하는 것에 동의합니다. 동의 시점은
            기록되며, 동의 철회는{" "}
            <a
              href="/settings/profile"
              className="text-[var(--primary)] hover:underline"
            >
              설정
            </a>
            에서 언제든 가능합니다.{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener"
              className="text-[var(--primary)] hover:underline"
            >
              자세히 보기
            </a>
          </span>
        </label>
      </div>

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

      {/* dedup 다이얼로그 — Phase 5-4: 식별 정보(handle/display_name) 노출 X.
          가입 채널 힌트만 제공 → "그 방법으로 로그인하세요" UX. */}
      {duplicate && duplicate.match_count > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius)] bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text)]">
              혹시 이미 가입하셨나요?
            </h3>
            <p className="mt-2 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
              입력하신 이름·생년월일·성별과 일치하는 계정이 이미 발견되었어요.
              {duplicate.providers.length > 0 && (
                <>
                  <br />
                  기존에 <strong>{formatProviders(duplicate.providers)}</strong>{" "}
                  계정으로 가입하신 적이 있을 수 있습니다.
                </>
              )}
            </p>
            <p className="mt-3 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
              본인 계정이 맞으면 해당 소셜 계정으로 다시 로그인해주세요.
              본인 확인이 필요하시면 관리자(pibutenten@gmail.com)에게 문의 주세요.
              다른 분이거나 처음 가입이시면 그냥 진행하셔도 됩니다.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  setDuplicate(null);
                  // 기존 계정으로 다시 로그인 — 현재(새) 세션을 먼저 로그아웃해야
                  //   /login 이 다시 /signup 으로 튕기는 루프를 막는다.
                  try {
                    const sb = createSupabaseBrowserClient();
                    await sb.auth.signOut();
                    const secure =
                      typeof window !== "undefined" &&
                      window.location.protocol === "https:"
                        ? "; Secure"
                        : "";
                    for (const name of [
                      "pibutenten:identity-mirror",
                      "pibutenten_onboarded",
                      "pibutenten_must_onboard",
                    ]) {
                      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
                    }
                  } catch {
                    /* ignore */
                  }
                  window.location.assign("/login");
                }}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
              >
                기존 계정으로 로그인
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicate(null);
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
  /** 검증 시 사용 — UI 라벨('필수' / '선택')은 노출하지 않음 (사용자 요청 2026-05-23). */
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  void required;
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* 질문체 제목 — 16px 로 키움 (이전 14px) */}
        <h2 className="text-[16px] font-bold leading-[1.4] text-[var(--text)]">
          {title}
        </h2>
        {hint && (
          <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>
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
      // 비활성: bg #E8EAEE / text #5C6470 / fontWeight 500 (검색 페이지 톤 동일)
      // 활성: 브랜드색 #4CBFF2 (var(--primary)) / text white / fontWeight 600
      //   — 사용자 요청 (2026-05-23 IV): 회색 → 브랜드색. 단, 5번 관심 키워드 picker
      //     안의 칩은 카테고리 색을 유지(별도 인라인 <button>, Chip 컴포넌트와 분리).
      className="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] transition-colors active:scale-[0.97]"
      style={
        active
          ? {
              backgroundColor: "#4CBFF2",
              color: "#FFFFFF",
              fontWeight: 600,
            }
          : {
              backgroundColor: "#E8EAEE",
              color: "#5C6470",
              fontWeight: 500,
            }
      }
    >
      {children}
    </button>
  );
}

/**
 * 관심 키워드 picker — /search 의 CategoryWithChips UI 재현 + 온보딩용 확장.
 * - 밑줄형 카테고리 탭 (5개, active 시 카테고리 색) — 가운데 정렬
 * - 탭 ↔ 칩 사이 그라데이션 라인
 * - 작은 칩 (#E8EAEE 배경 / picked 시 해당 칩이 속한 카테고리 색 + 굵게) — 가운데 정렬
 * - collapsed 시 3줄 미리보기, expanded 시 전체 노출 (잘림 없음)
 * - 선택된 키워드 미리보기 — picked 칩의 원래 카테고리 색으로 표시 + 자유 추가 입력란
 */
function InterestPicker({
  popularByCategory,
  activeCategory,
  onCategoryChange,
  picked,
  onToggle,
  onRemove,
  onAddCustom,
}: {
  popularByCategory: PopularByCategory;
  activeCategory: CategorySlug;
  onCategoryChange: (slug: CategorySlug) => void;
  picked: string[];
  onToggle: (kw: string) => void;
  onRemove: (kw: string) => void;
  onAddCustom: (kw: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  /** 줄 수 제한으로 잘려서 표시 안 되는 첫 칩 index (null = 전부 표시 가능). */
  const [cutoffIndex, setCutoffIndex] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState("");
  const innerRef = useRef<HTMLDivElement>(null);

  const cat = CATEGORIES.find((c) => c.slug === activeCategory)!;
  const allChips = popularByCategory[activeCategory] ?? [];

  // 줄 수 제한 — collapsed 3줄 / expanded 7줄. ROW_LIMIT 초과 줄에 들어갈 칩은 아예 렌더 안 함.
  const ROW_LIMIT = expanded ? 7 : 3;

  /** 주어진 키워드가 속한 카테고리 색을 반환 — 미발견 시 회색(#9CA3AF) 폴백. */
  function colorOfKeyword(kw: string): string {
    for (const c of CATEGORIES) {
      if ((popularByCategory[c.slug] ?? []).includes(kw)) return c.color;
    }
    return "#9CA3AF";
  }

  // 줄 수 측정 → cutoffIndex 결정. ⚠ 무한 re-measure 루프 fix (사용자 보고 "떨림"):
  //   기존 버전은 ResizeObserver 가 자기가 슬라이스한 inner 의 사이즈 변화를 감지하여 재측정,
  //   재측정 결과가 달라지면(슬라이스 vs 풀세트 layout 차이) 다시 setState → 무한 루프.
  //
  //   현재 버전:
  //   1) effect 의존성 변경 시 (category/ROW_LIMIT/allChips/window-resize) → cutoff null 로 reset
  //   2) cutoff === null 이면 전체 칩이 렌더된 상태 → 그 layout 으로 측정 → cutoff 확정
  //   3) cutoff 가 number 일 때 effect 다시 들어와도 early return → 무한 루프 차단
  //   4) ResizeObserver 미사용 (window resize 만 listen)
  useLayoutEffect(() => {
    setCutoffIndex(null);
  }, [activeCategory, ROW_LIMIT, allChips]);

  useLayoutEffect(() => {
    if (cutoffIndex !== null) return; // 이미 슬라이스됨 — 재측정 X
    const inner = innerRef.current;
    if (!inner) return;
    const chips = Array.from(inner.children) as HTMLElement[];
    if (chips.length === 0) return;

    const seenTops = new Set<number>();
    let cutoff: number | null = null;
    for (let i = 0; i < chips.length; i++) {
      const t = chips[i].offsetTop;
      if (!seenTops.has(t)) {
        if (seenTops.size >= ROW_LIMIT) {
          cutoff = i;
          break;
        }
        seenTops.add(t);
      }
    }
    if (cutoff !== null) setCutoffIndex(cutoff);
  });

  // window resize → cutoff 리셋 → 전체 칩 재렌더 → 재측정.
  useEffect(() => {
    function onResize() {
      setCutoffIndex(null);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const visibleChips =
    cutoffIndex !== null ? allChips.slice(0, cutoffIndex) : allChips;
  const hasOverflow = cutoffIndex !== null;

  return (
    <div>
      {/* 탭 — 가운데 정렬 */}
      <div
        role="tablist"
        aria-label="카테고리"
        className="-mx-2 flex justify-center gap-x-[14px] overflow-x-auto px-2 sm:mx-0 sm:flex-wrap sm:gap-x-7 sm:gap-y-2 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" } as CSSProperties}
      >
        {CATEGORIES.map((c) => {
          const isActive = activeCategory === c.slug;
          return (
            <button
              key={c.slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onCategoryChange(c.slug)}
              className="shrink-0 cursor-pointer border-b-2 px-1 py-[6px] text-[13px] font-semibold transition-[color,border-color,transform] hover:opacity-70 active:scale-[0.96] sm:py-[7px] sm:text-[14px]"
              style={{
                color: isActive ? c.color : "var(--text-secondary)",
                borderBottomColor: isActive ? c.color : "transparent",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* 탭 ↔ 칩 그라데이션 라인 */}
      <div
        aria-hidden
        className="mb-3 h-px w-full sm:mb-[14px]"
        style={{
          background:
            "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.10) 18%, rgba(0,0,0,0.10) 82%, transparent 100%)",
        }}
      />

      {/* 칩 — 가운데 정렬. 줄 수 제한(ROW_LIMIT) 초과 칩은 visibleChips 에서 잘려 렌더 안 됨. */}
      {allChips.length === 0 ? (
        <div className="text-center text-xs text-[var(--text-muted)]">
          이 카테고리의 인기 키워드가 아직 없어요.
        </div>
      ) : (
        <>
          <div>
            <div ref={innerRef} className="flex flex-wrap justify-center gap-1.5">
              {visibleChips.map((kw) => {
                const selected = picked.includes(kw);
                return (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => onToggle(kw)}
                    className="cursor-pointer rounded-full px-3 py-1 text-[13px] transition-colors active:scale-[0.97]"
                    style={
                      selected
                        ? {
                            backgroundColor: cat.color + "1A",
                            color: cat.color,
                            fontWeight: 700,
                          }
                        : {
                            backgroundColor: "#E8EAEE",
                            color: "#5C6470",
                            fontWeight: 500,
                          }
                    }
                  >
                    {kw}
                  </button>
                );
              })}
            </div>
          </div>

          {(hasOverflow || expanded) && (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-full px-3 py-1 text-[12px] font-semibold text-[var(--text-muted)] transition-colors"
              >
                {expanded ? "접기 ▴" : "더보기 ▾"}
              </button>
            </div>
          )}
        </>
      )}

      {/* 선택된 키워드 미리보기 — picked 칩의 원래 카테고리 색으로 표시. ✕ 클릭 = 제거. */}
      {picked.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <div className="mb-1.5 text-center text-[11px] text-[var(--text-muted)]">
            선택한 키워드
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {picked.map((kw) => {
              const color = colorOfKeyword(kw);
              return (
                <button
                  key={kw}
                  type="button"
                  onClick={() => onRemove(kw)}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: color + "1A",
                    color: color,
                    fontWeight: 700,
                  }}
                  title="제거"
                >
                  {kw}
                  <span aria-hidden>×</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 자유 추가 입력란 — 원하는 키워드가 위 목록에 없으면 직접 추가 */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              onAddCustom(customInput);
              setCustomInput("");
            }
          }}
          placeholder="원하는 키워드 직접 추가"
          maxLength={30}
          className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            onAddCustom(customInput);
            setCustomInput("");
          }}
          disabled={!customInput.trim()}
          className="h-9 shrink-0 rounded-md bg-[var(--primary)] px-3 text-[12.5px] font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
        >
          추가
        </button>
      </div>

    </div>
  );
}
