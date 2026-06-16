"use client";

/**
 * FeedSidebar — 홈 피드/토픽/리포트가 공유하는 데스크탑 우측 사이드바 (클라이언트).
 *
 * 기존엔 BetaSkinFeed.tsx 안에 인라인으로 있던 3개 위젯을 별도 컴포넌트로 추출(중복 구현 방지):
 *   ① 인기 태그   — "전체"(서버 빈도순 popularTags) + 카테고리 5탭(/api/beta-discover cats).
 *   ② 인기 Q&A    — 의사 Q&A 카드 풀(hotQa)에서 5개를 진입마다 회전 노출.
 *   ③ 글쓰기 CTA — 랜덤 문구(정적, 데이터 불필요) + /write 버튼.
 *
 * 데이터(popularTags·hotQa)는 props 로 받는다 — 홈은 피드 풀에서 파생,
 *   토픽/리포트는 서버에서 홈과 동일 방식(feed_cards_scored)으로 조회해 넘긴다.
 * 검색(태그 클릭)은 onTagClick 으로 위임 — 모든 페이지가 운영 홈(/?q=)으로 라우팅.
 *
 * 격리: beta-skin.module.css 무수정 — 기존 BetaSkinFeed 사이드바와 동일 클래스만 사용.
 */

import { useEffect, useMemo, useState } from "react";
import type { CardData } from "@/lib/types/card";
import { prefetchDiscover } from "@/components/beta/BetaDiscovery";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import styles from "./beta-skin.module.css";
import { cardHref, catTagClass, catKey } from "./beta-ui";

// 인기태그 빈도 유틸(topKeywords·POPULAR_TAGS)은 서버 page(홈/토픽/리포트)에서도 호출하므로
//   비-client 모듈 ./feed-sidebar-data 로 분리(이 파일은 "use client" → 서버 호출 시 throw 회귀 방지).
//   서버 page 는 그 모듈에서 직접 import 한다(이 파일 경유 금지).

/* 사이드 글쓰기 유도 박스 문구 — 매 진입 랜덤 셔플(꿀팁/고민/후기/일기/질문). CTA 는 글쓰기. */
const SIDE_PROMPTS: { h3: string; p: string }[] = [
  { h3: "공유하고 싶은 피부 꿀팁이 있으세요?", p: "나만 아는 노하우를 글로 남겨보세요." },
  { h3: "요즘 피부 고민, 어떠세요?", p: "고민을 남기면 회원·전문의와 이야기 나눌 수 있어요." },
  { h3: "최근 받은 시술, 어땠나요?", p: "솔직한 경험을 글로 들려주세요." },
  { h3: "오늘의 피부, 한 줄 남겨볼까요?", p: "작은 변화도 기록하면 큰 도움이 돼요." },
  { h3: "궁금한 점이 있으세요?", p: "글로 남기면 회원·전문의의 이야기를 들어볼 수 있어요." },
];

export default function FeedSidebar({
  popularTags,
  hotQa,
  currentTag = "",
  onTagClick,
}: {
  /** 사이드 '인기 태그' '전체' 탭 — 서버가 비검색 피드 풀 기준으로 계산한 16개(순서 고정). */
  popularTags: string[];
  /** 인기 Q&A 후보 풀 — 의사 Q&A 카드 상위 N개. 이 안에서 5개를 회전 노출. */
  hotQa: CardData[];
  /** 현재 활성 태그/검색어 — 인기 태그 칩 선택 표시용(그 태그면 카테고리 틴트). */
  currentTag?: string;
  /** 태그 칩 클릭 — 그 키워드로 검색 라우팅(호출부가 위임). */
  onTagClick: (keyword: string) => void;
}) {
  // 사이드 '인기 태그' 카드 — 카테고리 탭. "전체"는 빈도순 popularTags(16개),
  //   카테고리 탭은 /api/beta-discover 의 cats(검색 드롭다운과 동일 소스)에서 해당 slug 상위 16개.
  type TagTab = "all" | CategorySlug;
  // 태그 클릭 → 검색(/?q=) 라우팅 시 BetaSkinFeed/FeedSidebar 가 재마운트되며 내부 state 가 초기화된다.
  //   이때 선택했던 서브 카테고리 탭이 "전체"로 풀리던 버그를 방지하기 위해 sessionStorage 에 보존.
  //   (prop 시그니처·호출부 무수정 → 회귀 위험 최소. 헤더 검색·BetaDiscovery 경로는 영향 없음.)
  const TAG_TAB_KEY = "pbtt:feedSidebar:tagTab";
  const VALID_TABS = useMemo<TagTab[]>(
    () => ["all", ...CATEGORIES.map((c) => c.slug)],
    [],
  );
  const [tagTab, setTagTabState] = useState<TagTab>("all");
  // 초기값 복원 — SSR/하이드레이션 안전을 위해 마운트 후 useEffect 로만 sessionStorage 에서 읽는다
  //   (초기 렌더는 항상 "all" → 서버/클라 마크업 일치, 마운트 직후 보존값으로 동기화).
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(TAG_TAB_KEY);
      if (saved && (VALID_TABS as string[]).includes(saved)) {
        setTagTabState(saved as TagTab);
      }
    } catch {
      /* sessionStorage 비활성 */
    }
  }, [VALID_TABS]);
  // 탭 변경 시 state + sessionStorage 동시 갱신.
  const setTagTab = (tab: TagTab) => {
    setTagTabState(tab);
    try {
      window.sessionStorage.setItem(TAG_TAB_KEY, tab);
    } catch {
      /* sessionStorage 비활성 */
    }
  };
  const [cats, setCats] = useState<Record<string, string[]> | null>(null);
  useEffect(() => {
    let alive = true;
    prefetchDiscover().then((d) => {
      if (alive) setCats(d.cats ?? {});
    });
    return () => {
      alive = false;
    };
  }, []);

  // 현재 선택 탭의 태그 목록 — "전체"면 빈도순 16개, 카테고리면 cats[slug] 상위 16개.
  const sideTags = useMemo<string[]>(() => {
    if (tagTab === "all") return popularTags;
    return (cats?.[tagTab] ?? []).slice(0, 16);
  }, [tagTab, cats, popularTags]);

  // 인기 Q&A — 받은 풀 안에서 진입마다 시작점을 무작위로 옮겨 5개를 순환 노출.
  //   하이드레이션 안전: SSR·초기 렌더는 항상 offset 0(앞 5개, 결정적). 마운트 후 useEffect 로만 회전.
  const [hotQaOffset, setHotQaOffset] = useState(0);
  useEffect(() => {
    setHotQaOffset(Math.floor(Math.random() * 20));
  }, []);
  const doctorAnswers = useMemo(() => {
    const n = hotQa.length;
    if (n <= 5) return hotQa;
    const start = hotQaOffset % n;
    const out: CardData[] = [];
    for (let i = 0; i < 5; i++) out.push(hotQa[(start + i) % n]);
    return out;
  }, [hotQa, hotQaOffset]);

  // 사이드 글쓰기 유도 박스 — 매 진입 랜덤 문구(SSR 은 0번, 마운트 후 셔플 → 하이드레이션 안전).
  const [promptIdx, setPromptIdx] = useState(0);
  useEffect(() => {
    setPromptIdx(Math.floor(Math.random() * SIDE_PROMPTS.length));
  }, []);
  const sidePrompt = SIDE_PROMPTS[promptIdx];

  return (
    <>
      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>인기 태그</h3>
        {/* 카테고리 탭 — "전체"(빈도순 16개) + 운영 5개 카테고리. */}
        <div className={styles.tagCatTabs}>
          <button
            type="button"
            className={`${styles.tagCatTab} ${tagTab === "all" ? styles.tagCatTabActive : ""}`}
            onClick={() => setTagTab("all")}
            aria-pressed={tagTab === "all"}
          >
            전체
          </button>
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.slug}
              className={`${styles.tagCatTab} ${tagTab === c.slug ? styles.tagCatTabActive : ""}`}
              onClick={() => setTagTab(c.slug)}
              aria-pressed={tagTab === c.slug}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className={styles.sideTags}>
          {/* 인기 태그에 # 표기 금지 — 키워드만. 클릭 시 서버 검색. */}
          {sideTags.length === 0 ? (
            <p className={styles.empty}>
              {cats === null ? "불러오는 중…" : "표시할 태그가 없습니다."}
            </p>
          ) : (
            sideTags.map((tag) => {
              // 통일 태그: 평소 연한 회색(.t), 선택(현재 태그=그 태그)일 때만 연한 카테고리 틴트.
              const on = currentTag.trim() === tag;
              return (
                <button
                  type="button"
                  className={`${styles.t} ${on ? catTagClass(tag) : ""}`}
                  data-cat={catKey(tag)}
                  key={tag}
                  onClick={() => onTagClick(tag)}
                  aria-pressed={on}
                >
                  {tag}
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>인기 Q&A</h3>
        <div className={styles.sideList}>
          {doctorAnswers.map((c) => (
            <a key={c.id} href={cardHref(c)}>
              <span className={styles.n}>Q</span>
              <span>{c.title}</span>
            </a>
          ))}
        </div>
      </section>

      <section className={`${styles.card} ${styles.sideCta}`}>
        <h3>{sidePrompt.h3}</h3>
        <p>{sidePrompt.p}</p>
        <a className={styles.sideCtaBtn} href="/write">
          글쓰기
        </a>
      </section>
    </>
  );
}
