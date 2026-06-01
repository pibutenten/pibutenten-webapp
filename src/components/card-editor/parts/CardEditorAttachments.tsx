"use client";

/**
 * CardEditorAttachments — CardEditor 첨부 영역 (P2-2, 2026-05-27 분리).
 *
 * 담당 UI:
 *   - 외부 링크 (ExternalLinkField) — qa 영상 URL + 시작시각
 *   - 영상 시작 시각 + oEmbed 제목 가져오기 (qa + admin 모드만)
 *   - PubMed 참고문헌 (PubmedRefsField, qa 카테고리만)
 *
 * (폐지) link 카테고리 외부 콘텐츠 큐레이션 + 첫 댓글 — link 카테고리 제거(2026-06-01)와 함께 삭제.
 *
 * Presentational only — 모든 setter 와 비동기 호출(oEmbed)은 부모에서 전달.
 */

import PubmedRefsField, {
  type PubmedRefObj,
} from "@/components/card-editor/fields/PubmedRefsField";
import ExternalLinkField, {
  type ExternalMeta,
} from "@/components/card-editor/fields/ExternalLinkField";

/**
 * 첨부 영역은 본문 위(external+start) / 본문 아래(refs) 두 위치에 등장.
 * 같은 컴포넌트를 위치별로 호출하되 어떤 섹션을 그릴지 명시적으로 지정.
 *  - "external"  → 외부 링크 + 영상 시작 시각 (본문 위)
 *  - "post-body" → PubMed 참고문헌 (본문 아래)
 */
export type AttachmentsRenderSection = "external" | "post-body";

export type CardEditorAttachmentsProps = {
  pending: boolean;
  onError: (msg: string | null) => void;
  renderSection: AttachmentsRenderSection;

  // ── 외부 링크 ─────────────────────────────────────────────
  showExternal: boolean;
  externalUrl: string;
  onChangeExternalUrl: (v: string) => void;
  externalMeta: ExternalMeta | null;
  onChangeExternalMeta: (v: ExternalMeta | null) => void;

  // ── 영상 시작 시각 + oEmbed (admin + qa) ───────────────────
  isAdminMode: boolean;
  showStartTime: boolean;
  startInput: string;
  onChangeStartInput: (v: string) => void;
  onCommitStartInput: () => void;
  onFetchOembedTitle: () => Promise<void> | void;
  oembedLoading: boolean;

  // ── PubMed refs (qa) ─────────────────────────────────────
  showRefs: boolean;
  references: string[];
  refsMeta: (PubmedRefObj | null)[];
  onChangeRefs: (v: string[], m: (PubmedRefObj | null)[]) => void;
};

export default function CardEditorAttachments({
  pending,
  onError,
  renderSection,
  showExternal,
  externalUrl,
  onChangeExternalUrl,
  externalMeta,
  onChangeExternalMeta,
  isAdminMode,
  showStartTime,
  startInput,
  onChangeStartInput,
  onCommitStartInput,
  onFetchOembedTitle,
  oembedLoading,
  showRefs,
  references,
  refsMeta,
  onChangeRefs,
}: CardEditorAttachmentsProps) {
  const isExternalSection = renderSection === "external";
  const isPostBodySection = renderSection === "post-body";
  return (
    <>
      {/* 외부 링크 — qa 영상 URL + 시작시각 */}
      {isExternalSection && showExternal && (
        <ExternalLinkField
          url={externalUrl}
          onUrlChange={onChangeExternalUrl}
          meta={externalMeta}
          onMetaChange={onChangeExternalMeta}
          mode="qa"
          onError={onError}
          disabled={pending}
        />
      )}

      {/* 영상 시작 시각 + oEmbed 제목 가져오기 (qa + admin 모드만) */}
      {isExternalSection && isAdminMode && showStartTime && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text)]">
              시작 시각 (MM:SS)
            </label>
            <input
              type="text"
              value={startInput}
              onChange={(e) => onChangeStartInput(e.target.value)}
              onBlur={onCommitStartInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCommitStartInput();
                }
              }}
              disabled={pending}
              placeholder="00:00"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-sm disabled:opacity-50"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => onFetchOembedTitle()}
              disabled={pending || oembedLoading || !externalUrl}
              className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
            >
              {oembedLoading ? "조회 중…" : "↻ 제목 가져오기"}
            </button>
          </div>
        </div>
      )}

      {/* Q&A 참고문헌 */}
      {isPostBodySection && showRefs && (
        <PubmedRefsField
          value={references}
          meta={refsMeta}
          onChange={onChangeRefs}
          onError={onError}
          disabled={pending}
        />
      )}
    </>
  );
}
