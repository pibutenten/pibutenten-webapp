"use client";

/**
 * ReportsDetailView — /reports/[시술] 전체 리포트.
 *
 * 2026-07-08 UI 개편 Phase 2-1 (디자인 명세 PDF p.4-7 + 시안 2d-리포트-1/2 — 위→아래 한 스크롤)
 * + 2026-07-09 R2-1 디자인 보정(계획서 docs/plans/260709 §2 — 히어로 표지화 ~390px·색 경량화):
 *   ① 히어로 카드 — R3(2026-07-09) 시안 100% 일치 픽셀 실측 반영: 카드 폭 348(셸 .page 18px
 *      + 로컬 3px = 마진 21 — MyPageView 패턴)·라운드 18·패딩 좌우 28/상 58/하 28,
 *      그라데이션 130deg(원색 0→21% 평탄 → gradEnd(초록 #90D5CE) 100%), tt: 워터마크 =
 *      IconBrandTT(brand-logo.svg 글리프 추출, 폭 167·top 31·right -9·white/16),
 *      라벨 15px/tracking .28em, 시술명 37px, 칩 rounded-10 반투명 오버레이(rgba(0,88,71,.40)),
 *      재시술의향 95px %, 사람 그리드 20×3=60(셀 10.2px — IconPersonGrid 꽉 채움),
 *      보조문구 "후기 N건 중 있음 y건, 고민 중 m건, 없어요 n건", 헤드라인 17px 전폭
 *      + `{효과} 효과` 부분만 #FFF8D1 이중색, 저장·공유 별도 행(우측 정렬, 터치 타깃 44×44))
 *   ② SATISFACTION(좌 큰 숫자+별 5 / 우 별점 분포 5줄) ③ PAIN & RECOVERY(통증 그라데이션
 *      척도 바+원형 마커[번개], 다운타임 채움 바+원형 마커[십자 — 원장 확정]+표시 3구간
 *      당일/1주/2주 재그룹 — 저장 척도 5구간 불변, DOWNTIME_DAYS 환산 재사용)
 *   ④ RESULTS(효과 막대 전체+미체감 문구) ⑤ TIMELINE(세로 막대 4개+축 선·점, 최다만 강조)
 *   ⑥ 작성자 통계(성별·연령 가로 띠, 큰 조각 띠 안 라벨·작은 조각 아래 범례)
 *   ⑦ (배경 #F5FBFF 전환) 리뷰 섹션 ⑧ 후기 유도 카드(#E0F2FB) ⑨ 전문의 섹션(순위 원+제목)
 *   ⑩ 다른 시술 5(카테고리 chip 파스텔) ⑪ 푸터 PIBUTENTEN REPORT ⑫ 하단 고정 바(모바일).
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
  IconPersonGrid,
  IconBrandTT,
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
const PAIN_LABELS = ["없음", "조금", "보통", "많이", "심함"]; // R2-1: "꽤"→"많이" (척도어 3면 통일)
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

// 히어로 파생 색 — 명세는 초록(#029688) 기준 칩 오버레이 rgba(0,88,71,.40) · 사람 #168275 만
//   제시(R3: 구 불투명 chip #078172 폐기 — 칩은 그라데이션 위 반투명 오버레이).
//   타 카테고리는 theme.deep 로 결정론 폴백 — 오버레이는 deep 40%. color-mix 는 iOS 15 이하
//   미지원(무색 렌더) → deep 이 hex 일 때만 사용하고, CSS var 폴백(null 카테고리)은 고정
//   rgba 오버레이로 방어(R3 검수 반영).
const HERO_ANCHOR: Record<string, { chipOverlay: string; person: string }> = {
  "#029688": { chipOverlay: "rgba(0,88,71,0.40)", person: "#168275" },
};

/** 사람 그리드 셀 배분 — round 비율 배분 + "0 아닌 상태 최소 1셀" 보장(R2-1 — 1칸=1.67%p 라
 *  소수 상태가 반올림으로 사라지는 것을 방지. 부족분은 가장 큰 조각에서 1셀 차감). */
function allocGridCells(
  yes: number,
  maybe: number,
  no: number,
  total: number,
): { y: number; m: number; n: number } {
  const sum = Math.max(1, yes + maybe + no);
  const cells: [number, number, number] = [Math.round((yes / sum) * total), 0, 0];
  cells[1] = Math.min(total - cells[0], Math.round((maybe / sum) * total));
  cells[2] = total - cells[0] - cells[1];
  const counts = [yes, maybe, no];
  for (let i = 0; i < 3; i++) {
    if (counts[i] > 0 && cells[i] === 0) {
      let donor = -1;
      for (let j = 0; j < 3; j++) {
        if (j !== i && cells[j] > 1 && (donor < 0 || cells[j] > cells[donor])) donor = j;
      }
      if (donor >= 0) {
        cells[donor] -= 1;
        cells[i] = 1;
      }
    }
  }
  return { y: cells[0], m: cells[1], n: cells[2] };
}

/** 히어로 헤드라인 이중 색상(R3) — 문장 안에 `{최다 효과} 효과` 부분 문자열이 있으면 그 부분만
 *  #FFF8D1, 나머지 흰색. 매칭 없으면 전체 흰색(엔진 문장 다양성 대응 — 문구 자체는 불변). */
function renderHeadline(text: string, effectLabel: string) {
  const token = effectLabel ? `${effectLabel} 효과` : "";
  const idx = token ? text.indexOf(token) : -1;
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: "#FFF8D1" }}>{token}</span>
      {text.slice(idx + token.length)}
    </>
  );
}

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
      {/* 히어로 저장·공유 행 아이콘(흰색) — 시각 22px + 패딩으로 터치 타깃 44×44 확보(R2-1.
          음수 마진 상쇄라 레이아웃 자리는 아이콘 크기 그대로). 버튼 간 gap 22px(R3). */}
      <div className="flex items-center gap-[22px] text-white">
        <button
          type="button"
          onClick={eng.save.toggle}
          aria-label={eng.save.active ? "저장 취소" : "저장"}
          aria-pressed={eng.save.active}
          className="-m-[11px] flex cursor-pointer items-center p-[11px] transition-opacity hover:opacity-80"
        >
          <BookmarkGlyph filled={eng.save.active} size={22} />
        </button>
        <button
          type="button"
          onClick={() => void eng.share.share()}
          aria-label="공유"
          className="-m-[11px] flex cursor-pointer items-center p-[11px] transition-opacity hover:opacity-80"
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
              /* 탭바 실측 76px 밀착 + 상단 1px 보더로 경계(R2-1) — 배포 후 실기기 확인. */
              bottom: "calc(76px + env(safe-area-inset-bottom))",
              borderTop: "1px solid #EFF3F6",
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
    HERO_ANCHOR[theme.color.toUpperCase()] ?? {
      chipOverlay: theme.deep.startsWith("#")
        ? `color-mix(in srgb, ${theme.deep} 40%, transparent)`
        : "rgba(0,60,50,0.35)", // null 카테고리(CSS var) — color-mix 구형 브라우저 무색 방어
      person: theme.deep,
    };
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

  // 사람 그리드 20×3=60(R2-1 시안 실측 배열) — 비율 채움: 있음 1.0 / 고민 중 0.55 / 없어요 0.25.
  //   0 아닌 상태 최소 1셀 보장(allocGridCells). stagger 는 opacity 만(transform/opacity 규칙).
  const GRID_TOTAL = 60;
  const { y: yShow, m: mShow } = allocGridCells(revisit.yes, revisit.maybe, revisit.no, GRID_TOTAL);
  // 재시술 문항 전원 무응답(0292 이후 revisit nullable)이면 그리드 미노출 — 60칸 전부
  //   "없어요" 톤으로 렌더되어 "전원 부정"으로 오독될 수 있음(R2 검수 지적).
  const revisitAnswered = revisit.yes + revisit.maybe + revisit.no > 0;

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
      {/* 뒤로가기는 셸 헤더로 이전(R2-2 backHeader — ReportsShell 이 상세일 때 지정).
          구 인라인 BackButton 행 제거(중복 방지). */}

      {/* ── 리포트 카드 한 장(라운드 18, 390 기준 폭 348 — 셸 .page 18px + 로컬 3px = 마진 21.
             MyPageView "padding: 0 2px" 패턴의 로컬 보정. 흰 통계 섹션 포함 카드 전체 적용) ── */}
      <div className="mx-[3px] overflow-hidden rounded-[18px] bg-white">
        {/* ① 히어로 — R3 시안 픽셀 실측 일치. 블록 간 마진은 명세 "잉크 간격"에서 라인박스
            여백(하프 리딩 + 글리프 상하 여백 — 한글 잉크 ≈ 0.11em~0.89em, 숫자 ≈ 0.13em~0.85em
            가정)을 뺀 환산값. 그라데이션 130deg(원색 0→21% 평탄 → gradEnd 100%). */}
        <section
          className="relative overflow-hidden rounded-[18px] px-[28px] pb-[28px] pt-[58px] text-white"
          style={{
            background: `linear-gradient(130deg, ${theme.color} 0%, ${theme.color} 21%, ${theme.gradEnd} 100%)`,
          }}
        >
          {/* tt: 워터마크 — 브랜드 로고타이프 SVG(IconBrandTT, viewBox=잉크 bbox 크롭).
              잉크 기준 top 31·right -9(콜론 점 ~8px 카드 밖 — overflow-hidden 클립), 폭 167. */}
          <IconBrandTT
            width={167}
            fill="#FFFFFF"
            className="pointer-events-none absolute right-[-9px] top-[31px] opacity-[.16]"
          />

          <div className="relative">
            {/* 1. 라벨 — 15px/700, tracking .28em, white/55 */}
            <div className="text-[15px] font-bold leading-[1.3] tracking-[0.28em] text-white/55">피부텐텐 리포트</div>
            {/* 2. 시술명 — 잉크 간격 23.5 → mt 14 */}
            <h2 className="mt-[14px] text-[37px] font-extrabold leading-[1.15] tracking-[-0.01em]">{ko}</h2>

            {/* 3. 태그 칩 1줄 = 효과 top3 — rounded-10, 높이 32(py 7·px 12), 반투명 오버레이 배경.
                잉크 간격 18.2 → mt 13. 줄바꿈 없이 1줄 유지. */}
            {heroTags.length > 0 && (
              <div className="mt-[13px] flex flex-nowrap gap-[6px] overflow-hidden">
                {heroTags.map((t) => (
                  <span
                    key={t}
                    className="whitespace-nowrap rounded-[10px] px-[12px] py-[7px] text-[13.5px] font-semibold leading-[1.35] text-white"
                    style={{ backgroundColor: heroAccent.chipOverlay }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* 4. 재시술의향 라벨 — 15px/700 white 100%. 잉크 간격 34.5 → mt 31 */}
            <div className="mt-[31px] text-[15px] font-bold leading-[1.3] text-white">재시술의향</div>
            {/* 5. % 숫자 — 95px/800, tracking -.04em, tabular. %-스팬 0.50em 베이스라인 정렬.
                잉크 간격 18.2 → mt 2(95px 숫자 캡 위 여백 ≈ 12.4 흡수) */}
            <div className="mt-[2px] whitespace-nowrap text-[95px] font-extrabold leading-none tracking-[-0.04em] [font-feature-settings:'tnum']">
              {yesPctAnim}
              <span className="text-[0.5em]">%</span>
            </div>

            {/* 6. 사람 아이콘 그리드 20×3=60 — 값 연동 비율 채움. 셀 높이 10.2px(R3),
                IconPersonGrid(셀 비율 10×11.6)가 셀을 꽉 채움(레터박스 폐기).
                잉크 간격 27.1 → mt 13(숫자 베이스라인 아래 여백 ≈ 14.3 흡수).
                전원 무응답이면 그리드·보조문구 미노출(오독 방지). */}
            {revisitAnswered && (
              <>
                <div
                  className="mt-[13px] grid grid-cols-[repeat(20,minmax(0,1fr))] gap-x-[6px] gap-y-[8px]"
                  role="img"
                  aria-label={`후기 ${count}건 중 재시술의향 있음 ${revisit.yes}건, 고민 중 ${revisit.maybe}건, 없어요 ${revisit.no}건`}
                >
                  {Array.from({ length: GRID_TOTAL }).map((_, i) => {
                    const op = i < yShow ? 1 : i < yShow + mShow ? 0.55 : 0.25;
                    return (
                      <span
                        key={i}
                        className="block h-[10.2px]"
                        style={{
                          opacity: mounted ? op : 0,
                          transition: `opacity .35s ease ${i * 4}ms`,
                        }}
                      >
                        <IconPersonGrid fill={heroAccent.person} className="block h-full w-full" />
                      </span>
                    );
                  })}
                </div>

                {/* 7. 보조문구 — 13.5px white/65, PDF p5 명세 원문 포맷. 잉크 간격 ~16 → mt 12 */}
                <p className="mt-[12px] text-[13.5px] leading-[1.35] text-white/65">
                  후기 {count}건 중 있음 {revisit.yes}건, 고민 중 {revisit.maybe}건, 없어요 {revisit.no}건
                </p>
              </>
            )}

            {/* 8. 헤드라인 — 전폭 블록 한 줄 17px/700, `{효과} 효과` 부분만 #FFF8D1 이중색.
                잉크 간격 16.2 → mt 7 */}
            <p className="mt-[7px] text-[17px] font-bold leading-[1.4]">
              {renderHeadline(
                topEffectLabel
                  ? `${topEffectLabel} 효과가 좋았다는 후기가 많아요`
                  : `후기 ${count}명의 경험을 모았어요`,
                topEffectLabel,
              )}
            </p>

            {/* 9. 저장·공유 행(R3 신설) — 우측 정렬, 아이콘 22px. 배선(useCardEngagement·aria·
                로그인 유도)은 기존 AnchorEngagement/공유 폴백 그대로 — 행 위치만 이동.
                잉크 간격 39 → mt 31 */}
            <div className="mt-[31px] flex items-center justify-end">
              {report.anchor ? (
                <AnchorEngagement anchor={report.anchor} me={me} onLoginRequired={setAuthPrompt} />
              ) : (
                // 앵커 없음 — 저장 비노출(대상 card_id 부재), 공유만 URL 공유로 노출.
                <button
                  type="button"
                  onClick={() => void sharePlainUrl()}
                  aria-label="공유"
                  className="-m-[11px] flex cursor-pointer items-center p-[11px] text-white transition-opacity hover:opacity-80"
                >
                  <IconShare size={22} stroke="#FFFFFF" />
                </button>
              )}
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
                className="absolute top-1/2 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white"
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
                    className="absolute top-1/2 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white"
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
            <div className="mt-2 flex h-[30px] overflow-hidden rounded-full" aria-hidden>
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
                <div className="mt-2 flex h-[30px] overflow-hidden rounded-full" aria-hidden>
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

      {/* ── ⑦~⑪ 하단 영역 — 배경 #F5FBFF 전환(R2-1 색 경량화. 모바일 좌우 풀블리드 = .page
             패딩 18px 상쇄, 데스크탑은 본문 컬럼 안 라운드 패널 — 사이드바 그리드 침범 방지) ── */}
      <div className="-mx-[18px] mt-8 bg-[#F5FBFF] px-[18px] pb-6 pt-7 min-[900px]:mx-0 min-[900px]:rounded-[24px] min-[900px]:px-6">
        {/* ⑦ 리뷰 섹션 */}
        <section className="scroll-mt-2">
          <div className="flex items-baseline gap-2 px-1">
            <h3 className={SECTION_TITLE}>{ko} 경험자들의 솔직한 후기</h3>
            <span className="shrink-0 text-[13px] font-semibold text-[#8A939B]">{reviewTotal}건</span>
          </div>

          {/* 정렬 칩 4종(보존) — 후기 구간에서만 sticky. 배경은 패널색(#F5FBFF)과 동일. 활성=#1A9DE8.
              비선택 칩은 흰 배경이라 밝아진 패널 위 대비 보전용 1px 보더 #E1EAF2(R2-1). */}
          <div className="sticky z-[41] mt-3 bg-[#F5FBFF] py-2.5" style={{ top: "var(--sat)" }}>
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
                        ? { backgroundColor: "var(--accent-blue)", color: "#fff", border: "1px solid transparent" }
                        : { backgroundColor: "#fff", color: "#8A939B", border: "1px solid #E1EAF2" }
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

        {/* ⑧ 후기 유도 카드 — #E0F2FB(R2-1 경량화), 말풍선 + 흰 버튼(파란 글자) */}
        <section className="mt-8 rounded-[16px] bg-[#E0F2FB] px-6 py-9 text-center">
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

        {/* ⑩ 다른 시술 — 카테고리 chip 파스텔 카드 5(R2-1: soft 12% 틴트→chip, 라운드 24,
            py 16 = 높이 ~58, 간격 8. 기존 similar 데이터 유지) */}
        {similar.length > 0 && (
          <section className="mt-9">
            <div className="px-1">
              <h3 className={SECTION_TITLE}>‘{topEffectLabel}’ 효과가 좋았던 다른 시술</h3>
            </div>
            <div className="mt-3.5 flex flex-col gap-2">
              {similar.map((s, i) => {
                const st = categoryTheme(s.category ?? report.category);
                return (
                  <Link
                    key={s.ko}
                    href={`/reports/${encodeURIComponent(s.ko)}`}
                    className="flex items-center gap-3.5 rounded-[24px] px-5 py-4 transition-opacity hover:opacity-90"
                    style={{ backgroundColor: st.chip }}
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
