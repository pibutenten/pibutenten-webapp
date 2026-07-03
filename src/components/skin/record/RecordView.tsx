"use client";

/**
 * RecordView — /today "투데이" 본문 (클라이언트).
 *
 * 원칙: UI 는 신규 스킨 유지, 데이터·로직은 운영(record-data SSOT) 재사용.
 *   순서: ① 날씨 요약 → ② 인사 히어로(computeStatus 5단계 / 게스트 가입 유도)
 *        → ③ 나만의 피부기록(가장 최근 노트 1건 요약, /notes 링크) → ④ 나의 KPI(글/노트/후기/댓글)
 *        → ⑤ 관심 키워드 새 글 → ⑥ 인기글.
 *   - 시술 노트 전체(타임라인/달력/목록 3토글)는 '내 노트' 탭(/notes)으로 분리됐다.
 *   - '나만의 피부기록' 박스 배지는 운영 recordBadge(diary-status SSOT).
 */

import { useRef, useState } from "react";
import Link from "next/link";
import CardAvatar from "@/components/card/CardAvatar";
import AppShell from "../AppShell";
import styles from "../app.module.css";
import { IconVerified, useSearchRouting } from "../ui";
import SkinWeatherCard from "./skin-weather/SkinWeatherCard";
import { computeStatus, type DiaryLatest } from "@/lib/diary-status";
import type { KeywordPost } from "@/app/today/KeywordCarousel";
import type { PopularData, PopularItem } from "@/lib/record-data";

import { shortLabelForCategory } from "@/lib/post-category";

const SAMPLE_CHIPS = ["리프팅", "보톡스", "스킨부스터", "볼륨", "더모코스메틱"];

/* ---------- 인기글 섹션 — 7/30/90일 토글 + 상위 5 + 6~N위 더보기 ---------- */
const CAT_LABEL: Record<string, string> = {
  qa: "Q&A",
  review: "시술후기",
  doodle: "끄적끄적",
  review_summary: shortLabelForCategory("review_summary"),
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
  handle = null,
  latest,
  diaryCount,
  reviewsCount,
  postCount,
  commentCount,
  keywordPosts,
  popular,
  myKeywords,
}: {
  guest?: boolean;
  userName: string;
  /** 공개 프로필 핸들 — KPI 타일의 `/{handle}?tab=...` 링크용(마이페이지와 동일 규칙).
   *  null(핸들 미설정 회원·게스트)이면 프로필행 타일은 비링크 폴백. */
  handle?: string | null;
  latest: DiaryLatest | null;
  diaryCount: number;
  reviewsCount: number;
  postCount: number;
  commentCount: number;
  keywordPosts: KeywordPost[];
  popular: PopularData;
  myKeywords: string[];
}) {
  // 피드백 4) 헤더 검색 → 피드로 라우팅(공용 헬퍼). 피드가 ?q=/?cat= 을 읽어 자동 필터.
  const search = useSearchRouting();
  // 관심 키워드 칩 — 실데이터 우선, 비면 샘플 폴백(게스트/미등록 회원).
  const chips = myKeywords.length >= 1 ? myKeywords : SAMPLE_CHIPS;
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
  // KPI 프로필행 링크 베이스 — 마이페이지(MyPageView)의 `/${handle}` 규칙 재사용(SSOT, 새 URL 규칙 발명 금지).
  const profileHref = handle ? `/${handle}` : null;

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
          <h3>글쓰기</h3>
          {/* 글쓰기 3종 — 아래로 하나씩 내부 박스(노트/후기/글). */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
            {[
              { href: "/write", label: "노트 작성하기" },
              { href: "/write?tab=review", label: "후기 작성하기" },
              { href: "/write?tab=doodle", label: "글 올리기" },
            ].map((w) => (
              <Link
                key={w.href}
                href={w.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "var(--bg-soft, #f1f6fb)",
                  color: "var(--text)",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                {w.label}
                <span style={{ color: "var(--tt-blue, #4cbff2)", fontWeight: 700 }}>›</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );

  return (
    <AppShell active="투데이" sidebar={sidebar} {...search}>
      {/* 오늘의 피부 날씨 — 위치 기반(인증 불필요), 게스트·회원 공통. 투데이 최상단. */}
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
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div className={styles.greetTop} style={{ color: "rgba(255,255,255,0.8)" }}>안녕하세요, {userName}님</div>
            {/* 내 노트 보기 — 카드 우상단(날씨 카드 동선과 동일). 연한 글씨. */}
            <Link
              href="/notes"
              style={{ flexShrink: 0, marginTop: 2, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", textDecoration: "none" }}
            >
              내 노트 보기 ›
            </Link>
          </div>
          <h1 className={styles.greetTitle} style={{ whiteSpace: "pre-line" }}>
            {status.headline}
          </h1>
          <p className={styles.muted} style={{ margin: "10px 0 4px", color: "rgba(255,255,255,0.92)" }}>
            {status.sub}
          </p>
          {/* 나의 KPI — 날씨 칩처럼 라벨 위·숫자 아래. 내 노트 / 내 후기 / 내 글 / 내 댓글.
              운영 제보(타일을 탭해도 이동 안 됨) 대응: 표시 전용 div → 실제 링크로 전환.
              목적지 규칙은 마이페이지(MyPageView)와 동일(SSOT) — 내 노트=/notes, 나머지=/{handle}?tab=... */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 16 }}>
            {[
              { n: diaryCount, l: "내 노트", href: "/notes" as string | null },
              // 핸들 미설정 회원(profileHref=null)은 공개 프로필 URL 을 만들 수 없어 href=null → 아래 비링크 div 폴백.
              { n: reviewsCount, l: "내 후기", href: profileHref && `${profileHref}?tab=reviews` },
              { n: postCount, l: "내 글", href: profileHref && `${profileHref}?tab=posts` },
              { n: commentCount, l: "내 댓글", href: profileHref && `${profileHref}?tab=comments` },
            ].map((s) => {
              // 기존 표시 전용 타일과 동일 시각(배경·radius·padding) 유지 — 링크화는 동작만 추가.
              const tileStyle = {
                background: "rgba(255,255,255,0.16)",
                borderRadius: 12,
                padding: "11px 4px",
                textAlign: "center" as const,
              };
              const inner = (
                <>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.82)" }}>{s.l}</div>
                  <div style={{ marginTop: 5, fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{s.n}</div>
                </>
              );
              return s.href ? (
                <Link
                  key={s.l}
                  href={s.href}
                  aria-label={`${s.l} ${s.n}개 보기`}
                  style={{ ...tileStyle, display: "block", textDecoration: "none", transition: "background 0.12s ease" }}
                  /* 탭 피드백 — 인라인 스타일이라 :active 를 못 쓰므로 pointer 이벤트로 배경만 살짝 진하게. */
                  onPointerDown={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.24)"; }}
                  onPointerUp={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.16)"; }}
                  onPointerLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.16)"; }}
                  onPointerCancel={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.16)"; }}
                >
                  {inner}
                </Link>
              ) : (
                // 폴백 — 핸들 미설정이라 목적지가 없는 프로필행 타일은 기존과 동일한 표시 전용 div.
                <div key={s.l} style={tileStyle}>
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 글쓰기 메뉴 — 모바일(<900px)에선 웰컴 카드 바로 아래에 노출. 데스크탑(≥900px)은 우측 사이드바가 담당(여긴 숨김). */}
      <div className="min-[900px]:hidden" style={{ marginTop: 18 }}>
        {sidebar}
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
    </AppShell>
  );
}
