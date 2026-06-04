"use client";

/**
 * ProcedureReportCard — 시술별 후기 집계 + 개별 후기를 담은 **단일 카드**(접힘 내장).
 *
 * 두 모드(작업 A, 2026-06-04):
 *   - variant="insert" (피드·/search·/topics): 컴팩트+접힘 기본. 본문 클릭=펼침/접힘 토글,
 *     타이틀 클릭=/reports/{en} 이동. 펼침 = 집계 + 후기 **최대 3개** + 하단 "더보기"(조용한 링크)
 *     → /reports/{en}. 카드 내 후기 추가 로드 없음.
 *       · 피드(feedHref): 컴팩트 풀(후기·효과·인구통계 없음) → 펼칠 때만 1회 lazy fetch
 *         (/api/reports/{en}/reviews?include_report=1&limit=3). 홈 최초 렌더 시엔 미fetch.
 *       · /search·/topics: reviews prop 이 이미 있으면 fetch 생략(즉시 펼침).
 *   - variant="page" (/reports/[procedure]): 항상 펼침. 후기 첫 10개 서버 렌더 + 무한 스크롤
 *     (로그인=IntersectionObserver 자동 / 비로그인=10경계 클릭형 넛지). 토글 없음.
 *
 * 개별 후기 줄 클릭-펼침은 과거 제거됨 → 복원하지 않음(토글은 카드 레벨만).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import type { CardData } from "@/components/Card";
import { categoryTheme } from "@/lib/procedure-theme";
import { DOWNTIME_DAYS, EFFECT_ONSET_OPTIONS } from "@/lib/review-options";
import { useSession } from "@/lib/session-context";
import type { EngagementMe } from "@/components/card/hooks/useCardEngagement";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import ReportReviewItem from "@/components/report/ReportReviewItem";
import ReportAnchorActions from "@/components/report/ReportAnchorActions";
import DistBars from "@/components/report/DistBars";
import DowntimeGauge from "@/components/report/DowntimeGauge";
import EffectOnsetTimeline from "@/components/report/EffectOnsetTimeline";
import { getQaUrl } from "@/lib/card-url";
import { experienceCount } from "@/lib/report-copy";

const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const PAIN_SOFT = ["#BAE6FD", "#FDE68A", "#FDBA74", "#FCA5A5", "#F08A8A"];
const EFFECT_BAR_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];

// 연령대 분할 바 색 — 10대~50대+ 순(차가운→따뜻한 5색).
const AGE_COLORS = ["#A8C2E6", "#9AA6DE", "#C3B0E8", "#F2A9C0", "#FFCB8C"];

// 삽입 카드 펼침 시 보여줄 후기 최대 개수.
const INSERT_REVIEW_CAP = 3;
// 전용 페이지 무한 스크롤 페이지 크기.
const PAGE_SIZE = 10;

// 집계 섹션 — 구분선 없이 여백(py-5)으로만 구분.
const SECTION = "px-5 py-5";
const TITLE = "mb-2.5 text-[15px] font-bold text-[var(--text)]";

type ReviewsApiResponse = {
  reviews: CardData[];
  reviewLiked: Record<number, boolean>;
  report?: ProcedureReport | null;
};

// 통계 수치를 편안한 자연어로 — 값에 따라 멘트가 달라진다.
function revisitPhrase(pct: number): string {
  if (pct >= 70) return `경험하신 분들의 ${pct}%가 다시 받고 싶어 해요.`;
  if (pct >= 40) return `${pct}%가 다시 받을 의향이 있어요. 호불호가 갈리는 편이에요.`;
  return `다시 받겠다는 분은 ${pct}%예요. 신중히 고민해 보세요.`;
}
function satisfactionPhrase(avg: number): string {
  const x = avg.toFixed(1);
  if (avg >= 4.5) return `만족도 ${x}점! 다들 결과에 크게 만족하셨어요.`;
  if (avg >= 4.0) return `만족도 ${x}점, 대체로 만족하는 분위기예요.`;
  if (avg >= 3.0) return `만족도 ${x}점, 기대와 결과가 갈리는 편이에요.`;
  return `만족도 ${x}점으로 아쉬웠다는 의견이 많아요.`;
}
function painPhrase(avg: number): string {
  const x = avg.toFixed(1);
  let desc: string;
  if (avg < 1.5) desc = "거의 안 아파요.";
  else if (avg < 2.5) desc = "살짝 따끔한 정도예요.";
  else if (avg < 3.5) desc = "참을 만해요.";
  else if (avg < 4.5) desc = "참을 만하지만 꽤 뻐근해요.";
  else desc = "꽤 아픈 편이라 마취가 필요해요.";
  return `통증 : 평균 ${x}점, ${desc}`;
}

export default function ProcedureReportCard({
  report,
  reviews = [],
  reviewLiked = {},
  defaultExpanded = false,
  feedHref,
  variant = "insert",
  total,
}: {
  report: ProcedureReport;
  reviews?: CardData[];
  /** 후기 id별 viewer 좋아요 여부(부모 페이지 prefetch). 비로그인이면 빈 객체. */
  reviewLiked?: Record<number, boolean>;
  /** 초기 펼침 여부. 단독 /reports 페이지=true, 검색·태그 삽입=false(접힘). */
  defaultExpanded?: boolean;
  /** 홈 피드 주입용 — set 시 펼칠 때 lazy fetch(컴팩트 풀엔 후기·효과·인구통계 없음). */
  feedHref?: string;
  /** "insert"=삽입 카드(후기 3 + 링크) / "page"=전용 페이지(10 + 무한스크롤). */
  variant?: "insert" | "page";
  /** page 모드 — 전체 후기 수(무한스크롤 hasMore 판정). */
  total?: number;
}) {
  const isPage = variant === "page";

  // 피드 lazy fetch 로 받아온 풀집계·후기(있으면 prop 대신 사용).
  const [fetched, setFetched] = useState<ReviewsApiResponse | null>(null);
  const [loadingExpand, setLoadingExpand] = useState(false);

  // 표시에 쓰는 집계 — 피드 lazy fetch 성공 시 풀집계로 교체.
  const rep = fetched?.report ?? report;

  const {
    procedureKo, en, anchor, category, count, avgSatisfaction, satisfactionDist,
    avgPain, revisit, effects, demographics,
    noEffectCount, downtimeAnswered, downtimeDist, onsetAnswered, onsetDist,
  } = rep;
  const reportHref = getQaUrl({ id: anchor?.id ?? 0, type: "review_summary", post_slug: en });

  // 초기 펼침은 prop 으로만 결정.
  const [expanded, setExpanded] = useState(defaultExpanded || isPage);

  const satRounded = Math.round(avgSatisfaction);
  const maxSat = Math.max(1, ...satisfactionDist);
  const painPct = Math.min(100, Math.max(0, (avgPain / 5) * 100));
  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const maybePct = Math.round((revisit.maybe / rTotal) * 100);
  const noPct = Math.max(0, 100 - yesPct - maybePct);
  const topEffects = effects.slice(0, 6);

  // 다운타임(C-1·E) — 평균 일수(day 코딩) 기반 헤드라인 "다운타임은 대부분 N일이었어요".
  const dtAvg =
    downtimeAnswered > 0
      ? downtimeDist.reduce((s, c, i) => s + c * (DOWNTIME_DAYS[i] ?? 0), 0) / downtimeAnswered
      : 0;
  const dtAvgLabel = Number.isInteger(dtAvg) ? String(dtAvg) : `약 ${dtAvg.toFixed(1)}`;
  // 평균이 0으로 반올림되면 옵션 라벨('없음')과 일관되게 "없었어요".
  const dtHeadline =
    Math.round(dtAvg) === 0
      ? "다운타임은 대부분 없었어요."
      : `다운타임은 대부분 ${dtAvgLabel}일이었어요.`;

  // 효과시점(작업 3) — 칩 스택 타임라인. 헤드라인은 시간 구간(0~3) 최다 기준(still_watching 제외).
  const onsetTimeSum = onsetDist.slice(0, 4).reduce((a, b) => a + b, 0);
  const onsetTopIdx = [0, 1, 2, 3].reduce(
    (best, i) => ((onsetDist[i] ?? 0) > (onsetDist[best] ?? 0) ? i : best),
    0,
  );
  const onsetHeadline =
    onsetTimeSum === 0
      ? "아직 효과를 느꼈다는 후기가 적어요."
      : `효과는 대부분 ${EFFECT_ONSET_OPTIONS[onsetTopIdx]?.label ?? ""}부터 느끼기 시작했어요.`;
  const demoTotal = Math.max(1, demographics.male + demographics.female);
  const femalePct = Math.round((demographics.female / demoTotal) * 100);
  const malePct = Math.max(0, 100 - femalePct);
  const ageTotal = Math.max(1, demographics.ageBands.reduce((a, b) => a + b.count, 0));

  const theme = categoryTheme(category);
  const yesDominant = revisit.yes >= revisit.no;
  const yesBarLabel = yesDominant ? "재시술 의향 있어요" : "있어요";
  const noBarLabel = yesDominant ? "없어요" : "재시술 의향 없어요";

  // me — SessionContext(SSR) 단일 출처. 비로그인 → null.
  const session = useSession();
  const me: EngagementMe =
    session === null ? null : { id: session.activeIdentityId, role: session.role };
  const loggedIn = session !== null;
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);

  // ── page 모드 무한스크롤 상태 ──
  const [pageReviews, setPageReviews] = useState<CardData[]>(reviews);
  const [pageLiked, setPageLiked] = useState<Record<number, boolean>>(reviewLiked);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaded = pageReviews.length;
  const hasMore = isPage && total !== undefined ? loaded < total : false;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  async function fetchReviewsPage(offset: number, limit: number, includeReport: boolean) {
    const qs = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
      ...(includeReport ? { include_report: "1" } : {}),
    });
    const res = await fetch(`/api/reports/${encodeURIComponent(en)}/reviews?${qs}`);
    if (!res.ok) throw new Error(`reviews fetch ${res.status}`);
    return (await res.json()) as ReviewsApiResponse;
  }

  // 피드 카드 펼침 — 처음 펼칠 때만 1회 lazy fetch(집계 + 후기 3).
  async function loadFeedDetail() {
    if (loadingExpand || fetched) return;
    setLoadingExpand(true);
    try {
      const data = await fetchReviewsPage(0, INSERT_REVIEW_CAP, true);
      setFetched(data);
    } catch {
      /* 실패 시 컴팩트 집계만 유지 */
    } finally {
      setLoadingExpand(false);
    }
  }

  function handleToggle() {
    if (isPage) return; // 전용 페이지는 토글 없음(항상 펼침)
    const next = !expanded;
    setExpanded(next);
    if (next && feedHref) void loadFeedDetail();
  }

  // page 무한스크롤 — 로그인 + hasMore 일 때만 IntersectionObserver.
  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchReviewsPage(loaded, PAGE_SIZE, false);
      setPageReviews((prev) => [...prev, ...data.reviews]);
      setPageLiked((prev) => ({ ...prev, ...data.reviewLiked }));
    } catch {
      /* 무시 — 다음 교차 때 재시도 */
    } finally {
      setLoadingMore(false);
    }
  }
  useEffect(() => {
    if (!isPage || !loggedIn || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "400px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPage, loggedIn, hasMore, loaded, loadingMore]);

  // 표시 후기 목록 — insert: (피드 lazy 또는 prop) 최대 3 / page: 누적.
  const insertReviews = (feedHref ? fetched?.reviews ?? [] : reviews).slice(0, INSERT_REVIEW_CAP);
  const insertLiked = feedHref ? fetched?.reviewLiked ?? {} : reviewLiked;
  const displayReviews = isPage ? pageReviews : insertReviews;
  const displayLiked = isPage ? pageLiked : insertLiked;

  // 집계 본문(헤더·후기·하단 컨트롤 제외) — insert 모드에서 클릭 시 펼침/접힘 토글.
  const toggleProps = !isPage
    ? { onClick: handleToggle, role: "button" as const, tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); }
        },
        className: "cursor-pointer" }
    : {};

  return (
    <article className="overflow-hidden rounded-[var(--radius)] bg-white">
      {/* 헤더 — 타이틀 클릭=/reports 이동(토글 영역 밖). */}
      <header style={{ backgroundColor: theme.soft }} className="relative">
        <Link href={reportHref} className="block px-5 py-4">
          <div className="mb-1.5 text-[13px] font-bold tracking-tight text-[var(--text)]">
            피부텐텐 리포트
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]" style={{ color: theme.color }}>
              {procedureKo}
            </h1>
            <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">
              회원 경험 <b className="text-[var(--text)]">{count}건</b>
            </span>
          </div>
        </Link>
        {anchor && (
          <div className="absolute right-4 top-3.5" onClick={(e) => e.stopPropagation()}>
            <ReportAnchorActions anchor={anchor} me={me} onLoginRequired={setAuthPrompt} accentColor={theme.color} />
          </div>
        )}
      </header>

      {/* ── 집계 본문(토글 영역) ── */}
      <div {...toggleProps}>
        {/* 재시술 의향 */}
        <section className={SECTION}>
          <p className="mb-2.5 text-[14.5px] font-semibold leading-[1.45] text-[var(--text)]">
            {revisitPhrase(yesPct)}
          </p>
          <div className="flex h-[20px] overflow-hidden rounded-lg text-[11px] font-bold text-white">
            {yesPct > 0 && <div className="flex items-center justify-center overflow-hidden whitespace-nowrap" style={{ width: `${yesPct}%`, backgroundColor: "#4CBFF2" }}>{yesPct >= (yesDominant ? 42 : 14) ? yesBarLabel : ""}</div>}
            {maybePct > 0 && <div className="flex items-center justify-center overflow-hidden whitespace-nowrap" style={{ width: `${maybePct}%`, backgroundColor: "#9AA1AC" }}>{maybePct >= 12 ? "고민 중" : ""}</div>}
            {noPct > 0 && <div className="flex items-center justify-center overflow-hidden whitespace-nowrap" style={{ width: `${noPct}%`, backgroundColor: "#EA7E7B" }}>{noPct >= (yesDominant ? 14 : 42) ? noBarLabel : ""}</div>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">재시술 의향</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#4CBFF2" }} />있어요 {revisit.yes}명</span>
            {revisit.maybe > 0 && <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#9AA1AC" }} />고민 중 {revisit.maybe}명</span>}
            <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#EA7E7B" }} />없어요 {revisit.no}명</span>
          </div>
        </section>

        {/* 만족도 */}
        <section className={SECTION}>
          <p className="mb-2.5 text-[14.5px] font-semibold leading-[1.45] text-[var(--text)]">
            {satisfactionPhrase(avgSatisfaction)}
          </p>
          <div className="flex items-center gap-4">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <span className="text-[16px] leading-none tracking-[1px]">
                {[1, 2, 3, 4, 5].map((nn) => (
                  <span key={nn} style={{ color: nn <= satRounded ? "var(--accent-save)" : "#DDE2E7" }}>★</span>
                ))}
              </span>
              <span className="text-[22px] font-extrabold leading-none text-[var(--text)]">{avgSatisfaction.toFixed(1)}</span>
            </div>
            <DistBars
              rows={[5, 4, 3, 2, 1].map((score) => ({
                key: String(score),
                label: String(score),
                count: satisfactionDist[score - 1] ?? 0,
                color: "var(--accent-save)",
              }))}
              max={maxSat}
            />
          </div>
        </section>

        {/* 통증 — 접힘 시 마지막 노출 섹션. */}
        <section className={SECTION}>
          <p className="mb-2.5 text-[14.5px] font-semibold leading-[1.45] text-[var(--text)]">
            {painPhrase(avgPain)}
          </p>
          <div className="relative h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${PAIN_SOFT.join(", ")})` }}>
            <span className="absolute -top-[3px] h-[14px] w-[3px] rounded-[2px] bg-[#64748B] shadow-[0_0_0_2px_#fff]" style={{ left: `calc(${painPct}% - 1.5px)` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[9.5px] text-[var(--text-muted)]">
            {PAIN_LABELS.map((l) => <span key={l}>{l}</span>)}
          </div>
        </section>

        {/* 펼침 로딩(피드 lazy fetch 중) */}
        {expanded && loadingExpand && !fetched && (
          <div className="px-5 pb-5 text-center text-[12px] text-[var(--text-muted)]">
            불러오는 중…
          </div>
        )}

        {/* ── 펼침 영역(집계) ── */}
        {expanded && (
          <>
            {/* 다운타임 — 평균 게이지 + 1주·2주 가이드선. answered===0 이면 섹션 숨김. */}
            {downtimeAnswered > 0 && (
              <section className={SECTION}>
                <p className="mb-2.5 text-[14.5px] font-semibold leading-[1.45] text-[var(--text)]">
                  {dtHeadline}
                </p>
                <DowntimeGauge dist={downtimeDist} answered={downtimeAnswered} days={DOWNTIME_DAYS} />
              </section>
            )}

            {topEffects.length > 0 && (
              <section className={SECTION}>
                <div className={TITLE}>{procedureKo} 받은 분들이 느낀 효과예요.</div>
                <div className="flex flex-col gap-2.5">
                  {topEffects.map((e, i) => (
                    <div key={e.label} className="flex items-center gap-2.5">
                      <span className="w-[52px] text-[12.5px] font-semibold text-[var(--text)]">{e.label}</span>
                      <span className="h-[10px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                        <span className="block h-full rounded-full" style={{ width: `${e.pct}%`, backgroundColor: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length] }} />
                      </span>
                      <span className="w-10 text-right text-[12.5px] font-bold text-[var(--text-secondary)]">{e.pct}%</span>
                    </div>
                  ))}
                </div>
                {noEffectCount > 0 && (
                  <p className="mt-2.5 text-[12px] text-[var(--text-muted)]">
                    효과를 느끼지 못했다고 답한 분도 {noEffectCount}명 있었어요.
                  </p>
                )}
              </section>
            )}

            {/* 효과시점 — 칩 스택 타임라인(4구간) + '효과 못 느낌' 별도. answered===0 숨김. */}
            {onsetAnswered > 0 && (
              <section className={SECTION}>
                <p className="mb-3 text-[14.5px] font-semibold leading-[1.45] text-[var(--text)]">
                  {onsetHeadline}
                </p>
                <EffectOnsetTimeline dist={onsetDist} />
              </section>
            )}

            {demoTotal > 0 && (
              <section className={SECTION}>
                <div className="mb-2.5 text-[15px] font-bold text-[var(--text)]">작성자 통계</div>
                <div className="flex h-[14px] overflow-hidden rounded-full text-[9.5px] font-bold text-white">
                  {femalePct > 0 && (
                    <div className="flex items-center justify-center" style={{ width: `${femalePct}%`, backgroundColor: "#F59CB6" }}>
                      {femalePct >= 22 ? `여성 ${femalePct}%` : ""}
                    </div>
                  )}
                  {malePct > 0 && (
                    <div className="flex items-center justify-center" style={{ width: `${malePct}%`, backgroundColor: "#7FD0F8" }}>
                      {malePct >= 22 ? `남성 ${malePct}%` : ""}
                    </div>
                  )}
                </div>
                <div className="mt-1.5 flex gap-3.5 text-[11px] text-[var(--text-secondary)]">
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#F59CB6" }} />여성 {femalePct}%</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#7FD0F8" }} />남성 {malePct}%</span>
                </div>
                {/* 연령대 — 성별과 동일한 단일 가로 분할 바 + 범례. */}
                {demographics.ageBands.length > 0 && (
                  <div className="mt-3">
                    <div className="flex h-[14px] overflow-hidden rounded-full text-[9.5px] font-bold text-white">
                      {demographics.ageBands.map((b, i) => {
                        const pct = Math.round((b.count / ageTotal) * 100);
                        return pct > 0 ? (
                          <div
                            key={b.label}
                            className="flex items-center justify-center"
                            style={{ width: `${pct}%`, backgroundColor: AGE_COLORS[i % AGE_COLORS.length] }}
                          >
                            {pct >= 16 ? `${pct}%` : ""}
                          </div>
                        ) : null;
                      })}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                      {demographics.ageBands.map((b, i) => {
                        const pct = Math.round((b.count / ageTotal) * 100);
                        return (
                          <span key={b.label}>
                            <i
                              className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle"
                              style={{ backgroundColor: AGE_COLORS[i % AGE_COLORS.length] }}
                            />
                            {b.label} {pct}%
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            <p className="px-5 pb-4 text-[12px] leading-relaxed text-[var(--text-muted)]">
              이 리포트는 {experienceCount(count)}을 집계한 결과입니다. 개인차가 있으며 의학적
              효과·안전성을 보장하지 않습니다. 시술 결정은 전문의 상담 후 하시기 바랍니다.
            </p>
          </>
        )}
      </div>

      {/* 개별 후기 — 토글 영역 밖(후기 클릭은 후기 네비/좋아요). */}
      {expanded && displayReviews.length > 0 && (
        <section className="border-t border-[var(--border)] px-5 py-4">
          <div className={TITLE}>후기 {isPage && total !== undefined ? total : displayReviews.length}개</div>
          <ul className="divide-y divide-[var(--border)]">
            {displayReviews.map((card) => (
              <ReportReviewItem
                key={card.id}
                card={card}
                liked={displayLiked[card.id] ?? false}
                me={me}
                onLoginRequired={(reason) => setAuthPrompt(reason)}
              />
            ))}
          </ul>

          {/* page 모드 — 무한스크롤 sentinel(로그인) / 10경계 넛지(비로그인). */}
          {isPage && hasMore && (
            loggedIn ? (
              <div ref={sentinelRef} className="py-3 text-center text-[12px] text-[var(--text-muted)]">
                {loadingMore ? "불러오는 중…" : ""}
              </div>
            ) : (
              <div className="pt-4 text-center">
                <button
                  type="button"
                  onClick={() => setAuthPrompt("로그인하면 모든 후기를 볼 수 있어요.")}
                  className="rounded-full bg-[var(--primary-light)] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--primary-light-hover)]"
                >
                  로그인하고 후기 더 보기
                </button>
              </div>
            )
          )}
        </section>
      )}

      {/* 하단 컨트롤 — insert 모드만. page 모드는 무한스크롤이 대체. */}
      {!isPage && (
        <div className="flex items-center justify-center gap-6 bg-white py-3 text-[13px] font-semibold">
          {!expanded ? (
            <button
              type="button"
              onClick={handleToggle}
              aria-expanded={false}
              className="flex cursor-pointer items-center gap-1 text-[var(--primary-dark)] transition-colors hover:text-[var(--primary)]"
            >
              더보기
              <span aria-hidden>▾</span>
            </button>
          ) : (
            <>
              {/* 펼침 시 '더보기' = 카드 내 추가 로드 아님 → 단독 리포트 페이지로 이동(조용한 링크). */}
              <Link
                href={reportHref}
                className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
              >
                더보기
              </Link>
              <button
                type="button"
                onClick={handleToggle}
                aria-expanded={true}
                className="flex cursor-pointer items-center gap-1 text-[var(--primary-dark)] transition-colors hover:text-[var(--primary)]"
              >
                접기
                <span aria-hidden>▴</span>
              </button>
            </>
          )}
        </div>
      )}

      <LoginPromptDialog
        open={!!authPrompt}
        message={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </article>
  );
}
