"use client";

/**
 * DoctorProfileView — /doctors/[slug] "원장 공개 프로필" 본문 (클라이언트).
 *
 * 원칙(베타 승격, 2026-06-15): 선례 DoctorDashboardView·BetaProfileView 와 동일하게
 *   "상단바(헤더)만 베타 셸, 본문은 기존 운영 정보 구조를 최대한 유지". 큰 .card 박스에 욱여넣지 않는다.
 *   - 운영 page.tsx 의 본문(원장 hero · 프로필 학력/경력/전문분야/학회 · 답변 피드)을
 *     베타 톤(.card / .skinSection / .t 등 기존 클래스)로 자연스럽게 정리(재포장 X, 정보 구조 보존).
 *   - 데이터 fetch · 권한 · generateMetadata · JSON-LD 는 전부 서버 page.tsx 가 책임(여기는 표시만).
 *   - 셸은 active="마이"(미강조 톤) · back="/doctors"(공개 전문의 목록으로 복귀).
 *
 * 레이아웃(2026-06-15 재구성): BetaSkinShell 2단 레이아웃 사용 —
 *   - 메인(좌, 넓게): 원장 hero(이름·병원·사진) + "답변 N편" 헤더 + 단일열 PostCard 피드(홈과 동일 톤).
 *   - 사이드바(우): 프로필 정보(학력·경력·전문분야·자격·학회·학회활동·출판·외부 링크). 운영 단독 URL
 *     의 우측 프로필 사이드바 형식과 동일한 느낌. dl 은 사이드 폭에 맞춰 단일 컬럼.
 *   - 데스크탑은 2단, 모바일은 셸이 자동 1단(sidebarMobileBelow → 프로필을 피드 아래로 노출,
 *     프로필 정보 누락 방지). H1(원장명)은 메인 hero 모바일 분기에 유지 → SEO 영향 없음.
 *
 * 격리: beta-skin.module.css 무수정. 베타 기존 클래스 재사용 + 부분 인라인 style 만.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { CardData } from "@/components/Card";
import { CARD_BUS_EVENTS } from "@/components/card/hooks/useCardBus";
import { orcidUrl, type DoctorProfileData } from "@/lib/doctor-profile";
import type { DoctorTheme } from "@/lib/doctor-theme";
import type { BetaViewerState } from "../../beta-skin/beta-ui";
import {
  IconVerified,
  PostCard,
  useBetaSearchRouting,
} from "../../beta-skin/beta-ui";
import BetaSkinShell from "../../beta-skin/BetaSkinShell";
import styles from "../../beta-skin/beta-skin.module.css";

/* 무한스크롤 한 번에 확장할 카드 수 — /api/cards?ids= 한 묶음(라우트 상한 60 이내).
 *   홈 BetaSkinFeed 와 동일(PAGE=20). */
const PAGE = 20;

export default function DoctorProfileView({
  name,
  intro,
  affiliation,
  photo,
  profile,
  cards,
  orderedIds = [],
  count,
  hotIds,
  viewerStates,
}: {
  /** page.tsx 호환을 위해 타입에는 유지하되 구조분해 생략(미사용).
   *  slug: 본문은 cards/orderedIds 로 동작. theme: hero 제거(원장 카드 사이드바로 이동)로 그라데이션 미사용. */
  slug: string;
  name: string;
  intro: string | null;
  affiliation: string;
  photo: string;
  theme: DoctorTheme;
  profile: DoctorProfileData;
  /** 초기 풀(앞 PAGE 장, 전체 데이터). 무한스크롤이 이 뒤로 orderedIds 순서대로 이어 받는다. */
  cards: CardData[];
  /** 이 원장 전체 글 ID 순서(랭킹). 무한스크롤이 이 순서대로 /api/cards?ids= 로 다음 묶음을 받음. */
  orderedIds?: number[];
  count: number | null;
  hotIds: number[];
  viewerStates: Record<number, BetaViewerState>;
}) {
  const search = useBetaSearchRouting();
  const hotSet = useMemo(() => new Set(hotIds ?? []), [hotIds]);

  // 풀 + 무한스크롤 커서 — 홈 BetaSkinFeed loadMore 패턴 이식(검색·칩·리포트 없는 단순 무한스크롤).
  const [pool, setPool] = useState<CardData[]>(cards);
  const [hasMore, setHasMore] = useState(orderedIds.length > cards.length);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const cursorRef = useRef(cards.length);
  const orderedIdsRef = useRef(orderedIds);
  orderedIdsRef.current = orderedIds;
  // mount-once 스크롤 콜백이 항상 최신 hasMore 참조하도록 ref 동기화.
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  // 서버가 새 초기풀/순서를 내려주면(원장 전환·재진입 등) 풀·커서 리셋.
  useEffect(() => {
    setPool(cards);
    cursorRef.current = cards.length;
    setHasMore(orderedIds.length > cards.length);
  }, [cards, orderedIds]);

  // 풀 확장 — orderedIds 순서대로 다음 묶음을 ID 로 받아 순서 보존 append (홈 BetaSkinFeed loadMore 동일).
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    const ids = orderedIdsRef.current;
    const start = cursorRef.current;
    const nextIds = ids.slice(start, start + PAGE);
    if (nextIds.length === 0) {
      setHasMore(false);
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    // 삭제된 ID 조회 누락이 있어도 같은 자리 재시도 안 하도록 커서를 먼저 전진.
    cursorRef.current = start + nextIds.length;
    try {
      const res = await fetch(`/api/cards?ids=${nextIds.join(",")}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const data = (await res.json()) as { cards: CardData[] };
      const byId = new Map((data.cards ?? []).map((c) => [c.id, c]));
      // .in() 조회는 순서 보장 X → 저장된 순서(nextIds)대로 재정렬.
      const ordered = nextIds
        .map((id) => byId.get(id))
        .filter((c): c is CardData => Boolean(c));
      setPool((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...ordered.filter((c) => !seen.has(c.id))];
      });
      if (cursorRef.current >= ids.length) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // sentinel 관찰 — mount 시 1회만 설정(홈 BetaSkinFeed 동일). loadMore 가 ref 로 최신값 참조.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const ob = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "320px 0px" },
    );
    ob.observe(node);
    return () => ob.disconnect();
  }, [loadMore]);

  // 카드 삭제 broadcast 수신 → 풀에서 제거(홈 BetaSkinFeed 동일). 발사는 카드 ⋮메뉴 쪽.
  useEffect(() => {
    function onDeleted(e: Event) {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (typeof id !== "number") return;
      setPool((prev) => prev.filter((c) => c.id !== id));
    }
    window.addEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
    return () =>
      window.removeEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
  }, []);

  // 우측 사이드바 = 원장 카드 1장 — 글 상세(PostDetail) 작성자 사이드바와 같은 형식.
  //   메시지(intro) → 이름(H1) → "피부과 전문의" 배지 → 누끼 사진 → 프로필 상세(소속·학력·경력·
  //   전문분야·자격·학회·학회활동·출판) → 외부 링크 칩. 데스크탑 2단 우측, 모바일은 피드 아래(sidebarMobileBelow).
  const profileSidebar = (
    <DoctorProfileSidebar
      name={name}
      intro={intro}
      affiliation={affiliation}
      photo={photo}
      profile={profile}
    />
  );

  return (
    <BetaSkinShell
      active="마이"
      back="/doctors"
      sidebar={profileSidebar}
      sidebarMobileBelow
      {...search}
    >
      {/* 메인(좌) = 답변 피드만 (글 상세 PostDetail 과 같은 형식 — 본문은 메인, 원장 카드는 사이드바).
          원장 사진·이름·병원은 우측 사이드바(원장 카드)로 이동했다. 여기는 헤더 + 답변 피드. */}
      {/* 답변 헤더 — "정한미 원장님의 답변 N편" (베타 sectionHead 톤) */}
      <div className={styles.sectionHead}>
        <h2>
          {name} 원장님의 답변{" "}
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-300)" }}>
            {count ?? 0}편
          </span>
        </h2>
      </div>

      {/* Q&A 피드 (해당 원장만) — 홈과 동일한 단일열 PostCard 피드(feedList) + 무한스크롤.
          서버가 내려준 초기 풀(cards)을 PostCard 로 렌더하고, 스크롤 끝(sentinel)에 닿으면
          orderedIds 순서대로 /api/cards?ids= 로 다음 묶음을 이어 받아 append(holes 없이 전체 노출).
          태그 클릭 → 헤더 검색 라우팅(useBetaSearchRouting), HOT 카드 딱지 동기화. */}
      {pool.length === 0 ? (
        <div className={styles.card} style={{ textAlign: "center" }}>
          <p className={styles.muted}>아직 등록된 Q&amp;A가 없어요.</p>
        </div>
      ) : (
        <>
          <div className={styles.feedList}>
            {pool.map((card) => (
              <PostCard
                key={card.id}
                card={card}
                isHot={hotSet.has(card.id)}
                viewer={viewerStates?.[card.id]}
                onTagClick={(t) => search.onSearchSubmit?.(t)}
              />
            ))}
          </div>
          {/* 무한스크롤 sentinel — 풀 소진 시 렌더 안 함(홈 BetaSkinFeed 동일). */}
          {hasMore && (
            <div
              ref={sentinelRef}
              className={styles.feedSentinel}
              aria-hidden="true"
            />
          )}
          {loading && <p className={styles.empty}>불러오는 중…</p>}
        </>
      )}
    </BetaSkinShell>
  );
}

/**
 * 의사 프로필 사이드바 = 원장 카드 1장 — 글 상세(PostDetail) 작성자 사이드바와 같은 형식/톤.
 *
 * 순서(운영·PostDetail 정합): 메시지(intro) → 이름(H1) → "피부과 전문의" 배지 → 누끼 사진 →
 *   프로필 상세(소속·학력·경력·전문분야·자격·학회·학회활동·출판) → 외부 링크 칩.
 *   PostDetail 은 더보기 토글로 접지만, 원장 공개 프로필 페이지는 이 정보가 핵심이라 항상 펼쳐 노출한다.
 *
 * H1: 페이지의 유일한 <h1> 을 여기 원장 이름에 둔다(메인 hero 제거로 중복 없음, SEO H1 1개 유지).
 * 데스크탑: BetaSkinShell 우측 칼럼(.sidebar). 모바일: 셸이 본문(피드) 아래로 노출(sidebarMobileBelow).
 */
function DoctorProfileSidebar({
  name,
  intro,
  affiliation,
  photo,
  profile,
}: {
  name: string;
  intro: string | null;
  affiliation: string;
  photo: string;
  profile: DoctorProfileData;
}) {
  // 프로필 상세 dl — 소속(맨 위) → 학력 → 경력 → 전문 분야 → 자격 → 학회 → 학회 활동 → 출판·저서.
  //   값이 있는 항목만 노출(빈 행 없음). 정보 누락 방지 — 자격(전문의 취득연도)도 dl 에 유지.
  const items: { title: string; values: string[] }[] = [];
  if (affiliation) items.push({ title: "소속", values: [affiliation] });
  if (profile.education && profile.education.length > 0)
    items.push({ title: "학력", values: profile.education });
  if (profile.career && profile.career.length > 0)
    items.push({ title: "경력", values: profile.career });
  if (profile.expertise && profile.expertise.length > 0)
    items.push({ title: "전문 분야", values: profile.expertise });
  if (profile.boardCertifiedYear)
    items.push({
      title: "자격",
      values: [`${profile.boardCertifiedYear}년 전문의 취득`],
    });
  if (profile.memberOf && profile.memberOf.length > 0)
    items.push({ title: "학회", values: profile.memberOf });
  if (profile.societyRoles && profile.societyRoles.length > 0)
    items.push({ title: "학회 활동", values: profile.societyRoles });
  if (profile.publications && profile.publications.length > 0)
    items.push({ title: "출판·저서", values: profile.publications });

  // 외부 링크 — 병원 홈페이지·SNS·학술 프로필 (노출 우선순위 정렬)
  const externalLinks: { label: string; url: string }[] = [];
  if (profile.clinicUrl)
    externalLinks.push({ label: "병원 홈페이지", url: profile.clinicUrl });
  if (profile.instagram)
    externalLinks.push({ label: "병원 인스타그램", url: profile.instagram });
  if (profile.threads)
    externalLinks.push({ label: "스레드", url: profile.threads });
  if (profile.youtube) externalLinks.push({ label: "YouTube", url: profile.youtube });
  if (profile.blog) externalLinks.push({ label: "블로그", url: profile.blog });
  const orcid = orcidUrl(profile);
  if (orcid) externalLinks.push({ label: "ORCID", url: orcid });
  if (profile.googleScholarUrl)
    externalLinks.push({ label: "Google Scholar", url: profile.googleScholarUrl });

  return (
    <section className={`${styles.card} ${styles.authorSide}`}>
      {/* 한줄 메시지(intro) — 맨 위. (운영 doctors.intro) */}
      {intro && <p className={styles.authorMessage}>{intro}</p>}
      {/* 이름 — 페이지 유일 H1(원장명). authorName/authorSideName 톤 재사용. */}
      <h1 className={`${styles.authorName} ${styles.authorSideName}`}>{name}</h1>
      {/* 피부과 전문의 배지 */}
      <div className={styles.authorSub}>
        <span className={styles.verified}>
          <IconVerified />
          피부과 전문의
        </span>
      </div>
      {/* 누끼 원장 사진 — 운영 프로필과 동일한 /doctors/{slug}.png (PostDetail 과 동일 톤). */}
      <div className={styles.authorSidePhoto}>
        <Image
          src={photo}
          alt={`${name} 원장님`}
          fill
          sizes="300px"
          className={styles.authorSidePhotoImg}
          priority
        />
      </div>
      {/* 프로필 상세 — 학력·경력·… dl + 외부 링크 칩. 항상 펼쳐 노출(이 페이지의 핵심 정보). */}
      {(items.length > 0 || externalLinks.length > 0) && (
        <div className={styles.authorIntro}>
          <div className={styles.profileDetail}>
            {items.length > 0 && (
              <dl className={styles.profileDl}>
                {items.map((it) => (
                  <div className={styles.profileRow} key={it.title}>
                    <dt>{it.title}</dt>
                    <dd>
                      {it.values.map((v, idx) => (
                        <span key={`${it.title}-${idx}`}>{v}</span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {externalLinks.length > 0 && (
              <div className={styles.profileLinks}>
                {externalLinks.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
