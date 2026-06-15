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

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import CardAvatar from "@/components/card/CardAvatar";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import { IconVerified, useBetaSearchRouting } from "../beta-ui";
import SkinWeatherCard from "./skin-weather/SkinWeatherCard";
import RecordNotesPanel, { toRecEntries } from "./RecordNotesPanel";
import { computeStatus, type DiaryLatest } from "@/lib/diary-status";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";
import type { KeywordPost } from "@/app/record/KeywordCarousel";
import type { PopularData, PopularItem } from "@/lib/record-data";

const SAMPLE_CHIPS = ["리프팅", "보톡스", "스킨부스터", "볼륨", "더모코스메틱"];

/* "이렇게 기록돼요" 빈 상태용 샘플 노트(더미) — 실데이터 아님이 분명하도록 '예시' 배지와 함께 미리보기.
 *   날짜·병원·시술명·메모가 든 더미 카드 4개. 클릭 동작 없음(시각적 이해 전용). */
const SAMPLE_NOTES: {
  month: number;
  day: number;
  procs: string[];
  place: string;
  doctor: string;
  memo: string;
  badge: { label: string; tone: "mint" | "heal" };
}[] = [
  {
    month: 5,
    day: 12,
    procs: ["리프팅", "스킨부스터"],
    place: "○○피부과의원",
    doctor: "○○○ 원장",
    memo: "시술 직후 약간 붉었지만 다음 날 가라앉음. 탄력 변화 관찰 중.",
    badge: { label: "효과 관찰 중", tone: "mint" },
  },
  {
    month: 4,
    day: 28,
    procs: ["레이저토닝", "스킨케어"],
    place: "○○피부과의원",
    doctor: "○○○ 원장",
    memo: "색소·잡티 관리 목적. 시술 후 이틀간 살짝 따끔, 보습 신경 써서 관리.",
    badge: { label: "회복 중", tone: "heal" },
  },
  {
    month: 4,
    day: 3,
    procs: ["보톡스"],
    place: "○○의원",
    doctor: "○○○ 원장",
    memo: "이마 주름 부위. 일주일 뒤부터 효과 체감.",
    badge: { label: "회복 완료", tone: "mint" },
  },
  {
    month: 3,
    day: 15,
    procs: ["필러"],
    place: "○○피부과의원",
    doctor: "○○○ 원장",
    memo: "팔자 부위 볼륨. 시술 당일 약간 부었고 3일 뒤 자연스럽게 자리잡음.",
    badge: { label: "회복 완료", tone: "mint" },
  },
];

/* ---------- 인기글 섹션 — 7/30/90일 토글 + 상위 5 + 6~N위 더보기 ---------- */
const CAT_LABEL: Record<string, string> = {
  qa: "Q&A",
  review: "시술후기",
  doodle: "끄적끄적",
  review_summary: "리포트",
};
const catLabel = (c: string) => CAT_LABEL[c] ?? "글";

/* 인기글 순위 색 — 운영(record/RecordTab.tsx) 차등 재현.
 *   1위=핑크 강조 / 2위=하늘(브랜드) / 3위=골드 / 4위↑=중립 회색. 1위만 글자 살짝 크게. */
const popRankColor = (r: number) =>
  r === 1 ? "#F76D9B" : r === 2 ? "var(--tt-blue-deep)" : r === 3 ? "#F5A623" : "var(--ink-300)";

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
        href={hasHref ? it.href : "/"}
        target={hasHref ? "_blank" : undefined}
        rel={hasHref ? "noopener noreferrer" : undefined}
      >
        <span
          className={styles.popRank}
          style={{ color: popRankColor(it.rank), fontSize: it.rank === 1 ? 18 : 16 }}
        >
          {it.rank}
        </span>
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
  // 인라인은 최근 N개 미리보기만. 전체(3토글 전부)는 /record/notes 자세히 페이지에서.
  const NOTES_PREVIEW = 4;
  const previewEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day);
    return sorted.slice(0, NOTES_PREVIEW);
  }, [entries]);
  const hasMoreNotes = entries.length > NOTES_PREVIEW;
  // 관심 키워드 새 글 — 단일 키워드 필터(운영 KeywordCarousel 동작 재현).
  const [selKw, setSelKw] = useState<string | null>(null);
  const shownPosts = selKw ? keywordPosts.filter((p) => p.matchedKeywords.includes(selKw)) : keywordPosts;
  // 캐러셀 좌우 화살표(데스크탑)·페이지 도트 — 운영 KeywordCarousel 장치 재현.
  //   STEP = 카드폭(240) + gap(14) = 254. 화살표 클릭 시 한 카드씩 smooth 스크롤.
  const KW_STEP = 254;
  const kwRef = useRef<HTMLDivElement>(null);
  const [kwActive, setKwActive] = useState(0);
  const kwDotCount = shownPosts.length;
  const nudge = (dir: 1 | -1) => kwRef.current?.scrollBy({ left: dir * KW_STEP, behavior: "smooth" });
  const onKwScroll = () => {
    const el = kwRef.current;
    if (!el) return;
    setKwActive(Math.min(Math.max(Math.round(el.scrollLeft / KW_STEP), 0), Math.max(kwDotCount - 1, 0)));
  };
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
          <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} href="/write">
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
      {/* 오늘의 피부 날씨 — 위치 기반(인증 불필요), 게스트·회원 공통. 노트 최상단. */}
      <SkinWeatherCard />
      {/* 히어로 — 게스트=가입 유도, 회원=computeStatus 5단계 인사 */}
      {guest ? (
        <section className={`${styles.card} ${styles.greetCard}`}>
          <div className={styles.greetTop}>내 시술노트</div>
          <h1 className={styles.greetTitle}>
            받은 시술을 기록하면
            <br />
            이렇게 한눈에 보여요
          </h1>
          <p className={styles.muted} style={{ margin: "10px 0 4px", color: "rgba(255,255,255,0.92)" }}>
            병원·시술·다운타임·효과·재방문 주기까지. 가입하면 나만의 시술노트가 시작돼요.
          </p>
          <div className={styles.greetActions}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="/write">
              노트 작성하기
            </a>
          </div>
        </section>
      ) : (
        <section className={`${styles.card} ${styles.greetCard}`}>
          <div className={styles.greetTop}>안녕하세요, {userName}님</div>
          <h1 className={styles.greetTitle} style={{ whiteSpace: "pre-line" }}>
            {status.headline}
          </h1>
          <p className={styles.muted} style={{ margin: "10px 0 4px", color: "rgba(255,255,255,0.92)" }}>
            {status.sub}
          </p>
          {/* 항목9) 버튼 3개·이모지 제거·자연스러운 문구(운영 RecordTab 동선 정합). */}
          <div className={styles.greetActions}>
            {/* 내 노트 보기 → 시술노트 자세히 페이지(/record/notes). 인라인 스크롤 대신 전용 페이지로. */}
            <Link href="/record/notes" className={`${styles.btn} ${styles.btnPrimary}`}>
              내 노트 보기
            </Link>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="/write">
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
        <section className={`${styles.card} ${styles.statCard} ${styles.mb20}`} style={{ marginTop: 18 }}>
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

      {/* 시술 노트 — 회원=실데이터 3토글, 게스트=빈 예시 안내 ('내 노트 보기' 스크롤 타깃) */}
      <div id="rec-notes" style={{ marginTop: 24, scrollMarginTop: 70 }}>
        {entries.length === 0 ? (
          <>
            <div className={styles.recExampleHead}>
              <h2 className={styles.recNotesTitle}>이렇게 기록돼요</h2>
              <span className={styles.recExampleTag}>예시</span>
            </div>
            {/* 샘플 미리보기 — 실데이터 아님(더미)이 분명하도록 흐리게 + '예시' 배지. 클릭 동작 없음.
                베타 타임라인 토큰(recTl*) 재사용 → "이렇게 기록된다"를 시각적으로 보여줌. */}
            <div className={styles.recExamplePreview} aria-hidden="true">
              <div className={styles.recTl}>
                {SAMPLE_NOTES.map((n, i) => (
                  <div className={styles.recTlItem} key={i}>
                    <span className={styles.recTlDot}>
                      <span className={styles.recTlDotMonth}>{n.month}월</span>
                      <span className={styles.recTlDotDay}>{n.day}</span>
                    </span>
                    <div className={`${styles.card} ${styles.recTlCard}`}>
                      <div className={styles.recTlHead}>
                        <h3 className={styles.recTlName}>{n.procs.join(" · ")}</h3>
                        <span
                          className={`${styles.recBadge} ${n.badge.tone === "mint" ? styles.recBadgeMint : styles.recBadgeHeal}`}
                        >
                          {n.badge.label}
                        </span>
                      </div>
                      <div className={styles.recMeta}>
                        {n.place}
                        <span className={styles.sep}>·</span>
                        {n.doctor}
                      </div>
                      <p className={styles.recMemo}>{n.memo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <section className={`${styles.card} ${styles.sideCard}`} style={{ textAlign: "center" }}>
              <p className={styles.muted}>
                {guest
                  ? "가입하고 첫 시술을 기록하면 타임라인·달력·목록으로 한눈에 정리돼요."
                  : "첫 노트를 쓰면 타임라인·달력·목록으로 한눈에 정리돼요."}
              </p>
              <a
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
                href="/write"
                style={{ marginTop: 12 }}
              >
                첫 노트 쓰러 가기
              </a>
            </section>
          </>
        ) : (
          <>
            {/* 인라인은 미리보기(최근 N개). 전체(3토글)는 위 인사 카드의 '내 노트 보기' + 아래 '전체 보기'로 이동. */}
            <RecordNotesPanel entries={previewEntries} />
            {hasMoreNotes && (
              <Link href="/record/notes" className={styles.recNotesViewAll}>
                시술 노트 전체 보기 ({entries.length}건) ›
              </Link>
            )}
          </>
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
        <div className={styles.kwCarousel}>
          <div className={styles.kwScroll} ref={kwRef} onScroll={onKwScroll}>
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
                  {p.keyword && <span className={styles.t}>{p.keyword}</span>}
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

          {/* 데스크탑 좌우 화살표 — ≥900px 에서만 표시, 컨테이너 hover 시 노출. */}
          <button
            type="button"
            aria-label="이전"
            className={`${styles.kwArrow} ${styles.kwArrowLeft}`}
            onClick={() => nudge(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="다음"
            className={`${styles.kwArrow} ${styles.kwArrowRight}`}
            onClick={() => nudge(1)}
          >
            ›
          </button>

          {/* 페이지 도트 — onScroll 로 계산한 active 강조. */}
          {kwDotCount > 1 && (
            <div className={styles.kwDots}>
              {Array.from({ length: kwDotCount }, (_, i) => (
                <span
                  key={i}
                  className={`${styles.kwDot} ${i === kwActive ? styles.kwDotActive : ""}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 인기글 — 공개 통계(published 카드만, buildPopularData 가 RLS+published 로 enrich → 게스트 노출 안전).
          게스트도 실제 인기글을 보여 흥미를 유발하고, 그 아래 가입 유도만 덧붙인다. */}
      <PopularSection popular={popular} />
      {guest && (
        <section className={`${styles.card} ${styles.sideCard}`} style={{ textAlign: "center", marginTop: 12 }}>
          <p className={styles.muted} style={{ marginBottom: 14 }}>
            가입하면 내 시술 기록·관심 키워드 새 글까지 한곳에서 볼 수 있어요.
          </p>
          <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} href="/signup">
            가입하고 내 노트 시작하기
          </a>
        </section>
      )}
    </BetaSkinShell>
  );
}
