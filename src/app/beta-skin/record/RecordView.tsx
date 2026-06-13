"use client";

/**
 * RecordView — /beta-skin/record "내 노트" 본문 (클라이언트).
 *
 * 원칙: UI 는 베타 스킨 유지, 데이터·로직은 운영(record) 재사용.
 *   - 시술 노트(타임라인/달력/목록 3토글): 운영 diaries → SummaryGroup[](record-data SSOT)을
 *     RecEntry 로 어댑트해 기존 베타 3토글 뷰에 그대로 흘려보낸다. 배지는 운영 recordBadge(diary-status SSOT).
 *   - 히어로: 회원이면 computeStatus(latest) 5단계 인사, 비로그인이면 가입 유도 데모.
 *   - 관심 키워드 새 글: 운영 KeywordPost(limit 20) — 베타 카드 UI 로 렌더. 칩 탭 = 단일 키워드 필터.
 *   - 인기글: 운영 get_top_cards_by_views PopularData(7/30/90일). 작은 기간 토글 + 5위 + 6~N위 더보기.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import CardAvatar from "@/components/card/CardAvatar";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import { IconVerified, useBetaSearchRouting } from "../beta-ui";
import { computeStatus, recordBadge, type DiaryLatest } from "@/lib/diary-status";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";
import type { KeywordPost } from "@/app/record/KeywordCarousel";
import type { PopularData, PopularItem } from "@/lib/record-data";

const SAMPLE_CHIPS = ["리프팅", "보톡스", "스킨부스터", "볼륨", "더모코스메틱"];

/* ---------- 시술 노트 1건(뷰 전용) — 운영 SummaryItem 에서 어댑트 ----------
 * year/month/day + 시술 칩 + 병원·의사 메타 + 배지용 visitedOn("YYYY-MM-DD"). */
type RecEntry = {
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
function toRecEntries(summary: SummaryGroup[]): RecEntry[] {
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

/* ---------- 3토글 컨테이너 (우상단 타임라인/달력/목록) ---------- */
function RecordNotes({ entries }: { entries: RecEntry[] }) {
  const [mode, setMode] = useState<"tl" | "cal" | "list">("tl");
  const TABS: [typeof mode, string][] = [
    ["tl", "타임라인"],
    ["cal", "달력"],
    ["list", "목록"],
  ];
  return (
    <section>
      <div className={styles.recNotesHead}>
        <h2 className={styles.recNotesTitle}>내 시술 노트</h2>
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

/* ---------- 인기글 섹션 — 7/30/90일 토글 + 상위 5 + 6~N위 더보기 ---------- */
const CAT_LABEL: Record<string, string> = {
  qa: "Q&A",
  review: "시술후기",
  doodle: "끄적끄적",
  review_summary: "리포트",
};
const catLabel = (c: string) => CAT_LABEL[c] ?? "글";

function PopularSection({ popular }: { popular: PopularData }) {
  const [period, setPeriod] = useState<keyof PopularData>("d7");
  const [expanded, setExpanded] = useState(false);
  const items = popular[period];
  const top = items.slice(0, 5);
  const rest = items.slice(5);
  const change = (k: keyof PopularData) => {
    setPeriod(k);
    setExpanded(false);
  };

  const Row = ({ it }: { it: PopularItem }) => {
    const hasHref = it.href !== "/";
    return (
      <a
        className={styles.popRow}
        href={hasHref ? it.href : "/beta-skin"}
        target={hasHref ? "_blank" : undefined}
        rel={hasHref ? "noopener noreferrer" : undefined}
      >
        <span className={styles.popRank}>{it.rank}</span>
        <span className={styles.popInfo}>
          <span className={styles.popTitle}>{it.title}</span>
          <span className={styles.popMeta}>
            {it.authorName} · {catLabel(it.type)}
          </span>
        </span>
      </a>
    );
  };

  return (
    <>
      {/* 섹션헤더 — 우측에 7/30/90 토글(내 시술 노트의 타임라인/달력/목록 토글과 동일 위치·패턴). */}
      <div className={styles.recNotesHead}>
        <h2 className={styles.recNotesTitle}>인기글</h2>
        <div className={styles.recToggle}>
          {(
            [
              ["d7", "7일"],
              ["d30", "30일"],
              ["d90", "90일"],
            ] as [keyof PopularData, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`${styles.recToggleBtn} ${period === k ? styles.recToggleBtnOn : ""}`}
              onClick={() => change(k)}
              aria-pressed={period === k}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <div className={`${styles.card} ${styles.sideCard}`} style={{ textAlign: "center" }}>
          <p className={styles.muted}>이 기간엔 인기글이 아직 없어요.</p>
        </div>
      ) : (
        <div className={`${styles.card} ${styles.popList}`}>
          {top.map((it) => (
            <Row it={it} key={it.rank} />
          ))}
          {expanded && rest.map((it) => <Row it={it} key={it.rank} />)}
          {items.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 0",
                marginTop: 2,
                borderTop: "1px solid var(--line)",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--ink-500)",
                background: "transparent",
              }}
            >
              {expanded ? "접기 ▲" : `6~${items.length}위 보기 ▼`}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default function RecordView({
  guest = false,
  userName,
  summary,
  latest,
  diaryCount,
  reviewsCount,
  postCount,
  receivedCount,
  keywordPosts,
  popular,
  myKeywords,
}: {
  guest?: boolean;
  userName: string;
  summary: SummaryGroup[];
  latest: DiaryLatest | null;
  diaryCount: number;
  reviewsCount: number;
  postCount: number;
  receivedCount: number;
  keywordPosts: KeywordPost[];
  popular: PopularData;
  myKeywords: string[];
}) {
  // 피드백 4) 헤더 검색 → 피드로 라우팅(공용 헬퍼). 피드가 ?q=/?cat= 을 읽어 자동 필터.
  const search = useBetaSearchRouting();
  // 관심 키워드 칩 — 실데이터 우선, 비면 샘플 폴백(게스트/미등록 회원).
  const chips = myKeywords.length >= 1 ? myKeywords : SAMPLE_CHIPS;
  // 시술 노트 — 운영 SummaryGroup[] → RecEntry[](배지용 visitedOn 포함).
  const entries = useMemo(() => toRecEntries(summary), [summary]);
  // 관심 키워드 새 글 — 단일 키워드 필터(운영 KeywordCarousel 동작 재현).
  const [selKw, setSelKw] = useState<string | null>(null);
  const shownPosts = selKw ? keywordPosts.filter((p) => p.matchedKeywords.includes(selKw)) : keywordPosts;
  // 회원 히어로 상태(운영 computeStatus 5단계). 게스트는 가입 유도.
  const status = computeStatus(latest);

  const sidebar = (
    <>
      {guest ? (
        <section className={`${styles.card} ${styles.sideCard}`}>
          <h3>내 노트를 시작해보세요</h3>
          <p className={styles.muted} style={{ marginBottom: 14 }}>
            가입하면 받은 시술과 경과를 나만의 노트로 기록할 수 있어요.
          </p>
          <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} href="/beta-skin/write">
            노트 작성해보기
          </a>
        </section>
      ) : (
        <section className={`${styles.card} ${styles.sideCard}`}>
          <h3>오늘 시술 기록하기</h3>
          <p className={styles.muted} style={{ marginBottom: 14 }}>
            받은 시술·다운타임·효과를 노트에 남기면 경과를 한눈에 볼 수 있어요.
          </p>
          <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} href="/write">
            노트 작성하기
          </a>
        </section>
      )}
    </>
  );

  return (
    <BetaSkinShell active="내 노트" sidebar={sidebar} {...search}>
      {/* 히어로 — 게스트=가입 유도, 회원=computeStatus 5단계 인사 */}
      {guest ? (
        <section className={`${styles.card} ${styles.greetCard}`}>
          <div className={styles.greetTop}>내 시술노트 ✨</div>
          <h1 className={styles.greetTitle}>
            받은 시술을 기록하면
            <br />
            이렇게 한눈에 보여요
          </h1>
          <p className={styles.muted} style={{ margin: "10px 0 4px", color: "rgba(255,255,255,0.92)" }}>
            병원·시술·다운타임·효과·재방문 주기까지. 가입하면 나만의 시술노트가 시작돼요.
          </p>
          <div className={styles.greetActions}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="/beta-skin/write">
              노트 작성해보기
            </a>
          </div>
        </section>
      ) : (
        <section className={`${styles.card} ${styles.greetCard}`}>
          <div className={styles.greetTop}>안녕하세요, {userName}님 👋</div>
          <h1 className={styles.greetTitle} style={{ whiteSpace: "pre-line" }}>
            {status.headline}
          </h1>
          <p className={styles.muted} style={{ margin: "10px 0 4px", color: "rgba(255,255,255,0.92)" }}>
            {status.sub}
          </p>
          <div className={styles.greetActions}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="/write">
              오늘 시술 기록하기
            </a>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="/write?tab=review">
              시술 후기 남기기
            </a>
          </div>
        </section>
      )}

      {/* 카운팅 대시보드 — 회원만(개인 데이터). 내가 쓴 노트 / 내가 쓴 후기 / 내가 쓴 글 / 내 글에 달린 댓글 */}
      {!guest && (
        <section className={`${styles.card} ${styles.mb20}`} style={{ marginTop: 18 }}>
          <div className={styles.statRow} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div>
              <div className={styles.num}>{diaryCount}</div>
              <div className={styles.lab}>내가 쓴 노트</div>
            </div>
            <div>
              <div className={styles.num}>{reviewsCount}</div>
              <div className={styles.lab}>내가 쓴 후기</div>
            </div>
            <div>
              <div className={styles.num}>{postCount}</div>
              <div className={styles.lab}>내가 쓴 글</div>
            </div>
            <div>
              <div className={styles.num}>{receivedCount}</div>
              <div className={styles.lab}>내 글에 달린 댓글</div>
            </div>
          </div>
        </section>
      )}

      {/* 시술 노트 — 회원=실데이터 3토글, 게스트=빈 예시 안내 */}
      <div style={{ marginTop: 24 }}>
        {entries.length === 0 ? (
          <>
            <div className={styles.recExampleHead}>
              <h2 className={styles.recNotesTitle}>이렇게 기록돼요</h2>
              <span className={styles.recExampleTag}>예시</span>
            </div>
            <section className={`${styles.card} ${styles.sideCard}`} style={{ textAlign: "center" }}>
              <p className={styles.muted}>
                {guest
                  ? "가입하고 첫 시술을 기록하면 타임라인·달력·목록으로 한눈에 정리돼요."
                  : "첫 노트를 쓰면 타임라인·달력·목록으로 한눈에 정리돼요."}
              </p>
              <a
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
                href={guest ? "/beta-skin/write" : "/write"}
                style={{ marginTop: 12 }}
              >
                첫 노트 쓰러 가기
              </a>
            </section>
          </>
        ) : (
          <RecordNotes entries={entries} />
        )}
      </div>

      {/* 관심 키워드 새 글 */}
      <div className={styles.sectionHead}>
        <h2>{guest ? "인기 키워드 새 글" : "관심 키워드 새 글"}</h2>
        <a className={styles.more} href={guest ? "/signup" : "/settings/profile"}>
          {guest ? "내 키워드 만들기" : "키워드 편집"}
        </a>
      </div>
      {/* 관심 키워드 칩 — 탭하면 그 키워드 글만, 다시 탭하면 전체(운영 KeywordCarousel 동작). */}
      <div className={styles.chipRow}>
        {chips.slice(0, 12).map((c) => {
          const on = selKw === c;
          return (
            <button
              type="button"
              key={c}
              className={`${styles.chip} ${styles.chipNav}`}
              onClick={() => setSelKw(on ? null : c)}
              aria-pressed={on}
              style={on ? { background: "var(--tt-blue)", color: "#fff" } : undefined}
            >
              {c}
            </button>
          );
        })}
      </div>

      {shownPosts.length === 0 ? (
        <section className={`${styles.card} ${styles.sideCard}`} style={{ textAlign: "center" }}>
          <p className={styles.muted}>
            {selKw ? `‘${selKw}’ 키워드의 새 글이 아직 없어요.` : "관심 키워드에 맞는 새 글이 아직 없어요."}
          </p>
        </section>
      ) : (
        <div className={styles.kwScroll}>
          {shownPosts.map((p) => {
            const hasHref = p.href !== "/";
            return (
              <a
                className={`${styles.card} ${styles.kwCard}`}
                href={hasHref ? p.href : undefined}
                target={hasHref ? "_blank" : undefined}
                rel={hasHref ? "noopener noreferrer" : undefined}
                key={p.id}
              >
                {p.keyword && <span className={`${styles.tag} ${styles.tagBlue}`}>{p.keyword}</span>}
                <h3 className={styles.kwTitle}>{p.title}</h3>
                <div className={styles.kwFoot}>
                  <CardAvatar doctorSlug={p.doctorSlug} memberAvatarUrl={p.avatarUrl} name={p.authorName} size={36} />
                  <div>
                    <div className={styles.authorName} style={{ fontSize: 14 }}>
                      {p.authorName}
                      {p.doctorSlug && (
                        <span className={styles.verified}>
                          <IconVerified />
                        </span>
                      )}
                    </div>
                    <div className={styles.authorSub}>{p.doctorSlug ? "피부과 전문의" : "회원"}</div>
                  </div>
                  <span className={styles.when}>
                    {p.isNew ? "오늘" : p.timeAgo || "최근"}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* 인기글 — 회원 전용(사이트 통계 RPC는 로그인 필요). 게스트는 가입 CTA. */}
      {guest ? (
        <>
          <div className={styles.sectionHead}>
            <h2>인기글</h2>
          </div>
          <section className={`${styles.card} ${styles.sideCard}`} style={{ textAlign: "center" }}>
            <p className={styles.muted} style={{ marginBottom: 14 }}>
              가입하면 7일·30일·90일 인기글과 내 시술 기록·관심 키워드 새 글까지 볼 수 있어요.
            </p>
            <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} href="/signup">
              가입하고 내 노트 시작하기
            </a>
          </section>
        </>
      ) : (
        <PopularSection popular={popular} />
      )}
    </BetaSkinShell>
  );
}
