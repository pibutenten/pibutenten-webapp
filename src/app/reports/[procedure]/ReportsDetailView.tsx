"use client";

/**
 * ReportsDetailView — /reports/[시술] 전체 리포트.
 *
 * 2026-07-08 UI 개편 Phase 2-1 (디자인 명세 PDF p.4-7 + 시안 2d-리포트-1/2 — 위→아래 한 스크롤):
 *   ① 히어로 카드(라운드 24, 카테고리 그라데이션 deep→tint 세로, tt 워터마크, 시술명,
 *      태그 3=효과 top3, 재시술의향 큰 %, 사람 그리드 10×10=100 비율 채움,
 *      "후기 N건 중 있음 X·고민 중 Y·없어요 Z", 헤드라인, 우하단 저장·공유)
 *   ② SATISFACTION(좌 큰 숫자+별 5 / 우 별점 분포 5줄) ③ PAIN & RECOVERY(통증 그라데이션
 *      척도 바+원형 마커[번개], 다운타임 채움 바+원형 마커[십자 — 원장 확정]+표시 3구간
 *      당일/1주/2주 재그룹 — 저장 척도 5구간 불변, DOWNTIME_DAYS 환산 재사용)
 *   ④ RESULTS(효과 막대 전체+미체감 문구) ⑤ TIMELINE(세로 막대 4개+축 선·점, 최다만 강조)
 *   ⑥ 작성자 통계(성별·연령 가로 띠, 큰 조각 띠 안 라벨·작은 조각 아래 범례)
 *   ⑦ (배경 #EAF2F8 전환) 리뷰 섹션 ⑧ 후기 유도 카드(#D6E9F5) ⑨ 전문의 섹션(순위 원+제목)
 *   ⑩ 다른 시술 5(카테고리 soft 파스텔) ⑪ 푸터 PIBUTENTEN REPORT ⑫ 하단 고정 바(모바일).
 *
 * 배선(보존): report.anchor && ReportViewTracker / 앵커 없음·비로그인 소프트월 수동 폴백(이중가산
 *   방지) / 상세 진입 scrollTop=0 / 후기 정렬 칩 4종·10개 더보기 / 인라인 CommentsBlock /
 *   저장·공유 = report.anchor 기반 useCardEngagement(card_saves/card_shares — D5 재배선.
 *   데스크탑 사이드바 푸터 ReportShareButtons 는 setReportAnchorCard 모듈 스토어로 동일 앵커 공유).
 * 격리: app.module.css 미의존 — Tailwind + globals 토큰 + 명세 리터럴 hex(#3A3C41/#8A939B 등).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import type { ProcedureReport } from "@/lib/procedure-report";
import type { CardData } from "@/components/Card";
import type { ProcedureSlug } from "@/lib/categories";
import {
  useCardEngagement,
  type EngagementMe,
} from "@/components/card/hooks/useCardEngagement";
import { shareCard } from "@/components/card/utils/card-share";
import { categoryTheme } from "@/lib/procedure-theme";
import { getQaUrl } from "@/lib/card-url";
import { DOWNTIME_DAYS, EFFECT_ONSET_OPTIONS } from "@/lib/review-options";
import { useSession } from "@/lib/session-context";
import { useSoftKeyboardOpen } from "@/lib/useSoftKeyboardOpen";
import {
  IconPain,
  IconDowntimeCross,
  IconPerson,
  IconStar,
  IconShare,
  IconSpeechBubble,
} from "@/components/icons";
import ReportsReviewCard from "./ReportsReviewCard";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import ReportViewTracker from "@/components/report/ReportViewTracker";
import { setReportAnchorCard } from "@/app/reports/ReportShareButtons";
import { addEngagement } from "@/lib/engagement-score";
import { ssGet, ssSet } from "@/lib/safe-storage";
import { showToast } from "@/lib/toast";

/* ---------- 명세 색·상수 (globals 토큰 없는 값은 리터럴 hex — 격리 원칙) ---------- */

// 효과 가로 막대 — 항목 순서별 색(명세: 파랑·보라·남보라·주황·민트·핑크 계열).
const EFFECT_BAR_COLORS = ["#6EC1F0", "#A99BE0", "#8AA0E0", "#FFC08A", "#7ED4BC", "#F49BB8"];
// 연령대 띠 — 나이순 옅은→진한 보라 단색 농도(명세: 무지개 아님). 라벨 고정 매핑(ageBands 는
//   count>0 필터라 배열 인덱스 기반이면 색이 밀림).
const AGE_COLOR: Record<string, string> = {
  "10대": "#E3D3F6",
  "20대": "#C9A9EC",
  "30대": "#9E7AE3",
  "40대": "#7C52D2",
  "50대+": "#6238BF",
};
const DEMO_FEMALE = "#F2A0BC"; // 명세: 성별 막대(여성)
const DEMO_MALE = "#6EC1F0";

// 전문의 Q&A 랭킹 색 — 1·2·3위 강조, 4위 이하 회색(기존 유지, 원형 채움으로 표시만 변경).
function rankColor(rank: number): string {
  if (rank === 1) return "#F76D9B";
  if (rank === 2) return "#378ADD";
  if (rank === 3) return "#F5A623";
  return "#A2A6AF";
}

// 통증 척도 — 명세 4스톱 그라데이션(#FFDD77→#FFB46D→#FF7B9F→#FF565B) + 라벨 SSOT 현행 유지.
//   ⚠ 허브(ReportsIndexCard, --pain-grad-* 3스톱)와 색이 다른 것은 시안 명세 의도(PDF p5 vs p2).
const PAIN_STOPS = ["#FFDD77", "#FFB46D", "#FF7B9F", "#FF565B"];
const PAIN_GRADIENT = `linear-gradient(90deg, ${PAIN_STOPS.join(", ")})`;
const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
function painPos(v: number): number {
  const x = Math.min(5, Math.max(1, v));
  return 6.25 + ((x - 1) / 4) * 87.5;
}
/** 마커 테두리 "값 색"(명세) — 값 위치에 해당하는 그라데이션 스톱 색 버킷. */
function painMarkColor(v: number): string {
  const x = Math.min(5, Math.max(1, v));
  return PAIN_STOPS[Math.min(3, Math.round(((x - 1) / 4) * 3))];
}
function painPhrase(a: number): string {
  if (a < 2.0) return "거의 안 아팠다는 분이 많아요";
  if (a < 3.0) return "살짝 따끔한 정도였대요";
  if (a < 3.6) return "참을 만했다는 평이 많아요";
  if (a < 4.4) return "센 편이었다는 분이 많아요";
  return "꽤 아팠다는 분이 많아요";
}

// 다운타임 — 표시 3구간(당일/1주/2주) 재그룹. 저장 척도 5구간·DOWNTIME_DAYS 환산 불변,
//   트랙 위치 매핑은 기존 DowntimeGauge 와 동일(-1~15일 → 당일 6.25% / 1주 50% / 2주 93.75%).
const DT_FILL = "#6EC1F0"; // 명세: 다운타임 바 채움
function downtimePos(days: number): number {
  const clamped = Math.min(16, Math.max(0, days));
  return Math.min(100, Math.max(0, ((clamped + 1) / 16) * 100));
}
function formatDays(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// 히어로 파생 색 — 명세는 초록(#029688) 기준 태그 #078172 · 사람 #168275 만 제시.
//   타 카테고리는 theme.deep(같은 hue 의 진한 톤)으로 결정론 폴백(procedure-theme 앵커 패턴).
const HERO_ANCHOR: Record<string, { chip: string; person: string }> = {
  "#029688": { chip: "#078172", person: "#168275" },
};

// 후기 정렬 보조값.
function reviewOf(card: CardData) {
  const pr = card.procedure_review;
  return Array.isArray(pr) ? pr[0] : pr;
}
function satOf(card: CardData): number {
  return reviewOf(card)?.satisfaction ?? 0;
}
function reactionScore(card: CardData): number {
  return (card.like_count ?? 0) + (card.comment_count ?? 0) + (card.share_count ?? 0);
}
function bodyLen(card: CardData): number {
  return (card.body ?? "").length;
}

/** 진입 카운트업(0→target). run=true 일 때 1회 애니메이션. */
function useCountUp(target: number, run: boolean): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return v;
}

/* ---------- 공용 소품 ---------- */

const SECTION_TITLE =
  "text-[19px] font-extrabold leading-[1.35] tracking-[-0.02em] text-[#3A3C41]";
const EYEBROW = "mb-1 text-[11.5px] font-extrabold uppercase tracking-[0.12em]";

const CHEVRON_RIGHT = (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
const CHEVRON_DOWN = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** 북마크 글리프 — active 채움 토글이 필요해 로컬 SVG(공용 IconBookmark 는 상시 채움). */
function BookmarkGlyph({ filled, size = 22, className }: { filled: boolean; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** 앵커 없는 리포트의 히어로 공유 폴백 — URL 공유(card_shares 미기록. 저장은 비노출). */
async function sharePlainUrl() {
  if (typeof navigator === "undefined") return;
  const url = window.location.href;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: document.title, url });
      return;
    } catch {
      /* 취소/미지원 — 클립보드 폴백 */
    }
  }
  if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
  showToast("링크가 복사됐어요.");
}

/**
 * AnchorEngagement — 히어로 우하단 저장·공유 아이콘 + 하단 고정 바(모바일, 포털).
 *
 * 두 표면이 **한 훅 인스턴스**(useCardEngagement — toggle_card_save/card_shares)를 공유해
 * 저장 상태가 항상 일치한다(별도 인스턴스면 히어로↔바 낙관 상태가 어긋남).
 * 바는 document.body 포털 — AppShell 루트(z-100 오버레이)·PTR transform 래퍼 밖으로 꺼내
 * 당김 중 fixed 기준점 이탈을 방지. z-105(루트 위) / bottom = 탭바 높이(약 64px)+safe-area 위.
 * 소프트 키보드 열림 시 바 숨김(WriteFab·탭바와 동일 정책 — 댓글 입력 가림 방지).
 */
function AnchorEngagement({
  anchor,
  me,
  onLoginRequired,
}: {
  anchor: CardData;
  me: EngagementMe;
  onLoginRequired: (reason: string) => void;
}) {
  const eng = useCardEngagement(anchor, {}, me, onLoginRequired, shareCard);
  const keyboardOpen = useSoftKeyboardOpen();
  // 포털은 document 필요 — 마운트 뒤 한 프레임 늦게 열기(rAF — effect 동기 setState lint 회피,
  //   본문 mounted 트리거와 동일 패턴).
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPortalReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <>
      {/* 히어로 우하단 아이콘(흰색) */}
      <div className="flex items-center gap-4 text-white">
        <button
          type="button"
          onClick={eng.save.toggle}
          aria-label={eng.save.active ? "저장 취소" : "저장"}
          aria-pressed={eng.save.active}
          className="flex cursor-pointer items-center transition-opacity hover:opacity-80"
        >
          <BookmarkGlyph filled={eng.save.active} size={23} />
        </button>
        <button
          type="button"
          onClick={() => void eng.share.share()}
          aria-label="공유"
          className="flex cursor-pointer items-center transition-opacity hover:opacity-80"
        >
          <IconShare size={22} stroke="#FFFFFF" />
        </button>
      </div>

      {/* ⑫ 하단 고정 바 — 모바일 전용(min-[900px]:hidden), 탭바 위. */}
      {portalReady &&
        !keyboardOpen &&
        createPortal(
          <div
            className="fixed inset-x-0 z-[105] flex items-center bg-white/95 px-4 py-2.5 backdrop-blur min-[900px]:hidden"
            style={{
              /* 탭바 실점유 높이 실측 ~76px(패딩 포함) + 여유 8px — 최종 검수 A 실측 반영.
                 (64→72→84px 로 2회 상향: 겹침 재발 방지 여유 포함) */
              bottom: "calc(84px + env(safe-area-inset-bottom))",
              boxShadow: "0 -4px 16px rgba(27,73,101,0.06)",
            }}
          >
            <button
              type="button"
              onClick={eng.save.toggle}
              aria-pressed={eng.save.active}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 py-1.5 text-[14.5px] font-semibold"
              style={{ color: eng.save.active ? "var(--accent-blue)" : "#7F838D" }}
            >
              <BookmarkGlyph filled={eng.save.active} size={19} />
              {eng.save.active ? "저장됨" : "저장하기"}
            </button>
            <span aria-hidden className="h-5 w-px shrink-0 bg-[#E5EAEE]" />
            <button
              type="button"
              onClick={() => void eng.share.share()}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 py-1.5 text-[14.5px] font-semibold text-[#7F838D]"
            >
              <IconShare size={18} />
              공유하기
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

type SortKey = "rec" | "high" | "low" | "new";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "rec", label: "추천순" },
  { key: "high", label: "별점 높은 순" },
  { key: "low", label: "별점 낮은 순" },
  { key: "new", label: "최신순" },
];

export default function ReportsDetailView({
  ko,
  en,
  report,
  reviews,
  reviewLiked,
  reviewDemo,
  reviewTotal,
  topicsExists,
  doctorQAs,
  similar,
}: {
  ko: string;
  en: string;
  report: ProcedureReport;
  reviews: CardData[];
  reviewLiked: Record<number, boolean>;
  /** 후기 작성자 나이·성별(카드 표시용). */
  reviewDemo: Record<number, { gender: string | null; ageDecade: number | null }>;
  reviewTotal: number;
  topicsExists: boolean;
  /** 의사 Q&A 인기순 최대 10개 */
  doctorQAs: CardData[];
  /** 비슷한 시술 최대 5개(각 카테고리 색) */
  similar: { ko: string; en: string; count: number; effectPct: number; category: ProcedureSlug | null }[];
}) {
  const session = useSession();
  const me: EngagementMe =
    session === null ? null : { id: session.activeIdentityId, role: session.role };
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);
  const [qaExpanded, setQaExpanded] = useState(false);
  const [reviewSort, setReviewSort] = useState<SortKey>("rec");
  const listRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // 정렬 변경 시 첫 후기가 보이도록 후기 리스트 상단으로 스크롤(sticky 칩 높이만큼 여백 확보).
  function changeSort(k: SortKey) {
    setReviewSort(k);
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // 공유 layout 으로 스크롤 컨테이너(AppShell .root)가 persist → 상세 진입 시 직전(인덱스) 스크롤이
  //   남아 맨 위가 아닌 곳에서 시작하는 문제. 마운트 시 가장 가까운 스크롤 조상을 찾아 최상단으로 리셋.
  useEffect(() => {
    let el: HTMLElement | null = topRef.current?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") {
        el.scrollTop = 0;
        break;
      }
      el = el.parentElement;
    }
  }, []);

  // 소프트월 v4 리포트 점수 배선 — 리포트 상세를 보면 비로그인 흥미점수에 "report-view"(+8)를 가산한다.
  // 세션당 1회만(sessionStorage seenKey 로 dedup) — 기존 useCardViewer.recordView 패턴과 동일.
  //   ⚠ 앵커가 있으면 실행하지 않는다(2026-07-04): 아래 ReportViewTracker → useCardViewer.recordView 가
  //   review_summary 에 report-view 점수까지 가산하므로(useCardViewer.ts), 이 수동 effect 와 겹치면
  //   dedup 키가 달라(view:{id} vs report-view:{ko}) 방문 1회에 +16 이중 가산 → 소프트월(임계 15)이
  //   리포트 1건으로 즉시 발동한다. 앵커 없는(미발행) 리포트만 이 수동 폴백으로 점수 유지.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (report.anchor) return; // 앵커 있음 — ReportViewTracker 경로가 점수·조회수 모두 담당
    if (session !== null) return; // 비로그인만 — 소프트월(회원가입 권유) 대상이라 로그인 사용자는 점수 안 쌓음
    const seenKey = `pibutenten:report-view:${encodeURIComponent(ko)}`;
    // safe-storage (R2-3): 인앱 브라우저 sandbox 에서 storage 가 throw 해도 크래시 없이
    //   dedup 만 degrade (점수 가산은 addEngagement 내부 가드가 함께 무력화).
    if (ssGet(seenKey)) return;
    ssSet(seenKey, "1");
    addEngagement("report-view");
  }, [ko, session, report.anchor]);

  // 데스크탑 사이드바 푸터(ReportShareButtons — ReportsShell 주입)와 앵커 공유 (D5 동일 배선).
  //   layout 계층은 page 데이터에 접근 못 하므로 모듈 스토어로 발행, 언마운트 시 해제.
  useEffect(() => {
    setReportAnchorCard(report.anchor ?? null);
    return () => setReportAnchorCard(null);
  }, [report.anchor]);

  // 진입 애니메이션 트리거(마운트 직후 1회).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const theme = categoryTheme(report.category);
  const heroAccent =
    HERO_ANCHOR[theme.color.toUpperCase()] ?? { chip: theme.deep, person: theme.deep };
  const {
    count, avgSatisfaction, satisfactionDist, avgPain, revisit, effects,
    noEffectCount, downtimeAnswered, downtimeDist, onsetAnswered, onsetDist,
    demographics,
  } = report;

  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const yesPctAnim = useCountUp(yesPct, mounted);

  // 만족도 히스토그램
  const maxSat = Math.max(1, ...satisfactionDist);
  const starFill = Math.round(avgSatisfaction);

  // 다운타임 평균(일) — DOWNTIME_DAYS 환산 재사용(표시만 당일/1주/2주 3구간 재그룹).
  const dtAvgDays =
    downtimeAnswered > 0
      ? downtimeDist.reduce((s, c, i) => s + c * (DOWNTIME_DAYS[i] ?? 0), 0) / downtimeAnswered
      : 0;
  const dtPct = downtimePos(dtAvgDays);
  const dtCaption =
    Math.round(dtAvgDays) === 0
      ? `당일 일상 복귀 · ${downtimeAnswered}명`
      : `평균 약 ${formatDays(dtAvgDays)}일 · ${downtimeAnswered}명`;

  // 효과시점 헤드라인 + 세로 막대(효과 못 느낌 제외 4구간, answered 분모·최다 강조).
  const onsetCols = onsetDist.slice(0, 4);
  const onsetTimeSum = onsetCols.reduce((a, b) => a + b, 0);
  let onsetTopIdx = 0;
  for (let i = 1; i < 4; i++) if ((onsetCols[i] ?? 0) > (onsetCols[onsetTopIdx] ?? 0)) onsetTopIdx = i;
  const onsetMax = Math.max(1, ...onsetCols);
  const onsetHead =
    onsetTimeSum === 0
      ? "아직 효과를 느꼈다는 후기가 적어요."
      : `효과는 대부분 ${EFFECT_ONSET_OPTIONS[onsetTopIdx]?.label ?? ""}부터 느끼기 시작했어요.`;

  // 작성자 통계 — 큰 조각(≥18%)은 띠 안 라벨, 작은 조각은 아래 범례.
  const INLINE_MIN = 18;
  const demoTotal = Math.max(1, demographics.male + demographics.female);
  const femalePct = Math.round((demographics.female / demoTotal) * 100);
  const malePct = Math.max(0, 100 - femalePct);
  const genderSegs = [
    { label: "여성", pct: femalePct, color: DEMO_FEMALE },
    { label: "남성", pct: malePct, color: DEMO_MALE },
  ];
  const ageTotal = Math.max(1, demographics.ageBands.reduce((a, b) => a + b.count, 0));
  const ageSegs = demographics.ageBands.map((b) => ({
    label: b.label,
    pct: Math.round((b.count / ageTotal) * 100),
    color: AGE_COLOR[b.label] ?? "#C9A9EC",
  }));

  // 사람 그리드 10×10=100(명세) — 비율 채움: 있음 진하게 / 고민 중 반투명 / 없어요 옅게.
  //   stagger 는 opacity 만(transform/opacity 규칙) — jank 시 45개로 낮춰도 비율 표현 동일.
  const GRID_TOTAL = 100;
  const yShow = Math.round((revisit.yes / rTotal) * GRID_TOTAL);
  const mShow = Math.min(GRID_TOTAL - yShow, Math.round((revisit.maybe / rTotal) * GRID_TOTAL));

  const topEffects = effects.slice(0, 6);
  const noEffectPct = Math.round((noEffectCount / Math.max(1, count)) * 100);
  const topEffectLabel = effects[0]?.label ?? "";
  const heroTags = effects.slice(0, 3).map((e) => e.label);

  // 전문의 Q&A — 5개 기본, 더 있으면 토글로 전체.
  const qaVisible = qaExpanded ? doctorQAs : doctorQAs.slice(0, 5);

  // ── 후기: 클라 정렬 + 10개씩 더 보기/접기 ──
  const [items, setItems] = useState<CardData[]>(reviews);
  const [liked, setLiked] = useState<Record<number, boolean>>(reviewLiked);
  const [demo, setDemo] = useState(reviewDemo);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const hasMore = !reachedEnd && items.length < reviewTotal;
  const expanded = items.length > reviews.length;
  const remaining = Math.max(0, reviewTotal - items.length);

  const sortedItems = useMemo(() => {
    const arr = [...items];
    switch (reviewSort) {
      case "high":
        arr.sort((a, b) => satOf(b) - satOf(a) || reactionScore(b) - reactionScore(a));
        break;
      case "low":
        arr.sort((a, b) => satOf(a) - satOf(b) || reactionScore(b) - reactionScore(a));
        break;
      case "new":
        arr.sort((a, b) => {
          const ca = a.created_at ?? "";
          const cb = b.created_at ?? "";
          return ca < cb ? 1 : ca > cb ? -1 : 0;
        });
        break;
      default: // 추천순 = 리액션(좋아요+댓글+공유)순, 동률은 글자수 많은순 — 댓글 성분은 D6 집계로 정합.
        arr.sort((a, b) => reactionScore(b) - reactionScore(a) || bodyLen(b) - bodyLen(a));
    }
    return arr;
  }, [items, reviewSort]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/reports/${encodeURIComponent(en || ko)}/reviews?offset=${items.length}&limit=10`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        reviews: CardData[];
        reviewLiked: Record<number, boolean>;
        reviewDemo?: Record<number, { gender: string | null; ageDecade: number | null }>;
        /* D6 댓글 수는 각 카드의 comment_count 에 서버가 병합해 온다(별도 필드 없음). */
      };
      setItems((prev) => [...prev, ...data.reviews]);
      setLiked((prev) => ({ ...prev, ...data.reviewLiked }));
      setDemo((prev) => ({ ...prev, ...(data.reviewDemo ?? {}) }));
      if ((data.reviews?.length ?? 0) < 10) setReachedEnd(true);
    } catch {
      // 버튼 재클릭으로 재시도 가능하나 무피드백이면 버튼이 죽은 것처럼 보임 → danger 토스트.
      showToast("후기를 더 불러오지 못했어요. 잠시 후 다시 시도해주세요.", { tone: "danger" });
    } finally {
      setLoadingMore(false);
    }
  }
  function collapseReviews() {
    setItems(reviews);
    setLiked(reviewLiked);
    setReachedEnd(false);
  }

  return (
    <>
      <div ref={topRef} aria-hidden className="sr-only" />
      {/* 페이지 h1 — 히어로 시술명은 h2(디자인 불변) 유지, 상위 계층은 sr-only 로 공급
          (허브·상세 h1 부재 — schema-auditor 지적, 2026-07-08). */}
      <h1 className="sr-only">{ko} 시술 리포트</h1>
      {/* 앵커 조회수 기록(2026-07-04 복원) — 구 상세(ProcedureReportCard variant="page")가 담당하던
          ReportViewTracker 배선이 신디자인 승격(f00fb5e, 2026-06-29) 때 누락돼 리포트 조회수가
          그날 이후 0 증가(원장 제보·card_views 실측으로 확정). 일반 글과 동일한 useCardViewer 경로
          (card_views INSERT → 트리거 view_count+1, 세션당 1회 dedup). */}
      {report.anchor && <ReportViewTracker card={report.anchor} auto />}
      <BackButton fallbackHref="/reports" className="mb-1" />

      {/* ── 리포트 카드 한 장(라운드 24) — 히어로 + 통계 섹션(흰 배경) ── */}
      <div className="overflow-hidden rounded-[24px] bg-white">
        {/* ① 히어로 — 카테고리 그라데이션 deep→tint 세로(tint 는 130% 지점 — 가시 하단이
            중간 톤에 머물러 흰 글자 가독 유지), tt 워터마크(텍스트 처리 — 크게·흐리게). */}
        <section
          className="relative overflow-hidden rounded-[24px] px-6 pb-6 pt-7 text-white"
          style={{ background: `linear-gradient(180deg, ${theme.deep} 0%, ${theme.tint} 130%)` }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-4 -top-12 select-none text-[150px] font-extrabold leading-none tracking-[-0.06em] text-white/10"
          >
            tt:
          </span>

          <div className="relative">
            <div className="text-[13.5px] font-bold tracking-[0.02em] text-white/90">피부텐텐 리포트</div>
            <h2 className="mt-2.5 text-[38px] font-extrabold leading-[1.08] tracking-[-0.04em]">{ko}</h2>

            {/* 태그 3 = 효과 top3 — 진한 톤 pill(명세 #078172 계열) */}
            {heroTags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {heroTags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white"
                    style={{ backgroundColor: heroAccent.chip }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* 재시술의향 — 라벨 + 아주 큰 % */}
            <div className="mt-7 text-[14px] font-bold text-white/90">재시술의향</div>
            <div className="text-[clamp(56px,17vw,80px)] font-extrabold leading-[1.02] tracking-[-0.04em] [font-feature-settings:'tnum']">
              {yesPctAnim}
              <span className="text-[0.42em]">%</span>
            </div>

            {/* 사람 아이콘 그리드 10×10=100 — 값 연동 비율 채움 */}
            <div
              className="mt-4 grid grid-cols-10 gap-x-[7px] gap-y-[8px]"
              role="img"
              aria-label={`후기 ${count}건 중 재시술의향 있음 ${revisit.yes}건, 고민 중 ${revisit.maybe}건, 없어요 ${revisit.no}건`}
            >
              {Array.from({ length: GRID_TOTAL }).map((_, i) => {
                const op = i < yShow ? 1 : i < yShow + mShow ? 0.5 : 0.22;
                return (
                  <span
                    key={i}
                    className="block leading-[0]"
                    style={{
                      opacity: mounted ? op : 0,
                      transition: `opacity .35s ease ${i * 8}ms`,
                    }}
                  >
                    <IconPerson fill={heroAccent.person} className="h-auto w-full" />
                  </span>
                );
              })}
            </div>

            <p className="mt-4 text-[13px] text-white/70">
              후기 {count}건 중 있음 {revisit.yes}·고민 중 {revisit.maybe}·없어요 {revisit.no}
            </p>

            {/* 헤드라인(흰 볼드) + 우하단 저장·공유 */}
            <div className="mt-2.5 flex items-end justify-between gap-4">
              <p className="min-w-0 text-[17px] font-bold leading-[1.45]">
                {topEffectLabel
                  ? `${topEffectLabel} 효과가 좋았다는 후기가 많아요`
                  : `후기 ${count}명의 경험을 모았어요`}
              </p>
              <div className="shrink-0 pb-0.5">
                {report.anchor ? (
                  <AnchorEngagement anchor={report.anchor} me={me} onLoginRequired={setAuthPrompt} />
                ) : (
                  // 앵커 없음 — 저장 비노출(대상 card_id 부재), 공유만 URL 공유로 노출.
                  <button
                    type="button"
                    onClick={() => void sharePlainUrl()}
                    aria-label="공유"
                    className="flex cursor-pointer items-center text-white transition-opacity hover:opacity-80"
                  >
                    <IconShare size={22} stroke="#FFFFFF" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ② SATISFACTION — 좌: 큰 평점+별 5 / 우: 별점 분포 5줄 */}
        <section className="px-5 pt-8">
          <div className={EYEBROW} style={{ color: theme.color }}>Satisfaction</div>
          <h3 className={SECTION_TITLE}>후기 {count}개가 말해주는 만족도예요</h3>
          <div className="mt-5 flex items-center gap-6">
            <div className="shrink-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[46px] font-extrabold leading-none text-[#3A3C41] [font-feature-settings:'tnum']">
                  {avgSatisfaction.toFixed(1)}
                </span>
                <span className="text-[15px] font-semibold text-[#8A939B]">/ 5.0</span>
              </div>
              <div className="mt-2.5 flex gap-[3px]" aria-label={`평균 만족도 ${avgSatisfaction.toFixed(1)}점`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} style={{ color: s <= starFill ? "#FCC623" : "#EDF2F4" }} aria-hidden>
                    <IconStar size={19} />
                  </span>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
              {[5, 4, 3, 2, 1].map((s) => {
                const c = satisfactionDist[s - 1] ?? 0;
                const w = Math.round((c / maxSat) * 100);
                return (
                  <div key={s} className="flex items-center gap-2 text-[11.5px]">
                    <span className="w-6 shrink-0 text-[#8A939B]">{s}점</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-[6px] bg-[var(--gauge-track)]">
                      <span
                        className="block h-full rounded-[6px] bg-[#FCC623] transition-[width] duration-700 ease-out"
                        style={{ width: mounted ? `${w}%` : "0%" }}
                        aria-hidden
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-[#8A939B] [font-feature-settings:'tnum']">{c}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ③ PAIN & RECOVERY — 통증 척도 바(그라데이션+원형 마커[번개]) · 다운타임(채움+마커[십자]) */}
        <section className="px-5 pt-8">
          <div className={EYEBROW} style={{ color: theme.color }}>Pain &amp; Recovery</div>
          <h3 className={SECTION_TITLE}>얼마나 아프고, 얼마나 쉬어야 할까?</h3>

          <div className="mt-5">
            <div className="text-[15px] leading-[1.45]">
              <b className="font-bold text-[#3A3C41]">통증 평균 {avgPain.toFixed(1)}점</b>{" "}
              <span className="text-[13px] text-[#8A939B]">{painPhrase(avgPain)}</span>
            </div>
            <div className="relative mt-5 h-[10px] rounded-[6px]" style={{ background: PAIN_GRADIENT }} aria-hidden>
              <span
                className="absolute top-1/2 flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 bg-white"
                style={{
                  left: `${painPos(avgPain)}%`,
                  transform: "translate(-50%,-50%)",
                  borderColor: painMarkColor(avgPain),
                  color: painMarkColor(avgPain),
                }}
              >
                <IconPain size={12} />
              </span>
            </div>
            <div className="mt-2.5 flex justify-between text-[11.5px] text-[#8A939B]" aria-hidden>
              {PAIN_LABELS.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </div>

          <div className="mt-7">
            {downtimeAnswered > 0 ? (
              <>
                <div className="text-[15px] leading-[1.45]">
                  <b className="font-bold text-[#3A3C41]">다운타임</b>{" "}
                  <span className="text-[13px] text-[#8A939B]">{dtCaption}</span>
                </div>
                <div className="relative mt-5 h-[10px] rounded-[6px] bg-[var(--gauge-track)]" aria-hidden>
                  <span
                    className="absolute left-0 top-0 block h-full rounded-[6px] transition-[width] duration-700 ease-out"
                    style={{ width: mounted ? `${dtPct}%` : "0%", backgroundColor: DT_FILL }}
                  />
                  <span
                    className="absolute top-1/2 flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 bg-white"
                    style={{
                      left: `${dtPct}%`,
                      transform: "translate(-50%,-50%)",
                      borderColor: DT_FILL,
                      color: DT_FILL,
                    }}
                  >
                    <IconDowntimeCross size={10} />
                  </span>
                </div>
                {/* 표시 3구간 재그룹 라벨(당일/1주/2주) — 트랙 매핑 위치에 정렬(저장 척도 5구간 불변) */}
                <div className="relative mt-2.5 h-[14px] text-[11.5px] text-[#8A939B]" aria-hidden>
                  <span className="absolute -translate-x-1/2" style={{ left: `${downtimePos(0)}%` }}>당일</span>
                  <span className="absolute -translate-x-1/2" style={{ left: `${downtimePos(7)}%` }}>1주</span>
                  <span className="absolute -translate-x-1/2" style={{ left: `${downtimePos(14)}%` }}>2주</span>
                </div>
              </>
            ) : (
              <>
                <b className="text-[15px] font-bold text-[#3A3C41]">다운타임</b>
                <p className="mt-1.5 text-[12.5px] text-[#8A939B]">아직 다운타임 응답이 적어요.</p>
              </>
            )}
          </div>
        </section>

        {/* ④ RESULTS — 효과 가로 막대 전체 + 미체감 문구 */}
        {topEffects.length > 0 && (
          <section className="px-5 pt-8">
            <div className={EYEBROW} style={{ color: theme.color }}>Results</div>
            <h3 className={SECTION_TITLE}>{ko} 받은 분들이 느낀 효과예요</h3>
            <p className="mt-2 text-[13px] text-[#8A939B]">
              ‘{topEffects[0]?.label}’ 효과를 가장 많이 꼽았어요. %는 그 효과를 봤다는 분의 비율이에요.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {topEffects.map((e, i) => (
                <div key={e.label} className="flex items-center gap-3">
                  <span className="w-[64px] shrink-0 truncate text-[13.5px] font-bold text-[#3A3C41]">{e.label}</span>
                  <span className="h-[10px] flex-1 overflow-hidden rounded-[6px] bg-[var(--gauge-track)]">
                    <span
                      className="block h-full rounded-[6px] transition-[width] duration-700 ease-out"
                      style={{
                        width: mounted ? `${e.pct}%` : "0%",
                        backgroundColor: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length],
                      }}
                      aria-hidden
                    />
                  </span>
                  <span className="w-11 shrink-0 text-right text-[15px] font-extrabold text-[#1A1A1A] [font-feature-settings:'tnum']">
                    {e.pct}%
                  </span>
                </div>
              ))}
            </div>
            {noEffectCount > 0 && (
              <p className="mt-3.5 text-[12.5px] text-[#8A939B]">
                효과를 느끼지 못한 분도 {noEffectCount}명({noEffectPct}%) 있었어요
              </p>
            )}
          </section>
        )}

        {/* ⑤ TIMELINE — 세로 막대 4개(최다만 강조색+숫자 파랑) + 타임라인 축(선+점) */}
        {onsetAnswered > 0 && (
          <section className="px-5 pt-8">
            <div className={EYEBROW} style={{ color: theme.color }}>Timeline</div>
            <h3 className={SECTION_TITLE}>{onsetHead}</h3>
            <div
              className="mt-6"
              role="img"
              aria-label={EFFECT_ONSET_OPTIONS.slice(0, 4)
                .map((o, i) => `${o.label} ${onsetCols[i] ?? 0}명`)
                .join(", ")}
            >
              <div className="grid grid-cols-4 items-end gap-2">
                {onsetCols.map((n, i) => {
                  const top = i === onsetTopIdx && onsetTimeSum > 0;
                  const h = n > 0 ? Math.round(18 + (n / onsetMax) * 108) : 0;
                  return (
                    <div key={i} className="flex flex-col items-center justify-end">
                      <span
                        className={
                          top
                            ? "text-[16px] font-extrabold text-[var(--accent-blue)] [font-feature-settings:'tnum']"
                            : "text-[14px] font-bold text-[#B5BEC6] [font-feature-settings:'tnum']"
                        }
                      >
                        {n}명
                      </span>
                      <span
                        className="mt-1.5 w-[40px] max-w-[55%] rounded-t-full transition-[height] duration-700 ease-out"
                        style={{
                          height: mounted ? h : 0,
                          background: top
                            ? "linear-gradient(180deg, #1A9DE8, #A8DCF5)"
                            : "linear-gradient(180deg, #A8DCF5, #E5F4FD)",
                        }}
                        aria-hidden
                      />
                    </div>
                  );
                })}
              </div>
              {/* 축 — 선 + 구간 점(최다 지점만 채움) */}
              <div className="relative h-[24px]">
                <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#E3EAF0]" aria-hidden />
                <div className="grid h-full grid-cols-4 gap-2">
                  {onsetCols.map((_, i) => {
                    const top = i === onsetTopIdx && onsetTimeSum > 0;
                    return (
                      <span key={i} className="flex items-center justify-center">
                        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--accent-blue)] bg-white">
                          {top && <span className="h-2 w-2 rounded-full bg-[var(--accent-blue)]" />}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="mt-1 grid grid-cols-4 gap-2 text-center text-[12px] text-[#8A939B]">
                {EFFECT_ONSET_OPTIONS.slice(0, 4).map((o) => (
                  <span key={o.value}>{o.label}</span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ⑥ 작성자 통계 — 성별·연령 가로 띠(큰 조각 띠 안 라벨 / 작은 조각 아래 범례) */}
        {demographics.total > 0 && (
          <section className="mx-5 mt-8 border-t border-[#EDF2F4] pt-7 pb-8">
            <div className="text-[16px] font-extrabold text-[#3A3C41]">작성자 통계</div>

            <div className="mt-4 text-[13px] font-semibold text-[#8A939B]">성별</div>
            <div className="mt-2 flex h-[36px] overflow-hidden rounded-full" aria-hidden>
              {genderSegs.map(
                (g) =>
                  g.pct > 0 && (
                    <span
                      key={g.label}
                      className="flex items-center justify-center overflow-hidden whitespace-nowrap text-[13px] font-bold text-white"
                      style={{ width: `${g.pct}%`, backgroundColor: g.color }}
                    >
                      {g.pct >= INLINE_MIN ? `${g.label} ${g.pct}%` : ""}
                    </span>
                  ),
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#8A939B]">
              {genderSegs
                .filter((g) => g.pct < INLINE_MIN)
                .map((g) => (
                  <span key={g.label}>
                    <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: g.color }} />
                    {g.label} {g.pct}%
                  </span>
                ))}
            </div>

            {ageSegs.length > 0 && (
              <>
                <div className="mt-5 text-[13px] font-semibold text-[#8A939B]">연령대</div>
                <div className="mt-2 flex h-[36px] overflow-hidden rounded-full" aria-hidden>
                  {ageSegs.map(
                    (b) =>
                      b.pct > 0 && (
                        <span
                          key={b.label}
                          className="flex items-center justify-center overflow-hidden whitespace-nowrap text-[13px] font-bold text-white"
                          style={{ width: `${b.pct}%`, backgroundColor: b.color }}
                        >
                          {b.pct >= INLINE_MIN ? `${b.label} ${b.pct}%` : ""}
                        </span>
                      ),
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#8A939B]">
                  {ageSegs
                    .filter((b) => b.pct < INLINE_MIN)
                    .map((b) => (
                      <span key={b.label}>
                        <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: b.color }} />
                        {b.label} {b.pct}%
                      </span>
                    ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* ── ⑦~⑪ 하단 영역 — 배경 #EAF2F8 전환(모바일 좌우 풀블리드 = .page 패딩 18px 상쇄,
             데스크탑은 본문 컬럼 안 라운드 패널 — 사이드바 그리드 침범 방지) ── */}
      <div className="-mx-[18px] mt-8 bg-[#EAF2F8] px-[18px] pb-6 pt-7 min-[900px]:mx-0 min-[900px]:rounded-[24px] min-[900px]:px-6">
        {/* ⑦ 리뷰 섹션 */}
        <section className="scroll-mt-2">
          <div className="flex items-baseline gap-2 px-1">
            <h3 className={SECTION_TITLE}>{ko} 경험자들의 솔직한 후기</h3>
            <span className="shrink-0 text-[13px] font-semibold text-[#8A939B]">{reviewTotal}건</span>
          </div>

          {/* 정렬 칩 4종(보존) — 후기 구간에서만 sticky. 배경은 패널색(#EAF2F8)과 동일. 활성=#1A9DE8. */}
          <div className="sticky z-[41] mt-3 bg-[#EAF2F8] py-2.5" style={{ top: "var(--sat)" }}>
            <div
              role="group"
              aria-label="후기 정렬"
              className="flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {SORTS.map((s) => {
                const on = reviewSort === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => changeSort(s.key)}
                    aria-pressed={on}
                    className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors"
                    style={
                      on
                        ? { backgroundColor: "var(--accent-blue)", color: "#fff" }
                        : { backgroundColor: "#fff", color: "#8A939B" }
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {sortedItems.length > 0 ? (
            <div
              key={reviewSort}
              ref={listRef}
              className="flex flex-col gap-3 px-px scroll-mt-[calc(var(--sat,0px)_+_56px)]"
            >
              {sortedItems.map((card) => (
                <div key={card.id} style={{ animation: "rvRise .28s ease both" }}>
                  <ReportsReviewCard
                    card={card}
                    category={report.category}
                    liked={liked[card.id] ?? false}
                    demo={demo[card.id]}
                    me={me}
                    onLoginRequired={(reason) => setAuthPrompt(reason)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="px-1 py-6 text-[13px] text-[#8A939B]">아직 등록된 후기가 없어요.</p>
          )}

          {(hasMore || expanded) && (
            <div className="mt-3 flex justify-center gap-2">
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  className="flex items-center justify-center gap-1.5 px-4 py-3 text-[14px] font-semibold text-[#8A939B] transition-opacity hover:opacity-70"
                >
                  {loadingMore ? "불러오는 중…" : `${remaining}건의 후기 더보기`}
                  {!loadingMore && CHEVRON_DOWN}
                </button>
              )}
              {expanded && (
                <button
                  type="button"
                  onClick={collapseReviews}
                  className="flex items-center justify-center gap-1 px-4 py-3 text-[14px] font-semibold text-[#B5BEC6] transition-opacity hover:opacity-70"
                >
                  접기
                </button>
              )}
            </div>
          )}
        </section>

        {/* ⑧ 후기 유도 카드 — #D6E9F5, 말풍선 + 흰 버튼(파란 글자) */}
        <section className="mt-8 rounded-[16px] bg-[#D6E9F5] px-6 py-9 text-center">
          <IconSpeechBubble size={62} className="mx-auto block" />
          <p className="mt-4 text-[18px] font-extrabold leading-[1.45] tracking-[-0.02em] text-[#3A3C41]">
            피부텐텐 리포트는
            <br />
            실제 후기로 만들어졌어요
          </p>
          <p className="mt-3 text-[13.5px] leading-[1.65] text-[#5E6A75]">
            당신의 경험이 다음 사람에게 도움이 되도록,
            <br />
            당신의 후기를 남겨주세요
          </p>
          <Link
            href={`/write?tab=review&proc=${encodeURIComponent(ko)}`}
            className="mt-5 inline-flex items-center justify-center rounded-[12px] bg-white px-9 py-3.5 text-[14.5px] font-bold text-[var(--accent-blue)] transition-opacity hover:opacity-90"
          >
            내 후기 남기기
          </Link>
        </section>

        {/* ⑨ 전문의 섹션 — 순위색 원 + 질문 제목 말줄임(기존 데이터·링크 로직 유지) */}
        {doctorQAs.length > 0 && (
          <section className="mt-9">
            <div className="flex items-baseline gap-2 px-1">
              <h3 className={SECTION_TITLE}>전문의가 알려주는 {ko}</h3>
              <span className="shrink-0 text-[13px] font-semibold text-[#8A939B]">
                {ko} 관련 {doctorQAs.length}개
              </span>
            </div>
            <div className="mt-3.5 rounded-[16px] bg-white px-5 pb-4 pt-1">
              {qaVisible.map((card, i) => {
                const rank = i + 1;
                return (
                  <Link
                    key={card.id}
                    href={getQaUrl(card)}
                    className="flex items-center gap-3.5 border-b border-[#F0F3F6] py-4 last:border-b-0"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white"
                      style={{ backgroundColor: rankColor(rank) }}
                    >
                      {rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#1A1A1A]">
                      {card.title}
                    </span>
                  </Link>
                );
              })}
              {!qaExpanded && doctorQAs.length > 5 && (
                <button
                  type="button"
                  onClick={() => setQaExpanded(true)}
                  className="flex w-full items-center justify-center gap-1.5 py-3.5 text-[14px] font-semibold text-[#8A939B] transition-opacity hover:opacity-70"
                >
                  6~{doctorQAs.length}위 보기{CHEVRON_DOWN}
                </button>
              )}
              {topicsExists && (
                <Link
                  href={`/?q=${encodeURIComponent(ko)}`}
                  className="mt-2 flex w-full items-center justify-center rounded-[12px] bg-[var(--accent-blue)] py-3.5 text-[14.5px] font-bold text-white transition-opacity hover:opacity-90"
                >
                  전문의 Q&amp;A 보러가기
                </Link>
              )}
            </div>
          </section>
        )}

        {/* ⑩ 다른 시술 — 카테고리 soft 파스텔 카드 5 (기존 similar 데이터 유지) */}
        {similar.length > 0 && (
          <section className="mt-9">
            <div className="px-1">
              <h3 className={SECTION_TITLE}>‘{topEffectLabel}’ 효과가 좋았던 다른 시술</h3>
            </div>
            <div className="mt-3.5 flex flex-col gap-3">
              {similar.map((s, i) => {
                const st = categoryTheme(s.category ?? report.category);
                return (
                  <Link
                    key={s.ko}
                    href={`/reports/${encodeURIComponent(s.ko)}`}
                    className="flex items-center gap-3.5 rounded-[16px] px-5 py-5 transition-opacity hover:opacity-90"
                    style={{ backgroundColor: st.soft }}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white"
                      style={{ backgroundColor: st.color }}
                    >
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="text-[17px] font-extrabold tracking-[-0.02em] text-[#3A3C41]">{s.ko}</span>
                      <span className="text-[13px] text-[#8A939B]">
                        후기 {s.count}개 <span aria-hidden className="mx-0.5 text-[#D4DDE4]">|</span> {topEffectLabel} 효과 {s.effectPct}%
                      </span>
                    </span>
                    <span className="shrink-0" style={{ color: st.color }} aria-hidden>
                      {CHEVRON_RIGHT}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ⑪ 푸터 — 아주 옅게 */}
        <p
          aria-hidden
          className="mt-10 select-none text-center text-[13px] font-extrabold uppercase tracking-[0.26em] text-[#C3CFD9]"
        >
          Pibutenten Report
        </p>
      </div>

      <style>{`@keyframes rvRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      <LoginPromptDialog
        open={!!authPrompt}
        message={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </>
  );
}
