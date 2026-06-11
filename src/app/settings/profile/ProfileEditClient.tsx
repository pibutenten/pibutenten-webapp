"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import ImageCropDialog from "@/components/ImageCropDialog";
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";
import {
  FACE_SHAPES,
  SKIN_TYPES,
  SKIN_CONCERNS,
  PROCEDURES,
  type FieldVisibility,
} from "@/lib/profile-options";
import {
  TERMS_VERSION,
  PRIVACY_VERSION,
} from "@/lib/consent-versions";

type Initial = {
  displayName: string;
  marketingConsent: boolean;
  newsConsent: boolean;
  /** 필수 동의 읽기전용 표시용 (값은 DB row, 문구/링크 SSOT는 consent-versions.ts). */
  termsAgreedAt: string | null;
  termsAgreedVersion: string | null;
  privacyAgreedAt: string | null;
  privacyAgreedVersion: string | null;
  birthdate: string;
  gender: "male" | "female" | "other" | null;
  faceShape: string | null;
  skinType: string | null;
  skinConcerns: string[];
  interestedProcedures: string[];
  bio: string;
  avatarUrl: string | null;
  fieldVisibility: FieldVisibility;
};

export type ProfileEditProps = {
  /** auth.users.id — Storage path / auth 작업 (탈퇴 등) 용. */
  userId: string;
  /**
   * PII 읽기·쓰기 대상 명함 ID (active 명함 또는 base).
   * page.tsx 가 `getIdentityContext` SSOT 로 결정 (남의 명함 위조 차단 포함).
   * 2026-05-29 POLICY-1 잔여 정리: 옛 `activeIdentityId ?? userId` 의 클라이언트 로컬
   * 결정 → 서버에서 결정한 단일 ID 로 통일.
   */
  targetProfileId: string;
  currentEmail: string;
  /** 로그인 방식 표시용 — 'email' | 'google' | 'kakao' 등 */
  loginProviders: string[];
  /** 우측 상단 [← 프로필] 링크의 href — 프로필 페이지(/{handle} 또는 /) */
  profileHref: string;
  /** 의사 명함 (target.role === DOCTOR) — 사진·이름 read-only (doctors 테이블에서 관리). */
  readOnlyNameAndAvatar: boolean;
  /** 알림 항목 노출 판정 — 검수 요청은 doctor/admin 한정. */
  role: "admin" | "doctor" | "user";
  initial: Initial;
  /** 마이페이지 아코디언 등 다른 페이지에 임베드 시 true — 자체 'h1 내 정보' 헤더 숨김. */
  embedded?: boolean;
};

// 알림 설정 — 키·기본값·저장 API 모두 기존(NotificationPreferences) 그대로 차용(저장 구조 불변).
type NotifPrefs = {
  pref_comment: boolean;
  pref_reply: boolean;
  pref_like: boolean;
  pref_save: boolean;
  pref_review_request: boolean;
  pref_published: boolean;
  pref_keyword_interest: boolean;
  pref_keyword_concern: boolean;
  pref_keyword_skin_type: boolean;
};
const NOTIF_DEFAULTS: NotifPrefs = {
  pref_comment: true,
  pref_reply: true,
  pref_like: true,
  pref_save: true,
  pref_review_request: true,
  pref_published: true,
  pref_keyword_interest: true,
  pref_keyword_concern: true,
  pref_keyword_skin_type: true,
};
// 활동 알림(관심시술 밑 별도 카드) — 기존 알림 토글 행 그대로. 검수 요청은 doctor/admin 한정.
const ACTIVITY_ROWS: {
  key: keyof NotifPrefs;
  emoji: string;
  label: string;
  desc: string;
  visibleToUser: boolean;
}[] = [
  { key: "pref_comment", emoji: "💬", label: "내 글에 댓글", desc: "내가 쓴 글에 누군가 댓글을 남기면 알림", visibleToUser: true },
  { key: "pref_reply", emoji: "↳", label: "내 댓글에 답글", desc: "내가 단 댓글에 누군가 답글을 달면 알림", visibleToUser: true },
  { key: "pref_like", emoji: "❤", label: "내 글에 좋아요", desc: "누군가 내 글에 좋아요를 누르면 알림 (24시간에 1회)", visibleToUser: true },
  { key: "pref_save", emoji: "🔖", label: "내 글 저장", desc: "누군가 내 글을 저장하면 알림 (이름 없이 인원수만, 24시간에 1회)", visibleToUser: true },
  { key: "pref_review_request", emoji: "🩺", label: "검수 요청", desc: "관리자가 내 카드 검수를 요청하면 알림 (원장님 한정)", visibleToUser: false },
  { key: "pref_published", emoji: "🚀", label: "내 카드 발행됨", desc: "검수 후 내 카드가 발행되면 알림", visibleToUser: true },
];

type Status =
  | { type: "idle" }
  | { type: "ok"; msg: string }
  | { type: "err"; msg: string };

const SELECTED = "#9CA3AF"; // 더 연한 회색
const CHECK_ACCENT = "#CBD5E1"; // 체크박스 — 더 연한 슬레이트 (눈에 덜 띄게)

const PROVIDER_LABEL: Record<string, string> = {
  email: "이메일",
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
};

export default function ProfileEditClient({
  userId,
  targetProfileId,
  currentEmail,
  loginProviders,
  profileHref,
  readOnlyNameAndAvatar,
  role,
  initial,
  embedded = false,
}: ProfileEditProps) {
  const router = useRouter();
  const sb = createSupabaseBrowserClient();

  // ── 알림 설정 (기존 NotificationPreferences 로직 차용 — 같은 API·키, 저장 구조 불변) ──
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null);
  const [notifSaving, setNotifSaving] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false); // 활동 알림 카드 기본 접힘
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notifications/preferences", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as NotifPrefs;
        if (!cancelled) setNotifPrefs(data);
      } catch {
        if (!cancelled) setNotifPrefs(NOTIF_DEFAULTS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  async function toggleNotif(k: keyof NotifPrefs) {
    if (!notifPrefs) return;
    const prev = notifPrefs;
    const next = { ...notifPrefs, [k]: !notifPrefs[k] };
    setNotifPrefs(next);
    setNotifSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setNotifPrefs(prev); // 실패 롤백
      showToast("알림 설정 저장 실패", { tone: "danger" });
    } finally {
      setNotifSaving(false);
    }
  }

  // ── 프로필 사진 ──
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  // 사진 변경: storage 업로드 후 pendingAvatarUrl state 에 보관 — DB 는 즉시저장(autosave effect)에서 반영
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);

  // 사진 자르기 다이얼로그 (인스타식 — 드래그·확대로 위치 조정 후 업로드)
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  /** 파일 선택 시 — 다이얼로그 띄움 (자동 center-crop 대신 사용자 조정). */
  function onFilePicked(file: File) {
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setCropOpen(true);
  }

  function onCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setCropOpen(false);
  }

  /** 다이얼로그에서 [완료] 누름 → blob을 supabase 업로드. */
  async function onCropConfirm(blob: Blob) {
    setUploading(true);
    setCropOpen(false);
    try {
      const path = `${userId}/${Date.now()}.jpg`;
      const { error: upErr } = await sb.storage
        .from("avatars")
        .upload(path, blob, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (upErr) {
        showToast("업로드 실패: " + upErr.message, { tone: "danger" });
        return;
      }
      const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
      const newUrl = pub.publicUrl;
      // preview만 — DB는 일괄 저장 시
      setAvatarUrl(newUrl);
      setPendingAvatarUrl(newUrl);
    } finally {
      setUploading(false);
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    }
  }

  // ── 닉네임 ──
  // (개별 저장 path 제거됨 — saveAll()로 통합 저장. 입력 state만 유지.)
  const [displayName, setDisplayName] = useState(initial.displayName);

  // ── 피부 정보 ──
  const [faceShape, setFaceShape] = useState<string | null>(initial.faceShape);
  const [skinType, setSkinType] = useState<string | null>(initial.skinType);
  const [skinConcerns, setSkinConcerns] = useState<string[]>(
    initial.skinConcerns,
  );
  const [interestedProcedures, setInterestedProcedures] = useState<string[]>(
    initial.interestedProcedures,
  );
  const [interestedInput, setInterestedInput] = useState("");
  const [bio, setBio] = useState(initial.bio);
  const [visibility, setVisibility] = useState<FieldVisibility>(
    initial.fieldVisibility,
  );
  const [skinStatus, setSkinStatus] = useState<Status>({ type: "idle" });
  const [, startSkin] = useTransition();

  function toggleArr(arr: string[], k: string): string[] {
    return arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k];
  }
  function addInterestedProcedure() {
    const v = interestedInput.trim();
    if (!v) return;
    if (interestedProcedures.includes(v)) {
      setInterestedInput("");
      return;
    }
    if (interestedProcedures.length >= 10) {
      setSkinStatus({
        type: "err",
        msg: "관심있는 시술은 최대 10개까지 추가할 수 있어요.",
      });
      return;
    }
    setInterestedProcedures([...interestedProcedures, v]);
    setInterestedInput("");
  }
  // 통합 저장: 사진 + 닉네임 + 자기소개 + 피부정보 + visibility 한 번에
  // v5.1 옵션 X: 활성 identity가 multi-identity면 profile_identities row에 저장.
  //   - 사진·이름·bio는 identity 별로 분리 (배스킨 사진 = 배스킨 identity row)
  //   - 피부정보·visibility·marketing은 profiles 공통 (개인 1명 1set)
  //   - readOnlyNameAndAvatar = true면 사진·이름 변경 무시 (원장 1차 계정 등)
  function saveAll() {
    setSkinStatus({ type: "idle" });
    startSkin(async () => {
      // 1) 피부 정보·visibility는 항상 profiles에 (개인 1명 단일 set)
      const profileUpdates: Record<string, unknown> = {
        face_shape: faceShape,
        skin_type: skinType,
        skin_concerns: skinConcerns,
        interested_procedures: interestedProcedures,
        field_visibility: visibility,
      };

      // 2) 사진·이름·bio — 활성 identity 따라 분기
      const trimmedName = displayName.trim();
      const nameChanged = trimmedName !== initial.displayName;
      const photoChanged = !!pendingAvatarUrl;
      const bioTrimmed = bio.trim() || null;

      if (nameChanged && !readOnlyNameAndAvatar) {
        if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 20) {
          setSkinStatus({
            type: "err",
            msg: "닉네임은 2~20자로 입력해주세요.",
          });
          return;
        }
      }

      // POLICY-1 잔여 정리 (2026-05-29): 옛 로컬 결정 `activeIdentityId ?? userId` →
      // 서버 (page.tsx + getIdentityContext SSOT) 가 결정한 props.targetProfileId 사용.
      // 읽기·쓰기 같은 명함 보장 (엇갈림 방지).
      if (!readOnlyNameAndAvatar) {
        if (photoChanged) profileUpdates.avatar_url = pendingAvatarUrl;
        if (nameChanged) profileUpdates.display_name = trimmedName;
      }
      profileUpdates.bio = bioTrimmed;

      const { error } = await sb
        .from("profiles")
        .update(profileUpdates)
        .eq("id", targetProfileId);
      if (error) {
        setSkinStatus({ type: "err", msg: error.message });
        return;
      }
      // Phase 6-NEW (migration 0106): 의사 멀티 계정 보유자의 묶음 내 NULL 컬럼에 propagate.
      // COALESCE 패턴이므로 다른 row 에 이미 값 있는 컬럼은 보존 — "이식 후 독립 수정" 보장.
      // avatar_url/display_name 은 RPC 가 복사하지 않음 (의사 row 사진/이름 보호).
      // 의사 멀티 계정 아니면 0 반환 — 무해. 실패는 silent.
      try {
        const { error: propErr } = await sb.rpc(
          "propagate_onboarding_to_doctor_bundle",
          { p_source_profile_id: targetProfileId },
        );
        if (propErr) {
          console.warn(
            "[profile-edit] propagate RPC failed:",
            propErr.message,
          );
        }
      } catch (e) {
        console.warn("[profile-edit] propagate RPC threw:", e);
      }
      setPendingAvatarUrl(null);
      setSkinStatus({ type: "idle" }); // 즉시저장 — 성공 무표시(실패만 표시)
      router.refresh();
    });
  }

  // 즉시 저장 — 선택·체크(얼굴형·피부타입·피부고민·관심시술·공개·사진)는 변경 시 디바운스 저장.
  //   텍스트(닉네임·자기소개)는 onBlur 에서 저장(입력 핸들러). 새 API 없음 — 기존 saveAll 재사용.
  const autosaveKey = JSON.stringify([
    faceShape,
    skinType,
    skinConcerns,
    interestedProcedures,
    visibility,
    pendingAvatarUrl,
  ]);
  const autosaveMounted = useRef(false);
  useEffect(() => {
    if (!autosaveMounted.current) {
      autosaveMounted.current = true;
      return;
    }
    const t = setTimeout(() => saveAll(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveKey]);

  // ── 선택 동의 (news / marketing) — 단일 공유 저장 경로 ──
  // F-2A (2026-06-04): news·marketing 둘 다 같은 active 명함 (targetProfileId) 에 저장하고,
  //   값 변경 시 해당 _at = now() 동시 기록 (3-state: 켜면 true+_at=now, 끄면 false+_at=now).
  //   기존 marketing 의 _at 누락도 이 헬퍼로 보강. 새 분기 만들지 않음 (동일 경로).
  const [marketing, setMarketing] = useState(initial.marketingConsent);
  const [news, setNews] = useState(initial.newsConsent);
  const [mktPending, startMkt] = useTransition();
  const [newsPending, startNews] = useTransition();

  function saveConsent(
    field: "marketing_email_consent" | "news_email_consent",
    atField: "marketing_email_consent_at" | "news_email_consent_at",
    next: boolean,
    setLocal: (v: boolean) => void,
    runTransition: (cb: () => void) => void,
  ) {
    setLocal(next);
    runTransition(async () => {
      const { error } = await sb
        .from("profiles")
        .update({ [field]: next, [atField]: new Date().toISOString() })
        .eq("id", targetProfileId);
      if (error) setLocal(!next); // 롤백
      router.refresh();
    });
  }

  // ── 로그아웃 / 탈퇴 ──
  // Phase 6-5 (2026-05-16): typed confirmation 강제 — "탈퇴에 동의합니다" 타이핑 일치 시만 진행
  const DELETE_CONFIRMATION_PHRASE = "탈퇴에 동의합니다";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  async function performDelete() {
    if (deleteConfirmInput.trim() !== DELETE_CONFIRMATION_PHRASE) return;
    setDeletePending(true);
    try {
      const r = await fetch("/api/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmInput.trim() }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as
          | { error?: string; message?: string }
          | Record<string, never>;
        // B-3 (2026-05-29 / P1-F): message (한글) 우선, error (kind enum) fallback.
        showToast(pickErrorMessage(j, r.status) || "탈퇴 실패", {
          tone: "danger",
        });
        return;
      }
      window.location.assign("/");
    } finally {
      setDeletePending(false);
      setDeleteOpen(false);
      setDeleteConfirmInput("");
    }
  }
  // 로그아웃은 본인 프로필 페이지(/{handle}) 하단의 LogoutButton으로 이동됨

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
      {/* 헤더 — 변경 즉시 저장(수동 저장 버튼 없음). 임베드(마이페이지 아코디언) 시 숨김. */}
      {!embedded && (
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-[var(--text)]">내 정보</h1>
        </div>
      )}

      {/* 1. 프로필 사진 — 큰 원, 사진 변경 / 사진 찍기.
          원장 1차 계정(readOnlyNameAndAvatar)은 사진 변경 비활성 — 관리자가 doctors 테이블에서 관리. */}
      <Card title="프로필 사진">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() =>
              !readOnlyNameAndAvatar && fileRef.current?.click()
            }
            disabled={uploading || readOnlyNameAndAvatar}
            className="relative h-32 w-32 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-soft)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-100 disabled:hover:opacity-100 sm:h-36 sm:w-36"
            aria-label={readOnlyNameAndAvatar ? "사진 변경 불가" : "프로필 사진 변경"}
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
          {readOnlyNameAndAvatar && (
            <p className="text-[12px] text-[var(--text-muted)]">
              원장님 공식 프로필 사진·이름은 관리자가 관리합니다
            </p>
          )}
          {!readOnlyNameAndAvatar && (
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
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFilePicked(f);
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
              if (f) onFilePicked(f);
              if (cameraRef.current) cameraRef.current.value = "";
            }}
          />

          {/* 인스타식 사진 자르기 — 드래그·확대로 위치 조정 후 정사각형 crop */}
          <ImageCropDialog
            src={cropSrc}
            open={cropOpen}
            onCancel={onCropCancel}
            onConfirm={onCropConfirm}
            outputSize={512}
          />
        </div>
      </Card>

      {/* 2. 기본 정보 (읽기 전용 — 닉네임 위) */}
      <Card title="기본 정보" subtitle="가입 시 입력 — 변경 불가">
        <dl className="space-y-1.5 text-[13px]">
          <Row label="이메일" value={currentEmail} />
          <Row label="간편로그인" value={providerLabel} />
          <Row label="나이·성별" value={ageGenderLabel} />
        </dl>
      </Card>

      {/* 3. 닉네임 */}
      <Card title="닉네임">
        <div className="flex items-stretch gap-1.5">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={saveAll}
            disabled={readOnlyNameAndAvatar}
            maxLength={20}
            className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none disabled:bg-[var(--bg-soft)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed"
          />
        </div>
      </Card>

      {/* 4. 자기소개 */}
      <SectionWithVisibility
        title="본인을 소개해주세요!"
        visField="bio"
        visibility={visibility}
        setVisibility={setVisibility}
      >
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          onBlur={saveAll}
          rows={3}
          maxLength={200}
          className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[14px] focus:border-[var(--primary)] focus:outline-none"
        />
        <p className="mt-1 text-right text-[11px] text-[var(--text-muted)]">
          {bio.length} / 200
        </p>
      </SectionWithVisibility>

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
        notifyOn={notifPrefs?.pref_keyword_skin_type ?? true}
        onToggleNotify={() => toggleNotif("pref_keyword_skin_type")}
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
        notifyOn={notifPrefs?.pref_keyword_concern ?? true}
        onToggleNotify={() => toggleNotif("pref_keyword_concern")}
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

      {/* 8. 관심있는 시술 (자유 입력) */}
      <SectionWithVisibility
        title="관심있는 시술이 있으세요?"
        visField="interested_procedures"
        visibility={visibility}
        setVisibility={setVisibility}
        subtitle="자유 입력 — Enter로 추가"
        notifyOn={notifPrefs?.pref_keyword_interest ?? true}
        onToggleNotify={() => toggleNotif("pref_keyword_interest")}
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          {interestedProcedures.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() =>
                setInterestedProcedures(interestedProcedures.filter((x) => x !== k))
              }
              style={{ backgroundColor: SELECTED, color: "#fff" }}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-medium opacity-90 hover:opacity-100"
            >
              {k} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={interestedInput}
            onChange={(e) => setInterestedInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addInterestedProcedure();
              }
            }}
            placeholder="예: 보톡스, 필러, 울쎄라, 써마지, 티타늄, 리쥬란 등"
            className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={addInterestedProcedure}
            className="h-9 rounded-md border border-[var(--border)] px-3 text-[12px] hover:bg-[var(--bg-soft)]"
          >
            추가
          </button>
        </div>
      </SectionWithVisibility>

      {/* 활동 알림 — 관심시술 바로 밑 별도 카드. 기본 접힘, 헤더 클릭 시 펼침. */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
        <button
          type="button"
          onClick={() => setActivityOpen((o) => !o)}
          aria-expanded={activityOpen}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <h3 className="text-sm font-bold text-[var(--text)]">🔔 활동 알림</h3>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            {notifSaving ? "저장 중…" : ""}
            <span aria-hidden className="text-[var(--text-muted)]">
              {activityOpen ? "▲" : "▼"}
            </span>
          </span>
        </button>
        {activityOpen && (
        <ul className="mt-3 divide-y divide-[var(--border)]/60">
          {ACTIVITY_ROWS.filter(
            (r) => r.visibleToUser || role === "doctor" || role === "admin",
          ).map((r) => {
            const value = notifPrefs ? notifPrefs[r.key] : true;
            return (
              <li key={r.key} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--text)]">
                    <span className="mr-1.5">{r.emoji}</span>
                    {r.label}
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{r.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={value}
                  disabled={!notifPrefs || notifSaving}
                  onClick={() => toggleNotif(r.key)}
                  className="relative shrink-0 rounded-full transition-colors"
                  style={{
                    width: 44,
                    height: 24,
                    backgroundColor: value ? "var(--primary)" : "var(--border)",
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute rounded-full bg-white ring-1 ring-black/10"
                    style={{
                      width: 20,
                      height: 20,
                      top: 2,
                      left: value ? 22 : 2,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1)",
                      transition: "left 200ms ease",
                    }}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        )}
      </div>

      {/* 선택 동의 (news / marketing) — 변경 즉시 저장 (값 + _at 기록) */}
      <div className="flex flex-col items-center gap-2 px-4 pt-2 text-[13px]">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={news}
            onChange={(e) =>
              saveConsent(
                "news_email_consent",
                "news_email_consent_at",
                e.target.checked,
                setNews,
                startNews,
              )
            }
            disabled={newsPending}
            style={{ accentColor: CHECK_ACCENT }}
            className="h-4 w-4"
          />
          <span className="text-[var(--text-secondary)]">
            새 Q&amp;A·콘텐츠 소식을 이메일로 받을게요
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) =>
              saveConsent(
                "marketing_email_consent",
                "marketing_email_consent_at",
                e.target.checked,
                setMarketing,
                startMkt,
              )
            }
            disabled={mktPending}
            style={{ accentColor: CHECK_ACCENT }}
            className="h-4 w-4"
          />
          <span className="text-[var(--text-secondary)]">
            혜택·이벤트 등 광고성 정보를 이메일로 받을게요
          </span>
        </label>
      </div>

      {/* 필수 동의 상태 (읽기 전용) — 동의 일시 + 버전 + 문서 링크. 철회는 탈퇴 경로. */}
      <div className="mx-4 mt-3 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3 text-[12px] text-[var(--text-muted)]">
        <ConsentStatusRow
          label="이용약관 동의"
          at={initial.termsAgreedAt}
          version={initial.termsAgreedVersion ?? TERMS_VERSION}
          href="/terms"
        />
        <ConsentStatusRow
          label="개인정보 수집·이용 동의"
          at={initial.privacyAgreedAt}
          version={initial.privacyAgreedVersion ?? PRIVACY_VERSION}
          href="/privacy"
        />
      </div>

      {/* 변경 즉시 저장 — 저장 버튼 없음. 실패 시에만 에러 표시. */}
      <Msg status={skinStatus} />

      {/* 회원 탈퇴 footer — 로그아웃은 본인 프로필 페이지(/{handle}) 하단으로 이동됨 */}
      <div className="mt-10 border-t border-[var(--border)] pt-6">
        <div className="flex items-center justify-end gap-3 text-[12px] text-[var(--text-muted)]">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="hover:text-red-700 hover:underline"
          >
            회원 탈퇴
          </button>
        </div>
      </div>

      {/* Phase 6-5: typed confirmation — 의도치 않은 탈퇴 / CSRF 방어 */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius)] bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text)]">
              정말 탈퇴할까요?
            </h3>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-[1.6] text-[var(--text-secondary)]">
              {`회원 탈퇴 시 계정이 영구 삭제되며, 작성한 글·댓글·좋아요·저장 등 모든 활동 기록이 함께 사라집니다.\n\n이 작업은 되돌릴 수 없어요.`}
            </p>
            <p className="mt-3 text-[12.5px] leading-[1.55] text-[var(--text)]">
              계속하시려면 아래 칸에{" "}
              <strong className="text-[var(--accent)]">
                {DELETE_CONFIRMATION_PHRASE}
              </strong>{" "}
              라고 정확히 입력해주세요.
            </p>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={DELETE_CONFIRMATION_PHRASE}
              autoFocus
              className="mt-2 h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-[13px] focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirmInput("");
                }}
                disabled={deletePending}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={performDelete}
                disabled={
                  deletePending ||
                  deleteConfirmInput.trim() !== DELETE_CONFIRMATION_PHRASE
                }
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deletePending ? "탈퇴 처리 중…" : "탈퇴"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  notifyOn,
  onToggleNotify,
  children,
}: {
  title: string;
  subtitle?: string;
  visField: keyof FieldVisibility;
  visibility: FieldVisibility;
  setVisibility: (v: FieldVisibility) => void;
  /** 관심 Q&A 알림 토글 — 제공 시 '공개' 옆에 '알림' 체크박스(동일 형식) 노출. */
  notifyOn?: boolean;
  onToggleNotify?: () => void;
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
        {/* 순서: [알림][공개] — 공개를 항상 우측 끝 고정(알림 없는 섹션과 세로 정렬). */}
        <div className="flex shrink-0 items-center gap-2.5">
          {onToggleNotify && (
            <label className="flex shrink-0 items-center gap-1 text-[11.5px] text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={!!notifyOn}
                onChange={onToggleNotify}
                style={{ accentColor: CHECK_ACCENT }}
                className="h-3.5 w-3.5"
              />
              알림
            </label>
          )}
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

/** ISO timestamp → "2026년 6월 4일". 값 없으면 빈 문자열. */
function formatConsentDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 필수 동의 1줄 — 라벨 + 동의 일시 + 버전 + 문서 링크 (읽기 전용). */
function ConsentStatusRow({
  label,
  at,
  version,
  href,
}: {
  label: string;
  at: string | null;
  version: string;
  href: string;
}) {
  const dateStr = formatConsentDate(at);
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 py-0.5">
      <span className="text-[var(--text-secondary)]">{label}</span>
      {dateStr && <span>· {dateStr} 동의</span>}
      <span>· v{version}</span>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--primary)] underline hover:text-[var(--primary-dark)]"
      >
        문서 보기
      </Link>
    </div>
  );
}
