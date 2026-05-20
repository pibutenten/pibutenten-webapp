"use client";

/**
 * 카드 헤더 — 배지 + 작성자 행 + kebab 메뉴 (Phase 4-6 추출).
 *
 * 영역:
 *  1) 상단 우측 배지 (NEW / HOT / Pick) — 카드 상단에 매달리는 딱지
 *  2) 우상단 ⋮ 메뉴 (canEdit일 때만) — 수정 / 삭제
 *  3) 작성자 행 — 아바타 + 이름 + 직함 + 카테고리·날짜
 *
 * 작성자 행 클릭:
 *  - 의사 + credential 노출 → /doctors/{slug}
 *  - 회원 (handle 있음)     → /{handle}
 *  - 회원 (handle 없음)     → /u/{id} (legacy)
 *  - author 없음            → disabled
 */
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { CardData } from "@/components/Card";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import { labelForCategory } from "@/lib/post-category";
import { absoluteDateTimeLabel } from "@/components/card/utils/card-render";
import RelativeTime from "@/components/RelativeTime";

type Props = {
  card: CardData;
  isHot: boolean;
  isNew: boolean;
  isPick: boolean;
  canEdit: boolean;
  /** 수정 href — 있으면 메뉴에 '수정' 노출. */
  editHref: string | null;
  /** 삭제 메뉴 클릭 — 호출자가 ConfirmDialog 등을 띄움. */
  onDeleteClick: () => void;
};

export default function CardHeader({
  card,
  isHot,
  isNew,
  isPick,
  canEdit,
  editHref,
  onDeleteClick,
}: Props) {
  const router = useRouter();
  const doctor = card.doctor;
  const theme = doctor ? getDoctorTheme(doctor.slug) : null;
  const photo = doctor ? getDoctorPhoto(doctor.slug) : null;

  // hide_doctor_credential — 의사가 카테고리·토글로 직함 숨긴 경우 (Phase A.2)
  const credentialHidden = Boolean(card.hide_doctor_credential);
  const showAsDoctor = !!doctor && !credentialHidden;
  // Phase 6-7 (2026-05-16): 탈퇴 sentinel 처리 — handle === 'deleted-user' 또는 id === well-known UUID
  //   일 때 프로필 페이지 이동 비활성, 직함 표시 비활성.
  const isDeletedUser =
    card.author?.handle === "deleted-user" ||
    card.author?.id === "00000000-0000-0000-0000-000000000000";
  const authorName = doctor?.name ?? card.author?.display_name ?? "익명";

  // 회원 아바타에는 cache buster (profile.updated_at) 부착 — 사진 변경 즉시 반영
  const rawAvatar = doctor ? photo : card.author?.avatar_url ?? null;
  const authorAvatar = (() => {
    if (!rawAvatar) return null;
    if (doctor) return rawAvatar; // 정적 의사 사진은 그대로
    const ts = card.author?.updated_at;
    if (!ts) return rawAvatar;
    const stamp = new Date(ts).getTime();
    return rawAvatar + (rawAvatar.includes("?") ? "&" : "?") + "v=" + stamp;
  })();

  // Card 아바타용 offset (avatarOffsetX/Y 우선, 없으면 offsetX/Y * 0.46)
  const avatarTx =
    theme?.avatarOffsetX ?? (theme?.offsetX ?? 0) * 0.46;
  const avatarTy =
    theme?.avatarOffsetY ?? (theme?.offsetY ?? 0) * 0.46;

  const hasDate = !!card.created_at;
  const dateAbsolute = card.created_at
    ? absoluteDateTimeLabel(card.created_at)
    : null;
  const dateIso = card.created_at ?? undefined;

  // ── 메뉴 ──
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  const onAuthorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 탈퇴 sentinel — 프로필 페이지 없음, 클릭 무시
    if (isDeletedUser) return;
    if (showAsDoctor && doctor?.slug) {
      router.push(`/doctors/${doctor.slug}`);
    } else if (card.author?.handle) {
      router.push(`/${card.author.handle}`);
    } else if (card.author?.id) {
      router.push(`/u/${card.author.id}`);
    }
  };

  return (
    <>
      {/* 배지 — 카드 상단 안쪽에서 매달려 내려오는 딱지 */}
      {(isPick || isHot || isNew) && (
        <div className="pointer-events-none absolute right-4 top-0 z-10 flex gap-1">
          {isNew && (
            <span
              className="inline-flex items-center rounded-b-md px-2 pt-0.5 pb-1 text-[10px] font-bold leading-none tracking-wider text-white"
              style={{ backgroundColor: "#81C784" }}
            >
              NEW
            </span>
          )}
          {isHot && (
            <span
              className="inline-flex items-center rounded-b-md px-2 pt-0.5 pb-1 text-[10px] font-bold leading-none tracking-wider text-white"
              style={{ backgroundColor: "#F48FB1" }}
            >
              HOT
            </span>
          )}
          {isPick && (
            <span
              className="inline-flex items-center rounded-b-md px-2 pt-0.5 pb-1 text-[10px] font-bold leading-none tracking-wider text-white"
              style={{ backgroundColor: "#7DB7DA" }}
            >
              Pick
            </span>
          )}
        </div>
      )}

      {/* 작성자 row + 우상단 kebab (수정/삭제) — 본인/관리자만 노출 */}
      {canEdit && (
        <div ref={menuRef} className="absolute right-3 top-7 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"
            aria-label="더보기"
            title="더보기"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-[22px] w-[22px]"
              aria-hidden
            >
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-28 overflow-hidden rounded-md border border-[var(--border)] bg-white py-1 shadow-lg">
              {editHref && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push(editHref);
                  }}
                  className="block w-full cursor-pointer px-3 py-1.5 text-left text-[13px] text-[var(--text)] hover:bg-[var(--bg-soft)]"
                >
                  수정
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteClick();
                }}
                className="block w-full cursor-pointer px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          )}
        </div>
      )}

      {/* 1. 작성자 행 — 가장 위 (원장이면 원장 페이지, 일반 사용자면 /u/[id] 로 이동) */}
      <button
        type="button"
        onClick={onAuthorClick}
        disabled={isDeletedUser || (!showAsDoctor && !card.author?.id)}
        className={
          "mb-3 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-md py-1.5 px-1 text-left transition-colors " +
          (!isDeletedUser && (showAsDoctor || card.author?.id)
            ? "cursor-pointer hover:bg-[var(--primary-soft)]"
            : "cursor-default")
        }
        aria-label={
          showAsDoctor
            ? `${authorName} 원장님 소개로 이동`
            : `${authorName} 프로필로 이동`
        }
      >
        <div
          className="relative shrink-0 overflow-hidden rounded-full"
          style={{
            background: showAsDoctor
              ? theme?.bg ?? "var(--bg-soft)"
              : "var(--bg-soft)",
            boxShadow: showAsDoctor
              ? `inset 0 0 0 2px ${theme?.bgSoft ?? "var(--bg-soft)"}`
              : undefined,
            height: 36,
            width: 36,
          }}
        >
          {authorAvatar ? (
            <Image
              src={authorAvatar}
              alt={authorName}
              fill
              // 표시 컨테이너는 36px 기본이지만 일부 레이아웃에서 42px까지 확대됨.
              // DPR 2x를 고려해 srcSet에서 한 단계 큰 사이즈를 선택하도록 여유 보정.
              sizes="48px"
              className="object-cover"
              unoptimized={!doctor}
              style={
                showAsDoctor
                  ? {
                      objectPosition: "50% 12%",
                      transform: `translate(${avatarTx}px, ${avatarTy}px) scale(1.18)`,
                      transformOrigin: "50% 30%",
                    }
                  : { objectPosition: "50% 50%" }
              }
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-base text-[var(--text-muted)]">
              👤
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {/* 1줄: 이름 + 피부과 전문의 — 글자 살짝만 키워서 아바타와 높이 균형 */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 leading-[1.2]">
            <span className="text-[13.5px] font-bold leading-[1.2] text-[var(--text)]">
              {authorName}
            </span>
            {showAsDoctor && (
              <span
                className="inline-flex items-center gap-1 text-[11.5px] font-medium leading-[1.2]"
                style={{ color: "#5BB0D1" }}
              >
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  className="h-[12px] w-[12px]"
                  aria-hidden
                >
                  <path
                    d="M6 0L7.6025 1.30939L9.7082 1.1459L10.1954 3.10104L12 4.1459L11.1858 6L12 7.8541L10.1954 8.89896L9.7082 10.8541L7.6025 10.6906L6 12L4.3975 10.6906L2.2918 10.8541L1.80459 8.89896L0 7.8541L0.814188 6L0 4.1459L1.80459 3.10104L2.2918 1.1459L4.3975 1.30939L6 0Z"
                    fill="#4CBFF2"
                  />
                  <path
                    d="M8.56567 4.79451L5.50235 7.85783L3.43457 5.79005L4.08693 5.1373L5.50235 6.55232L7.91292 4.14215L8.56567 4.79451Z"
                    fill="#FFFFFF"
                  />
                </svg>
                피부과 전문의
              </span>
            )}
          </div>
          {/* 2줄: 카테고리 · 날짜 — 모든 글 동일 (의사·회원·관리자 다 동일).
              옛 영상 topic 표시는 v4에서 제거 (카테고리로 통일). */}
          {(() => {
            const catLabel = labelForCategory(card.category);
            if (!catLabel && !hasDate) return null;
            return (
              <div className="mt-[5px] truncate text-[11.5px] leading-[1.2] text-[var(--text-muted)]">
                {catLabel}
                {hasDate && card.created_at && (
                  <>
                    {catLabel ? " · " : ""}
                    <time
                      dateTime={dateIso}
                      title={dateAbsolute ?? undefined}
                    >
                      <RelativeTime iso={card.created_at} />
                    </time>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </button>
    </>
  );
}
