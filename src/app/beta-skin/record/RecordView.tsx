"use client";

/**
 * RecordView — /beta-skin/record "내 노트" 본문 (클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 active="내 노트" 로 사용.
 * - 인사 카드 / 시술 노트(타임라인·달력·목록 3토글) / 사이드바: 샘플(로그인 필요 데이터라 예시).
 * - 관심 키워드 칩: 실데이터(props.keywordChips) 우선, 비면 샘플 폴백.
 * - 관심 키워드 새 글 카드: 실데이터(props.kwCards) qa 카드, 비면 샘플 폴백.
 *
 * 항목 1) 운영 SkinDiaryMockup.RecordView(타임라인=좌측 점·세로선 / 달력=연 12개월 그리드+점 /
 *   목록=연도별 요약 카드, 우상단 토글)를 신규 스킨 디자인으로 재현. 샘플 데이터 기준 3뷰 전환.
 * 항목 3) 키워드 카드 링크 = 각 카드의 실제 cardHref(단일 /beta-skin/post 고정 버그 수정).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import CardAvatar from "@/components/card/CardAvatar";
import type { CardData } from "@/lib/types/card";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import {
  IconVerified,
  timeAgo,
  cardHref,
  categoryLabel,
  useBetaSearchRouting,
} from "../beta-ui";

const SAMPLE_CHIPS = ["리프팅", "보톡스", "스킨부스터", "볼륨", "더모코스메틱"];

/* ---------- 샘플 시술 기록 (로그인 필요 데이터 → 예시) ----------
 * 운영 SummaryItem 과 유사한 구조. 연/월/일 + 시술 칩 + 병원·의사 메타. */
type RecEntry = {
  id: string;
  year: number;
  month: number; // 1~12
  day: number;
  procs: string[]; // 받은 시술명
  tone: string; // 점 색 (styles.dotXxx)
  place: string;
  doctor: string;
  memo?: string;
};

const ENTRIES: RecEntry[] = [
  {
    id: "e1",
    year: 2026,
    month: 6,
    day: 12,
    procs: ["리쥬란 힐러"],
    tone: styles.dotPink,
    place: "OO피부과의원",
    doctor: "예시 원장님",
    memo: "피부결 개선 목적 · 2cc",
  },
  {
    id: "e2",
    year: 2026,
    month: 5,
    day: 12,
    procs: ["인모드 FX"],
    tone: styles.dotBlue,
    place: "OO피부과의원",
    doctor: "예시 원장님",
    memo: "탄력 · 다운타임 거의 없음",
  },
  {
    id: "e3",
    year: 2026,
    month: 4,
    day: 28,
    procs: ["피코레이저"],
    tone: styles.dotGreen,
    place: "OO피부과의원",
    doctor: "예시 원장님",
    memo: "색소·잡티 1회차",
  },
  {
    id: "e4",
    year: 2025,
    month: 11,
    day: 3,
    procs: ["써마지", "스컬트라"],
    tone: styles.dotPurple,
    place: "△△피부과의원",
    doctor: "예시 원장님",
    memo: "1년 주기로 받기로",
  },
];

/* 키워드 카드 샘플 폴백 */
const SAMPLE_KW_CARDS = [
  {
    tag: "리프팅",
    tagTone: styles.tagBlue,
    title: "리프팅 받았는데 효과 없는 사람은 왜 그런 건가요?",
    author: "예시 전문의",
    when: "1달 전",
  },
  {
    tag: "스킨부스터",
    tagTone: styles.tagPink,
    title: "리쥬란이랑 쥬브젠, 둘 중 뭐가 더 오래가나요?",
    author: "예시 전문의",
    when: "2주 전",
  },
];

const KW_TONES = [
  styles.tagBlue,
  styles.tagPink,
  styles.tagGreen,
  styles.tagPurple,
];

/* "회복 중 / 효과 관찰 중 / 회복 완료" 배지 — 운영 recordBadge 의 간이판(샘플 데이터 기준).
 * 실제 의학 파라미터(diary-status) 대신, 경과 일수로만 단순 판정(프리뷰 표시용). */
function badgeFor(year: number, month: number, day: number): {
  label: string;
  tone: "heal" | "mint";
} {
  const t = new Date(year, month - 1, day).getTime();
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  if (days <= 7) return { label: "회복 중", tone: "heal" };
  if (days <= 42) return { label: "효과 관찰 중", tone: "heal" };
  return { label: "회복 완료", tone: "mint" };
}

function Badge({ tone, label }: { tone: "heal" | "mint"; label: string }) {
  return (
    <span
      className={`${styles.recBadge} ${
        tone === "mint" ? styles.recBadgeMint : styles.recBadgeHeal
      }`}
    >
      {label}
    </span>
  );
}

/* ---------- 타임라인 뷰 — 좌측 날짜 원 + 세로 연결선 ---------- */
function TimelineView({ entries }: { entries: RecEntry[] }) {
  // 연도 내림차순 → 같은 해 최신 날짜순. 연도 바뀌면 라벨.
  const sorted = [...entries].sort(
    (a, b) =>
      b.year - a.year ||
      b.month - a.month ||
      b.day - a.day,
  );
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
                <Badge {...badgeFor(row.e.year, row.e.month, row.e.day)} />
              </div>
              <div className={styles.recMeta}>
                {row.e.place}
                <span className={styles.sep}>·</span>
                {row.e.doctor}
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
  const years = useMemo(
    () => [...new Set(entries.map((e) => e.year))].sort((a, b) => b - a),
    [entries],
  );
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
          <button
            type="button"
            disabled={year <= minYear}
            onClick={() => moveYear(-1)}
            aria-label="이전 연도"
          >
            ‹
          </button>
          <span className={styles.recCalYear}>{year}</span>
          <button
            type="button"
            disabled={year >= maxYear}
            onClick={() => moveYear(1)}
            aria-label="다음 연도"
          >
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
              <button
                key={m}
                type="button"
                disabled={!has}
                onClick={() => setSelMonth(m)}
                className={cls}
              >
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
                  <span className={styles.recCalRowName}>
                    {e.procs.join(" · ")}
                  </span>
                  <Badge {...badgeFor(e.year, e.month, e.day)} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className={styles.recCalEmpty}>
            기록 있는 달을 눌러 상세를 확인하세요.
          </p>
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
        items: items.sort(
          (a, b) => b.month - a.month || b.day - a.day,
        ),
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
                  <button
                    type="button"
                    className={styles.recListBtn}
                    onClick={() => toggle(e.id)}
                  >
                    <span className={styles.recListDate}>
                      {e.month}.{e.day}
                    </span>
                    <span className={styles.recListInfo}>
                      <span className={styles.recListName}>
                        {e.procs.join(" · ")}
                      </span>
                      <span className={styles.recListPlace}>{e.place}</span>
                    </span>
                    <span className={styles.recListChev}>
                      {isOpen ? "▴" : "▾"}
                    </span>
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
                        <b>{e.doctor}</b>
                        <span className={styles.sep}>·</span>
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
              className={`${styles.recToggleBtn} ${
                mode === m ? styles.recToggleBtnOn : ""
              }`}
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

export default function RecordView({
  kwCards,
  keywordChips,
  popularCards = [],
}: {
  kwCards: CardData[];
  keywordChips: string[];
  /** 피드백 3) 인기글 섹션 데이터(피드 풀 상위). */
  popularCards?: CardData[];
}) {
  const chips = keywordChips.length >= 3 ? keywordChips : SAMPLE_CHIPS;
  // 피드백 4) 헤더 검색 → 피드로 라우팅(공용 헬퍼). 피드가 ?q=/?cat= 을 읽어 자동 필터.
  const search = useBetaSearchRouting();

  const sidebar = (
    <>
      {/* 피드백 3) 게스트 모드 — 로그인 가정 위젯 대신 가입 유도. */}
      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>내 노트를 시작해보세요</h3>
        <p className={styles.muted} style={{ marginBottom: 14 }}>
          가입하면 받은 시술과 경과를 나만의 노트로 기록할 수 있어요.
        </p>
        <a
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
          href="/beta-skin/write"
        >
          노트 작성해보기
        </a>
      </section>

      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>인기 Q&A</h3>
        <div className={styles.sideList}>
          {popularCards.length > 0 ? (
            popularCards.slice(0, 3).map((c, i) => (
              <a href={`/beta-skin/post?id=${c.id}`} key={c.id}>
                <span className={styles.n}>{i + 1}</span>
                <span>{c.title}</span>
              </a>
            ))
          ) : (
            <a href="/beta-skin">
              <span className={styles.n}>›</span>
              <span>피드에서 인기 Q&A 보기</span>
            </a>
          )}
        </div>
      </section>
    </>
  );

  return (
    <BetaSkinShell
      active="내 노트"
      sidebar={sidebar}
      {...search}
      searchSuggestions={chips}
    >
      {/* 피드백 3) 게스트 예시 히어로 — 로그인 가정("텐즈님 248일째") 대신 가입 유도. */}
      <section className={`${styles.card} ${styles.greetCard}`}>
        <div className={styles.greetTop}>내 시술노트 ✨</div>
        <h1 className={styles.greetTitle}>
          받은 시술을 기록하면
          <br />
          이렇게 한눈에 보여요
        </h1>
        <p
          className={styles.muted}
          style={{ margin: "10px 0 4px", color: "rgba(255,255,255,0.92)" }}
        >
          병원·시술·다운타임·효과·재방문 주기까지. 가입하면 나만의 시술노트가
          시작돼요.
        </p>
        <div className={styles.greetActions}>
          <a
            className={`${styles.btn} ${styles.btnPrimary}`}
            href="/beta-skin/write"
          >
            노트 작성해보기
          </a>
        </div>
      </section>

      {/* 시술 노트 — '예시' 라벨 + 타임라인/달력/목록 3토글(더미 데이터). */}
      <div style={{ marginTop: 24 }}>
        <div className={styles.recExampleHead}>
          <h2 className={styles.recNotesTitle}>이렇게 기록돼요</h2>
          <span className={styles.recExampleTag}>예시</span>
        </div>
        <RecordNotes entries={ENTRIES} />
      </div>

      {/* 관심 키워드 새 글 */}
      <div className={styles.sectionHead}>
        <h2>관심 키워드 새 글</h2>
        <a className={styles.more} href="/settings/profile">
          키워드 편집
        </a>
      </div>
      {/* 관심 키워드 칩 — 클릭 시 피드로 이동해 그 키워드로 검색·필터(?kw=).
          항목 4) # 표기 금지 — 키워드만 표시. */}
      <div className={styles.chipRow}>
        {chips.map((c) => (
          <Link
            className={`${styles.chip} ${styles.chipNav}`}
            key={c}
            href={`/beta-skin?kw=${encodeURIComponent(c)}`}
          >
            {c}
          </Link>
        ))}
      </div>

      <div className={styles.kwScroll}>
        {kwCards.length >= 2
          ? kwCards.map((c, i) => {
              const author =
                c.doctor?.name ?? c.author?.display_name ?? "회원";
              const isDoctor = !!c.doctor && !c.hide_doctor_credential;
              const kw = c.keywords?.[0] ?? "키워드";
              // 항목 3) 각 카드의 실제 canonical URL (단일 /beta-skin/post 고정 버그 수정).
              const href = cardHref(c);
              const hasHref = href !== "/";
              return (
                <a
                  className={`${styles.card} ${styles.kwCard}`}
                  href={hasHref ? href : undefined}
                  target={hasHref ? "_blank" : undefined}
                  rel={hasHref ? "noopener noreferrer" : undefined}
                  key={c.id}
                >
                  <span
                    className={`${styles.tag} ${KW_TONES[i % KW_TONES.length]}`}
                  >
                    {kw}
                  </span>
                  <h3 className={styles.kwTitle}>{c.title}</h3>
                  <div className={styles.kwFoot}>
                    <CardAvatar
                      doctorSlug={c.doctor?.slug}
                      memberAvatarUrl={c.author?.avatar_url}
                      name={author}
                      size={36}
                    />
                    <div>
                      <div className={styles.authorName} style={{ fontSize: 14 }}>
                        {author}
                        {isDoctor && (
                          <span className={styles.verified}>
                            <IconVerified />
                          </span>
                        )}
                      </div>
                      <div className={styles.authorSub}>
                        {isDoctor ? "피부과 전문의" : "회원"}
                      </div>
                    </div>
                    <span className={styles.when}>
                      {timeAgo(c.created_at) || "최근"}
                    </span>
                  </div>
                </a>
              );
            })
          : SAMPLE_KW_CARDS.map((c) => (
              <a
                className={`${styles.card} ${styles.kwCard}`}
                href="/beta-skin"
                key={c.title}
              >
                <span className={`${styles.tag} ${c.tagTone}`}>{c.tag}</span>
                <h3 className={styles.kwTitle}>{c.title}</h3>
                <div className={styles.kwFoot}>
                  <span className={`${styles.avatar} ${styles.avatarGray}`} />
                  <div>
                    <div className={styles.authorName} style={{ fontSize: 14 }}>
                      {c.author}
                      <span className={styles.verified}>
                        <IconVerified />
                      </span>
                    </div>
                    <div className={styles.authorSub}>피부과 전문의</div>
                  </div>
                  <span className={styles.when}>{c.when}</span>
                </div>
              </a>
            ))}
      </div>

      {/* 피드백 3) 인기글 섹션 복원 — 피드 풀 상위(좋아요+저장+댓글) 5개. */}
      {popularCards.length > 0 && (
        <>
          <div className={styles.sectionHead}>
            <h2>인기글</h2>
            <a className={styles.more} href="/beta-skin">
              전체보기
            </a>
          </div>
          <div className={`${styles.card} ${styles.popList}`}>
            {popularCards.map((c, i) => {
              const author =
                c.doctor?.name ?? c.author?.display_name ?? "회원";
              const href = cardHref(c);
              const hasHref = href !== "/";
              return (
                <a
                  className={styles.popRow}
                  key={c.id}
                  href={hasHref ? href : "/beta-skin"}
                  target={hasHref ? "_blank" : undefined}
                  rel={hasHref ? "noopener noreferrer" : undefined}
                >
                  <span className={styles.popRank}>{i + 1}</span>
                  <span className={styles.popInfo}>
                    <span className={styles.popTitle}>{c.title}</span>
                    <span className={styles.popMeta}>
                      {author} · {categoryLabel(c)}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        </>
      )}
    </BetaSkinShell>
  );
}
