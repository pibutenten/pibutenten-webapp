"use client";

/**
 * RecordNotesPanel — "내 시술 노트" 3토글 뷰(타임라인/달력/목록) 공용 컴포넌트.
 *
 * 원래 RecordView.tsx 안에 인라인으로 있던 시술 노트 3토글 뷰를 추출 — RecordView(인라인 미리보기)와
 * /record/notes 자세히 페이지(RecordNotesView)가 같은 컴포넌트를 공유한다(중복 구현 금지).
 *   - 입력은 운영 SummaryGroup[](record-data SSOT). toRecEntries 로 RecEntry[]로 어댑트.
 *   - 배지는 운영 recordBadge(diary-status SSOT) — 시술명 + 방문일 기준 회복 단계.
 *   - UI 토큰은 베타 스킨(beta-skin.module.css)의 rec* 클래스 그대로.
 */

import { useMemo, useState } from "react";
import styles from "../beta-skin.module.css";
import { recordBadge } from "@/lib/diary-status";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";

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

const DOT_TONES = [styles.dotPink, styles.dotBlue, styles.dotGreen, styles.dotPurple];

/** 운영 SummaryGroup[] → 베타 3토글 뷰가 쓰는 RecEntry[](연/월/일 + 배지용 visitedOn). */
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

/* ---------- 타임라인 뷰 — 좌측 날짜 원 + 세로 연결선 ---------- */
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
  return (
    <div className={styles.recTl}>
      {rows.map((row) =>
        row.kind === "year" ? (
          <div className={styles.recTlYear} key={`y${row.year}`}>
            {row.year}
          </div>
        ) : (
          <div className={styles.recTlItem} key={row.e.id}>
            <span className={styles.recTlDot}>
              <span className={styles.recTlDotMonth}>{row.e.month}월</span>
              <span className={styles.recTlDotDay}>{row.e.day}</span>
            </span>
            <div className={`${styles.card} ${styles.recTlCard}`}>
              <div className={styles.recTlHead}>
                <h3 className={styles.recTlName}>{row.e.procs.join(" · ")}</h3>
                <Badge entry={row.e} />
              </div>
              <div className={styles.recMeta}>
                {row.e.place}
                {row.e.doctor && (
                  <>
                    <span className={styles.sep}>·</span>
                    {row.e.doctor}
                  </>
                )}
              </div>
              {row.e.memo && <p className={styles.recMemo}>{row.e.memo}</p>}
            </div>
          </div>
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
              {selItems.map((e) => (
                <div className={styles.recCalRow} key={e.id}>
                  <span className={styles.recCalRowDate}>
                    {e.month}.{e.day}
                  </span>
                  <span className={styles.recCalRowName}>{e.procs.join(" · ")}</span>
                  <Badge entry={e} />
                </div>
              ))}
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
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
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
