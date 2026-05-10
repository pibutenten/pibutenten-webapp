"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  GENDERS,
  FACE_SHAPES,
  SKIN_TYPES,
  SKIN_CONCERNS,
  PROCEDURES,
  DEFAULT_VISIBILITY,
  type FieldVisibility,
} from "@/lib/profile-options";

type Initial = {
  displayName: string;
  marketingConsent: boolean;
  birthdate: string; // YYYY-MM-DD or ''
  gender: "male" | "female" | "other" | null;
  faceShape: string | null;
  skinType: string | null;
  skinConcerns: string[];
  interestedProcedures: string[];
  likedProcedures: string[];
  bio: string;
  fieldVisibility: FieldVisibility;
};

type Props = {
  userId: string;
  currentEmail: string;
  initial: Initial;
};

type Status =
  | { type: "idle" }
  | { type: "ok"; msg: string }
  | { type: "err"; msg: string };

/**
 * 통합 프로필 편집 페이지 — 닉네임 + 피부 정보 + 자기소개 + 마케팅 + 로그아웃·탈퇴.
 *
 * 항목별 [공개] 체크박스 (default 모두 공개).
 * '받아보고 좋았던 시술'은 자유 입력 태그 (Enter로 추가).
 *
 * id 변경·이메일 변경·비밀번호 변경은 v4에서 제거 — 가입 흐름에서만.
 * 프로필 사진 + 아바타는 별도 진입 (/onboarding)에서 (다음 phase에서 통합 예정).
 */
export default function ProfileEditClient({
  userId,
  currentEmail,
  initial,
}: Props) {
  const router = useRouter();
  const sb = createSupabaseBrowserClient();

  // ── 닉네임 (별도 저장) ──
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

  // ── 피부 정보 (한 번에 저장) ──
  const [birthdate, setBirthdate] = useState(initial.birthdate);
  const [gender, setGender] = useState<Initial["gender"]>(initial.gender);
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
        msg: "받아보고 좋았던 시술은 최대 10개까지 추가할 수 있어요.",
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
          birthdate: birthdate || null,
          gender,
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

  // ── 회원 탈퇴 / 로그아웃 ──
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

  // ── 생년월일 분리 (YYYY/MM/DD) ──
  const dateParts = birthdate.split("-");
  const yyyy = dateParts[0] ?? "";
  const mm = dateParts[1] ?? "";
  const dd = dateParts[2] ?? "";
  function setDate(y: string, m: string, d: string) {
    if (y && m && d) {
      setBirthdate(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    } else {
      setBirthdate("");
    }
  }
  const years: number[] = [];
  for (let y = new Date().getFullYear(); y >= 1940; y--) years.push(y);

  return (
    <div className="space-y-5">
      {/* 닉네임 */}
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

      {/* 기본 정보 — 생년월일·성별 */}
      <SectionWithVisibility
        title="기본 정보"
        visField="birthdate"
        visibility={visibility}
        setVisibility={setVisibility}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-muted)]">
              생년월일
            </label>
            <div className="flex gap-1">
              <select
                value={yyyy}
                onChange={(e) => setDate(e.target.value, mm, dd)}
                className={selectClass}
              >
                <option value="">년</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
              <select
                value={mm}
                onChange={(e) => setDate(yyyy, e.target.value, dd)}
                className={selectClass}
              >
                <option value="">월</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m).padStart(2, "0")}>
                    {m}월
                  </option>
                ))}
              </select>
              <select
                value={dd}
                onChange={(e) => setDate(yyyy, mm, e.target.value)}
                className={selectClass}
              >
                <option value="">일</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d).padStart(2, "0")}>
                    {d}일
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-muted)]">
              성별
            </label>
            <div className="flex gap-1.5">
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
      </SectionWithVisibility>

      {/* 얼굴형 */}
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

      {/* 피부타입 */}
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

      {/* 피부고민 (복수) */}
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

      {/* 관심시술 (복수) */}
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

      {/* 받아보고 좋았던 시술 (자유 입력 태그) */}
      <SectionWithVisibility
        title="받아보고 좋았던 시술"
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
              className="inline-flex items-center gap-1 rounded-full border border-[#9CA3AF] bg-[#F3F4F6] px-2.5 py-0.5 text-[12px] font-medium text-[var(--text)] hover:bg-[#E5E7EB]"
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
            placeholder="예: 울쎄라, 비타민 IV 등"
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

      {/* 자기소개 */}
      <SectionWithVisibility
        title="본인을 소개한다면?"
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

      {/* 피부 정보 일괄 저장 */}
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
            className="h-4 w-4"
          />
          <span className="text-[var(--text-secondary)]">
            새 글·이벤트 등의 안내를 이메일로 받을게요{" "}
            <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">
              (현재 이메일: {currentEmail})
            </span>
          </span>
        </label>
      </Card>

      {/* 로그아웃 + 회원탈퇴 — footer 작게 */}
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

const selectClass =
  "h-9 flex-1 min-w-0 rounded-md border border-[var(--border)] bg-white px-2 text-[13px] focus:border-[var(--primary)] focus:outline-none";

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
      className={
        "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors " +
        (active
          ? "bg-[#6B7280] text-white"
          : "bg-[var(--bg-soft)] text-[var(--text-secondary)] hover:bg-[#E5E7EB] hover:text-[var(--text)]")
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
