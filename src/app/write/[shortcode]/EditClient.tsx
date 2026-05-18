"use client";

/**
 * EditClient — 본인/원장/admin 가 카드 수정 (`/write/{shortcode}`).
 *
 * Phase 2 풀폼 확장 (260518):
 *   - 기존: 제목·본문·태그만 (138 LOC) → "Q&A 카드인데 일반 글 수정기로 가버린다"
 *     사용자 회귀.
 *   - 새: WriteClient 와 동일한 UI 깊이 — Q&A 카테고리면 PubMed 참고문헌·영상 URL 모두
 *     편집 가능. 새소식이면 외부 링크 편집 가능. 카테고리 자체는 readonly (admin 라우트
 *     `/admin/cards/[id]/edit` 에서 변경).
 *   - 본문에 자동 생성된 "참고문헌" 섹션은 `splitBodyAndReferences` 로 추출 → refs state
 *     로 격리. 저장 시 `appendReferencesToBody` 로 다시 합성. textarea 와 refs UI 가
 *     동일 source 충돌 안 함.
 *   - pubmed_refs(객체 배열) 컬럼이 있는 카드는 객체 → string 변환해 refs 에 합침.
 *
 * 저장 (Phase 2 한정): supabase client 직접 update. Phase 3 에서 PUT /api/articles/[id]
 * 엔드포인트로 분리해 권한 검증 통일 예정.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

type Props = {
  cardId: number;
  type: "qa" | "post";
  category: string | null;
  /** active identity 의 role — 카테고리 옵션 필터링 ('qa' 는 admin·doctor 만). */
  viewerRole: "admin" | "doctor" | "user";
  initialTitle: string;
  initialBody: string;
  initialKeywords: string[];
  initialExternalUrl: string;
  initialExternalMeta: ExternalMeta | null;
  initialPubmedRefs: NonNullable<PubmedRefObj>[];
  /** 저장·취소 후 돌아갈 URL (예: /{handle}/{shortcode}) */
  returnUrl: string;
};

const KEYWORD_MAX = 10;
const BODY_MAX_DEFAULT = 4000;

export default function EditClient({
  cardId,
  type,
  category: initialCategory,
  viewerRole,
  initialTitle,
  initialBody,
  initialKeywords,
  initialExternalUrl,
  initialExternalMeta,
  initialPubmedRefs,
  returnUrl,
}: Props) {
  const router = useRouter();

  // 카테고리 — viewerRole 기반 옵션 필터. 변경 시 type ('qa' vs 'post') 도 함께 갱신.
  // user 는 'qa' 옵션 없음 (categoriesForRole 가 publicForUsers 만 반환).
  const availableCategories = useMemo(
    () => categoriesForRole(viewerRole),
    [viewerRole],
  );
  // 초기값이 category 옵션에 없으면 (예: viewerRole='user' 인데 카드가 type='qa') readonly fallback.
  const initialCategoryNorm: PostCategorySlug | null =
    initialCategory && isPostCategorySlug(initialCategory)
      ? (initialCategory as PostCategorySlug)
      : null;
  const initialChangeable =
    initialCategoryNorm !== null &&
    availableCategories.some((c) => c.slug === initialCategoryNorm);
  const [category, setCategory] = useState<PostCategorySlug | null>(
    initialCategoryNorm,
  );

  // 본문에 이미 박힌 "참고문헌" 섹션을 추출해 refs state 로 격리.
  // (textarea 에는 cleanBody 만 표시 → refs UI 와 중복 노출 방지.)
  // 동시에 pubmed_refs 객체 배열은 meta state 로 보관 (PubMed 링크 클릭에 사용).
  const initial = useMemo(() => {
    const split = splitBodyAndReferences(initialBody);
    // 본문에서 추출한 ref string 들 — 매칭되는 PubmedRefObj 가 있으면 그것을 meta 로 묶음.
    const objStrings = initialPubmedRefs.map((r) => pubmedRefObjToString(r));
    const objByString = new Map<string, PubmedRefObj>();
    initialPubmedRefs.forEach((obj, i) => {
      const s = objStrings[i];
      if (s) objByString.set(s, obj);
    });

    const refs: string[] = [];
    const metas: (PubmedRefObj | null)[] = [];
    // 본문에서 추출한 ref 우선 (사용자가 보던 순서 보존), 매칭되는 객체는 meta 로 첨부.
    for (const r of split.refs) {
      refs.push(r);
      metas.push(objByString.get(r) ?? null);
      objByString.delete(r);
    }
    // 본문에 없던 객체-only ref 추가
    for (const [s, obj] of objByString.entries()) {
      refs.push(s);
      metas.push(obj);
    }

    return {
      cleanBody: split.cleanBody,
      refs: refs.length > 0 ? refs : [""],
      metas: refs.length > 0 ? metas : [null],
    };
  }, [initialBody, initialPubmedRefs]);

  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initial.cleanBody);
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [references, setReferences] = useState<string[]>(initial.refs);
  const [refsMeta, setRefsMeta] = useState<(PubmedRefObj | null)[]>(
    initial.metas,
  );
  const [externalUrl, setExternalUrl] = useState(initialExternalUrl);
  const [externalMeta, setExternalMeta] = useState<ExternalMeta | null>(
    initialExternalMeta,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // category 가 변경 가능하면 그 값 우선, 아니면 props.type 으로 폴백.
  const isQa = category === "qa" || (category === null && type === "qa");
  const isLink = category === "link";
  const showRefs = isQa;
  const showExternal = isQa || isLink;

  function save() {
    setError(null);
    if (!title.trim()) {
      setError(isQa ? "질문을 입력해주세요." : "제목을 입력해주세요.");
      return;
    }
    if (!body.trim()) {
      setError(isQa ? "답변을 입력해주세요." : "본문을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const sb = createSupabaseBrowserClient();

      // 본문 최종 — Q&A 면 참고문헌을 본문 끝에 append (WriteClient 와 동일 규칙).
      const cleanBody = normalizeAnswerBody(body);
      const filledRefs = references.map((r) => r.trim()).filter(Boolean);
      const finalAnswer = showRefs
        ? appendReferencesToBody(cleanBody, filledRefs)
        : cleanBody;

      // 업데이트 페이로드. external_* 는 URL 있을 때만 채움 (없으면 null 로 비움).
      const payload: Record<string, unknown> = {
        question: title.trim(),
        answer: finalAnswer,
        keywords,
      };

      // 카테고리 변경됐으면 함께 갱신 + type 도 파생 ('qa' ↔ 'post').
      if (category && category !== initialCategoryNorm) {
        payload.category = category;
        payload.type = category === "qa" ? "qa" : "post";
      }
      if (showExternal) {
        const u = externalUrl.trim();
        if (u) {
          payload.external_url = u;
          payload.external_title = externalMeta?.title ?? null;
          payload.external_description = externalMeta?.description ?? null;
          payload.external_image = externalMeta?.image ?? null;
          payload.external_site_name = externalMeta?.siteName ?? null;
        } else {
          payload.external_url = null;
          payload.external_title = null;
          payload.external_description = null;
          payload.external_image = null;
          payload.external_site_name = null;
        }
      }

      // Q&A 카테고리만 — PubMed refs 객체 컬럼 보존 (PubMed 링크 클릭에 사용).
      // 비어있지 않은 ref 인덱스만 추리고, meta 가 있으면 객체, 없으면 string 만 있는 ref 는 객체 없으니
      // pubmed_refs 에 포함 X (본문 append 로만 표시).
      if (showRefs) {
        const objs: NonNullable<PubmedRefObj>[] = [];
        references.forEach((r, i) => {
          if (!r.trim()) return;
          const m = refsMeta[i];
          if (m && (m.pmid || m.doi)) objs.push(m as NonNullable<PubmedRefObj>);
        });
        payload.pubmed_refs = objs.length > 0 ? objs : null;
        payload.pubmed_ref = objs[0] ?? null;
      }

      const { error: updErr } = await sb
        .from("cards")
        .update(payload)
        .eq("id", cardId);
      if (updErr) {
        setError("저장 실패: " + updErr.message);
        return;
      }
      router.push(returnUrl);
      router.refresh();
    });
  }

  const titleLabel = isQa ? "질문" : "제목";
  const bodyLabel = isQa ? "답변" : "본문";
  const bodyMax = isLink ? 400 : BODY_MAX_DEFAULT;

  return (
    <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      {/* 카테고리 — viewerRole 가 변경 가능한 옵션 보유 시 picker, 아니면 readonly 칩.
          (예: viewerRole='user' 면 'qa' 옵션 없음 → user 가 doctor Q&A 를 수정해도 카테고리는 readonly) */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span>카테고리</span>
        {initialChangeable && availableCategories.length > 1 ? (
          <select
            value={category ?? ""}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value;
              if (isPostCategorySlug(next)) setCategory(next as PostCategorySlug);
            }}
            className="h-7 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-2 text-xs font-medium text-[var(--text)] focus:border-[var(--primary-light)] focus:outline-none disabled:opacity-50"
            aria-label="카테고리 변경"
          >
            {availableCategories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <>
            <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 font-medium text-[var(--text)]">
              {category ?? type}
            </span>
            {!initialChangeable && (
              <span className="text-[11px]">
                (이 카테고리는 본인 권한으로 변경 불가)
              </span>
            )}
          </>
        )}
      </div>

      {/* 외부 링크 (Q&A: 영상 URL / 새소식: 외부 링크) */}
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
          // 새소식 채우기 — 수정 모드에서는 자동 덮어쓰기 안 함 (사용자 작성한 본문 보존).
          // mode='link' 면 [채우기] 버튼이 노출되지만, onAutoFill 미지정이라 메타만 업데이트.
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

      {/* 본문 — Q&A 면 MarkdownBoldEditor (선택영역 → '강조' 토글 즉시 bold+형광펜),
          그 외엔 일반 textarea. WriteClient 의 PostQaForm 과 같은 정책. */}
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
            highlightColor={pickHighlight(String(cardId))}
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

      {/* Q&A 참고문헌 (PubMed) — Q&A 카테고리에서만 노출. */}
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

      {/* 액션 */}
      <div className="flex items-center justify-center gap-2 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={() => router.push(returnUrl)}
          disabled={pending}
          className="h-10 rounded-md border border-[var(--border)] px-4 text-sm hover:bg-[var(--bg-soft)] disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-10 rounded-md bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
