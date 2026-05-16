"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import { CATEGORIES } from "@/lib/categories";
import { categorize } from "@/lib/category-sets";
import { PICK_IDS } from "@/lib/picks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import CommentsBlock from "@/components/CommentsBlock";
import RecentLikers from "@/components/RecentLikers";
import { getQaUrl, getQaEditUrl } from "@/lib/card-url";
import { getActiveIdentityId } from "@/lib/active-identity";
import {
  parseYoutubeTimestamp,
  formatTimestamp,
} from "@/lib/youtube-time";
import { labelForCategory } from "@/lib/post-category";
import { pickHighlight } from "@/lib/card-highlight";
import { enqueueImpression } from "@/lib/impression-queue";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import RelativeTime from "@/components/RelativeTime";

export type CardData = {
  id: number;
  question: string;
  answer: string;
  meta: string | null;
  keywords: string[];
  like_count: number;
  view_count: number;
  share_count?: number;
  comment_count?: number;
  /** v4 — 저장(북마크) 누적 수 (cards.save_count) */
  save_count?: number;
  type?: "card" | "post" | "link";
  created_at?: string;
  /** §2 SEO URL — /doctors/{slug}/{year}/{postSlug} canonical 생성용 */
  post_year?: number | null;
  post_slug?: string | null;
  /** v4 — 회원 글 URL용 8자 base58 식별자 */
  shortcode?: string | null;
  /** 외부 링크 — 모든 카테고리에서 옵션 (Phase 3). card 카테고리 외에서는 카드에 [더 알아보기] 버튼 노출 */
  external_url?: string | null;
  external_title?: string | null;
  external_description?: string | null;
  external_image?: string | null;
  external_site_name?: string | null;
  /** 글 분류 카테고리 (Phase 2) */
  category?: string | null;
  /** 의사 직함 숨김 (Phase A.2) — true면 사적 모드, "피부과 전문의" 배지 숨김 */
  hide_doctor_credential?: boolean | null;
  /** Phase 6 — 카드 하단 ref. 박스용 PubMed 단일 참고문헌. (legacy, 호환성 유지) */
  pubmed_ref?: {
    pmid?: string | null;
    doi?: string | null;
    title?: string | null;
    journal?: string | null;
    year?: string | null;
    authors_short?: string | null;
    pubmed_url?: string | null;
    doi_url?: string | null;
    reasoning?: string | null;
  } | null;
  /** Phase 9 (0054) — 멀티 참고문헌 배열. 있으면 우선, 없으면 pubmed_ref 사용 */
  pubmed_refs?: Array<{
    pmid?: string | null;
    doi?: string | null;
    title?: string | null;
    journal?: string | null;
    year?: string | null;
    authors_short?: string | null;
    pubmed_url?: string | null;
    doi_url?: string | null;
    reasoning?: string | null;
  }> | null;
  doctor: {
    slug: string;
    name: string;
    branch: string | null;
  } | null;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    /** v4 — 회원 핸들 (URL용) */
    handle?: string | null;
    /** v4 — avatar cache buster용. profile.updated_at (avatar 변경 시 갱신) */
    updated_at?: string | null;
  } | null;
  video: {
    youtube_id: string;
    youtube_url: string;
    topic: string | null;
    upload_date: string | null;
  } | null;
};

/**
 * Q&A 카드.
 * - 본문 클릭 → 부드럽게 펼치기/접기 토글
 * - 원장님 아바타 뒤 파스텔 배경 (식별성)
 * - fadeInUp 애니메이션
 */
type Props = {
  card: CardData;
  /** 검색어 — 일치하는 태그 칩은 카테고리 색, 본문은 노란 mark */
  activeQuery?: string;
  /** 칩 클릭 시 검색 URL에 boost로 함께 전달 (원장님 단일 페이지에서 사용) */
  boostDoctorSlug?: string;
  /** 이 카드가 HOT인지 (서버에서 계산한 hot id set 기준) */
  isHot?: boolean;
  /** 단독 페이지(/doctors/{slug}/{year}/{slug}, /[handle]/[shortcode])에서 사용 — 댓글 자동 열림 */
  autoExpandComments?: boolean;
  /** 단독 페이지: 본문 자동 펼침 (line-clamp 해제). 짧은 글이면 영향 없음. */
  forceExpanded?: boolean;
  /** 단독 페이지: 질문을 h1으로 렌더 (페이지당 h1 1개 룰). 피드/리스트에서는 h2 유지. */
  asH1?: boolean;
  /** v4 — viewer의 좋아요/저장 초기 상태 (server prefetch).
   * 있으면 useEffect fetch 생략 → 카드가 즉시 정확한 상태로 렌더 (2~3초 지연 제거). */
  viewerLiked?: boolean;
  viewerSaved?: boolean;
};

// 카드별 결정적 형광펜 색은 lib/card-highlight.ts 의 pickHighlight 사용
// (Yellow / Mint / Lavender / Sky Blue 4색 — 카드 ID 해시로 결정. SSR safe)

export default function Card({
  card,
  activeQuery,
  boostDoctorSlug,
  isHot = false,
  autoExpandComments = false,
  forceExpanded = false,
  asH1 = false,
  viewerLiked,
  viewerSaved,
}: Props) {
  const highlightColor = pickHighlight(
    String(card.shortcode ?? card.post_slug ?? card.id ?? "")
  );
  const [expanded, setExpanded] = useState(forceExpanded);
  const [viewCount, setViewCount] = useState(card.view_count);
  const [likeCount, setLikeCount] = useState(card.like_count);
  const [shareCount, setShareCount] = useState(card.share_count ?? 0);
  const [commentCount, setCommentCount] = useState(card.comment_count ?? 0);
  // 단독 페이지에서는 댓글창 자동 열림 (autoExpandComments)
  const [commentsOpen, setCommentsOpen] = useState(autoExpandComments);
  // 20번 — 모바일: 다른 카드 댓글창 열리면 본 카드 댓글창 닫기 (focus single).
  //   데스크탑은 이 이벤트 미발사 (송신 측에서 width 768 분기).
  useEffect(() => {
    function onOtherOpened(e: Event) {
      const det = (e as CustomEvent<{ cardId: number }>).detail;
      if (det && det.cardId !== card.id) setCommentsOpen(false);
    }
    window.addEventListener("pibutenten:comments-opened", onOtherOpened);
    return () =>
      window.removeEventListener("pibutenten:comments-opened", onOtherOpened);
  }, [card.id]);
  const [liked, setLiked] = useState(viewerLiked ?? false);
  // v4 — 저장(북마크) (server prefetch가 있으면 즉시 적용 → 2~3초 지연 제거)
  const [saved, setSaved] = useState(viewerSaved ?? false);
  const [saveCount, setSaveCount] = useState(card.save_count ?? 0);
  const [savePending, setSavePending] = useState(false);
  // 정책 (2026-05-15 재정의): me.id / me.role 모두 **active profile.id 단일** 기준.
  // - id: active profile.id (cookie 'pibutenten:identity' 기반, 'primary' 면 user.id)
  // - role: active profile 자체의 role (묶음 최고 권한 X)
  // → 본인 글 편집/⋮ 메뉴는 active == author 일 때만 노출. ID 전환 시 권한도 함께 전환됨.
  // 3-state: undefined=로딩 중 / null=비로그인 / obj=로그인.
  // 로딩 중에 좋아요/저장/평가 클릭 시 잘못된 login redirect 방지 (race 차단).
  const [me, setMe] = useState<
    { id: string; role: "admin" | "doctor" | "user" } | null | undefined
  >(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  // 비로그인 사용자가 로그인 필요 액션 시도 시 띄울 모달 (인스타·트위터 표준 UX)
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(card.question);
  const [editBody, setEditBody] = useState(card.answer);
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 24번 — 삭제 성공 후 카드가 fade-out + collapse 후 사라지는 애니메이션
  const [vanishing, setVanishing] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const doctor = card.doctor;
  const isPick = PICK_IDS.has(card.id);

  // 노출(impression) +1 — 큐에 enqueue (session 1회 dedup은 sessionStorage로 차단).
  // 조회(view)와 분리: 노출 = 단순 등장, 조회 = 의도 신호.
  // engagement rate = view_count / impression_count 로 인기도 평가 가능.
  // DB trigger(0048)가 cards.impression_count 자동 +1.
  // 배치: enqueueImpression이 800ms 디바운스로 모아 1회 INSERT (홈 21건 → 1건).
  // 방문자 분리 집계 — active identity의 profile.id를 user_id로 저장 (큐 모듈 내부에서 결정).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (forceExpanded) return; // 단독 페이지는 피드 노출과 무관
    const impKey = `pibutenten:imp:${card.id}`;
    if (sessionStorage.getItem(impKey)) return;
    sessionStorage.setItem(impKey, "1");
    enqueueImpression(card.id);
  }, [card.id, forceExpanded]);

  // 조회수 +1 helper — 의도 신호일 때만 호출.
  // card_views.insert만 호출. DB trigger(0047)가 cards.view_count도 자동 +1 동기화.
  // 두 메트릭(이벤트 로그 + 누적 카운터) 항상 일치 — 코드 단순화.
  // session_id 기반 dedup — 같은 세션 같은 card는 1회만.
  const recordView = useCallback(() => {
    if (typeof window === "undefined") return;
    const seenKey = `pibutenten:view:${card.id}`;
    if (sessionStorage.getItem(seenKey)) return; // 이미 카운팅한 세션
    sessionStorage.setItem(seenKey, "1");

    let sessionId = sessionStorage.getItem("pibutenten:sid");
    if (!sessionId) {
      sessionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem("pibutenten:sid", sessionId);
    }

    // optimistic UI update — 카드 조회수 표시 즉시 +1 (trigger가 DB도 +1)
    setViewCount((v) => (typeof v === "number" ? v + 1 : 1));

    (async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await sb.auth.getUser();
        // active identity 분리 집계 — 같은 묶음 내 ID 전환 시 별도 user_id로 카운트
        const activeId = getActiveIdentityId();
        const userId = user ? (activeId ?? user.id) : null;
        await sb.from("card_views").insert({
          card_id: card.id,
          user_id: userId,
          session_id: sessionId,
        });
        window.dispatchEvent(new CustomEvent("pibutenten:card-viewed"));
      } catch (e) {
        // 트래킹 실패는 UX에 영향 X — silent fail 이지만 운영 가시성 위해 콘솔 로그
        console.error("[card_views] insert failed:", e);
      }
    })();
  }, [card.id]);

  // 조회수 트리거 — 4-10초 dwell 윈도우 (사용자 정책).
  //
  // 카드가 viewport 이탈할 때 머문 시간 측정:
  //   · 4초 미만: 스쳐 지나감 → X
  //   · 4초 ≤ dwell ≤ 10초: 실제 읽음 → 카운팅 ✅
  //   · 10초 초과: 자리비움(딴짓 의심) → X
  //
  // 첫 화면 스크롤 없이 등장한 카드는 dwell 시작 자체를 안 함 → 카운팅 X.
  //
  // 명시적 트리거 (dwell 윈도우와 무관하게 즉시 카운팅):
  //   1. 단독 페이지 진입 (forceExpanded=true)
  //   2. 카드 펼침 (더보기 클릭)
  //   3. 영상 보러가기 클릭
  //
  // session_id 기반 dedup — 같은 세션 같은 qa는 1회만.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 단독 페이지 진입 = 명확한 의도 → 즉시 카운트
    if (forceExpanded) {
      recordView();
      return;
    }
    const card = cardRef.current;
    if (!card) return;

    const DWELL_MIN_MS = 4000;
    const DWELL_MAX_MS = 10000;
    let scrolled = false;
    let dwellStartTime: number | null = null;

    function onScroll() {
      if (scrolled) return;
      scrolled = true;
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          // 카드 진입 — dwell 타이머 시작 (단, 페이지 스크롤 발생 후에만)
          if (scrolled) dwellStartTime = Date.now();
        } else {
          // 카드 이탈 — dwell 시간 측정 + 윈도우 검사
          if (dwellStartTime !== null) {
            const dwellMs = Date.now() - dwellStartTime;
            dwellStartTime = null;
            if (dwellMs >= DWELL_MIN_MS && dwellMs <= DWELL_MAX_MS) {
              recordView();
              observer.disconnect();
            }
            // 4초 미만(스쳐감) or 10초 초과(딴짓) → 무시
          }
        }
      },
      {
        rootMargin: "-35% 0px -35% 0px",
        threshold: 0.01,
      },
    );
    observer.observe(card);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [card.id, forceExpanded, recordView]);

  // 좋아요 + 저장 상태 초기화 — server prefetch가 있으면 client fetch 생략.
  // 미로그인 사용자만 localStorage에서 좋아요 기억 복원.
  const hasViewerPrefetch =
    viewerLiked !== undefined || viewerSaved !== undefined;
  useEffect(() => {
    if (hasViewerPrefetch) return; // 서버에서 이미 받음 → fetch 생략
    let alive = true;
    (async () => {
      if (typeof window === "undefined") return;
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // 정책 (2026-05-15 재정의): 활동(좋아요/저장) 표시는 **active profile.id 단일** 기준.
        // 묶음의 다른 profile 로 누른 좋아요는 그 profile 의 활동 — 본인이라도 active 가 다르면 OFF.
        // active = cookie 'pibutenten:identity' = 'primary' 면 user.id, UUID 면 그 값.
        const activeId = getActiveIdentityId() ?? user.id;

        const [likeRes, saveRes] = await Promise.all([
          supabase
            .from("card_likes")
            .select("card_id")
            .eq("card_id", card.id)
            .eq("user_id", activeId)
            .limit(1)
            .maybeSingle(),
          supabase
            .from("card_saves")
            .select("card_id")
            .eq("card_id", card.id)
            .eq("user_id", activeId)
            .limit(1)
            .maybeSingle(),
        ]);
        if (!alive) return;
        setLiked(!!likeRes.data);
        setSaved(!!saveRes.data);
      } else {
        if (alive) setLiked(lsGet(`card-liked-${card.id}`) === "1");
      }
    })();
    return () => {
      alive = false;
    };
  }, [card.id, hasViewerPrefetch]);

  // 저장 토글 — 로그인 필수, 진행 중 클릭 무시 (자꾸 풀리는 문제 방지).
  // ⚠️ 모든 경로에서 setSavePending(false)로 풀어야 다음 클릭이 막히지 않음.
  async function handleSave() {
    if (typeof window === "undefined") return;
    // me 로딩 중(undefined) → 무시. 비로그인(null) → 로그인 안내 모달.
    if (me === undefined) return;
    if (me === null) {
      setAuthPrompt("저장하려면 회원가입이 필요해요");
      return;
    }
    if (savePending) return;
    setSavePending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const wasSaved = saved;
      // 낙관적
      setSaved(!wasSaved);
      setSaveCount((c) => (wasSaved ? Math.max(0, c - 1) : c + 1));
      // v5.1+ identity 기반 RPC (PK=(identity_id, card_id))
      const activeIdentityId = getActiveIdentityId();
      const { data, error } = await supabase.rpc("toggle_card_save", {
        p_card_id: card.id,
        p_identity_id: activeIdentityId,
      });
      if (error) {
        console.error("[toggle_card_save]", error);
        alert((wasSaved ? "저장 취소" : "저장") + " 실패: " + error.message);
        // 낙관적 복원
        setSaved(wasSaved);
        setSaveCount((c) => (wasSaved ? c + 1 : Math.max(0, c - 1)));
        return;
      }
      const row = (data as { saved: boolean; save_count: number }[] | null)?.[0];
      if (row) {
        setSaved(row.saved);
        setSaveCount(row.save_count);
      }
      // 트리거가 갱신한 정확한 save_count 재조회
      const { data: q } = await supabase
        .from("cards")
        .select("save_count")
        .eq("id", card.id)
        .maybeSingle();
      if (q) setSaveCount(Number((q as { save_count: number }).save_count ?? 0));
    } finally {
      // 어떤 경로로 끝나든 무조건 pending 해제 — 다음 클릭 가능
      setSavePending(false);
    }
  }

  // localStorage 안전 접근 헬퍼 (인앱 브라우저 sandbox 방어)
  function lsGet(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function lsSet(key: string, val: string) {
    try {
      localStorage.setItem(key, val);
    } catch {
      /* ignore — Google/카톡 인앱 sandbox */
    }
  }
  function lsRemove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function handleLike() {
    if (typeof window === "undefined") return;
    // me 로딩 중(undefined) → 무시. 로딩 race 차단.
    // 비로그인(null) → 로그인 안내 모달.
    if (me === undefined) return;
    if (me === null) {
      setAuthPrompt("좋아요를 누르려면 회원가입이 필요해요");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const wasLiked = liked;
    // 낙관적 UI 업데이트
    setLiked(!wasLiked);
    setLikeCount((c) => (wasLiked ? Math.max(0, c - 1) : c + 1));

    (async () => {
      try {
        const { data, error } = await supabase.rpc("toggle_card_like", {
          p_card_id: card.id,
          p_identity_id: getActiveIdentityId(),
        });
        if (error) throw error;
        const row = (data as { liked: boolean; like_count: number }[] | null)?.[0];
        if (row) {
          setLiked(row.liked);
          setLikeCount(row.like_count);
          if (row.liked) lsSet(`card-liked-${card.id}`, "1");
          else lsRemove(`card-liked-${card.id}`);
        }
      } catch (e) {
        // RPC 실패 — UI 롤백 + 콘솔 로깅 (silent fail 방지)
        console.error("[handleLike] toggle_card_like failed:", e);
        setLiked(wasLiked);
        setLikeCount((c) => (wasLiked ? c + 1 : Math.max(0, c - 1)));
      }
    })();
  }
  const theme = doctor ? getDoctorTheme(doctor.slug) : null;
  const photo = doctor ? getDoctorPhoto(doctor.slug) : null;
  // 모든 글 단일 시간 기준 — cards.created_at (영상 글은 backfill로 video.upload_date와 동기화됨)
  // SNS 표준 상대시간 + 호버 시 절대 날짜.
  // P1-4 fix — relativeTime() 직접 호출 대신 <RelativeTime/> 컴포넌트 사용 (hydration mismatch 방지).
  const hasDate = !!card.created_at;
  const dateAbsolute = card.created_at
    ? absoluteDateTimeLabel(card.created_at)
    : null;
  const dateIso = card.created_at ?? undefined;

  // Card 아바타용 offset (avatarOffsetX/Y 우선, 없으면 offsetX/Y * 0.46)
  const avatarTx =
    theme?.avatarOffsetX ?? (theme?.offsetX ?? 0) * 0.46;
  const avatarTy =
    theme?.avatarOffsetY ?? (theme?.offsetY ?? 0) * 0.46;

  // 검색어가 어느 카테고리에 속하는지 판정 → 칩 강조 색
  // 단, 글 카테고리 라벨(Q&A/꿀팁/피부일기/궁금해요/소식공유/끄적끄적)이면 콘텐츠 카테고리 추정 X
  // (그 라벨은 search/page.tsx 에서 category 컬럼 직접 필터로 분기됨)
  const POST_CATEGORY_LABELS = new Set([
    "Q&A", "피부꿀팁", "피부일기", "궁금해요", "소식공유", "끄적끄적",
  ]);
  const queryCategoryColor =
    activeQuery && !POST_CATEGORY_LABELS.has(activeQuery)
      ? CATEGORIES.find((c) => c.slug === categorize(activeQuery))?.color
      : null;

  // 현재 로그인 사용자 + Phase 9 묶음 정보
  // me 결정: active profile.id 단일 조회 (정책 재정의 2026-05-15).
  //   - cookie 'pibutenten:identity' = 'primary' 또는 미설정 → user.id (primary profile.id)
  //   - cookie UUID → 그 profile.id (단 본인 묶음 안 멤버여야 함, 보안 검증)
  //   - role 도 그 active profile 자체의 role 만 사용 (묶음 최고 권한 X)
  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!alive) return;
      // 비로그인 — me=null 명시 (로딩 중 undefined 와 구분)
      if (!user) {
        setMe(null);
        return;
      }
      const activeId = getActiveIdentityId() ?? user.id;
      // 단일 profile 조회 — 본인 묶음 안 멤버 검증 포함
      const { data: prof } = await sb
        .from("profiles")
        .select("id, role, auth_user_id")
        .eq("id", activeId)
        .maybeSingle();
      if (!alive) return;
      const row = prof as { id: string; role: string; auth_user_id: string } | null;
      // 본인 묶음 검증 — 다른 사람 profile cookie 위조 차단
      const isMine = !!row && (row.id === user.id || row.auth_user_id === user.id);
      if (!isMine) {
        // fallback: primary profile (= user.id) 로
        setMe({ id: user.id, role: "user" });
        return;
      }
      const role = ((row?.role as string) ?? "user") as "admin" | "doctor" | "user";
      setMe({ id: activeId, role });
    })();
    return () => { alive = false; };
  }, []);

  // 옛 mount 즉시 qa_views INSERT는 제거됨 (옵션 A 적용 — 의도 신호일 때만).
  // 노출(impression)은 위쪽 useEffect에서, 조회(view)는 recordView()에서 처리.

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

  // 수정/삭제 권한 (정책 재정의 2026-05-15):
  //   - active=admin: 모든 글
  //   - 그 외: active profile.id == card.author?.id 일 때만 (active 단일 매칭)
  //     → 같은 묶음의 다른 ID 로 쓴 글은 ⋮ 안 보임. 그 ID 로 전환해야 편집 가능.
  const canEdit =
    !!me &&
    (me.role === "admin" ||
      (card.author?.id != null && me.id === card.author.id));

  async function saveEdit() {
    if (!editTitle.trim() || !editBody.trim()) {
      alert("제목과 본문을 입력해주세요.");
      return;
    }
    setEditSaving(true);
    try {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb
        .from("cards")
        .update({ question: editTitle.trim(), answer: editBody.trim() })
        .eq("id", card.id);
      if (error) {
        alert("수정 실패: " + error.message);
      } else {
        setIsEditing(false);
        router.refresh();
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function performDelete() {
    setDeleting(true);
    try {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb.from("cards").delete().eq("id", card.id);
      if (error) {
        alert("삭제 실패: " + error.message);
        setDeleting(false);
        return;
      }
      setConfirmDeleteOpen(false);

      // 24번 — 카드 사라지는 애니메이션 (fade-out + collapse).
      // 1) vanishing=true → CSS transition 으로 max-height/opacity/margin 축소 (320ms)
      // 2) 단일 페이지면 push, 피드면 dispatch + refresh (애니메이션 이후)
      const path = window.location.pathname;
      const isSinglePage =
        (card.post_slug && path.includes(`/${card.post_slug}`)) ||
        (card.shortcode && path.endsWith(`/${card.shortcode}`));

      if (isSinglePage) {
        // 단일 페이지 — 즉시 이동 (페이지 자체가 사라지므로 카드 애니메이션 의미 없음)
        router.push("/");
        return;
      }

      // 피드/검색/대시보드 — 카드 자체에 vanishing 애니메이션 적용
      setVanishing(true);
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("pibutenten:card-deleted", { detail: { id: card.id } }),
        );
        router.refresh();
      }, 340);
    } catch (e) {
      void e;
      setDeleting(false);
    }
  }

  // 24시간 내 글 → NEW 배지
  const isNew = (() => {
    if (!card.created_at) return false;
    const t = new Date(card.created_at).getTime();
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < 24 * 60 * 60 * 1000;
  })();

  // 본문 길이 — 짧으면 "더보기" 토글 비표시 (250자 미만 또는 줄바꿈 5줄 미만)
  const answerLines = (card.answer ?? "").split("\n").length;
  const isLongAnswer = (card.answer?.length ?? 0) > 250 || answerLines >= 6;

  // hide_doctor_credential — 의사가 카테고리·토글로 직함 숨긴 경우 (Phase A.2)
  const credentialHidden = Boolean(card.hide_doctor_credential);
  const showAsDoctor = !!doctor && !credentialHidden;
  const authorName =
    doctor?.name ?? card.author?.display_name ?? "익명";
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

  return (
    <article
      ref={cardRef}
      // 24번 — vanishing=true 면 fade-out + collapse 애니메이션 (삭제 직후).
      //   max-height 는 일시적 estimate; transition 후 부모 listener 가 React unmount.
      style={
        vanishing
          ? {
              maxHeight: 0,
              opacity: 0,
              marginTop: 0,
              marginBottom: 0,
              paddingTop: 0,
              paddingBottom: 0,
              overflow: "hidden",
              transition:
                "max-height 320ms ease, opacity 220ms ease, margin 320ms ease, padding 320ms ease",
            }
          : undefined
      }
      className="fade-in-up relative rounded-[var(--radius)] bg-white p-[18px_20px]"
    >
      {(isPick || isHot || isNew) && (
        // 카드 상단 안쪽에서 매달려 내려오는 딱지 — 카드 위로 올라가지 않음
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
      {isEditing ? (
        /* 인라인 편집 모드 */
        <div className="mb-3 space-y-2">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            maxLength={200}
            className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-[15px] font-bold focus:border-[var(--primary)] focus:outline-none"
            placeholder="제목"
          />
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={6}
            maxLength={4000}
            className="w-full resize-y rounded-md border border-[var(--border)] p-3 text-[14px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none"
            placeholder="본문"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditTitle(card.question);
                setEditBody(card.answer);
              }}
              className="rounded-md px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={editSaving}
              className="rounded-md bg-[var(--primary)] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
            >
              {editSaving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      ) : (
        <>
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
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-[22px] w-[22px]" aria-hidden>
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-28 overflow-hidden rounded-md border border-[var(--border)] bg-white py-1 shadow-lg">
                  {(() => {
                    const editHref = getQaEditUrl(card);
                    if (!editHref) return null;
                    return (
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
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDeleteOpen(true);
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
            onClick={(e) => {
              e.stopPropagation();
              if (showAsDoctor && doctor?.slug) {
                router.push(`/doctors/${doctor.slug}`);
              } else if (card.author?.handle) {
                router.push(`/${card.author.handle}`);
              } else if (card.author?.id) {
                router.push(`/u/${card.author.id}`);
              }
            }}
            disabled={!showAsDoctor && !card.author?.id}
            className={
              "mb-3 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-md py-1.5 px-1 text-left transition-colors " +
              (showAsDoctor || card.author?.id
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
                background: showAsDoctor ? theme?.bg ?? "var(--bg-soft)" : "var(--bg-soft)",
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
                      viewBox="0 0 24 24"
                      fill="#5BB0D1"
                      className="h-[12px] w-[12px]"
                      aria-hidden
                    >
                      <path d="M22.5 12.5l-2.7-3 .4-4-3.9-.9-2-3.5-3.7 1.9-3.7-1.9-2 3.5-3.9.8.4 4-2.7 3 2.7 3-.4 4 3.9.9 2 3.5 3.7-1.9 3.7 1.9 2-3.5 3.9-.8-.4-4 2.6-3zM10 17.5L5.5 13l1.7-1.7L10 14.1l6.7-6.7L18.4 9 10 17.5z" />
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

          {/* 2. 제목 — 하늘색(브랜드 primary), 클릭 시 단독 페이지로 이동.
              내부 링크 신호(PageRank · 앵커 텍스트) 누적 + 크롤러가 단독 URL 색인 가능.
              asH1=true(단독 페이지)면 <h1>, 그 외 피드/리스트에서는 <h2>. */}
          {asH1 ? (
            <h1 className="mb-2.5 whitespace-pre-wrap text-[17px] font-bold leading-[1.45] tracking-[-0.3px]">
              <Link
                href={getQaUrl(card)}
                className="text-[var(--primary)] hover:underline"
              >
                {highlight(card.question, activeQuery)}
              </Link>
            </h1>
          ) : (
            <h2 className="mb-2.5 whitespace-pre-wrap text-[17px] font-bold leading-[1.45] tracking-[-0.3px]">
              <Link
                href={getQaUrl(card)}
                className="text-[var(--primary)] hover:underline"
              >
                {highlight(card.question, activeQuery)}
              </Link>
            </h2>
          )}

          {/* 3. 본문 — 단락(\n\n) 분리 + **bold** 인라인(형광펜 하이라이트) 렌더링.
              isLongAnswer && !expanded → 첫 단락만 line-clamp-4(mobile)/md:line-clamp-5(desktop)로 가림.
              expanded → 전체 단락 + 참고문헌까지 펼침.
              6번 — forceExpanded (글 단독 페이지) 일 때는 본문 클릭으로도 접기 불가 (사용자 요청). */}
          <div
            onClick={() => {
              if (!isLongAnswer) return;
              if (forceExpanded) return; // 단독 페이지: 접기 차단
              // 펼침 클릭 = 명확한 의도 → 조회 카운트 (recordView가 session dedup)
              if (!expanded) recordView();
              setExpanded((v) => !v);
            }}
            className={isLongAnswer && !forceExpanded ? "cursor-pointer" : ""}
          >
            {renderAnswerBody(card.answer, activeQuery, isLongAnswer && !expanded, highlightColor)}
          </div>

          {/* 3a. 참고 논문 — 멀티 ref 지원.
              pubmed_refs(배열) 우선, 없으면 단일 pubmed_ref(legacy) fallback.
              isLongAnswer && !expanded면 가림(펼쳐야 보임). reasoning은 사용자 화면 X. */}
          {(() => {
            // 표시할 ref 배열 결정
            const refs: NonNullable<CardData["pubmed_refs"]> =
              card.pubmed_refs && card.pubmed_refs.length > 0
                ? card.pubmed_refs
                : card.pubmed_ref
                  ? [card.pubmed_ref]
                  : [];
            // 유효한 ref만 (pmid 또는 doi 있는 것)
            const validRefs = refs.filter((r) => r.pmid || r.doi);
            if (validRefs.length === 0) return null;
            if (isLongAnswer && !expanded) return null;
            return (
              <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                <div className="text-[10px] font-semibold tracking-[0.04em] text-[var(--text-muted)]/70">
                  참고문헌{validRefs.length > 1 ? ` (${validRefs.length})` : ""}
                </div>
                <ul className="mt-0.5 space-y-1 text-[13px] leading-[1.55] text-[var(--text-muted)]">
                  {validRefs.map((r, idx) => {
                    const linkHref = r.pubmed_url || r.doi_url;
                    return (
                      <li key={`${r.pmid ?? r.doi ?? idx}-${idx}`}>
                        <cite
                          itemScope
                          itemType="https://schema.org/ScholarlyArticle"
                          className="not-italic"
                        >
                          {validRefs.length > 1 && (
                            <span className="mr-1 text-[var(--text-muted)]/70">
                              {idx + 1}.
                            </span>
                          )}
                          {linkHref ? (
                            <a
                              href={linkHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                              style={{ color: "var(--primary)" }}
                              itemProp="url"
                            >
                              <span itemProp="name">{r.title}</span>
                            </a>
                          ) : (
                            <span itemProp="name">{r.title}</span>
                          )}
                          {r.authors_short && (
                            <>
                              {" — "}
                              <span itemProp="author">{r.authors_short}</span>
                            </>
                          )}
                          {r.journal && (
                            <>
                              {", "}
                              <span itemProp="publisher">{r.journal}</span>
                            </>
                          )}
                          {r.year && (
                            <>
                              {" ("}
                              <span itemProp="datePublished">{r.year}</span>
                              {")"}
                            </>
                          )}
                        </cite>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </>
      )}
      <div className="mt-2 flex items-center gap-3 text-[12px]">
        {/* 더보기 버튼 제거 — 본문 클릭으로 펼침/접기 */}
        {(() => {
          // 영상 링크 우선순위:
          //  1) Q&A 카테고리 + external_url(youtube) → 영상 보러가기 + timestamp (?t=...)
          //  2) videos 테이블 join (legacy backfill, timestamp 없음)
          //  3) 그 외 카테고리 + external_url → [더 알아보기]
          // 정정 (2026-05-15): 옛 코드 'card.category === "card"' 는 항상 false 였음
          //   (category enum: 'qa'|'tip'|'diary'|'ask'|'link'). 이로 인해 external_url
          //   분기를 타지 못해 videos.youtube_url(timestamp 없음) 으로 fallback 되며
          //   모든 Q&A 영상의 시작 시간이 표시되지 않던 회귀 fix.
          const isQa = card.category === "qa";
          const ext = card.external_url;
          const isYoutubeExt =
            ext && /(?:youtu\.be|youtube\.com|youtube-nocookie\.com)/.test(ext);
          const videoHref =
            isQa && isYoutubeExt
              ? ext
              : card.video?.youtube_url ?? null;
          const tsec = parseYoutubeTimestamp(videoHref);
          if (videoHref) {
            return (
              <a
                href={videoHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                  // 영상 보러가기 클릭 = 조회수 +1 (recordView가 session dedup + trigger)
                  recordView();
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)]/60 hover:text-[var(--primary)]"
              >
                <span style={{ color: "#FF0000" }}>▶</span>{" "}
                영상 보러가기
                {tsec !== null && (
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {formatTimestamp(tsec)}~
                  </span>
                )}
              </a>
            );
          }
          // Q&A 외 카테고리 + external_url (영상 아님) → [더 알아보기]
          if (!isQa && ext) {
            return (
              <a
                href={ext}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)]/60 hover:text-[var(--primary-light-hover)]"
              >
                <span aria-hidden>↗</span> 더 알아보기
              </a>
            );
          }
          return null;
        })()}
      </div>

      {/* 태그 칩 — 사용자 키워드 + 자동 카테고리 칩(맨 끝).
          v5.2: 카테고리 라벨(끄적끄적/피부일기/피부꿀팁/궁금해요/소식공유/Q&A) 을
          모든 글의 태그 맨 끝에 자동 append. 클릭하면 /search?q=라벨 로 같은
          카테고리 글만 보임. 사용자 직접 입력은 받지 않음 (자동). */}
      {(() => {
        // 옛 데이터에 사용자가 직접 입력한 카테고리 라벨이 있으면 중복 방지로 제거
        const CATEGORY_LABELS = [
          "Q&A", "답해드려요",
          "꿀팁", "피부꿀팁",
          "피부일기",
          "물어봐요", "궁금해요",
          "새소식", "공유하기", "소식공유",
          "끄적끄적",
        ];
        const userKeywords = card.keywords.filter(
          (k) => !CATEGORY_LABELS.includes(k),
        );
        // 현재 글의 category 라벨을 마지막에 자동 추가
        const categoryLabel = card.category
          ? labelForCategory(card.category)
          : null;
        const visibleKeywords = categoryLabel
          ? [...userKeywords, categoryLabel]
          : userKeywords;
        if (visibleKeywords.length === 0) return null;
        return (
        <Keywords
          keywords={visibleKeywords}
          activeQuery={activeQuery}
          queryCategoryColor={queryCategoryColor ?? null}
          forceShowAll={expanded || forceExpanded}
          onPick={(kw) => {
            const params = new URLSearchParams({ q: kw });
            if (boostDoctorSlug) params.set("boost", boostDoctorSlug);
            // v3 URL 정책: 검색은 /search 로 분리됨
            router.push(`/search?${params.toString()}`);
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        />
        );
      })()}

      {/* footer: 좋아요 · 댓글 · 저장 (좌측 묶음) — 공유 (우측)
          v5.1+:
           - 좋아요: ♥ Heart + accent coral (#FF6B81)
           - 저장(북마크): 따뜻한 호박색 (#F59E0B amber-500, 톤앤매너)
           - 공유: 우측 정렬 (ml-auto) */}
      <div className="flex items-center gap-4 pt-3 text-[14px] text-[var(--text-secondary)]">
        <button
          type="button"
          onClick={handleLike}
          aria-label={liked ? "좋아요 취소" : "좋아요"}
          aria-pressed={liked}
          className={
            "flex cursor-pointer items-center gap-1 transition-colors " +
            (liked
              ? "text-[var(--accent)]"
              : "text-[var(--text-secondary)] hover:text-[var(--accent)]")
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              "h-[22px] w-[22px] transition-transform " +
              (liked ? "like-pulse" : "")
            }
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>

        <button
          type="button"
          onClick={() => {
            // 20번 — 모바일: 다른 카드 댓글창 열려 있으면 닫음 (포커스 이동 자연스럽게).
            // 데스크탑은 그대로 유지 (병렬 편집 가능). 768px 기준.
            setCommentsOpen((v) => {
              const next = !v;
              if (next && typeof window !== "undefined" && window.innerWidth <= 768) {
                window.dispatchEvent(
                  new CustomEvent("pibutenten:comments-opened", {
                    detail: { cardId: card.id },
                  }),
                );
              }
              return next;
            });
          }}
          className="flex cursor-pointer items-center gap-1 transition-colors hover:text-[var(--primary)]"
          aria-label="댓글"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[22px] w-[22px]"
            aria-hidden
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>

        {/* 저장(북마크) — 따뜻한 호박색 (amber-500 #F59E0B). 좌측 묶음 */}
        <button
          type="button"
          onClick={handleSave}
          aria-label={saved ? "저장 취소" : "저장"}
          aria-pressed={saved}
          className={
            "flex cursor-pointer items-center gap-1 transition-colors " +
            (saved
              ? "text-[#F59E0B]"
              : "text-[var(--text-secondary)] hover:text-[#F59E0B]")
          }
          title={saved ? "저장 취소" : "저장"}
        >
          <svg
            viewBox="0 0 24 24"
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[22px] w-[22px]"
            aria-hidden
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          {saveCount > 0 && <span>{saveCount}</span>}
        </button>

        {/* 공유 — 우측 정렬 (ml-auto) */}
        <button
          type="button"
          onClick={async () => {
            const channel = await shareCard(card);
            // 사용자가 native share dialog를 취소한 경우(channel=null): 카운트 X
            if (!channel) return;
            // card_shares row insert — 트리거(0095)가 cards.share_count 자동 +1.
            // user_id: active profile.id (Phase 9) 또는 비로그인 시 null (익명 카운트).
            // channel: "native" (모바일 OS 공유) | "link-copy" (데스크탑 클립보드).
            // 패턴은 card_views / card_impressions 와 동일.
            const supabase = createSupabaseBrowserClient();
            const { data: u } = await supabase.auth.getUser();
            const activeId = getActiveIdentityId();
            const userId = u.user ? (activeId ?? u.user.id) : null;
            // 낙관적 UI: setShareCount 즉시 +1, fail 시 rollback
            const prevCount = shareCount;
            setShareCount((c) => c + 1);
            const insRes = await supabase.from("card_shares").insert({
              card_id: card.id,
              user_id: userId,
              channel,
            });
            if (insRes.error) {
              setShareCount(prevCount);
              return;
            }
            // 트리거가 갱신한 정확한 카운트 재조회 (낙관적 추정 보정)
            const { data: q } = await supabase
              .from("cards")
              .select("share_count")
              .eq("id", card.id)
              .maybeSingle();
            if (q) setShareCount(Number((q as { share_count: number }).share_count ?? prevCount + 1));
          }}
          className="ml-auto flex cursor-pointer items-center gap-1 transition-colors hover:text-[var(--primary)]"
          aria-label="공유"
          title="공유"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[22px] w-[22px]"
            aria-hidden
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          {shareCount > 0 && <span>{shareCount}</span>}
        </button>

      </div>

      {/* 인스타식 좋아요 표시 — 구분선 아래, 댓글 블록 바로 위. 좋아요 1+ 일 때만 노출. */}
      <RecentLikers cardId={card.id} likeCount={likeCount} />

      {/* 댓글 블록 — 댓글 있거나 댓글창 열린 상태일 때만 표시 (본문 펼침과 무관) */}
      <CommentsBlock
        cardId={card.id}
        doctorSlug={card.doctor?.slug ?? null}
        isPublishedQa={true}
        onCountChange={setCommentCount}
        showInput={commentsOpen}
        disableAutoFocus={autoExpandComments}
      />

      {/* 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="이 글을 삭제할까요?"
        description={"삭제하면 되돌릴 수 없어요.\n댓글과 좋아요도 함께 사라집니다."}
        confirmLabel={deleting ? "삭제 중…" : "삭제"}
        cancelLabel="취소"
        tone="danger"
        onConfirm={performDelete}
        onCancel={() => !deleting && setConfirmDeleteOpen(false)}
      />

      {/* 비로그인 상태에서 좋아요/저장 시도 시 — 인스타·트위터 표준 UX */}
      <LoginPromptDialog
        open={!!authPrompt}
        message={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </article>
  );
}

// ────────────────────────────────────────────────────────────
// Keywords — 컨테이너 너비에 맞춰 한 줄에 들어가는 만큼만 노출 + +N 토글
// ────────────────────────────────────────────────────────────
const CHIP_BASE_CLASS =
  "inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] whitespace-nowrap";
const CHIP_DEFAULT_STYLE: React.CSSProperties = {
  backgroundColor: "#F0F2F5",
  color: "#8A8F99",
  fontWeight: 500,
};

function Keywords({
  keywords,
  activeQuery,
  queryCategoryColor,
  onPick,
  forceShowAll = false,
}: {
  keywords: string[];
  activeQuery?: string;
  queryCategoryColor: string | null;
  onPick: (kw: string) => void;
  /** 카드 본문 펼침 / 단독 페이지 진입 시 태그도 자동 펼침 */
  forceShowAll?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showAllLocal, setShowAllLocal] = useState(false);
  const showAll = forceShowAll || showAllLocal;
  const setShowAll = setShowAllLocal;
  // 초기값: 모든 태그 노출(SSR HTML에는 한 번만 등장).
  // 클라이언트에서 첫 줄 측정 후 fitCount 조정 → +N 배지 표시.
  const [fitCount, setFitCount] = useState<number>(keywords.length);

  // 측정: DOM에 detached probe div를 잠깐 만들어 첫 줄에 맞는 칩 갯수 계산.
  //  → 별도 측정 div를 마크업에 두지 않음 (검색엔진/AI 태그 스터핑 방지)
  useLayoutEffect(() => {
    if (showAll) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (typeof document === "undefined") return;

    const measure = () => {
      const w = wrapper.clientWidth;
      if (w === 0) return;
      const probe = document.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = `position:absolute;left:-99999px;top:-99999px;width:${w}px;display:flex;flex-wrap:wrap;gap:4px;visibility:hidden;`;
      for (const kw of keywords) {
        const span = document.createElement("span");
        span.className = CHIP_BASE_CLASS;
        span.style.backgroundColor = "#F0F2F5";
        span.style.color = "#8A8F99";
        span.style.fontWeight = "500";
        span.textContent = kw;
        probe.appendChild(span);
      }
      document.body.appendChild(probe);
      const chips = Array.from(probe.children) as HTMLElement[];
      let count = chips.length;
      if (chips.length > 0) {
        const firstTop = chips[0].offsetTop;
        for (let i = 1; i < chips.length; i++) {
          if (chips[i].offsetTop > firstTop + 2) {
            count = Math.max(0, i - 1); // +N 배지 자리 확보
            break;
          }
        }
      }
      document.body.removeChild(probe);
      setFitCount(count);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [keywords, showAll]);

  const visible = showAll ? keywords : keywords.slice(0, fitCount);
  const hidden = keywords.length - visible.length;

  return (
    <div ref={wrapperRef} className="relative mb-2 mt-2.5">
      {/* 스크린리더 + LLM/검색엔진용 텍스트 — 콤마 구분으로 단어 경계 명시 (D-4) */}
      <span className="sr-only">태그: {keywords.join(", ")}</span>
      {/* 실제 노출 — collapse 상태일 때 한 줄, 펼친 상태일 때만 wrap */}
      <div
        aria-hidden="true"
        className={
          "flex gap-1 py-px " +
          (showAll ? "flex-wrap" : "flex-nowrap overflow-x-hidden")
        }
      >
        {visible.map((kw) => {
          const matched = activeQuery && kw === activeQuery;
          return (
            <button
              key={kw}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick(kw);
              }}
              className={
                CHIP_BASE_CLASS +
                " cursor-pointer transition-colors hover:shadow-sm"
              }
              style={
                matched && queryCategoryColor
                  ? {
                      backgroundColor: queryCategoryColor + "1A",
                      borderColor: queryCategoryColor,
                      color: queryCategoryColor,
                      fontWeight: 700,
                    }
                  : CHIP_DEFAULT_STYLE
              }
            >
              {kw}
            </button>
          );
        })}
        {!showAll && hidden > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(true);
            }}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-full px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap transition-colors hover:text-[var(--primary)]"
            style={{ backgroundColor: "#F0F2F5", color: "#8A8F99" }}
          >
            +{hidden}
          </button>
        )}
        {showAll && keywords.length > 0 && !forceShowAll && (
          /* "접기" 는 태그가 아니므로 칩 디자인 X — 연한 회색 inline 텍스트 (본문 더보기와 동일 톤).
             6번 — forceShowAll(글 단독 페이지) 일 때는 접기 자체 미노출 (사용자 요청). */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(false);
            }}
            className="inline-flex cursor-pointer items-center whitespace-nowrap px-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
          >
            접기
          </button>
        )}
      </div>
    </div>
  );
}

/** 공유 완료 시 사용된 채널을 반환. 사용자가 취소하면 null. */
async function shareCard(card: CardData): Promise<"native" | "link-copy" | null> {
  if (typeof window === "undefined") return null;
  // v4 canonical URL — getQaUrl이 의사(slug)·회원(handle+shortcode)·fallback 결정
  const path = getQaUrl(card);
  const url = `${window.location.origin}${path}`;
  const title = card.question;
  // 공유 문구: "OOO 원장님 | OOO OOO" — 파이프 구분 (이전 em-dash 어색해서 변경)
  const text = `${card.doctor?.name ?? ""} 원장님 | ${card.question ?? ""}`;

  // 모바일에서만 native share 사용 (데스크탑 Chrome share UI는 부실해서 클립보드가 더 자연)
  const ua = window.navigator.userAgent;
  const isMobile =
    /android|iphone|ipad|ipod/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua)); // iPad on iPadOS

  const nav = window.navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
  };

  if (isMobile && nav.share) {
    try {
      await nav.share({ url, title, text });
      return "native";
    } catch (err) {
      // 사용자 취소(AbortError)면 fallback 안 함 — "복사" 토스트가 의도 안 한 동작
      const e = err as { name?: string };
      if (e?.name === "AbortError") return null;
      // 그 외 실제 실패만 클립보드 fallback
    }
  }

  // 데스크탑(또는 share 미지원): 클립보드 복사
  try {
    await navigator.clipboard.writeText(url);
    showToast("링크가 복사되었어요");
    return "link-copy";
  } catch {
    // 클립보드 실패는 보통 권한 거부 — 노이즈 토스트 띄우지 않음
    return null;
  }
}

function showToast(msg: string) {
  // 화면 가운데에 산뜻한 흰 배경 토스트 (페이드 인/아웃)
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText =
    "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(0.9);" +
    "background:#FFFFFF;color:#1B4965;padding:14px 28px;" +
    "border:1px solid #E2E8EE;border-radius:9999px;" +
    "font-size:15px;font-weight:700;letter-spacing:-0.2px;z-index:9999;" +
    "box-shadow:0 12px 32px rgba(27,73,101,0.18),0 2px 6px rgba(0,0,0,0.06);" +
    "opacity:0;transition:opacity 0.2s ease,transform 0.2s ease;" +
    "pointer-events:none;";
  document.body.appendChild(el);
  // 다음 프레임에서 페이드 인
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translate(-50%,-50%) scale(1)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translate(-50%,-50%) scale(0.95)";
    setTimeout(() => el.remove(), 220);
  }, 1500);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
}

// SNS 표준 상대시간 — RelativeTime 컴포넌트로 이전됨 (P1-4 fix).
//   `src/components/RelativeTime.tsx` 의 formatRelativeTime/RelativeTime 사용.

/**
 * 호버 절대 날짜 — title 속성용.
 * 예: "2026년 4월 24일 14:30"
 */
function absoluteDateTimeLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}년 ${m}월 ${day}일 ${hh}:${mm}`;
}

/**
 * 텍스트 안에서 query 부분 일치를 노란 mark로 강조 (대소문자 무시).
 * query 비어있으면 원문 반환.
 */
/**
 * 답안 본문 렌더링.
 * - `\n\n` 단락 분리 후 각 단락을 <p>로 출력 (단락 사이 살짝 여백, mt-2.5).
 * - `**bold**` 마크다운만 인라인으로 <strong>로 변환 + 형광펜 하이라이트(투명 → 노란 alpha 0.55, 60% 지점).
 * - 검색 query 하이라이트는 plain 텍스트 부분에 highlight()로 적용.
 * - clamped=true면 첫 단락만 line-clamp-4(mobile) / md:line-clamp-5(desktop)로 가리고 이후 단락은 hidden.
 *   펼치면 전체 단락 표시. 인스타식 펼침/접기 UX.
 */
function renderAnswerBody(
  text: string,
  query: string | undefined,
  clamped: boolean,
  highlightColor: string,
): ReactNode {
  const paragraphs = (text ?? "").split(/\n{2,}/).map((s) => s.trimEnd());
  return (
    <>
      {paragraphs.map((para, pi) => {
        const isFirst = pi === 0;
        // 인라인 bold + 검색 하이라이트 처리
        const inline: ReactNode[] = [];
        const re = /\*\*([^*]+)\*\*/g;
        let lastIdx = 0;
        let m: RegExpExecArray | null;
        let key = 0;
        while ((m = re.exec(para)) !== null) {
          if (m.index > lastIdx) {
            const slice = para.slice(lastIdx, m.index);
            inline.push(
              <Fragment key={`t${pi}-${key++}`}>
                {highlight(slice, query)}
              </Fragment>,
            );
          }
          inline.push(
            <strong
              key={`b${pi}-${key++}`}
              className="font-semibold text-[var(--text)]"
              style={{
                // 하단 1/3 정도만 형광펜 줄을 깐 듯한 인라인 하이라이트
                // 카드 ID 해시로 3색(Yellow/Mint/Lavender) 결정적 매핑 — 한 카드 안에서는 동일 색
                backgroundImage: `linear-gradient(transparent 60%, ${highlightColor} 60%)`,
                padding: "0 1px",
              }}
            >
              {highlight(m[1], query)}
            </strong>,
          );
          lastIdx = m.index + m[0].length;
        }
        if (lastIdx < para.length) {
          inline.push(
            <Fragment key={`t${pi}-${key++}`}>
              {highlight(para.slice(lastIdx), query)}
            </Fragment>,
          );
        }
        // clamped일 때: 첫 단락은 line-clamp-4 md:line-clamp-5 / 나머지 단락은 hidden.
        // line-clamp가 자동으로 마지막 줄 끝에 '…'을 처리하므로 별도 ellipsis 표시 X.
        const clampClass = clamped
          ? isFirst
            ? "line-clamp-4 md:line-clamp-5"
            : "hidden"
          : "";
        const showMore = clamped && isFirst;
        // 첫 단락에 speakable class — JSON-LD SpeakableSpecification.cssSelector가 이걸 가리킴 (음성·AI assistant 답변 픽업).
        const speakableClass = isFirst ? " card-answer-speakable" : "";
        // SEO/AEO: '더보기' 라벨은 CSS ::after 로 표시. DOM 텍스트로 두면 크롤러/LLM 이
        // 답변 본문 끝에 "...작동 방식.더보기" 식으로 흘려 읽음. ::after content 는
        // pseudo element 라 검색엔진이 본문에서 분리.
        return (
          <p
            key={pi}
            className={`whitespace-pre-wrap text-[15px] leading-[1.7] text-[var(--text)]${speakableClass} ${
              isFirst ? "" : "mt-1"
            } ${clampClass} ${showMore ? "card-answer--more" : ""}`}
            style={{ transition: "color 0.2s ease" }}
          >
            {inline}
          </p>
        );
      })}
    </>
  );
}

function highlight(text: string, query?: string): ReactNode {
  if (!query || !query.trim()) return text;
  const q = query.trim();
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(lq, i);
    if (idx < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={`m${key++}`}
        style={{
          backgroundColor: "#FFF3A3",
          color: "inherit",
          padding: "0 1px",
          borderRadius: "2px",
        }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return <Fragment>{parts}</Fragment>;
}
