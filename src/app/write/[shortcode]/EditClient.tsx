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
import KeywordsEditor from "@/components/card-editor/KeywordsEditor";
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
  /** category 는 readonly 표시용. 수정은 admin 라우트에서만 가능. */
  category: string | null;
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
  category,
  initialTitle,
  initialBody,
  initialKeywords,
  initialExternalUrl,
  initialExternalMeta,
  initialPubmedRefs,
  returnUrl,
}: Props) {
  const router = useRouter();

  // 본문에 이미 박힌 "참고문헌" 섹션을 추출해 refs state 로 격리.
  // (textarea 에는 cleanBody 만 표시 → refs UI 와 중복 노출 방지.)
  const initial = useMemo(() => {
    const split = splitBodyAndReferences(initialBody);
    // pubmed_refs 객체 배열도 string 으로 변환해 합침 (admin 발행 카드 호환).
    const fromObj = initialPubmedRefs
      .map((r) => pubmedRefObjToString(r))
      .filter(Boolean);
    // 합집합 — 중복 제거 (object 변환과 본문 추출이 같은 내용일 수 있음).
    const allRefs = Array.from(new Set([...fromObj, ...split.refs]));
    return {
      cleanBody: split.cleanBody,
      refs: allRefs.length > 0 ? allRefs : [""],
    };
  }, [initialBody, initialPubmedRefs]);

  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initial.cleanBody);
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [references, setReferences] = useState<string[]>(initial.refs);
  const [externalUrl, setExternalUrl] = useState(initialExternalUrl);
  const [externalMeta, setExternalMeta] = useState<ExternalMeta | null>(
    initialExternalMeta,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isQa = category === "qa" || type === "qa";
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
      {/* 카테고리 표시 (readonly — admin 만 변경 가능) */}
      {category && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>카테고리</span>
          <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 font-medium text-[var(--text)]">
            {category}
          </span>
          <span className="text-[11px]">
            (카테고리 변경은 운영자에게 요청해주세요)
          </span>
        </div>
      )}

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

      {/* 본문 — textarea. 참고문헌은 별도 UI 라 cleanBody 만 표시. */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          {bodyLabel}{" "}
          <span className="text-xs font-normal text-[var(--text-muted)]">
            ({body.length} / {bodyMax})
          </span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          maxLength={bodyMax}
          disabled={pending}
          className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[15px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Q&A 참고문헌 (PubMed) — Q&A 카테고리에서만 노출. */}
      {showRefs && (
        <PubmedRefsField
          value={references}
          onChange={setReferences}
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
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
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
