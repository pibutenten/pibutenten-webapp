"use client";

/**
 * CardEditor — 카드 작성·수정 통합 컴포넌트 (Phase 4 풀 통합, 2026-05-22).
 *
 * 세 라우트가 본 컴포넌트의 wrapper:
 *   - /write                    → mode='create'
 *   - /write/[shortcode]        → mode='edit'
 *   - /admin/cards/[id]/edit    → mode='edit' + adminExtras
 *
 * Phase 4a (260518): 회원 EditClient 만 wrapper화
 * Phase 4b/4c (260522): WriteClient + admin EditClient 모두 wrapper화 + adminExtras 통합
 *
 * 책임:
 *   - 카테고리 picker (role 별 옵션 필터)
 *   - 제목 / 본문 (Q&A 면 MarkdownBoldEditor + 형광펜, 그 외 textarea)
 *   - 외부 링크 (ExternalLinkField — qa 영상 시작시간 + 새소식 미리보기)
 *   - PubMed 참고문헌 (PubmedRefsField)
 *   - 태그 (KeywordsEditor)
 *   - 의사 명의 글쓰기 (doctorSlug — admin/doctor)
 *   - 새소식 첫 댓글 (link 카테고리)
 *   - **adminExtras 일 때만**: author picker / doctor picker / isPick / status change /
 *     comment count / 시작시각(MM:SS) / 태그 자동추출 / soft-delete
 *
 * onSubmit 콜백 패턴:
 *   wrapper 가 정의. payload 에 모든 필드 포함해서 호출. wrapper 가 API 호출 + redirect.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeAnswerBody } from "@/lib/normalize-body";
import { pickHighlight } from "@/lib/card-highlight";
import MarkdownBoldEditor from "@/components/MarkdownBoldEditor";
import KeywordsEditor from "@/components/card-editor/KeywordsEditor";
import {
  categoriesForRole,
  isPostCategorySlug,
  labelForCategory,
  type PostCategorySlug,
} from "@/lib/post-category";
import PubmedRefsField, {
  pubmedRefObjToString,
  splitBodyAndReferences,
  type PubmedRefObj,
} from "@/components/card-editor/fields/PubmedRefsField";
import ExternalLinkField, {
  type ExternalMeta,
} from "@/components/card-editor/fields/ExternalLinkField";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SUICIDE_SELF_HARM_KEYWORDS } from "@/lib/content-screening-dict";

/**
 * 자살/자해 키워드 감지 — 차단 아닌 안내 (보안 2.5차 L3).
 */
function detectSuicideRisk(text: string): boolean {
  const lower = text.toLowerCase();
  return SUICIDE_SELF_HARM_KEYWORDS.some((kw) => lower.includes(kw));
}

export type CardStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "archived"
  | "hidden";

export type DoctorOption = {
  id: string;
  slug: string;
  name: string;
  branch?: string | null;
};

export type AuthorOption = {
  profileId: string;
  displayName: string | null;
  handle: string | null;
  role: "user" | "doctor" | "admin" | string;
};

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
  /** edit 모드 admin 전용 — 기타 메타 */
  status?: CardStatus;
  isPick?: boolean;
  doctorId?: string | null;
  authorProfileId?: string | null;
  startSeconds?: number;
  metaJson?: string | null;
};

export type CardEditorPayload = {
  category: PostCategorySlug | null;
  type: "qa" | "post";
  title: string;
  body: string;
  keywords: string[];
  externalUrl: string | null;
  externalMeta: ExternalMeta | null;
  pubmedRefs: NonNullable<PubmedRefObj>[];
  /** create 모드 (admin/doctor 의사 명의로 작성 시) */
  doctorSlug?: string | null;
  /** create 모드 link 카테고리 — 첫 댓글 */
  firstComment?: string;
  /** admin extras 일 때만 추가됨 */
  status?: CardStatus;
  isPick?: boolean;
  doctorId?: string | null;
  authorProfileId?: string | null;
  startSeconds?: number;
  externalTitle?: string | null;
};

export type SubmitAction =
  | "save_draft"
  | "request_review"
  | "publish"
  | "save";

type SaveResult = { ok: true; cardId: number } | { ok: false; error: string };

export type AdminExtras = {
  /** 글쓴이 표시 — 항상 표시 (변경 불가일 때도 readonly 박스로). */
  currentAuthorDisplay: string;
  /** 글쓴이 변경 가능 (super admin) — true 면 dropdown 활성 */
  canChangeAuthor: boolean;
  /** 글쓴이 변경 후보 (super admin 만 의미) */
  authorOptions?: AuthorOption[];
  /** 이 카드가 의사 글인지 (author 가 의사 profile) — Pick 토글 노출 조건 */
  isDoctorAuthored?: boolean;
  /** 현재 doctor 의 Pick 수 (5 한도 표시용, 의사 글일 때만 의미) */
  doctorPickCount?: number;
  /** comment 수 표시 */
  commentCount?: number;
  /** LLM 태그 자동 추출 (POST /api/admin/extract-keywords) */
  enableLlmTagExtract?: boolean;
  /** soft-delete 버튼 노출 */
  enableSoftDelete?: boolean;
  /** soft-delete 콜백 (wrapper 가 API/RPC 처리) */
  onSoftDelete?: () => Promise<void>;
  /** Pick 토글 가능 여부 (admin OR self-doctor) — 0151 권한 분기 */
  canTogglePick?: boolean;
  /** 숨김 토글 노출 가능 여부 (published OR hidden 상태 + admin 권한일 때 true) */
  canHide?: boolean;
  /** 숨김 토글 콜백 — published ↔ hidden 전환. wrapper 가 supabase 직접 호출. */
  onToggleHide?: () => Promise<void>;
};

type Props = {
  mode: "create" | "edit";
  viewerRole: "admin" | "doctor" | "user";

  initialCategory?: PostCategorySlug;
  initialCard?: CardEditorInitial;

  /** 헤더 영역 — wrapper 가 제공하는 H1/부제 (없으면 자동) */
  headerTitle?: string;
  headerSubtitle?: string;

  /** create 모드 — 의사 본인이 작성 시 myDoctor.slug 자동 첨부 (UI 노출 없음) */
  myDoctor?: { slug: string; name: string } | null;

  /** create 모드 admin — 글쓴이 dropdown (의사 9명). 선택 안 하면 본인 명의 (admin). */
  createAuthorOptions?: DoctorOption[];

  /** edit 모드 — 취소·저장 후 돌아갈 URL */
  returnUrl?: string;

  /** admin 전용 기능 묶음 (edit 모드 admin 페이지만) */
  adminExtras?: AdminExtras;

  /** create 모드 admin 만 — 검수 요청 버튼 노출 */
  showRequestReview?: boolean;

  /** edit 모드 일반 사용자(원장·회원) — 본인 글 지우기 (soft-delete) 콜백.
   *  제공되면 [지우기] 버튼 노출. admin 은 adminExtras.onSoftDelete 사용. */
  onOwnerDelete?: () => Promise<void>;

  onSubmit: (
    payload: CardEditorPayload,
    action: SubmitAction,
  ) => Promise<SaveResult>;
};

const KEYWORD_MAX = 10;
const BODY_MAX_DEFAULT = 4000;

/* ── 시작 시각 헬퍼 (admin 전용 시작시각 입력용) ──────────────────── */
function formatMMSS(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function parseMMSS(input: string): number {
  const t = input.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return 0;
}
function extractStartSeconds(url: string): number {
  if (!url) return 0;
  const m = url.match(/[?&]t=(\d+)s?/);
  return m ? parseInt(m[1], 10) : 0;
}
function buildExternalUrl(base: string, startSec: number): string {
  if (!base) return "";
  // YouTube ID 만 11자 들어왔다면 watch URL 로 조립
  if (/^[a-zA-Z0-9_-]{11}$/.test(base)) {
    return startSec > 0
      ? `https://youtu.be/${base}?t=${startSec}s`
      : `https://youtu.be/${base}`;
  }
  // 기존 URL — t 파라미터만 갱신
  const cleaned = base.replace(/([?&])t=\d+s?/g, "$1").replace(/[?&]$/, "");
  if (startSec === 0) return cleaned;
  const sep = cleaned.includes("?") ? "&" : "?";
  return `${cleaned}${sep}t=${startSec}s`;
}

const STATUS_LABELS: Record<CardStatus, string> = {
  draft: "초안",
  pending_review: "검수 대기",
  published: "발행",
  archived: "아카이브",
  hidden: "숨김",
};

const STATUS_COLORS: Record<CardStatus, string> = {
  draft: "#9CA3AF",
  pending_review: "#F59E0B",
  published: "#10B981",
  archived: "#6B7280",
  hidden: "#92400E",
};

export default function CardEditor({
  mode,
  viewerRole,
  initialCategory,
  initialCard,
  headerTitle,
  headerSubtitle,
  myDoctor,
  createAuthorOptions,
  returnUrl,
  adminExtras,
  showRequestReview = false,
  onOwnerDelete,
  onSubmit,
}: Props) {
  const router = useRouter();
  const isAdminMode = !!adminExtras;

  /* ── 카테고리 ──────────────────────────────────────────────── */
  const availableCategories = useMemo(
    () => categoriesForRole(viewerRole),
    [viewerRole],
  );
  const initialCatNorm: PostCategorySlug | null = useMemo(() => {
    if (mode === "edit" && initialCard) return initialCard.category;
    if (
      initialCategory &&
      availableCategories.some((c) => c.slug === initialCategory)
    )
      return initialCategory;
    return availableCategories[0]?.slug ?? null;
  }, [mode, initialCard, initialCategory, availableCategories]);

  const initialChangeable =
    initialCatNorm !== null &&
    (isAdminMode || availableCategories.some((c) => c.slug === initialCatNorm));

  const [category, setCategory] = useState<PostCategorySlug | null>(
    initialCatNorm,
  );

  /* ── 본문/refs prefill ──────────────────────────────────────── */
  const initialSplit = useMemo(() => {
    if (mode !== "edit" || !initialCard) {
      return {
        cleanBody: "",
        refs: [""] as string[],
        metas: [null] as (PubmedRefObj | null)[],
      };
    }
    const split = splitBodyAndReferences(initialCard.body);
    const objStrings = initialCard.pubmedRefs.map((r) =>
      pubmedRefObjToString(r),
    );
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

  /* ── form state ─────────────────────────────────────────────── */
  const [title, setTitle] = useState(initialCard?.title ?? "");
  const [body, setBody] = useState(initialSplit.cleanBody);
  const [keywords, setKeywords] = useState<string[]>(
    initialCard?.keywords ?? [],
  );
  const [references, setReferences] = useState<string[]>(initialSplit.refs);
  const [refsMeta, setRefsMeta] = useState<(PubmedRefObj | null)[]>(
    initialSplit.metas,
  );
  const [externalUrl, setExternalUrl] = useState(
    initialCard?.externalUrl ?? "",
  );
  const [externalMeta, setExternalMeta] = useState<ExternalMeta | null>(
    initialCard?.externalMeta ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* ── create 전용 state ──────────────────────────────────────── */
  // admin 의 글쓴이 dropdown 선택값 — "" 면 본인(관리자) 명의, slug 면 그 의사 명의.
  // doctor 본인은 자동 (myDoctor.slug). 회원은 항상 본인 명의.
  const [createAuthorSlug, setCreateAuthorSlug] = useState<string>("");
  // link 카테고리 첫 댓글
  const [firstComment, setFirstComment] = useState("");

  /* ── admin extras state (edit 모드 admin) ───────────────────── */
  const [authorProfileId, setAuthorProfileId] = useState<string | null>(
    initialCard?.authorProfileId ?? null,
  );
  const [status, setStatus] = useState<CardStatus>(
    initialCard?.status ?? "draft",
  );
  const [isPick, setIsPick] = useState<boolean>(initialCard?.isPick ?? false);
  const [startSec, setStartSec] = useState<number>(
    initialCard?.startSeconds ?? extractStartSeconds(initialCard?.externalUrl ?? ""),
  );
  const [startInput, setStartInput] = useState<string>(
    formatMMSS(initialCard?.startSeconds ?? extractStartSeconds(initialCard?.externalUrl ?? "")),
  );
  const [llmTagLoading, setLlmTagLoading] = useState(false);
  const [oembedLoading, setOembedLoading] = useState(false);

  /* ── 파생 ──────────────────────────────────────────────────── */
  const isQa = category === "qa";
  const isLink = category === "link";
  const showRefs = isQa;
  // 외부 링크 — 카테고리 기준만 (admin 모드 우대 X).
  // qa = 영상 URL + 시작시각 / link = 외부 콘텐츠 큐레이션
  const showExternal = isQa || isLink;
  const showStartTime = isQa; // 시작시각은 qa 영상용
  // 2026-05-22 사용자 결정: 라벨 통일 — qa 도 "제목"/"본문" (옛 "질문"/"답변" 폐기)
  const titleLabel = "제목";
  const bodyLabel = "본문";
  // 2026-05-22: 본문 글자수 한도 4000자 통일 (옛 link 카테고리 800자 폐기)
  const bodyMax = BODY_MAX_DEFAULT;
  const highlightSeed = String(initialCard?.cardId ?? "new");

  /* ── 카테고리 picker ──────────────────────────────────────── */
  // same-group = 단순 텍스트 카테고리 (제목+본문+태그 구조 동일). 자유 전환.
  // cross-group = qa(외부영상+PubMed) / link(외부URL+첫댓글). 구조 다름 → confirm.
  const SAME_GROUP: ReadonlySet<PostCategorySlug> = new Set<PostCategorySlug>([
    "doodle",
    "diary",
    "tip",
    "ask",
  ]);
  function isCrossGroupSwitch(
    a: PostCategorySlug | null,
    b: PostCategorySlug,
  ): boolean {
    if (!a) return false;
    return !(SAME_GROUP.has(a) && SAME_GROUP.has(b));
  }
  function changeCategory(next: PostCategorySlug) {
    if (next === category) return;
    // cross-group 전환 시에만 confirm (소식공유/Q&A 와 다른 카테고리 간 이동)
    const crossGroup = isCrossGroupSwitch(category, next);
    if (
      crossGroup &&
      (title.trim() || body.trim() || keywords.length > 0)
    ) {
      const ok = window.confirm(
        "주의: 카테고리를 변경하면 일부 정보가 소실될 수 있습니다. 계속하시겠습니까?",
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

  /* ── 시작 시각 ↔ URL 동기화 (qa + admin 모드만) ─────────────── */
  useEffect(() => {
    if (!isAdminMode || !showStartTime) return;
    // externalUrl 변경 시 startSec 추출해서 startInput 갱신 (외부 변경 케이스)
    const s = extractStartSeconds(externalUrl);
    if (s !== startSec) {
      setStartSec(s);
      setStartInput(formatMMSS(s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalUrl, isAdminMode, showStartTime]);

  function commitStartInput() {
    const sec = parseMMSS(startInput);
    setStartSec(sec);
    setStartInput(formatMMSS(sec));
    // URL 도 갱신
    if (externalUrl) {
      setExternalUrl(buildExternalUrl(externalUrl, sec));
    }
  }

  /* ── 태그 LLM 자동 추출 (admin extras only) ───────────────── */
  async function extractKeywordsLlm() {
    if (!adminExtras?.enableLlmTagExtract) return;
    if (!title.trim() && !body.trim()) {
      setError("제목 또는 본문이 있어야 키워드 추출이 가능합니다.");
      return;
    }
    setError(null);
    setLlmTagLoading(true);
    try {
      const res = await fetch("/api/admin/extract-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: title, answer: body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          "error" in data ? data.error : `키워드 추출 실패 (${res.status})`,
        );
        return;
      }
      const newKws = (data.keywords ?? []) as string[];
      // 기존 + 신규 merge, 중복 제거
      const merged = Array.from(new Set([...keywords, ...newKws])).slice(
        0,
        KEYWORD_MAX,
      );
      setKeywords(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "키워드 추출 네트워크 오류");
    } finally {
      setLlmTagLoading(false);
    }
  }

  /* ── oEmbed 제목 가져오기 (admin extras only) ──────────────── */
  async function fetchOembedTitle() {
    if (!externalUrl) return;
    setOembedLoading(true);
    try {
      const res = await fetch(
        `/api/og-extract?url=${encodeURIComponent(externalUrl)}`,
      );
      if (!res.ok) {
        setError(`제목 가져오기 실패 (${res.status})`);
        return;
      }
      const data = await res.json();
      const t = (data.title ?? data.meta?.title ?? "") as string;
      if (t) {
        setExternalMeta({
          title: t,
          description: externalMeta?.description ?? "",
          image: externalMeta?.image ?? "",
          siteName: externalMeta?.siteName ?? "",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "제목 가져오기 네트워크 오류");
    } finally {
      setOembedLoading(false);
    }
  }

  /* ── 저장 ─────────────────────────────────────────────────── */
  function buildPayload(action: SubmitAction): CardEditorPayload {
    // Critical-6 (2026-05-27): 본문에 "참고문헌\n1. ..." 평문 꼬리를 append 하던 옛 로직
    // 폐기. 참고문헌은 pubmed_refs (jsonb 컬럼) 단일 출처로만 저장. 본문은 본문만.
    const finalBody = normalizeAnswerBody(body);

    const refObjs: NonNullable<PubmedRefObj>[] = [];
    references.forEach((r, i) => {
      if (!r.trim()) return;
      const m = refsMeta[i];
      if (m && (m.pmid || m.doi))
        refObjs.push(m as NonNullable<PubmedRefObj>);
    });

    const u = externalUrl.trim();

    const payload: CardEditorPayload = {
      category,
      type: isQa ? "qa" : "post",
      title: title.trim(),
      body: finalBody,
      keywords: keywords
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, KEYWORD_MAX),
      externalUrl: u || null,
      externalMeta: u ? externalMeta : null,
      pubmedRefs: refObjs,
    };

    if (mode === "create") {
      // 글쓴이 결정:
      //   - doctor 본인 → myDoctor.slug 자동
      //   - admin → '글쓴이' dropdown 선택값 (의사 slug 또는 "") — "" 면 본인(관리자) 명의
      //   - user → 항상 본인 명의 (doctorSlug 없음)
      if (viewerRole === "doctor" && myDoctor) {
        payload.doctorSlug = myDoctor.slug;
      } else if (viewerRole === "admin" && createAuthorSlug) {
        payload.doctorSlug = createAuthorSlug;
      }
      if (isLink && firstComment.trim())
        payload.firstComment = firstComment.trim();
    }

    if (isAdminMode) {
      payload.status =
        action === "save_draft"
          ? "draft"
          : action === "request_review"
            ? "pending_review"
            : action === "publish"
              ? "published"
              : status;
      payload.isPick = isPick;
      payload.authorProfileId = authorProfileId;
      payload.startSeconds = startSec;
      payload.externalTitle = externalMeta?.title ?? null;
      // doctorId 는 wrapper 가 author 변경 후 자동 추론 (UI 노출 X)
    }

    return payload;
  }

  const [pendingAction, setPendingAction] = useState<SubmitAction | null>(null);
  const [suicideRiskAcknowledged, setSuicideRiskAcknowledged] = useState(false);

  function doSubmit(action: SubmitAction) {
    const payload = buildPayload(action);
    startTransition(async () => {
      const r = await onSubmit(payload, action);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
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
    const payload = buildPayload(action);
    if (payload.body.length > bodyMax) {
      setError(
        `본문은 최대 ${bodyMax}자까지 가능합니다. (현재 ${payload.body.length}자)`,
      );
      return;
    }
    if (!suicideRiskAcknowledged) {
      const text = `${payload.title} ${payload.body}`;
      if (detectSuicideRisk(text)) {
        setPendingAction(action);
        return;
      }
    }
    doSubmit(action);
  }

  async function handleSoftDelete() {
    if (!adminExtras?.onSoftDelete) return;
    if (
      !confirm(
        `이 카드를 삭제할까요?\n/admin/cards?status=deleted 에서 복구 가능합니다.`,
      )
    )
      return;
    setError(null);
    try {
      await adminExtras.onSoftDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  async function handleToggleHide() {
    if (!adminExtras?.onToggleHide) return;
    const isCurrentlyHidden = status === "hidden";
    const confirmMsg = isCurrentlyHidden
      ? "이 글의 숨김을 해제하고 다시 공개로 전환할까요?"
      : "이 글을 숨김 처리할까요?\n관리자/작성자/해당 원장 외에는 보이지 않게 됩니다.";
    if (!confirm(confirmMsg)) return;
    setError(null);
    try {
      await adminExtras.onToggleHide();
    } catch (e) {
      setError(e instanceof Error ? e.message : "숨김 처리 실패");
    }
  }

  function cancelEdit() {
    if (returnUrl) router.push(returnUrl);
    else router.back();
  }

  /* ── 렌더 ─────────────────────────────────────────────────── */
  const adminPickCount = adminExtras?.doctorPickCount ?? 0;

  return (
    <div className="space-y-5">
      {/* 헤더 (admin 모드 또는 wrapper 제공 시) */}
      {(headerTitle || isAdminMode) && initialCard && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-base font-bold text-[var(--text)]">
              {headerTitle ??
                `${labelForCategory(category) || "글"} #${initialCard.cardId} 편집`}
            </span>
            {isAdminMode && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              >
                {STATUS_LABELS[status]}
              </span>
            )}
            {adminExtras?.commentCount !== undefined && (
              <span className="text-xs text-[var(--text-muted)]">
                댓글 {adminExtras.commentCount}
              </span>
            )}
          </div>
          {headerSubtitle && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {headerSubtitle}
            </p>
          )}
        </div>
      )}

      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
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
                  onChange={(e) => setAuthorProfileId(e.target.value || null)}
                  disabled={pending}
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-sm disabled:opacity-50"
                >
                  {adminExtras.authorOptions.map((a) => (
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
                    onChange={(e) => setIsPick(e.target.checked)}
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

        {/* 외부 링크 */}
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

        {/* 영상 시작 시각 + oEmbed 제목 가져오기 (qa + admin 모드만) */}
        {isAdminMode && showStartTime && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text)]">
                시작 시각 (MM:SS)
              </label>
              <input
                type="text"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                onBlur={commitStartInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitStartInput();
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
                onClick={fetchOembedTitle}
                disabled={pending || oembedLoading || !externalUrl}
                className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
              >
                {oembedLoading ? "조회 중…" : "↻ 제목 가져오기"}
              </button>
            </div>
          </div>
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

        {/* 본문 */}
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
              placeholder="답변을 입력하세요. 텍스트 선택 후 Ctrl+B 누르면 형광펜이 적용됩니다."
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

        {/* 태그 + (admin) LLM 자동추출 버튼 */}
        <div>
          <KeywordsEditor
            keywords={keywords}
            onChange={setKeywords}
            onError={setError}
            max={KEYWORD_MAX}
            disabled={pending}
            labelExtra={
              isAdminMode && adminExtras?.enableLlmTagExtract ? (
                <button
                  type="button"
                  onClick={extractKeywordsLlm}
                  disabled={pending || llmTagLoading}
                  className="ml-2 rounded-md border border-[var(--border)] bg-white px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
                >
                  {llmTagLoading ? "추출 중…" : "✨ 자동 추출"}
                </button>
              ) : null
            }
          />
        </div>

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
                onChange={(e) => setCreateAuthorSlug(e.target.value)}
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

        {/* link 카테고리 — 첫 댓글 */}
        {mode === "create" && isLink && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text)]">
              내 코멘트 (선택)
            </label>
            <textarea
              value={firstComment}
              onChange={(e) => setFirstComment(e.target.value)}
              rows={3}
              maxLength={500}
              disabled={pending}
              className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-sm focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
              placeholder="공유하면서 한마디 — 글 발행 시 첫 댓글로 등록됩니다."
            />
          </div>
        )}

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
              {/* 수정 모드 — 취소 제거. 관리자: 숨기기 / 지우기 / 올리기 / (해제). 일반(원장·회원): 올리기만. */}
              {isAdminMode && adminExtras?.canHide && (status === "published" || status === "hidden") && (
                <button
                  type="button"
                  onClick={handleToggleHide}
                  disabled={pending}
                  className="h-10 rounded-md bg-gray-400 px-5 text-sm font-semibold text-white hover:bg-gray-500 disabled:opacity-50"
                  title={
                    status === "hidden"
                      ? "숨김을 해제하고 다시 공개"
                      : "글을 숨김 (관리자/작성자/원장 외 비공개)"
                  }
                >
                  {status === "hidden" ? "해제" : "숨기기"}
                </button>
              )}
              {isAdminMode && adminExtras?.enableSoftDelete && (
                <button
                  type="button"
                  onClick={handleSoftDelete}
                  disabled={pending}
                  className="h-10 rounded-md bg-red-300 px-5 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
                  title="이 카드 삭제 (복구 가능)"
                >
                  지우기
                </button>
              )}
              {isAdminMode ? (
                <button
                  type="button"
                  onClick={() => submit("publish")}
                  disabled={pending}
                  className="h-10 rounded-md bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
                  title="수정 사항을 적용하고 발행"
                >
                  {pending ? "처리 중…" : "올리기"}
                </button>
              ) : (
                <>
                  {onOwnerDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm("이 글을 지울까요? 복구할 수 없어요.")) return;
                        setError(null);
                        try {
                          await onOwnerDelete();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "삭제 실패");
                        }
                      }}
                      disabled={pending}
                      className="h-10 rounded-md bg-red-300 px-5 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
                      title="이 글을 지웁니다"
                    >
                      지우기
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => submit("save")}
                    disabled={pending}
                    className="h-10 rounded-md bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
                    title="수정 사항 저장"
                  >
                    {pending ? "처리 중…" : "올리기"}
                  </button>
                </>
              )}
            </>
          ) : (
            // 일반 사용자: '올리기' 버튼만 노출 (저장/검수요청 제거 — 사용자 요청)
            <button
              type="button"
              onClick={() => submit("publish")}
              disabled={pending}
              className="h-10 rounded-md bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
              title="즉시 발행 (status=published)"
            >
              {pending ? "처리 중…" : "올리기"}
            </button>
          )}
        </div>

        {/* 자살/자해 안전 메시지 */}
        <ConfirmDialog
          open={pendingAction !== null}
          title="혹시 도움이 필요하신가요?"
          description={
            "입력하신 내용 중 어려운 시간을 보내고 계신 것 같은 표현이 보였어요.\n\n" +
            "도움을 받으실 수 있는 곳:\n" +
            "• 자살예방상담전화 109 (24시간)\n" +
            "• 정신건강위기상담 1577-0199\n" +
            "• 청소년상담 1388\n\n" +
            "그대로 작성을 계속하실 수 있고, 잠시 멈추고 도움받기를 선택하실 수도 있어요."
          }
          tone="primary"
          confirmLabel="계속 작성"
          cancelLabel="도움받기"
          onConfirm={() => {
            const action = pendingAction;
            setSuicideRiskAcknowledged(true);
            setPendingAction(null);
            if (action) doSubmit(action);
          }}
          onCancel={() => {
            setPendingAction(null);
          }}
        />
      </div>
    </div>
  );
}
