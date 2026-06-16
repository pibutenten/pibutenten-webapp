import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getPopularByCategory } from "@/lib/popular-keywords";
import RecordTab from "@/app/today/RecordTab";
import type { KeywordPost } from "@/app/today/KeywordCarousel";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";
import {
  KEYWORD_SELECT,
  DIARY_SELECT,
  toSummaryGroups,
  toKeywordPost,
  buildPopularData,
  type KeywordCardRow,
  type DiaryRow,
  type TopCardRow,
} from "@/lib/record-data";

// BetaNav 가 useSearchParams 사용 → 정적 프리렌더 회피(동적 렌더).
export const dynamic = "force-dynamic";

// /old-skin 박제 백업 — 구버전 식별용 접두 + noindex,nofollow 강제(원본도 noindex 였음).
export const metadata: Metadata = {
  title: "[구버전] 내 노트",
  robots: { index: false, follow: false },
};

// 비로그인 게스트 데모 — 가입 유도용 '예시' 타임라인(개인 데이터 없음).
const DEMO_SUMMARY: SummaryGroup[] = [
  {
    year: 2026,
    items: [
      { id: "demo-1", date: "06.10", proc: "써마지", hospital: "예시 강남피부과", doctor: "김○○ 원장", tel: "", price: "", memo: "이마·턱라인, 다운타임 거의 없었어요", items: [{ name: "써마지", unit: "600샷" }] },
      { id: "demo-2", date: "05.18", proc: "리쥬란 · 보톡스", hospital: "예시 서초피부과", doctor: "박○○ 원장", tel: "", price: "", memo: "리쥬란힐러, 2주 뒤 결이 좋아짐", items: [{ name: "리쥬란", unit: "2cc" }, { name: "보톡스", unit: "이마 50u" }] },
    ],
  },
  {
    year: 2025,
    items: [
      { id: "demo-3", date: "11.02", proc: "울쎄라", hospital: "예시 분당피부과", doctor: "정○○ 원장", tel: "", price: "", memo: "300샷, 1년 주기로 받기로", items: [{ name: "울쎄라", unit: "300샷" }] },
    ],
  },
];

// /record — 내 노트(비공개). 비로그인은 가입 유도 데모, 로그인은 active 명함 기준 실데이터.
export default async function RecordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── 게스트(비로그인) — 가입 유도 데모. 인기글 RPC(authenticated 전용)는 호출하지 않고,
  //    공개 인기 키워드 + 그 키워드의 최신 Q&A(공개 RLS)만 예시로 노출.
  if (!user) {
    const popularByCat = await getPopularByCategory();
    const guestKeywords = Array.from(
      new Set([
        ...popularByCat.lifting.slice(0, 4),
        ...popularByCat.injectables.slice(0, 4),
        ...popularByCat.concerns.slice(0, 3),
      ]),
    ).slice(0, 10);
    let guestPosts: KeywordPost[] = [];
    if (guestKeywords.length > 0) {
      const { data: qaRows } = await supabase
        .from("cards")
        .select(KEYWORD_SELECT)
        .eq("category", "qa")
        .eq("status", "published")
        .is("deleted_at", null)
        .overlaps("keywords", guestKeywords)
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .limit(20)
        .returns<KeywordCardRow[]>();
      const gSet = new Set(guestKeywords);
      const gNow = Date.now();
      guestPosts = (qaRows ?? []).map((c) => toKeywordPost(c, gSet, gNow));
    }
    return (
      <RecordTab
        guest
        summary={DEMO_SUMMARY}
        userName=""
        latest={null}
        diaryCount={0}
        reviewsCount={0}
        keywordPosts={guestPosts}
        popular={{ d7: [], d30: [], d90: [] }}
        myKeywords={guestKeywords}
      />
    );
  }

  const idCtx = await getIdentityContext(supabase);
  const activeId = idCtx?.active?.profileId ?? user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name, interested_procedures, skin_concerns, skin_type")
    .eq("id", activeId)
    .maybeSingle()
    .returns<{
      display_name: string | null;
      interested_procedures: string[] | null;
      skin_concerns: string[] | null;
      skin_type: string | null;
    }>();
  const userName = prof?.display_name?.trim() || "회원";

  // 관심 키워드 합집합(관심시술 + 피부고민 + 피부타입). 카드 keywords 와 같은 한글 키(0262).
  const interests = Array.from(
    new Set([
      ...(prof?.interested_procedures ?? []),
      ...(prof?.skin_concerns ?? []),
      ...(prof?.skin_type ? [prof.skin_type] : []),
    ]),
  );

  // 병렬: 노트 / 내가 쓴 후기 수 / 인기글 3기간(TOP10) / 관심 키워드 새 Q&A(컴팩트).
  const [diariesRes, reviewCntRes, top7Res, top30Res, top90Res, kwRes] = await Promise.all([
    supabase
      .from("diaries")
      .select(DIARY_SELECT)
      .order("visited_on", { ascending: false })
      .returns<DiaryRow[]>(),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("author_id", activeId)
      .eq("category", "review")
      .eq("status", "published"),
    supabase.rpc("get_top_cards_by_views", { p_days: 7, p_limit: 10 }),
    supabase.rpc("get_top_cards_by_views", { p_days: 30, p_limit: 10 }),
    supabase.rpc("get_top_cards_by_views", { p_days: 90, p_limit: 10 }),
    interests.length > 0
      ? supabase
          .from("cards")
          .select(KEYWORD_SELECT)
          .eq("category", "qa")
          .eq("status", "published")
          .is("deleted_at", null)
          .overlaps("keywords", interests)
          .order("reviewed_at", { ascending: false, nullsFirst: false })
          .limit(20)
          .returns<KeywordCardRow[]>()
      : Promise.resolve({ data: [] as KeywordCardRow[] }),
  ]);

  const rows = diariesRes.data ?? [];
  const reviewsCount = reviewCntRes.count ?? 0;

  // 상태 문구 계산용 — 가장 최근 방문의 첫 시술명 + 방문일 + 그 시술 누적 횟수('N회차').
  const latestRow = rows[0];
  const latestName =
    latestRow && ([...latestRow.diary_procedures].sort((a, b) => a.sort_order - b.sort_order)[0]?.procedure_ko ?? "시술");
  const latest = latestRow
    ? {
        name: latestName as string,
        visitedOn: latestRow.visited_on,
        count: rows.filter((r) => r.diary_procedures.some((p) => p.procedure_ko === latestName)).length,
      }
    : null;

  // 관심 키워드 새 Q&A(컴팩트 카드). NEW=24h. 원장 글은 doctor 사진, 회원 글은 author 아바타.
  const interestSet = new Set(interests);
  const now = Date.now();
  const keywordPosts: KeywordPost[] = ((kwRes.data ?? []) as KeywordCardRow[]).map((c) => toKeywordPost(c, interestSet, now));

  // 인기글 — 3기간 RPC + 카드 enrich(공개 카드만). deleted 제외, 조회수(cnt) 표시.
  //   가공 로직은 record-data.buildPopularData(SSOT)로 추출 — 베타 스킨과 공용.
  const popular = await buildPopularData(
    supabase,
    (top7Res.data ?? []) as TopCardRow[],
    (top30Res.data ?? []) as TopCardRow[],
    (top90Res.data ?? []) as TopCardRow[],
  );

  return (
    <RecordTab
      summary={toSummaryGroups(rows)}
      userName={userName}
      latest={latest}
      diaryCount={rows.length}
      reviewsCount={reviewsCount}
      keywordPosts={keywordPosts}
      popular={popular}
      myKeywords={interests}
    />
  );
}
