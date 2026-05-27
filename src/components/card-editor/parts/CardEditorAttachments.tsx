"use client";

/**
 * CardEditorAttachments — CardEditor 첨부 영역 (P2-2, 2026-05-27 분리).
 *
 * 담당 UI:
 *   - 외부 링크 (ExternalLinkField) — qa 영상 URL + 시작시각 / link 외부 콘텐츠 큐레이션
 *   - 영상 시작 시각 + oEmbed 제목 가져오기 (qa + admin 모드만)
 *   - PubMed 참고문헌 (PubmedRefsField, qa 카테고리만)
 *   - link 카테고리 첫 댓글 (create 모드, link 카테고리만)
 *
 * Presentational only — 모든 setter 와 비동기 호출(oEmbed/AutoFill)은 부모에서 전달.
 */

import PubmedRefsField, {
  type PubmedRefObj,
} from "@/components/card-editor/fields/PubmedRefsField";
import ExternalLinkField, {
  type ExternalMeta,
} from "@/components/card-editor/fields/ExternalLinkField";

/**
 * 첨부 영역은 본문 위(external+start) / 본문 아래(refs+first-comment) 두 위치에 등장.
 * 같은 컴포넌트를 위치별로 호출하되 어떤 섹션을 그릴지 명시적으로 지정.
 *  - "external"  → 외부 링크 + 영상 시작 시각 (본문 위)
 *  - "post-body" → PubMed 참고문헌 + link 첫 댓글 (본문 아래)
 */
export type AttachmentsRenderSection = "external" | "post-body";

export type CardEditorAttachmentsProps = {
  mode: "create" | "edit";
  pending: boolean;
  onError: (msg: string | null) => void;
  renderSection: AttachmentsRenderSection;

  // ── 외부 링크 ─────────────────────────────────────────────
  showExternal: boolean;
  isQa: boolean;
  isLink: boolean;
  externalUrl: string;
  onChangeExternalUrl: (v: string) => void;
  externalMeta: ExternalMeta | null;
  onChangeExternalMeta: (v: ExternalMeta | null) => void;
  bodyMax: number;
  /** ExternalLinkField 의 onAutoFill — create + link 시에만 의미. 부모가 title/body/keywords 일괄 set. */
  onAutoFill?: (data: {
    title: string;
    body: string;
    keywords: string[];
  }) => void;

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

  // ── link 첫 댓글 (create + link) ─────────────────────────
  firstComment: string;
  onChangeFirstComment: (v: string) => void;
};

export default function CardEditorAttachments({
  mode,
  pending,
  onError,
  renderSection,
  showExternal,
  isQa,
  isLink,
  externalUrl,
  onChangeExternalUrl,
  externalMeta,
  onChangeExternalMeta,
  bodyMax,
  onAutoFill,
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
  firstComment,
  onChangeFirstComment,
}: CardEditorAttachmentsProps) {
  const isExternalSection = renderSection === "external";
  const isPostBodySection = renderSection === "post-body";
  return (
    <>
      {/* 외부 링크 */}
      {isExternalSection && showExternal && (
        <ExternalLinkField
          url={externalUrl}
          onUrlChange={onChangeExternalUrl}
          meta={externalMeta}
          onMetaChange={onChangeExternalMeta}
          mode={isQa ? "qa" : "link"}
          bodyMax={bodyMax}
          onError={onError}
          disabled={pending}
          onAutoFill={mode === "create" && isLink ? onAutoFill : undefined}
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

      {/* link 카테고리 — 첫 댓글 */}
      {isPostBodySection && mode === "create" && isLink && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--text)]">
            내 코멘트 (선택)
          </label>
          <textarea
            value={firstComment}
            onChange={(e) => onChangeFirstComment(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={pending}
            className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-sm focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
            placeholder="공유하면서 한마디 — 글 발행 시 첫 댓글로 등록됩니다."
          />
        </div>
      )}
    </>
  );
}
