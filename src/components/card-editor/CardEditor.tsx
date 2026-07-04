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
 *   - 외부 링크 (ExternalLinkField — qa 영상 시작시간)
 *   - PubMed 참고문헌 (PubmedRefsField)
 *   - 태그 (KeywordsEditor)
 *   - 의사 명의 글쓰기 (doctorSlug — admin/doctor)
 *   - **adminExtras 일 때만**: author picker / doctor picker / isPick / status change /
 *     comment count / 시작시각(MM:SS) / 태그 자동추출 / soft-delete
 *
 * onSubmit 콜백 패턴:
 *   wrapper 가 정의. payload 에 모든 필드 포함해서 호출. wrapper 가 API 호출 + redirect.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useDraftAutoSave } from "@/hooks/useDraftAutoSave";
import { loadDraft, saveDraft, deleteDraft, type DraftFormType } from "@/lib/draft-storage";
import UnsavedChangesModal from "@/components/UnsavedChangesModal";
import { useRouter } from "next/navigation";
import { normalizeAnswerBody } from "@/lib/normalize-body";
import KeywordsEditor from "@/components/card-editor/KeywordsEditor";
import {
  categoriesForRole,
  labelForCategory,
  type PostCategorySlug,
} from "@/lib/post-category";
import {
  pubmedRefObjToString,
  splitBodyAndReferences,
  type PubmedRefObj,
} from "@/components/card-editor/fields/PubmedRefsField";
import { type ExternalMeta } from "@/components/card-editor/fields/ExternalLinkField";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  detectSuicideRisk,
  SAFETY_DIALOG_TITLE,
  SAFETY_DIALOG_DESCRIPTION,
} from "@/lib/safety";
// P2-2 (2026-05-27) — 1097줄 거대 컴포넌트를 4분할. 본 파일은 상위 컨테이너.
import CardEditorMeta from "@/components/card-editor/parts/CardEditorMeta";
import CardEditorBody from "@/components/card-editor/parts/CardEditorBody";
import CardEditorAttachments from "@/components/card-editor/parts/CardEditorAttachments";
import SlugField from "@/components/card-editor/fields/SlugField";

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
  /** admin extras 일 때만 추가됨 */
  status?: CardStatus;
  isPick?: boolean;
  doctorId?: string | null;
  authorProfileId?: string | null;
  startSeconds?: number;
  externalTitle?: string | null;
  /** admin edit — 잠금 전(status=draft) 의사 글의 URL slug 수정값. */
  postSlug?: string;
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
  /** URL slug 표시·편집 (의사 글 전용). show=active 명함 admin, editable=잠금 전(status=draft). */
  slug?: {
    show: boolean;
    editable: boolean;
    value: string;
    doctorId: string | null;
    doctorSlug: string | null;
    postYear: number;
    cardId: number;
  };
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

  /** create 모드 admin — 글쓴이 dropdown (참여 전문의). 선택 안 하면 본인 명의 (admin). */
  createAuthorOptions?: DoctorOption[];

  /** edit 모드 — 취소·저장 후 돌아갈 URL */
  returnUrl?: string;

  /** admin 전용 기능 묶음 (edit 모드 admin 페이지만) */
  adminExtras?: AdminExtras;

  /** create 모드 admin 만 — 검수 요청 버튼 노출 */
  showRequestReview?: boolean;

  /**
   * 카테고리 선택 줄 숨김 (값은 initialCategory 로 그대로 결정·저장).
   * /write(WriteClient) 에서만 true. 편집 화면은 미전달이라 기존대로 카테고리 줄 표시.
   */
  hideCategorySelector?: boolean;

  /** edit 모드 일반 사용자(원장·회원) — 본인 글 지우기 (soft-delete) 콜백.
   *  제공되면 [지우기] 버튼 노출. admin 은 adminExtras.onSoftDelete 사용. */
  onOwnerDelete?: () => Promise<void>;

  /** R2-2: 작성 내용 dirty 여부 보고(기존 isDirty 그대로) — /write 탭 전환 이탈 확인용. */
  onDirtyChange?: (dirty: boolean) => void;

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
  hideCategorySelector = false,
  onOwnerDelete,
  onDirtyChange,
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
  // admin edit — URL slug 수정값 (잠금 전 의사 글만 의미).
  const [postSlug, setPostSlug] = useState(adminExtras?.slug?.value ?? "");

  /* ── create 전용 state ──────────────────────────────────────── */
  // admin 의 글쓴이 dropdown 선택값 — "" 면 본인(관리자) 명의, slug 면 그 의사 명의.
  // doctor 본인은 자동 (myDoctor.slug). 회원은 항상 본인 명의.
  const [createAuthorSlug, setCreateAuthorSlug] = useState<string>("");

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

  /* ── 이탈 방지 (beforeunload + popstate 통합 가드) ─────── */
  const isDirty = !!(
    title.trim() ||
    body.trim() ||
    (keywords && keywords.length > 0)
  );

  // R2-2: /write 글 유형 탭 전환 가드용 dirty 신호 — 위 기존 isDirty 판정 그대로 보고(중복 판정식 없음).
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  /* ── 임시저장 자동저장 + 복원 (create 모드만) ─────────── */
  const draftType: DraftFormType = category === "qa" ? "qa" : "doodle";
  const getFields = useCallback(
    () => ({ title, body, keywords }),
    [title, body, keywords],
  );

  // C2 (2026-06-26): 이탈 모달 — create 모드는 [임시저장 후 종료]/[글쓰기 종료] type1.
  //   onSaveDraft: 떠나기 직전 1회 강제 저장(autosave 2초 디바운스 보강).
  //   onDiscardDraft: [글쓰기 종료] 시 임시저장 슬롯 삭제. edit 모드는 슬롯 없음 → no-op.
  const guard = useUnsavedChangesGuard(isDirty, {
    onSaveDraft: () => {
      if (mode === "create") saveDraft(draftType, getFields());
    },
    onDiscardDraft: () => {
      if (mode === "create") deleteDraft(draftType);
    },
  });

  const draft = useDraftAutoSave(
    draftType,
    mode === "create" && isDirty,
    [title, body, keywords],
    getFields,
  );
  useEffect(() => {
    if (mode !== "create") return;
    const saved = loadDraft(draftType);
    if (!saved?.fields) return;
    const f = saved.fields as { title?: string; body?: string; keywords?: string[] };
    if (f.title && !title) setTitle(f.title);
    if (f.body && !body) setBody(f.body);
    if (f.keywords?.length && !keywords.length) setKeywords(f.keywords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 파생 ──────────────────────────────────────────────────── */
  const isQa = category === "qa";
  const showRefs = isQa;
  // 외부 링크 — qa 영상 URL + 시작시각 전용 (doodle 등 일반 글은 외부 링크 영역 없음).
  const showExternal = isQa;
  const showStartTime = isQa; // 시작시각은 qa 영상용
  // 2026-05-22 사용자 결정: 라벨 통일 — qa 도 "제목"/"본문" (옛 "질문"/"답변" 폐기)
  const titleLabel = "제목";
  const bodyLabel = "본문";
  // 본문 글자수 한도 4000자 통일.
  const bodyMax = BODY_MAX_DEFAULT;
  const highlightSeed = String(initialCard?.cardId ?? "new");

  /* ── 카테고리 picker ──────────────────────────────────────── */
  // 현 카테고리는 qa / doodle 2종. qa(외부영상+PubMed) ↔ doodle(단순 텍스트) 간
  // 전환은 구조가 다르므로 입력값이 있으면 confirm.
  function changeCategory(next: PostCategorySlug) {
    if (next === category) return;
    if (title.trim() || body.trim() || keywords.length > 0) {
      const ok = window.confirm(
        "주의: 카테고리를 변경하면 일부 정보가 소실될 수 있습니다. 계속하시겠습니까?",
      );
      if (!ok) return;
    }
    setCategory(next);
    if (next !== "qa") {
      setReferences([""]);
      setRefsMeta([null]);
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
        body: JSON.stringify({ title, body }),
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
      // URL slug — 잠금 전(editable) 의사 글만 전송. 잠금이면 미전송(서버도 무시).
      if (adminExtras?.slug?.editable) {
        payload.postSlug = postSlug;
      }
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
      guard.markSubmitted();
      draft.clear();
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
  // doctorPickCount 는 서버 fetch 시점 값. 본인이 체크박스 토글하면 optimistic 가감
  // 으로 즉시 반영 (저장 후 router.refresh() 가 서버 카운트 재 fetch 하여 정합 복원).
  //   - 옛: 0/5 였는데 체크 → 0/5 그대로 (회귀)
  //   - 새: 0/5 였는데 체크 → 1/5 즉시 반영
  const initialIsPick = initialCard?.isPick ?? false;
  const adminPickCount =
    (adminExtras?.doctorPickCount ?? 0) +
    (isPick === initialIsPick ? 0 : isPick ? 1 : -1);

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
        {/* 메타데이터 영역 — 카테고리 picker + admin author/Pick + create admin author select.
            P2-2 (2026-05-27): 옛 코드는 create admin author select 가 키워드 아래에 있었지만,
            논리적으로 같은 "글쓴이 메타" 묶음이라 Meta 블록으로 통합. UI 동작·검증 동일. */}
        <CardEditorMeta
          mode={mode}
          viewerRole={viewerRole}
          initialCard={initialCard}
          pending={pending}
          category={category}
          availableCategories={availableCategories}
          initialChangeable={initialChangeable}
          onChangeCategory={changeCategory}
          hideCategorySelector={hideCategorySelector}
          isAdminMode={isAdminMode}
          adminExtras={adminExtras}
          authorProfileId={authorProfileId}
          onChangeAuthorProfileId={setAuthorProfileId}
          isPick={isPick}
          onChangeIsPick={setIsPick}
          adminPickCount={adminPickCount}
          createAuthorOptions={createAuthorOptions}
          createAuthorSlug={createAuthorSlug}
          onChangeCreateAuthorSlug={setCreateAuthorSlug}
        />

        {/* 첨부 영역 — 외부 링크 + 시작시각 (제목 바로 위, 원본 순서 유지) */}
        <CardEditorAttachments
          pending={pending}
          onError={setError}
          showExternal={showExternal}
          externalUrl={externalUrl}
          onChangeExternalUrl={setExternalUrl}
          externalMeta={externalMeta}
          onChangeExternalMeta={setExternalMeta}
          isAdminMode={isAdminMode}
          showStartTime={showStartTime}
          startInput={startInput}
          onChangeStartInput={setStartInput}
          onCommitStartInput={commitStartInput}
          onFetchOembedTitle={fetchOembedTitle}
          oembedLoading={oembedLoading}
          showRefs={showRefs}
          references={references}
          refsMeta={refsMeta}
          onChangeRefs={(v, m) => {
            setReferences(v);
            setRefsMeta(m);
          }}
          renderSection="external"
        />

        {/* 에디터 영역 — 제목 + 본문 (MarkdownBoldEditor / textarea) */}
        <CardEditorBody
          titleLabel={titleLabel}
          bodyLabel={bodyLabel}
          title={title}
          onChangeTitle={setTitle}
          body={body}
          onChangeBody={setBody}
          bodyMax={bodyMax}
          isQa={isQa}
          highlightSeed={highlightSeed}
          pending={pending}
        />

        {/* URL slug — admin 전용 (의사 글). 검수 발송/발행 글은 read-only 잠금. */}
        {adminExtras?.slug?.show && (
          <SlugField
            show={adminExtras.slug.show}
            editable={adminExtras.slug.editable}
            value={postSlug}
            onChange={setPostSlug}
            doctorId={adminExtras.slug.doctorId}
            doctorSlug={adminExtras.slug.doctorSlug}
            postYear={adminExtras.slug.postYear}
            excludeCardId={adminExtras.slug.cardId}
          />
        )}

        {/* 첨부 영역 — Q&A 참고문헌 (본문 아래) */}
        <CardEditorAttachments
          pending={pending}
          onError={setError}
          showExternal={false}
          externalUrl={externalUrl}
          onChangeExternalUrl={setExternalUrl}
          externalMeta={externalMeta}
          onChangeExternalMeta={setExternalMeta}
          isAdminMode={isAdminMode}
          showStartTime={false}
          startInput={startInput}
          onChangeStartInput={setStartInput}
          onCommitStartInput={commitStartInput}
          onFetchOembedTitle={fetchOembedTitle}
          oembedLoading={oembedLoading}
          showRefs={showRefs}
          references={references}
          refsMeta={refsMeta}
          onChangeRefs={(v, m) => {
            setReferences(v);
            setRefsMeta(m);
          }}
          renderSection="post-body"
        />

        {/* 태그 + (admin) LLM 자동추출 버튼 — 상위 컨테이너 보유 (LLM 호출이 컨테이너 상태 의존) */}
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

        {/* 자살/자해 안전 메시지 — 문구·키워드 SSOT = lib/safety.ts */}
        <ConfirmDialog
          open={pendingAction !== null}
          title={SAFETY_DIALOG_TITLE}
          description={SAFETY_DIALOG_DESCRIPTION}
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
      {guard.showModal && (
        <UnsavedChangesModal
          variant={mode === "create" ? "create" : "edit"}
          onSaveDraft={
            mode === "create" ? guard.confirmSaveAndLeave : undefined
          }
          onDiscard={guard.confirmDiscardAndLeave}
          onCancel={guard.cancelLeave}
        />
      )}
    </div>
  );
}
