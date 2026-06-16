"use client";

/**
 * DoctorProfileView — /doctors/[slug] "원장 공개 프로필" 본문 (클라이언트).
 *
 * 원칙(앱 셸 승격, 2026-06-15): 선례 DoctorDashboardView·ProfileView 와 동일하게
 *   "상단바(헤더)만 앱 셸, 본문은 기존 운영 정보 구조를 최대한 유지". 큰 .card 박스에 욱여넣지 않는다.
 *   - 운영 page.tsx 의 본문(원장 hero · 프로필 학력/경력/전문분야/학회 · 답변 피드)을
 *     앱 톤(.card / .skinSection / .t 등 기존 클래스)로 자연스럽게 정리(재포장 X, 정보 구조 보존).
 *   - 데이터 fetch · 권한 · generateMetadata · JSON-LD 는 전부 서버 page.tsx 가 책임(여기는 표시만).
 *   - 셸은 active="마이"(미강조 톤) · back="/doctors"(공개 전문의 목록으로 복귀).
 *
 * 레이아웃(2026-06-15 재구성): AppShell 2단 레이아웃 사용 —
 *   - 메인(좌, 넓게): 원장 hero(이름·병원·사진) + "답변 N편" 헤더 + 단일열 PostCard 피드(홈과 동일 톤).
 *   - 사이드바(우): 프로필 정보(학력·경력·전문분야·자격·학회·학회활동·출판·외부 링크). 운영 단독 URL
 *     의 우측 프로필 사이드바 형식과 동일한 느낌. dl 은 사이드 폭에 맞춰 단일 컬럼.
 *   - 데스크탑은 2단, 모바일은 셸이 자동 1단(sidebarMobileBelow → 프로필을 피드 아래로 노출,
 *     프로필 정보 누락 방지). H1(원장명)은 메인 hero 모바일 분기에 유지 → SEO 영향 없음.
 *
 * 격리: app.module.css 무수정. 앱 기존 클래스 재사용 + 부분 인라인 style 만.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { CardData } from "@/components/Card";
import { CARD_BUS_EVENTS } from "@/components/card/hooks/useCardBus";
import { orcidUrl, type DoctorProfileData } from "@/lib/doctor-profile";
import type { DoctorTheme } from "@/lib/doctor-theme";
import type { ViewerState } from "@/components/skin/ui";
import {
  cardHref,
  IconVerified,
  PostCard,
  useSearchRouting,
} from "@/components/skin/ui";
import AppShell from "@/components/skin/AppShell";
import styles from "@/components/skin/app.module.css";

/* 무한스크롤 한 번에 확장할 카드 수 — /api/cards?ids= 한 묶음(라우트 상한 60 이내).
 *   홈 FeedView 와 동일(PAGE=20). */
const PAGE = 20;

export default function DoctorProfileView({
  name,
  intro,
  affiliation,
  photo,
  profile,
  cards,
  orderedIds = [],
  relatedQa = [],
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
  /** 사이드바 "함께 보면 좋은 Q&A" — 이 원장 인기 Q&A 상위 N개(서버 조회). 비면 섹션 숨김. */
  relatedQa?: CardData[];
  count: number | null;
  hotIds: number[];
  viewerStates: Record<number, ViewerState>;
}) {
  const search = useSearchRouting();
  const hotSet = useMemo(() => new Set(hotIds ?? []), [hotIds]);

  // 풀 + 무한스크롤 커서 — 홈 FeedView loadMore 패턴 이식(검색·칩·리포트 없는 단순 무한스크롤).
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

  // 풀 확장 — orderedIds 순서대로 다음 묶음을 ID 로 받아 순서 보존 append (홈 FeedView loadMore 동일).
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

  // sentinel 관찰 — mount 시 1회만 설정(홈 FeedView 동일). loadMore 가 ref 로 최신값 참조.
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

  // 카드 삭제 broadcast 수신 → 풀에서 제거(홈 FeedView 동일). 발사는 카드 ⋮메뉴 쪽.
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

  // 우측 사이드바 — 글 상세(PostDetail) 작성자 사이드바와 동일한 형식:
  //   (a) 원장 카드(메시지 → 이름(H1) → "피부과 전문의" 배지 → 누끼 사진) + 프로필 상세를 "더보기"로 접음.
  //   (b) 그 아래 "함께 보면 좋은 Q&A"(이 원장 인기 Q&A) 섹션.
  //   데스크탑 2단 우측, 모바일은 피드 아래(sidebarMobileBelow).
  //
  // 모바일 순서(2026-06-16): 모바일에선 원장 프로필(소개) 카드를 답변 피드 "위"로 올린다.
  //   셸(AppShell)은 수정 금지 + DOM 순서가 children(답변)→sidebar(프로필)로 고정이므로,
  //   원장 카드(DoctorProfileCard)를 본문(children) 최상단에 "모바일 전용"으로 한 번 더 렌더하고
  //   (데스크탑 ≥900px 에서 .doctorProfileMobile 이 display:none), 사이드바 안의 같은 카드는
  //   모바일에서만 숨긴다(.doctorProfileSideCard, 데스크탑에선 그대로 노출) → 데스크탑 2단 현행 유지,
  //   중복 노출 없음. JSX 중복을 피해 카드 본체는 DoctorProfileCard 한 곳에만 정의해 양쪽이 재사용.
  const profileSidebar = (
    <DoctorProfileSidebar
      name={name}
      intro={intro}
      affiliation={affiliation}
      photo={photo}
      profile={profile}
      relatedQa={relatedQa}
    />
  );

  return (
    <AppShell
      active="마이"
      back="/doctors"
      backTitle={
        // '< 뒤로' 옆 제목 — 좌측 첫 글상자가 우측 원장 카드와 같은 높이에서 시작하도록
        //   메인 상단 헤더 대신 셸 backRow 로 올린다. H1 은 사이드바 원장명 1개 → 여기는 <h2>(중복 방지).
        <h2>
          {name} 원장님의 답변 <b>{count ?? 0}</b>편
        </h2>
      }
      sidebar={profileSidebar}
      sidebarMobileBelow
      {...search}
    >
      {/* 메인(좌) = 답변 피드만 (글 상세 PostDetail 과 같은 형식 — 본문은 메인, 원장 카드는 사이드바).
          원장 사진·이름·병원은 우측 사이드바(원장 카드)로, 답변 헤더는 셸 backTitle 로 이동했다. */}

      {/* 모바일 전용 원장 프로필(소개) 카드 — 답변 피드 "위"에 노출. 데스크탑(≥900px)에선 숨김
          (우측 사이드바의 같은 카드가 노출됨). 카드 본체는 DoctorProfileCard 한 곳에만 정의 → 중복 X.
          H1(원장명)은 사이드바 카드 쪽에만 두고 여기선 headingTag="h2" 로 → 페이지 H1 1개 유지(SEO). */}
      <div className={styles.doctorProfileMobile}>
        <DoctorProfileCard
          name={name}
          intro={intro}
          affiliation={affiliation}
          photo={photo}
          profile={profile}
          headingTag="h2"
        />
      </div>

      {/* Q&A 피드 (해당 원장만) — 홈과 동일한 단일열 PostCard 피드(feedList) + 무한스크롤.
          서버가 내려준 초기 풀(cards)을 PostCard 로 렌더하고, 스크롤 끝(sentinel)에 닿으면
          orderedIds 순서대로 /api/cards?ids= 로 다음 묶음을 이어 받아 append(holes 없이 전체 노출).
          태그 클릭 → 헤더 검색 라우팅(useSearchRouting), HOT 카드 딱지 동기화. */}
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
          {/* 무한스크롤 sentinel — 풀 소진 시 렌더 안 함(홈 FeedView 동일). */}
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
    </AppShell>
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
 * 데스크탑: AppShell 우측 칼럼(.sidebar). 모바일: 셸이 본문(피드) 아래로 노출(sidebarMobileBelow).
 */
function DoctorProfileSidebar({
  name,
  intro,
  affiliation,
  photo,
  profile,
  relatedQa,
}: {
  name: string;
  intro: string | null;
  affiliation: string;
  photo: string;
  profile: DoctorProfileData;
  relatedQa: CardData[];
}) {
  return (
    <>
      {/* 작성자(원장) 카드 — 사이드바판(데스크탑 우측). H1(원장명)은 이 카드에만(페이지 유일 H1).
          모바일에선 이 카드를 .doctorProfileSideCard 로 숨기고, 본문 최상단의 모바일 전용 카드가 대신 노출. */}
      <DoctorProfileCard
        name={name}
        intro={intro}
        affiliation={affiliation}
        photo={photo}
        profile={profile}
        headingTag="h1"
        sideOnly
      />

      {/* 함께 보면 좋은 Q&A — PostDetail 과 동일 섹션(이 원장 인기 Q&A). 데스크탑은 프로필 아래,
          모바일은 .sideQa order 로 프로필보다 위로(셸 sidebarMobileShow 규칙). 비면 숨김. */}
      {relatedQa.length > 0 && (
        <section className={`${styles.card} ${styles.sideCard} ${styles.sideQa}`}>
          <h3>함께 보면 좋은 Q&A</h3>
          <div className={styles.sideList}>
            {relatedQa.map((c) => (
              // 운영 canonical(/doctors/{slug}/{year}/{post-slug}) 로 — 이 페이지 PostCard 클릭 동선과 통일.
              <a href={cardHref(c)} key={c.id}>
                <span className={styles.n}>Q</span>
                <span>{c.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * 원장 카드 본체(메시지 → 이름 → 배지 → 누끼 사진 → 더보기 프로필 상세 → 외부 링크).
 *
 * 사이드바(데스크탑 우측)와 본문 최상단(모바일 전용) 두 곳에서 재사용 — JSX 중복 방지.
 *   - headingTag: 원장명 heading 레벨. 사이드바판은 "h1"(페이지 유일 H1), 모바일 본문판은 "h2"(중복 H1 방지).
 *   - sideOnly: true 면 .doctorProfileSideCard(모바일 숨김, 데스크탑 노출). 본문 모바일판은 false
 *     + 외부 래퍼(.doctorProfileMobile)가 데스크탑 숨김을 담당.
 */
function DoctorProfileCard({
  name,
  intro,
  affiliation,
  photo,
  profile,
  headingTag,
  sideOnly = false,
}: {
  name: string;
  intro: string | null;
  affiliation: string;
  photo: string;
  profile: DoctorProfileData;
  headingTag: "h1" | "h2";
  sideOnly?: boolean;
}) {
  // 프로필 상세 — PostDetail 과 동일하게 "더보기"로 접음. 기본 닫힘.
  const [profileOpen, setProfileOpen] = useState(false);

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

  // 더보기로 펼칠 확장 프로필이 실제로 있는지(빈 더보기 방지) — PostDetail 의 hasProfileDetail 정합.
  const hasProfileDetail = items.length > 0 || externalLinks.length > 0;

  // 원장명 heading — 사이드바판은 h1(페이지 유일 H1), 모바일 본문판은 h2(중복 H1 방지).
  const NameHeading = headingTag;

  return (
    <section
      className={`${styles.card} ${styles.authorSide} ${
        sideOnly ? styles.doctorProfileSideCard : ""
      } ${hasProfileDetail ? styles.authorSideClickable : ""}`}
      onClick={hasProfileDetail ? () => setProfileOpen((v) => !v) : undefined}
      role={hasProfileDetail ? "button" : undefined}
      tabIndex={hasProfileDetail ? 0 : undefined}
      aria-expanded={hasProfileDetail ? profileOpen : undefined}
      onKeyDown={
        hasProfileDetail
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setProfileOpen((v) => !v);
              }
            }
          : undefined
      }
    >
      {/* 한줄 메시지(intro) — 맨 위. 접힘 상태에서도 항상 노출. (운영 doctors.intro) */}
      {intro && <p className={styles.authorMessage}>{intro}</p>}
      {/* 이름 — 토글과 무관하게 항상 노출(접힘 영역 밖). 사이드바판 h1 = 페이지 유일 H1. */}
      <NameHeading className={`${styles.authorName} ${styles.authorSideName}`}>
        {name}
      </NameHeading>
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
      {/* 펼침 — 확장 프로필(소속·학력·경력·자격·학회·… dl + 외부 링크 칩). 링크 클릭은 토글과 충돌 방지(stopPropagation). */}
      {profileOpen && hasProfileDetail && (
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
                    onClick={(e) => e.stopPropagation()}
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* 더보기/접기 — 본문 더보기와 같은 미니멀 톤(.moreToggle). 실제 토글은 카드 전체 클릭. */}
      {hasProfileDetail && (
        <span className={styles.moreToggle}>
          {profileOpen ? "접기" : "더보기"}
        </span>
      )}
    </section>
  );
}
