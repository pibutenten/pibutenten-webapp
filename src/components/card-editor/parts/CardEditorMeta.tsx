"use client";

/**
 * CardEditorMeta — CardEditor 메타데이터 영역 (P2-2, 2026-05-27 분리).
 *
 * 담당 UI:
 *   - 카테고리 picker (role 별 옵션 chip, edit 시 변경 불가 분기)
 *   - admin extras (edit 모드 admin) — 글쓴이 + Pick 토글
 *   - create 모드 admin — 글쓴이 dropdown (의사 9명 + 본인 명의)
 *
 * Presentational only — state 없음, 모든 데이터/콜백 부모(`CardEditor`)에서 전달.
 */

import type {
  AdminExtras,
  AuthorOption,
  CardEditorInitial,
  DoctorOption,
} from "../CardEditor";
import type { PostCategory, PostCategorySlug } from "@/lib/post-category";

export type CardEditorMetaProps = {
  mode: "create" | "edit";
  viewerRole: "admin" | "doctor" | "user";
  initialCard: CardEditorInitial | undefined;
  pending: boolean;

  // ── 카테고리 ─────────────────────────────────────────────────
  category: PostCategorySlug | null;
  availableCategories: PostCategory[];
  initialChangeable: boolean;
  onChangeCategory: (next: PostCategorySlug) => void;

  // ── admin extras (edit 모드) ─────────────────────────────────
  isAdminMode: boolean;
  adminExtras: AdminExtras | undefined;
  authorProfileId: string | null;
  onChangeAuthorProfileId: (v: string | null) => void;
  isPick: boolean;
  onChangeIsPick: (v: boolean) => void;
  adminPickCount: number;

  // ── create 모드 admin — 글쓴이 dropdown ─────────────────────
  createAuthorOptions: DoctorOption[] | undefined;
  createAuthorSlug: string;
  onChangeCreateAuthorSlug: (v: string) => void;
};

export default function CardEditorMeta({
  mode,
  viewerRole,
  initialCard,
  pending,
  category,
  availableCategories,
  initialChangeable,
  onChangeCategory,
  isAdminMode,
  adminExtras,
  authorProfileId,
  onChangeAuthorProfileId,
  isPick,
  onChangeIsPick,
  adminPickCount,
  createAuthorOptions,
  createAuthorSlug,
  onChangeCreateAuthorSlug,
}: CardEditorMetaProps) {
  return (
    <>
      {/* 카테고리 picker — 라벨 옆에 chip 인라인 배치 (2026-05-22) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="text-sm font-semibold text-[var(--text)]">
          카테고리
        </label>
        {mode === "create" ||
        (initialChangeable && availableCategories.length > 1) ? (
          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map((c) => {
              const active = category === c.slug;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => onChangeCategory(c.slug)}
                  disabled={pending}
                  className={
                    "h-7 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50 " +
                    (active
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary-light)] hover:text-[var(--text)]")
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 items-center rounded-full bg-[var(--bg-soft)] px-3 text-xs font-medium text-[var(--text)]">
              {category ?? initialCard?.type ?? "post"}
            </span>
            {!initialChangeable && (
              <span className="text-[11px] text-[var(--text-muted)]">
                (이 카테고리는 본인 권한으로 변경 불가)
              </span>
            )}
          </div>
        )}
      </div>

      {/* admin extras — 글쓴이 + (의사 글일 때만) Pick (edit 모드 admin) */}
      {isAdminMode && adminExtras && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 글쓴이 — 항상 표시 (변경 가능 시 dropdown, 아니면 readonly) */}
          <div className={adminExtras.isDoctorAuthored ? "" : "sm:col-span-2"}>
            <label className="mb-1 block text-xs font-semibold text-[var(--text)]">
              글쓴이
            </label>
            {adminExtras.canChangeAuthor && adminExtras.authorOptions ? (
              <select
                value={authorProfileId ?? ""}
                onChange={(e) =>
                  onChangeAuthorProfileId(e.target.value || null)
                }
                disabled={pending}
                className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-sm disabled:opacity-50"
              >
                {adminExtras.authorOptions.map((a: AuthorOption) => (
                  <option key={a.profileId} value={a.profileId}>
                    {a.displayName ?? a.handle ?? "이름 없음"}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                {adminExtras.currentAuthorDisplay || "— 알 수 없음 —"}
              </div>
            )}
          </div>

          {/* Pick 토글 — 의사 글일 때만 노출 (회원 글 = Pick 없음).
              admin OR self-doctor 권한 (0151) */}
          {adminExtras.isDoctorAuthored && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text)]">
                Pick (원장님 추천)
              </label>
              <label className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                <input
                  type="checkbox"
                  checked={isPick}
                  onChange={(e) => onChangeIsPick(e.target.checked)}
                  disabled={
                    pending || !(adminExtras.canTogglePick ?? true)
                  }
                  className="h-4 w-4"
                />
                <span>추천</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {adminPickCount} / 5
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* create 모드 admin — 글쓴이 선택 (의사 9명 + 본인 명의) */}
      {mode === "create" &&
        viewerRole === "admin" &&
        createAuthorOptions &&
        createAuthorOptions.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text)]">
              글쓴이
            </label>
            <select
              value={createAuthorSlug}
              onChange={(e) => onChangeCreateAuthorSlug(e.target.value)}
              disabled={pending}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-sm disabled:opacity-50"
            >
              <option value="">— 본인 (관리자) 명의 —</option>
              {createAuthorOptions.map((d) => (
                <option key={d.id} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
    </>
  );
}
