"use client";

/**
 * CardEditor — 카드 작성·수정 통합 컴포넌트 (Phase 4, 260518).
 *
 * 세 라우트(`/write` · `/write/[shortcode]` · `/admin/cards/[id]/edit`) 가 본 컴포넌트
 * 의 wrapper 가 되어 통합. mode·adminMode·viewerRole 로 분기. 공통 필드는 본 컴포넌트
 * 가, admin 전용 필드(status·is_pick·video_id·meta JSON 등) 는 admin wrapper 가
 * AdminCardExtras 로 처리.
 *
 * 사용처별 mode:
 *   /write                    → mode='create' (POST /api/articles)
 *   /write/[shortcode]        → mode='edit'   (PUT  /api/articles/[id])
 *   /admin/cards/[id]/edit    → mode='edit'   + adminMode 추가 액션은 wrapper 에서
 *
 * 본 컴포넌트가 책임지는 영역:
 *   - 카테고리 picker (role 별 옵션 필터)
 *   - 제목 / 본문 (Q&A 면 MarkdownBoldEditor + 형광펜, 그 외 textarea)
 *   - 외부 링크 (ExternalLinkField — 새소식 [채우기] · Q&A 영상 미리보기 + 시작시간)
 *   - PubMed 참고문헌 (PubmedRefsField — 등록 chip 클릭 시 PubMed 새 탭)
 *   - 태그 (KeywordsEditor)
 *   - 액션 버튼: create→{초기화·저장·올리기}, edit→{취소·저장}
 *
 * 본 컴포넌트가 책임지지 않는 (wrapper 가 다루는) 영역:
 *   - doctor 선택 (admin 만 — 작성 시 누구 명의로 발행할지). wrapper 가 props.doctorSlug
 *     관리해서 onSubmit 에 포함시켜 전달.
 *   - admin 전용 status·is_pick·video_id·meta JSON·검수 큐 액션
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeAnswerBody } from "@/lib/normalize-body";
import { pickHighlight } from "@/lib/card-highlight";
import MarkdownBoldEditor from "@/components/MarkdownBoldEditor";
import KeywordsEditor from "@/components/card-editor/KeywordsEditor";
import {
  categoriesForRole,
  isPostCategorySlug,
  type PostCategorySlug,
} from "@/lib/post-category";
import PubmedRefsField, {
  appendReferencesToBody,
  pubmedRefObjToString,
  splitBodyAndReferences,
  type PubmedRefObj,
} from "@/components/card-editor/fields/PubmedRefsField";
import ExternalLinkField, {
  type ExternalMeta,
} from "@/components/card-editor/fields/ExternalLinkField";

export type CardEditorInitial = {
  cardId: number;
  type: "qa" | "post";
  category: PostCategorySlug | null;
  title: string;
  body: string;
  keywords: string[];
  externalUrl: string;
  externalMeta: ExternalMeta | null;
  pubmedRefs: NonNullable<PubmedRefObj>[];
};

type SaveResult = { ok: true; cardId: number } | { ok: false; error: string };

type Props = {
  mode: "create" | "edit";
  viewerRole: "admin" | "doctor" | "user";

  /** create 모드: 진입 시 카테고리 (URL ?category=) 폴백 */
  initialCategory?: PostCategorySlug;
  /** edit 모드: 카드 prefill */
  initialCard?: CardEditorInitial;

  /**
   * 저장 콜백 — wrapper 가 정의. 본 컴포넌트는 payload 만 만들고 호출.
   *   - create wrapper 는 POST /api/articles + 추가 필드 (doctor_slug, status, first_comment) 처리
   *   - edit wrapper 는 PUT /api/articles/[id]
   *   - admin wrapper 는 supabase 직접 + admin 전용 필드 처리
   * 반환값: { ok, cardId } / { ok: false, error }
   */
  onSubmit: (payload: CardEditorPayload, action: SubmitAction) => Promise<SaveResult>;

  /** edit 모드 — 취소·저장 후 돌아갈 URL */
  returnUrl?: string;

  /**
   * adminMode 면 본 컴포넌트의 카테고리 변경 검증 우회 (모든 카테고리 선택 가능).
   * admin wrapper 가 추가 필드 외장.
   */
  adminMode?: boolean;
};

export type CardEditorPayload = {
  category: PostCategorySlug | null;
  type: "qa" | "post";
  title: string;
  body: string; // 참고문헌 append 끝낸 최종 본문
  keywords: string[];
  externalUrl: string | null;
  externalMeta: ExternalMeta | null;
  pubmedRefs: NonNullable<PubmedRefObj>[];
};

/** create 모드 — 액션 종류. edit 모드는 'save' 만 사용. */
export type SubmitAction =
  | "save_draft"     // create: 초안 저장
  | "request_review" // create(admin): 검수 요청
  | "publish"        // create: 즉시 발행
  | "save";          // edit: 일반 저장

const KEYWORD_MAX = 10;
const BODY_MAX_DEFAULT = 4000;

export default function CardEditor({
  mode,
  viewerRole,
  initialCategory,
  initialCard,
  onSubmit,
  returnUrl,
  adminMode = false,
}: Props) {
  const router = useRouter();

  // ── 카테고리 ─────────────────────────────────────────────────
  // create: viewerRole 별 옵션 + URL 폴백. edit: initialCard.category (변경 가능 여부 체크).
  const availableCategories = useMemo(
    () => categoriesForRole(viewerRole),
    [viewerRole],
  );
  const initialCatNorm: PostCategorySlug | null = useMemo(() => {
    if (mode === "edit" && initialCard) return initialCard.category;
    if (initialCategory && availableCategories.some((c) => c.slug === initialCategory))
      return initialCategory;
    // create 디폴트 — 가능한 첫 옵션 (보통 'doodle')
    return availableCategories[0]?.slug ?? null;
  }, [mode, initialCard, initialCategory, availableCategories]);

  const initialChangeable =
    initialCatNorm !== null &&
    (adminMode || availableCategories.some((c) => c.slug === initialCatNorm));

  const [category, setCategory] = useState<PostCategorySlug | null>(initialCatNorm);

  // ── 본문 / refs prefill (edit 모드) ───────────────────────────
  const initialSplit = useMemo(() => {
    if (mode !== "edit" || !initialCard) {
      return { cleanBody: "", refs: [""] as string[], metas: [null] as (PubmedRefObj | null)[] };
    }
    const split = splitBodyAndReferences(initialCard.body);
    const objStrings = initialCard.pubmedRefs.map((r) => pubmedRefObjToString(r));
    const objByString = new Map<string, PubmedRefObj>();
    initialCard.pubmedRefs.forEach((obj, i) => {
      const s = objStrings[i];
      if (s) objByString.set(s, obj);
    });
    const refs: string[] = [];
    const metas: (PubmedRefObj | null)[] = [];
    for (const r of split.refs) {
      refs.push(r);
      metas.push(objByString.get(r) ?? null);
      objByString.delete(r);
    }
    for (const [s, obj] of objByString.entries()) {
      refs.push(s);
      metas.push(obj);
    }
    return {
      cleanBody: split.cleanBody,
      refs: refs.length > 0 ? refs : [""],
      metas: refs.length > 0 ? metas : [null],
    };
  }, [mode, initialCard]);

  // ── form state ──────────────────────────────────────────────
  const [title, setTitle] = useState(initialCard?.title ?? "");
  const [body, setBody] = useState(initialSplit.cleanBody);
  const [keywords, setKeywords] = useState<string[]>(initialCard?.keywords ?? []);
  const [references, setReferences] = useState<string[]>(initialSplit.refs);
  const [refsMeta, setRefsMeta] = useState<(PubmedRefObj | null)[]>(initialSplit.metas);
  const [externalUrl, setExternalUrl] = useState(initialCard?.externalUrl ?? "");
  const [externalMeta, setExternalMeta] = useState<ExternalMeta | null>(
    initialCard?.externalMeta ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ── 파생 ────────────────────────────────────────────────────
  const isQa = category === "qa";
  const isLink = category === "link";
  const showRefs = isQa;
  const showExternal = isQa || isLink;
  const titleLabel = isQa ? "질문" : "제목";
  const bodyLabel = isQa ? "답변" : "본문";
  const bodyMax = isLink ? 800 : BODY_MAX_DEFAULT;
  const highlightSeed = String(initialCard?.cardId ?? "new");

  // ── 카테고리 picker ─────────────────────────────────────────
  function changeCategory(next: PostCategorySlug) {
    if (next === category) return;
    // Q&A ↔ 그 외 전환 시 내용 있으면 확인 (UX 일관성).
    const isCurQa = category === "qa";
    const isNextQa = next === "qa";
    if (isCurQa !== isNextQa && (title.trim() || body.trim() || keywords.length > 0)) {
      const ok = window.confirm(
        "작성 중인 내용이 있습니다.\n카테고리(Q&A↔포스팅)를 변경하면 일부 입력이 사라질 수 있습니다.\n계속하시겠습니까?",
      );
      if (!ok) return;
    }
    setCategory(next);
    if (next !== "qa") {
      setReferences([""]);
      setRefsMeta([null]);
    }
    if (next !== "qa" && next !== "link") {
      setExternalUrl("");
      setExternalMeta(null);
    }
  }

  // ── 저장 ────────────────────────────────────────────────────
  function buildPayload(): CardEditorPayload {
    const cleanBody = normalizeAnswerBody(body);
    const filledRefs = references.map((r) => r.trim()).filter(Boolean);
    const finalBody = showRefs
      ? appendReferencesToBody(cleanBody, filledRefs)
      : cleanBody;

    // PubMed 객체 배열 — meta 있는 ref 만
    const refObjs: NonNullable<PubmedRefObj>[] = [];
    references.forEach((r, i) => {
      if (!r.trim()) return;
      const m = refsMeta[i];
      if (m && (m.pmid || m.doi)) refObjs.push(m as NonNullable<PubmedRefObj>);
    });

    const u = externalUrl.trim();

    return {
      category,
      type: isQa ? "qa" : "post",
      title: title.trim(),
      body: finalBody,
      keywords: keywords.map((k) => k.trim()).filter(Boolean).slice(0, KEYWORD_MAX),
      externalUrl: u || null,
      externalMeta: u ? externalMeta : null,
      pubmedRefs: refObjs,
    };
  }

  function submit(action: SubmitAction) {
    setError(null);
    if (!title.trim()) {
      setError(isQa ? "질문을 입력해주세요." : "제목을 입력해주세요.");
      return;
    }
    if (!body.trim()) {
      setError(isQa ? "답변을 입력해주세요." : "본문을 입력해주세요.");
      return;
    }
    const payload = buildPayload();
    if (payload.body.length > bodyMax) {
      setError(`본문은 최대 ${bodyMax}자까지 가능합니다. (현재 ${payload.body.length}자)`);
      return;
    }
    startTransition(async () => {
      const r = await onSubmit(payload, action);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // 성공 후 처리는 wrapper 가 알아서 (router.push 등). 본 컴포넌트는 form 만.
    });
  }

  function cancelEdit() {
    if (returnUrl) router.push(returnUrl);
    else router.back();
  }

  // ── 렌더 ────────────────────────────────────────────────────
  return (
    <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      {/* 카테고리 picker — create 면 모든 옵션, edit 이면서 변경 가능 옵션이면 select.
          edit + readonly 면 칩으로 표시. */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        <span>카테고리</span>
        {mode === "create" || (initialChangeable && availableCategories.length > 1) ? (
          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map((c) => {
              const active = category === c.slug;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => changeCategory(c.slug)}
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
          <>
            <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 font-medium text-[var(--text)]">
              {category ?? initialCard?.type ?? "post"}
            </span>
            {!initialChangeable && (
              <span className="text-[11px]">(이 카테고리는 본인 권한으로 변경 불가)</span>
            )}
          </>
        )}
      </div>

      {/* 외부 링크 (Q&A 영상 URL / 새소식 외부 링크) */}
      {showExternal && (
        <ExternalLinkField
          url={externalUrl}
          onUrlChange={setExternalUrl}
          meta={externalMeta}
          onMetaChange={setExternalMeta}
          mode={isQa ? "qa" : "link"}
          bodyMax={bodyMax}
          onError={setError}
          disabled={pending}
          onAutoFill={
            // create + link 카테고리 일 때만 부모 setState 자동 채움.
            // edit 에서는 [채우기] 눌러도 본문 덮어쓰지 않음 (콜백 미지정).
            mode === "create" && isLink
              ? ({ title: t, body: b, keywords: k }) => {
                  setTitle("");
                  setBody("");
                  setKeywords([]);
                  if (t) setTitle(t);
                  if (b) setBody(b);
                  if (k.length > 0) setKeywords(k);
                }
              : undefined
          }
        />
      )}

      {/* 제목 */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          {titleLabel}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={pending}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-base font-medium focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* 본문 — Q&A 면 contentEditable + 형광펜 토글, 그 외 textarea */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          {bodyLabel}{" "}
          <span className="text-xs font-normal text-[var(--text-muted)]">
            ({body.length} / {bodyMax})
          </span>
        </label>
        {isQa ? (
          <MarkdownBoldEditor
            value={body}
            onChange={setBody}
            highlightColor={pickHighlight(highlightSeed)}
            disabled={pending}
            placeholder="답변을 입력하세요. 텍스트를 선택해 '굵게' 버튼(또는 Ctrl+B) 누르면 형광펜이 적용됩니다."
            minHeight={280}
          />
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            maxLength={bodyMax}
            disabled={pending}
            className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[15px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
          />
        )}
      </div>

      {/* Q&A 참고문헌 */}
      {showRefs && (
        <PubmedRefsField
          value={references}
          meta={refsMeta}
          onChange={(v, m) => {
            setReferences(v);
            setRefsMeta(m);
          }}
          onError={setError}
          disabled={pending}
        />
      )}

      {/* 태그 */}
      <KeywordsEditor
        keywords={keywords}
        onChange={setKeywords}
        onError={setError}
        max={KEYWORD_MAX}
        disabled={pending}
      />

      {/* 에러 */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 액션 — create vs edit 분기 */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[var(--border)] pt-4">
        {mode === "edit" ? (
          <>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              className="h-10 rounded-md border border-[var(--border)] px-4 text-sm hover:bg-[var(--bg-soft)] disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => submit("save")}
              disabled={pending}
              className="h-10 rounded-md bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => submit("save_draft")}
              disabled={pending}
              className="h-10 rounded-md border border-[var(--border)] px-4 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
              title="발행하지 않고 임시 저장 (status=draft)"
            >
              저장
            </button>
            {viewerRole === "admin" && (
              <button
                type="button"
                onClick={() => submit("request_review")}
                disabled={pending}
                className="h-10 rounded-md border border-[var(--primary-light)] bg-white px-4 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:opacity-50"
                title="원장님 검수 큐로 보냄 (status=pending_review)"
              >
                검수 요청
              </button>
            )}
            <button
              type="button"
              onClick={() => submit("publish")}
              disabled={pending}
              className="h-10 rounded-md bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
              title="즉시 발행 (status=published)"
            >
              {pending ? "처리 중…" : "올리기"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
