"use client";

/**
 * RecordNotesPanel — "내 시술 노트" 3토글 뷰(타임라인/달력/목록) 공용 컴포넌트.
 *
 * 원래 RecordView.tsx 안에 인라인으로 있던 시술 노트 3토글 뷰를 추출 — RecordView(인라인 미리보기)와
 * /record/notes 자세히 페이지(RecordNotesView)가 같은 컴포넌트를 공유한다(중복 구현 금지).
 *   - 입력은 운영 SummaryGroup[](record-data SSOT). toRecEntries 로 RecEntry[]로 어댑트.
 *   - 배지는 운영 recordBadge(diary-status SSOT) — 시술명 + 방문일 기준 회복 단계.
 *   - UI 토큰은 앱 스킨(app.module.css)의 rec* 클래스 그대로.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "../app.module.css";
import { recordBadge } from "@/lib/diary-status";
import type { SummaryGroup } from "@/components/skin/record/SkinDiaryForms";

/* ---------- 시술 노트 1건(뷰 전용) — 운영 SummaryItem 에서 어댑트 ----------
 * year/month/day + 시술 칩 + 병원·의사 메타 + 배지용 visitedOn("YYYY-MM-DD"). */
export type RecEntry = {
  id: string;
  year: number;
  month: number; // 1~12
  day: number;
  visitedOn: string; // "YYYY-MM-DD" — recordBadge 입력
  procName: string; // 배지 판정용 대표(첫) 시술명
  procs: string[]; // 받은 시술명 목록
  tone: string; // 점 색 (styles.dotXxx)
  place: string;
  doctor: string;
  memo?: string;
};

/* ---------- 내가 쓴 후기 1건(공개 review 카드, 뷰 전용) ----------
 * notes/page.tsx 가 cards(category='review', status='published', author_id=active)를
 * procedure_reviews(procedure_ko) + author.handle 와 조인해 어댑트한다.
 *
 * 현재 diaries(시술 노트, 비공개) ↔ review 카드(공개)는 DB 상 직접 FK 가 없으므로,
 * 모든 후기는 "독립 후기"로 취급해 RecordNotesView 의 맨 밑 "내 후기" 섹션에 모은다.
 * (향후 노트↔후기 연결이 생기면 RecEntry 에 linkedReviews?: MyReview[] 를 추가하고
 *  각 노트 entry 아래에서 ReviewBox 로 렌더한다 — 아래 각 뷰의 "확장 지점" 주석 참고.) */
export type MyReview = {
  id: string;
  procName: string; // procedure_reviews.procedure_ko (없으면 카드 제목 폴백)
  body: string; // cards.body (한줄후기 본문)
  href: string; // 후기 상세(/{handle}/{shortcode}), 없으면 ""
  createdAt: string; // "YYYY-MM-DD" (작성일 요약 표시)
};

/* 내 후기 1건을 '닫힌 글상자'로 렌더 — 목록 뷰(recList*) 토큰 재사용.
 *   기본 닫힘(요약: 작성일 · 시술명). 클릭 시 본문(한줄후기) 펼침.
 *   상세 링크(href)가 있으면 펼친 본문 아래 '후기 보러 가기' 링크 노출.
 * 독립 후기 섹션(RecordNotesView)과 향후 노트별 연결(linkedReviews) 자리에서 공용으로 쓰도록 export. */
export function ReviewBox({ review }: { review: MyReview }) {
  const [open, setOpen] = useState(false); // SSR 안전 — 초기 닫힘
  // "YYYY-MM-DD" → "M.D" 요약. created_at 누락(빈 문자열) 시 날짜 칸 비움(NaN 방지).
  const [, m, d] = review.createdAt.split("-");
  const dateLabel = m && d ? `${Number(m)}.${Number(d)}` : "";
  return (
    <div className={`${styles.card} ${styles.recListCard}`}>
      <button type="button" className={styles.recListBtn} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.recListDate}>{dateLabel}</span>
        <span className={styles.recListInfo}>
          <span className={styles.recListName}>{review.procName}</span>
          <span className={styles.recListPlace}>내가 쓴 후기</span>
        </span>
        <span className={styles.recListChev}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className={styles.recListBody}>
          {review.body && <p className={styles.recMemo}>{review.body}</p>}
          {review.href && (
            <Link className={styles.recListLine} href={review.href} style={{ marginTop: 10, display: "inline-block" }}>
              <b>후기 보러 가기 ›</b>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

const DOT_TONES = [styles.dotPink, styles.dotBlue, styles.dotGreen, styles.dotPurple];

/** 운영 SummaryGroup[] → 3토글 뷰가 쓰는 RecEntry[](연/월/일 + 배지용 visitedOn). */
export function toRecEntries(summary: SummaryGroup[]): RecEntry[] {
  const out: RecEntry[] = [];
  let toneIdx = 0;
  for (const g of summary) {
    for (const it of g.items) {
      const [mm, dd] = it.date.split("."); // SummaryItem.date = "MM.DD"
      const month = Number(mm);
      const day = Number(dd);
      const procs = it.items.length > 0 ? it.items.map((i) => i.name) : it.proc ? [it.proc] : [];
      const procName = procs[0] ?? "시술";
      out.push({
        id: it.id,
        year: g.year,
        month,
        day,
        visitedOn: `${g.year}-${mm}-${dd}`,
        procName,
        procs,
        tone: DOT_TONES[toneIdx++ % DOT_TONES.length],
        place: it.hospital,
        doctor: it.doctor,
        memo: it.memo || undefined,
      });
    }
  }
  return out;
}

/* 회복 단계 배지 — 운영 recordBadge(diary-status SSOT) 사용(시술명 + 방문일 기준). */
function Badge({ entry }: { entry: RecEntry }) {
  const b = recordBadge(entry.procName, entry.visitedOn);
  return (
    <span
      className={`${styles.recBadge} ${b.tone === "mint" ? styles.recBadgeMint : styles.recBadgeHeal}`}
    >
      {b.label}
    </span>
  );
}

/* 펼침 상태 토글 훅 — 타임라인·달력·목록 3뷰 공통. 초기 빈 Set(모두 닫힘) → SSR 안전. */
function useExpand() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return { open, toggle };
}

/* ---------- 타임라인 뷰 — 좌측 날짜 원 + 세로 연결선 ----------
 * 각 노트는 '닫힌 글상자'(요약: 시술명 · 병원/의사 · 회복 배지)가 기본.
 * 카드 클릭 시 메모를 펼치고 다시 클릭하면 닫는다(목록 뷰와 동일 동작). */
function TimelineView({ entries }: { entries: RecEntry[] }) {
  // 연도 내림차순 → 같은 해 최신 날짜순. 연도 바뀌면 라벨.
  const sorted = [...entries].sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day);
  const rows: ({ kind: "year"; year: number } | { kind: "rec"; e: RecEntry })[] = [];
  let lastYear: number | null = null;
  for (const e of sorted) {
    if (e.year !== lastYear) {
      rows.push({ kind: "year", year: e.year });
      lastYear = e.year;
    }
    rows.push({ kind: "rec", e });
  }
  const { open, toggle } = useExpand();
  return (
    <div className={styles.recTl}>
      {rows.map((row) =>
        row.kind === "year" ? (
          <div className={styles.recTlYear} key={`y${row.year}`}>
            {row.year}
          </div>
        ) : (
          (() => {
            const e = row.e;
            const isOpen = open.has(e.id);
            const hasDetail = !!e.memo;
            return (
              <div className={styles.recTlItem} key={e.id}>
                <span className={styles.recTlDot}>
                  <span className={styles.recTlDotMonth}>{e.month}월</span>
                  <span className={styles.recTlDotDay}>{e.day}</span>
                </span>
                <div
                  className={`${styles.card} ${styles.recTlCard}`}
                  role={hasDetail ? "button" : undefined}
                  tabIndex={hasDetail ? 0 : undefined}
                  aria-expanded={hasDetail ? isOpen : undefined}
                  onClick={hasDetail ? () => toggle(e.id) : undefined}
                  onKeyDown={
                    hasDetail
                      ? (ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            toggle(e.id);
                          }
                        }
                      : undefined
                  }
                  style={hasDetail ? { cursor: "pointer" } : undefined}
                >
                  <div className={styles.recTlHead}>
                    <h3 className={styles.recTlName}>{e.procs.join(" · ")}</h3>
                    <Badge entry={e} />
                    {hasDetail && <span className={styles.recListChev}>{isOpen ? "▴" : "▾"}</span>}
                  </div>
                  <div className={styles.recMeta}>
                    {e.place}
                    {e.doctor && (
                      <>
                        <span className={styles.sep}>·</span>
                        {e.doctor}
                      </>
                    )}
                  </div>
                  {isOpen && e.memo && <p className={styles.recMemo}>{e.memo}</p>}
                  {/* 확장 지점: 노트↔후기 연결이 생기면 여기(펼친 상태)에
                      e.linkedReviews?.map((r) => <ReviewBox key={r.id} review={r} />) 를 렌더. */}
                </div>
              </div>
            );
          })()
        ),
      )}
    </div>
  );
}

/* ---------- 달력 뷰 — 연 네비 + 12개월 그리드(점·건수) + 선택 월 상세 ---------- */
function CalendarView({ entries }: { entries: RecEntry[] }) {
  const years = useMemo(() => [...new Set(entries.map((e) => e.year))].sort((a, b) => b - a), [entries]);
  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth() + 1;
  const minYear = years.length ? Math.min(...years) : thisYear;
  const maxYear = years.length ? Math.max(...years) : thisYear;

  const [year, setYear] = useState(years[0] ?? thisYear);

  const byMonth = useMemo(() => {
    const m = new Map<number, RecEntry[]>();
    for (const e of entries.filter((x) => x.year === year)) {
      m.set(e.month, [...(m.get(e.month) ?? []), e]);
    }
    return m;
  }, [entries, year]);

  const defaultMonth = useMemo(() => {
    const ms = [...byMonth.keys()].sort((a, b) => b - a);
    return ms[0] ?? null;
  }, [byMonth]);
  const [selMonth, setSelMonth] = useState<number | null>(null);
  const sel = selMonth ?? defaultMonth;
  const selItems = sel ? byMonth.get(sel) ?? [] : [];

  const { open, toggle } = useExpand(); // 선택월 상세 row 별 메모 펼침(기본 닫힘)

  const moveYear = (delta: number) => {
    const ny = year + delta;
    if (ny < minYear || ny > maxYear) return;
    setYear(ny);
    setSelMonth(null);
  };

  return (
    <>
      <div className={`${styles.card} ${styles.recCalCard}`}>
        <div className={styles.recCalNav}>
          <button type="button" disabled={year <= minYear} onClick={() => moveYear(-1)} aria-label="이전 연도">
            ‹
          </button>
          <span className={styles.recCalYear}>{year}</span>
          <button type="button" disabled={year >= maxYear} onClick={() => moveYear(1)} aria-label="다음 연도">
            ›
          </button>
        </div>
        <div className={styles.recCalGrid}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const items = byMonth.get(m) ?? [];
            const count = items.length;
            const has = count > 0;
            const isNow = year === thisYear && m === thisMonth;
            const isSel = sel === m;
            const cls = [
              styles.recCalMonth,
              has ? styles.recCalHas : "",
              isNow ? styles.recCalNow : "",
              isSel ? styles.recCalSel : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button key={m} type="button" disabled={!has} onClick={() => setSelMonth(m)} className={cls}>
                <span className={styles.recCalMonthLabel}>{m}월</span>
                <span className={styles.recCalDots}>
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
                {has && <span className={styles.recCalCount}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`${styles.card} ${styles.recCalDetail}`}>
        {sel ? (
          <>
            <p className={styles.recCalDetailHead}>
              {sel}월 · 기록 {selItems.length}건
            </p>
            <div className={styles.recCalDetailList}>
              {selItems.map((e) => {
                const isOpen = open.has(e.id);
                const hasDetail = !!e.memo;
                return (
                  <div key={e.id}>
                    <div
                      className={styles.recCalRow}
                      role={hasDetail ? "button" : undefined}
                      tabIndex={hasDetail ? 0 : undefined}
                      aria-expanded={hasDetail ? isOpen : undefined}
                      onClick={hasDetail ? () => toggle(e.id) : undefined}
                      onKeyDown={
                        hasDetail
                          ? (ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                toggle(e.id);
                              }
                            }
                          : undefined
                      }
                      style={hasDetail ? { cursor: "pointer" } : undefined}
                    >
                      <span className={styles.recCalRowDate}>
                        {e.month}.{e.day}
                      </span>
                      <span className={styles.recCalRowName}>{e.procs.join(" · ")}</span>
                      <Badge entry={e} />
                      {hasDetail && <span className={styles.recListChev}>{isOpen ? "▴" : "▾"}</span>}
                    </div>
                    {isOpen && e.memo && <p className={styles.recMemo}>{e.memo}</p>}
                    {/* 확장 지점: 노트↔후기 연결 시 여기(펼친 상태)에 e.linkedReviews 를 ReviewBox 로 렌더. */}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className={styles.recCalEmpty}>기록 있는 달을 눌러 상세를 확인하세요.</p>
        )}
      </div>
    </>
  );
}

/* ---------- 목록 뷰 — 연도별 요약 카드(펼침/접힘) ---------- */
function ListView({ entries }: { entries: RecEntry[] }) {
  const groups = useMemo(() => {
    const m = new Map<number, RecEntry[]>();
    for (const e of entries) m.set(e.year, [...(m.get(e.year) ?? []), e]);
    return [...m.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, items]) => ({
        year,
        items: items.sort((a, b) => b.month - a.month || b.day - a.day),
      }));
  }, [entries]);
  const { open, toggle } = useExpand();
  const thisYear = new Date().getFullYear();

  return (
    <div className={styles.recListWrap}>
      {groups.map((g) => (
        <div key={g.year}>
          <div className={styles.recListYear}>
            <span className={styles.recListYearNum}>{g.year}</span>
            <span className={styles.recListYearAgo}>
              {g.year === thisYear ? "올해" : `${thisYear - g.year}년 전`}
            </span>
          </div>
          <div className={styles.recListItems}>
            {g.items.map((e) => {
              const isOpen = open.has(e.id);
              return (
                <div className={`${styles.card} ${styles.recListCard}`} key={e.id}>
                  <button type="button" className={styles.recListBtn} onClick={() => toggle(e.id)}>
                    <span className={styles.recListDate}>
                      {e.month}.{e.day}
                    </span>
                    <span className={styles.recListInfo}>
                      <span className={styles.recListName}>{e.procs.join(" · ")}</span>
                      <span className={styles.recListPlace}>{e.place}</span>
                    </span>
                    <span className={styles.recListChev}>{isOpen ? "▴" : "▾"}</span>
                  </button>
                  {isOpen && (
                    <div className={styles.recListBody}>
                      <div className={styles.recListChips}>
                        {e.procs.map((p) => (
                          <span className={styles.recListChip} key={p}>
                            {p}
                          </span>
                        ))}
                      </div>
                      <div className={styles.recListLine}>
                        {e.doctor && <b>{e.doctor}</b>}
                        {e.doctor && <span className={styles.sep}>·</span>}
                        {e.place}
                        {e.memo && (
                          <>
                            <span className={styles.sep}>·</span>
                            <span className={styles.recListMemo}>{e.memo}</span>
                          </>
                        )}
                      </div>
                      {/* 확장 지점: 노트↔후기 연결 시 여기(펼친 상태)에 e.linkedReviews 를 ReviewBox 로 렌더. */}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- 3토글 컨테이너 (우상단 타임라인/달력/목록) ----------
 * RecordView(인라인 미리보기)와 /record/notes(자세히 페이지)가 공유하는 본체.
 *   title: 섹션 제목(기본 "내 시술 노트"). action: 헤더 우측 토글 옆 보조 슬롯(예: '자세히' 링크). */
export default function RecordNotesPanel({
  entries,
  title = "내 시술 노트",
  action,
}: {
  entries: RecEntry[];
  title?: string;
  action?: React.ReactNode;
}) {
  const [mode, setMode] = useState<"tl" | "cal" | "list">("tl");
  const TABS: [typeof mode, string][] = [
    ["tl", "타임라인"],
    ["cal", "달력"],
    ["list", "목록"],
  ];
  return (
    <section>
      <div className={styles.recNotesHead}>
        <h2 className={styles.recNotesTitle}>{title}</h2>
        <div className={styles.recToggle}>
          {TABS.map(([m, label]) => (
            <button
              key={m}
              type="button"
              className={`${styles.recToggleBtn} ${mode === m ? styles.recToggleBtnOn : ""}`}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
            >
              {label}
            </button>
          ))}
          {action}
        </div>
      </div>
      {mode === "tl" ? (
        <TimelineView entries={entries} />
      ) : mode === "cal" ? (
        <CalendarView entries={entries} />
      ) : (
        <ListView entries={entries} />
      )}
    </section>
  );
}
