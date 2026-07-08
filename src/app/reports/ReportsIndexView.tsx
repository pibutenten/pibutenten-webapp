"use client";

/**
 * ReportsIndexView — /reports(시술 리포트 인덱스 개선판) 본문 (클라이언트).
 *
 * 원칙: 글로벌 크롬(AppShell)·우측 사이드바·헤더 검색은 공유 layout(ReportsShell)이 담당한다.
 *   이 컴포넌트는 **본문 콘텐츠만** 반환한다(정렬 칩 + 목록 + 면책).
 *
 * 본문:
 *   - 정렬 칩 레일(컴팩트 풀로 계산 가능한 것만): 후기 많은 순(기본)/다시 받고 싶은 순/
 *     만족도 높은 순/통증 적은 순. 본문 상단에 인라인 sticky 바로 고정(상세 후기 정렬칩과 동일 패턴).
 *   - 카테고리 필터: 사이드바 칩 선택을 useReportsCategory()로 구독해 목록을 거른다(필터 해제·이동은
 *     상위 shell 의 사이드바 재클릭이 담당. 본문은 읽어서 필터만).
 *   - 각 시술 = ReportsIndexCard(자체 구현, 컴팩트 풀 값만 쓰는 요약 카드) + 서버 확정 headline.
 *     (공용 ProcedureReportCard 는 병렬 세션 소유라 import·의존하지 않는다.)
 *
 * 헤드라인은 서버 prop 그대로 표시(클라 재랜덤 금지 → SSR/CSR 일치, 하이드레이션 안전).
 *
 * 격리: app.module.css 클래스 의존 금지 — Tailwind 유틸 + globals.css 토큰만.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProcedureReport } from "@/lib/procedure-report";
import type { ProcedureSlug } from "@/lib/categories";
import ReportsIndexCard from "./ReportsIndexCard";
import { useReportsCategory } from "./category-context";

type ReportItem = {
  report: ProcedureReport;
  headline: string;
  /** 서버 선집계 대표 효과 top3(즉시 표시·끊김 없음). */
  effects: { label: string; pct: number }[];
  /** 효과 발현 최다 시점 라벨(없으면 null). */
  onsetLabel: string | null;
  /** family 롤업 후 가장 최근 후기 시각(ISO). 후기 0건이면 null. '최신순' 정렬용. */
  latestReviewAt: string | null;
};

type SortKey = "recent" | "count" | "revisit" | "satisfaction" | "pain";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "최신순" },
  { key: "count", label: "후기 많은 순" },
  { key: "revisit", label: "재시술의향 높은 순" },
  { key: "satisfaction", label: "만족도 높은 순" },
  { key: "pain", label: "통증 적은 순" },
];

/** 한 페이지(피드형 무한스크롤) 노출 개수. */
const PAGE_SIZE = 8;

/** 뒤로가기 복원용 스냅샷(상세로 떠나는 순간 저장 → 목록 재마운트 시 1회 복원, P2). */
const SNAPSHOT_KEY = "pibutenten:reports-index-snapshot";
/** 스냅샷 유효 기간(ms) — 5분 지나면 무효(맨 위·기본 상태로 새 진입). */
const SNAPSHOT_TTL = 5 * 60 * 1000;

type IndexSnapshot = {
  sort: SortKey;
  /** 떠나는 순간의 카테고리 필터(null=전체). 복원 시 현재값과 다르면 scrollTop 복원만 스킵. */
  category: ProcedureSlug | null;
  pageCount: number;
  open: string[];
  scrollTop: number;
  ts: number;
};

/** 재시술 의향 yes 비율(%) — 정렬용. 분모 0이면 0. */
function revisitYesPct(r: ProcedureReport): number {
  const total = r.revisit.yes + r.revisit.maybe + r.revisit.no;
  return total > 0 ? r.revisit.yes / total : 0;
}

/**
 * 결정론적 [0,1) 의사난수 — 시술명 + 일(日) 시드 해시(FNV-1a 변형).
 * 같은 (시술, 시드)면 항상 같은 값 → SSR/CSR 하이드레이션 일치 + Math.random 미사용.
 */
function rotationNoise(key: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** ISO 문자열 → ms. null/파싱불가면 0(가장 오래됨). */
function isoToMs(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** 최신순 합성 점수 가중치 — 최신 후기 / 후기 수 / 재시술의향 / 약한 일일 회전. */
const W_RECENCY = 0.4;
const W_COUNT = 0.35;
const W_REVISIT = 0.25;
const W_ROTATION = 0.12;

export default function ReportsIndexView({
  items,
  rotationSeed,
}: {
  /** 서버 정렬(count desc) + 헤드라인 확정 목록. */
  items: ReportItem[];
  /** 서버 계산 일(日) 시드 — '최신순' 약한 회전용(하루 고정 → 하이드레이션 일치). */
  rotationSeed: number;
}) {
  const [sort, setSort] = useState<SortKey>("recent");
  // 피드형 무한스크롤 — 현재 노출 페이지 수. 정렬·카테고리 변경 시 1로 리셋.
  const [pageCount, setPageCount] = useState(1);
  // 펼친 카드 집합(시술명 키) — lift-up. 뒤로가기 복원 위해 부모가 소유. 초기값 빈 Set(하이드레이션 안전).
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 스크롤 조상(.root) 탐색의 시작점이 될 DOM 마커 ref.
  const rootRef = useRef<HTMLDivElement | null>(null);
  // 복원으로 인한 setSort 직후 reset 효과 1회를 건너뛰기 위한 플래그.
  const restoringRef = useRef(false);
  // 카테고리 필터는 공유 layout(ReportsShell)의 사이드바 칩 상태를 구독(null=전체).
  const category = useReportsCategory();

  // 펼침 토글 — 부모 openSet 갱신(불변 갱신). 카드의 onToggle 으로 전달.
  //   setOpenSet 만 참조(안정) → 빈 의존성으로 안정 참조 유지.
  const toggleOpen = useCallback((ko: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(ko)) next.delete(ko);
      else next.add(ko);
      return next;
    });
  }, []);

  // 가장 가까운 overflowY auto/scroll 조상(.root) 탐색 — 상세 뷰와 동일 패턴.
  //   rootRef(안정 ref)만 참조 → 빈 의존성으로 안정 참조 유지(saveSnapshot·복원 effect 의 의존성).
  const findScrollAncestor = useCallback((): HTMLElement | null => {
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return el;
      el = el.parentElement;
    }
    return null;
  }, []);

  // 상세로 떠나는 순간 — 현재 정렬/카테고리/페이지수/펼침/스크롤 위치를 스냅샷 저장(sessionStorage).
  //   의존성(sort, category, pageCount, openSet, findScrollAncestor)을 정확히 지정해 신선한 값 보장.
  const saveSnapshot = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const scrollTop = findScrollAncestor()?.scrollTop ?? 0;
      const snap: IndexSnapshot = {
        sort,
        category,
        pageCount,
        open: [...openSet],
        scrollTop,
        ts: Date.now(),
      };
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {
      /* sessionStorage 불가(프라이빗 모드 등) — 복원만 못 할 뿐 동작엔 무해. */
    }
  }, [sort, category, pageCount, openSet, findScrollAncestor]);

  // 필터 + 정렬 — 서버 목록을 클라에서 재배열(헤드라인은 item 에 고정 동행).
  const visible = useMemo(() => {
    const filtered = category
      ? items.filter((it) => it.report.category === category)
      : items;

    // '최신순' 합성 점수용 정규화 분모 — 필터된 집합 기준 최신/최오래 후기 시각 + 최대 후기수.
    //   recency 는 [minRecency, maxRecency] 구간으로 정규화(후기 0건 시 0). count 는 maxCount 분모.
    let minRecency = Infinity;
    let maxRecency = 0;
    let maxCount = 0;
    if (sort === "recent") {
      for (const it of filtered) {
        const ms = isoToMs(it.latestReviewAt);
        if (ms > 0) {
          if (ms < minRecency) minRecency = ms;
          if (ms > maxRecency) maxRecency = ms;
        }
        if (it.report.count > maxCount) maxCount = it.report.count;
      }
    }
    const recencySpan = maxRecency > minRecency ? maxRecency - minRecency : 0;
    // 합성 점수: 최신 후기(0.4) + 후기 수(0.35) + 재시술의향(0.25) + 약한 일일 회전(±0.06).
    //   회전은 rotationNoise([0,1)) - 0.5 → [-0.5,0.5], W_ROTATION 0.12 가중 → 동점·근접만 뒤섞음.
    const recentScore = (it: ReportItem): number => {
      const ms = isoToMs(it.latestReviewAt);
      const recN = recencySpan > 0 && ms > 0 ? (ms - minRecency) / recencySpan : 0;
      const countN = maxCount > 0 ? it.report.count / maxCount : 0;
      const revisit = revisitYesPct(it.report);
      const rot = rotationNoise(it.report.procedureKo, rotationSeed) - 0.5;
      return (
        W_RECENCY * recN +
        W_COUNT * countN +
        W_REVISIT * revisit +
        W_ROTATION * rot
      );
    };

    const sorted = [...filtered].sort((a, b) => {
      const ra = a.report;
      const rb = b.report;
      switch (sort) {
        case "recent": {
          const d = recentScore(b) - recentScore(a);
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "revisit": {
          const d = revisitYesPct(rb) - revisitYesPct(ra);
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "satisfaction": {
          const d = rb.avgSatisfaction - ra.avgSatisfaction;
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "pain": {
          // 통증 적은 순 — avgPain 오름차순. 평균이 0(미응답)인 시술은 뒤로.
          const pa = ra.avgPain || Infinity;
          const pb = rb.avgPain || Infinity;
          const d = pa - pb;
          return d !== 0 ? d : rb.count - ra.count;
        }
        case "count":
        default:
          return (
            rb.count - ra.count ||
            ra.procedureKo.localeCompare(rb.procedureKo, "ko")
          );
      }
    });
    return sorted;
  }, [items, sort, category, rotationSeed]);

  // 피드형 무한스크롤 — 현재 페이지까지 잘라 노출. 정렬·카테고리 변경 시 1페이지로 리셋.
  const shown = useMemo(
    () => visible.slice(0, pageCount * PAGE_SIZE),
    [visible, pageCount],
  );
  const hasMore = shown.length < visible.length;

  // 정렬·카테고리 변경 시 1페이지로 리셋. 단, 복원으로 인한 setSort 직후 1회는 건너뛴다
  //   (복원한 pageCount 를 reset 이 덮어쓰지 않도록 — restoringRef 가 그 1회를 흡수).
  useEffect(() => {
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    setPageCount(1);
  }, [sort, category]);

  // 뒤로가기 복원 — 마운트 시 1회. 유효 스냅샷이면 정렬/페이지수/펼침/스크롤을 되돌리고 스냅샷 삭제(1회성).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(SNAPSHOT_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let snap: IndexSnapshot | null = null;
    try {
      snap = JSON.parse(raw) as IndexSnapshot;
    } catch {
      snap = null;
    }
    // 1회성 — 유효/무효 관계없이 읽었으면 삭제(다음 새 진입은 top·기본 상태).
    try {
      sessionStorage.removeItem(SNAPSHOT_KEY);
    } catch {
      /* noop */
    }
    if (!snap || typeof snap.ts !== "number") return;
    if (Date.now() - snap.ts >= SNAPSHOT_TTL) return;

    // sort 변경이 reset 효과를 깨우므로, 그 1회를 흡수하도록 플래그 선설정.
    restoringRef.current = true;
    // snap.sort 런타임 검증 — sessionStorage 오염 대비 SORTS 화이트리스트로만 채택.
    if (snap.sort && SORTS.some((s) => s.key === snap.sort)) {
      setSort(snap.sort as SortKey);
    }
    if (typeof snap.pageCount === "number" && snap.pageCount >= 1) {
      setPageCount(snap.pageCount);
    }
    if (Array.isArray(snap.open)) setOpenSet(new Set(snap.open));
    // restoringRef 해제를 rAF 로 보장 — setSort 가 no-op(스냅 sort == 현재값)이어도
    //   reset effect 가 안 깨워 플래그가 true 로 남는 버그 방지(다음 프레임에 무조건 해제).
    const rafFlag = requestAnimationFrame(() => {
      restoringRef.current = false;
    });

    // scrollTop 복원은 스냅샷 카테고리와 현재 카테고리가 같을 때만
    //   (다르면 목록 구성이 달라 엉뚱한 위치로 튐 → sort/pageCount/openSet 만 복원).
    const sameCategory = (snap.category ?? null) === (category ?? null);
    // 콘텐츠 렌더 후 스크롤 복원 — 레이아웃 확보 위해 rAF 2회.
    const top = typeof snap.scrollTop === "number" ? snap.scrollTop : 0;
    let raf2 = 0;
    const raf1 = sameCategory
      ? requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(() => {
            const el = findScrollAncestor();
            if (el) el.scrollTop = top;
          });
        })
      : 0;
    return () => {
      cancelAnimationFrame(rafFlag);
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
    // 마운트 시 1회만 실행(의존성 빈 배열) — setter 들은 안정적. category 는 마운트 시점 값 1회 사용.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    // (2026-07-02 수정 — "8개에서 멈춤" 간헐 버그)
    //   구 코드는 root 미지정(뷰포트)+의존성 [hasMore] 라, 실제 스크롤이 내부 컨테이너(.root)
    //   에서 일어나는 앱셸(특히 iOS WKWebView 중첩 스크롤)에서 교차 이벤트가 한 번 유실되면
    //   영구히 1페이지(PAGE_SIZE=8)에 멈췄다.
    //   ① root = 실제 스크롤 조상(findScrollAncestor) — rootMargin 400px 선로딩이 실제 적용.
    //   ② 의존성에 shown.length — 페이지마다 재장착. observe() 는 장착 즉시 현재 교차 상태를
    //      1회 통지하므로(스펙), 유실돼도 다음 재장착·복원 시 자가 회복된다.
    //   바닥에 붙은 채 연쇄 재장착되면 남은 페이지를 연속 로딩할 수 있으나(뷰포트 채우기),
    //   visible 이 유한하고 hasMore=false 에서 종결되므로 무한루프 없음 — 목록이 수십 개
    //   이상으로 커지면 throttle 검토.
    const scrollRoot = findScrollAncestor(); // null 이면 뷰포트 root 폴백(구 동작과 동일 — 무해)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPageCount((p) => p + 1);
        }
      },
      { root: scrollRoot, rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // findScrollAncestor 는 useCallback([]) 안정 참조 — 의존성 포함해도 재실행 유발 없음.
  }, [hasMore, shown.length, findScrollAncestor]);

  return (
    <>
      <style>{`@keyframes rvRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* 페이지 h1 — 시각 디자인엔 없는 제목이라 sr-only(헤딩 계층·SEO, schema-auditor 지적).
          카드 시술명(h2, ReportSummaryBox)들의 상위 계층. */}
      <h1 className="sr-only">시술 리포트</h1>

      {/* 정렬 칩 — 본문 상단에 인라인 sticky 고정. 배경은 캔버스 variant(--tt-canvas=#F5FBFF) 자동 추종.
          2026-07-08 UI 개편 Phase 1-3: 선택=--accent-blue(#1A9DE8)+흰 글자 / 비선택=흰 배경+#5A646C(명세
          고정색 — globals 토큰 없음, 리터럴). 5종 유지(D3 확정 — 시안 4종은 예시). sticky·로직 불변. */}
      {/* rootRef: 스크롤 조상(.root) 탐색의 시작점(항상 렌더되는 본문 첫 DOM). */}
      <div
        ref={rootRef}
        className="sticky z-[41] mb-1.5 py-2.5"
        style={{ top: "var(--sat)", background: "var(--tt-canvas)", backgroundAttachment: "fixed" }}
      >
        <div
          role="group"
          aria-label="정렬"
          className="flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SORTS.map((s) => {
            const on = sort === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                aria-pressed={on}
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors"
                style={
                  on
                    ? { backgroundColor: "var(--accent-blue)", color: "#fff" }
                    : { backgroundColor: "#fff", color: "#5A646C" }
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-1 py-8 text-center text-[14px] leading-[1.6] text-[var(--text-muted)]">
          {items.length === 0
            ? "아직 집계된 시술 리포트가 없어요."
            : "이 카테고리에는 아직 리포트가 없어요."}
        </p>
      ) : (
        /* 카드 목록 — 카드 간 세로 간격 16px(명세) */
        <div
          key={`${sort}-${category ?? "all"}`}
          className="flex flex-col gap-4"
          style={{ animation: "rvRise .28s ease both" }}
        >
          {shown.map((it) => (
            <ReportsIndexCard
              key={it.report.procedureKo}
              report={it.report}
              headline={it.headline}
              effects={it.effects}
              onsetLabel={it.onsetLabel}
              open={openSet.has(it.report.procedureKo)}
              onToggle={() => toggleOpen(it.report.procedureKo)}
              onNavigateDetail={saveSnapshot}
            />
          ))}
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-8" />}
        </div>
      )}
      <p className="mt-4 px-1 text-center text-[11.5px] leading-[1.6] text-[var(--text-muted)]">
        회원들의 실사용 후기를 집계한 결과예요. 개인차가 있으며 의학적 효과·안전성을 보장하지 않아요. 시술 결정은 전문의 상담 후에 하세요.
      </p>
    </>
  );
}
