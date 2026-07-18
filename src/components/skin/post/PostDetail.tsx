"use client";

/**
 * PostDetail — app skin post "글 상세".
 *
 * 정합성(누더기 금지): 본문(작성자·제목·본문·태그·좋아요/댓글·전체 댓글)은 피드의 PostCard 를
 *   forceExpanded 로 그대로 재사용한다. 글상세 전용 본문 컴포넌트/스타일(.articleBody 등)을
 *   따로 만들지 않으므로 피드 카드를 펼친 모습과 100% 동일하다.
 * 글상세 고유 영역은 사이드바(작성자 프로필 카드 + 함께 보면 좋은 Q&A)뿐이다.
 */

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import CardAvatar from "@/components/card/CardAvatar";
import { getDoctorPhoto } from "@/lib/doctor-theme";
import { orcidUrl, type DoctorProfileData } from "@/lib/doctor-profile";
import type { CardData } from "@/lib/types/card";
import AppShell from "../AppShell";
import styles from "../app.module.css";
import {
  IconVerified,
  cardHref,
  PostCard,
  useSearchRouting,
  type ViewerState,
} from "../ui";

export default function PostDetail({
  card,
  related = [],
  viewer,
  doctorIntro = null,
  doctorProfile = null,
  doctorAffiliation = null,
}: {
  card: CardData | null;
  related?: CardData[];
  viewer?: ViewerState;
  /** 작성자(원장) 한줄 메시지 — 사이드 프로필 카드에 항상 노출(운영 doctors.intro). 회원이면 null. */
  doctorIntro?: string | null;
  /** 작성자(원장) 확장 프로필(학력·경력·학회·링크) — "더보기" 펼침 내용(운영 doctors.profile_data). 회원이면 null. */
  doctorProfile?: DoctorProfileData | null;
  /** 작성자(원장) 소속(병원 + 지점) — 더보기 프로필 상세 맨 위 "소속" 행. 회원이면 null. */
  doctorAffiliation?: string | null;
}) {
  const search = useSearchRouting();
  const router = useRouter();
  // 사이드 작성자 프로필 — 접힘 기본, 카드 아무 곳이나 클릭하면 더보기 토글.
  const [profileOpen, setProfileOpen] = useState(false);

  const authorName =
    card?.doctor?.name ?? card?.author?.display_name ?? "회원";
  const isDoctor = card ? !!card.doctor && !card.hide_doctor_credential : false;
  const avatarUrl = card?.author?.avatar_url ?? null;
  // 누끼딴 원장 사진(의사일 때만, 운영 프로필과 동일한 /doctors/{slug}.png). 회원은 동그라미 아바타.
  const doctorPhoto =
    isDoctor && card?.doctor?.slug ? getDoctorPhoto(card.doctor.slug) : null;
  // "더보기" 펼침에 표시할 확장 프로필이 실제로 있는지(운영 DoctorProfileSection 과 같은 항목 기준).
  const hasProfileDetail = !!doctorProfile && profileHasContent(doctorProfile);

  // 함께 보면 좋은 Q&A — 이동 가능한 항목만(cardHref 가 fallback "/" 가 아닌 것).
  //   PostCard 제목 링크의 hasHref 가드와 같은 정책으로, 클릭해도 못 가는 항목을 미리 거른다.
  const relatedLinks = related
    .map((c) => ({ id: c.id, title: c.title, href: cardHref(c) }))
    .filter((c) => c.href !== "/");

  const sidebar = card ? (
    <>
      {/* 작성자 카드 — 프로필 아무 곳이나 클릭하면 더보기 토글(미니멀). 누끼 사진+이름+전문의+한줄 메시지. */}
      <section
        className={`${styles.card} ${styles.authorSide} ${
          hasProfileDetail ? styles.authorSideClickable : ""
        }`}
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
        {/* 운영 프로필 순서: 메시지(맨 위) → 이름 → 피부과 전문의 → 사진(아래). */}
        {/* 한줄 메시지(intro) — 맨 위. 접힘 상태에서도 항상 노출. */}
        {doctorIntro && <p className={styles.authorMessage}>{doctorIntro}</p>}
        <div className={`${styles.authorName} ${styles.authorSideName}`}>
          {authorName}
        </div>
        <div className={styles.authorSub}>
          {isDoctor ? (
            <span className={styles.verified}>
              <IconVerified />
              피부과 전문의
            </span>
          ) : (
            "회원"
          )}
        </div>
        {doctorPhoto ? (
          <div className={styles.authorSidePhoto}>
            <Image
              src={doctorPhoto}
              alt={`${authorName} 원장님`}
              fill
              sizes="300px"
              className={styles.authorSidePhotoImg}
            />
          </div>
        ) : (
          <div className={styles.authorSideAvatarWrap}>
            <CardAvatar
              doctorSlug={card.doctor?.slug}
              memberAvatarUrl={avatarUrl}
              name={authorName}
              size={68}
            />
          </div>
        )}
        {/* 펼침 — 확장 프로필(학력·경력·학회·외부 링크). 상단 구분선은 .authorIntro 보더. */}
        {profileOpen && hasProfileDetail && (
          <div className={styles.authorIntro}>
            <DoctorProfileDetail
              profile={doctorProfile!}
              affiliation={doctorAffiliation}
            />
          </div>
        )}
        {/* 더보기/접기 — 본문 더보기와 같은 미니멀 톤(.moreToggle). 실제 토글은 카드 전체 클릭. */}
        {hasProfileDetail && (
          <span className={styles.moreToggle}>
            {profileOpen ? "접기" : "더보기"}
          </span>
        )}
      </section>

      {/* 함께 보면 좋은 Q&A — 데스크탑은 프로필 아래, 모바일은 .sideQa order 로 프로필보다 위로.
          이동 가능한 항목만(cardHref !== "/") 노출 — PostCard 제목 링크의 hasHref 가드와 동일 정책. */}
      {relatedLinks.length > 0 && (
        <section className={`${styles.card} ${styles.sideCard} ${styles.sideQa}`}>
          <h3>함께 보면 좋은 Q&A</h3>
          <div className={styles.sideList}>
            {relatedLinks.map((c) => (
              <a href={c.href} key={c.id}>
                <span className={styles.n}>Q</span>
                <span>{c.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  ) : null;

  return (
    <AppShell
      active="피드"
      sidebar={sidebar}
      sidebarMobileBelow
      /* 2뎁스 헤더 variant(R2-3) — 구 back="/" 에서 전환: 모바일은 헤더 좌측 로고 자리 뒤로가기,
         데스크탑은 본문 뒤로 행(.backRowDesktop). fallback=피드(뒤로가기 시 피드 복원 스냅샷 동선). */
      backHeader={{ fallbackHref: "/" }}
      {...search}
    >
      {card ? (
        // 본문 = 피드와 동일한 PostCard(forceExpanded): 항상 펼침 + 댓글 전체+입력.
        //   태그 클릭은 피드와 동일하게 app skin 검색 로, 삭제 시 목록으로 이동.
        <PostCard
          card={card}
          forceExpanded
          viewer={viewer}
          onTagClick={(t) => search.onSearchSubmit?.(t)}
          onDeleted={() => router.push("/")}
        />
      ) : (
        <div className={styles.card}>
          <p className={styles.empty}>글을 찾을 수 없어요.</p>
        </div>
      )}
    </AppShell>
  );
}

/* ---------- 원장 확장 프로필 항목 구성 (운영 DoctorProfileSection 과 동일 로직) ----------
 * profile_data 중 채워진 항목만, 운영과 같은 순서/라벨로 행(rows)·링크(links)를 만든다.
 * 데이터 매핑(필드→라벨·orcidUrl 변환)은 운영과 100% 동일하고, 시각만 앱 톤(아래 CSS). */
function buildProfileRows(p: DoctorProfileData) {
  const rows: { title: string; values: string[] }[] = [];
  if (p.education?.length) rows.push({ title: "학력", values: p.education });
  if (p.career?.length) rows.push({ title: "경력", values: p.career });
  if (p.expertise?.length)
    rows.push({ title: "전문 분야", values: p.expertise });
  // 자격(전문의 취득연도) 행은 노출하지 않음 — 이름 옆 "피부과 전문의" 배지로 충분(중복 제거).
  if (p.memberOf?.length) rows.push({ title: "학회", values: p.memberOf });
  if (p.societyRoles?.length)
    rows.push({ title: "학회 활동", values: p.societyRoles });
  if (p.publications?.length)
    rows.push({ title: "출판·저서", values: p.publications });
  return rows;
}
function buildProfileLinks(p: DoctorProfileData) {
  const links: { label: string; url: string }[] = [];
  if (p.clinicUrl) links.push({ label: "병원 홈페이지", url: p.clinicUrl });
  if (p.instagram) links.push({ label: "병원 인스타그램", url: p.instagram });
  if (p.threads) links.push({ label: "스레드", url: p.threads });
  if (p.youtube) links.push({ label: "YouTube", url: p.youtube });
  if (p.blog) links.push({ label: "블로그", url: p.blog });
  const orcid = orcidUrl(p);
  if (orcid) links.push({ label: "ORCID", url: orcid });
  if (p.googleScholarUrl)
    links.push({ label: "Google Scholar", url: p.googleScholarUrl });
  return links;
}
/** "더보기"에 보여줄 확장 프로필이 실제로 하나라도 있는지(빈 더보기 방지). */
function profileHasContent(p: DoctorProfileData): boolean {
  return buildProfileRows(p).length > 0 || buildProfileLinks(p).length > 0;
}

/**
 * DoctorProfileDetail — 우측 작성자 카드 "더보기" 펼침 내용.
 * 운영 프로필 페이지의 학력·경력·학회·외부 링크와 동일한 항목/순서를 앱 사이드 톤으로 렌더.
 * (링크 클릭은 카드 전체 토글과 충돌하지 않게 stopPropagation.)
 */
function DoctorProfileDetail({
  profile,
  affiliation = null,
}: {
  profile: DoctorProfileData;
  affiliation?: string | null;
}) {
  // 소속(병원 + 지점)을 맨 위 "소속" 행으로 추가(학력 위).
  const rows = affiliation
    ? [{ title: "소속", values: [affiliation] }, ...buildProfileRows(profile)]
    : buildProfileRows(profile);
  const links = buildProfileLinks(profile);
  return (
    <div className={styles.profileDetail}>
      {rows.length > 0 && (
        <dl className={styles.profileDl}>
          {rows.map((r) => (
            <div className={styles.profileRow} key={r.title}>
              <dt>{r.title}</dt>
              <dd>
                {r.values.map((v, i) => (
                  <span key={`${r.title}-${i}`}>{v}</span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {links.length > 0 && (
        <div className={styles.profileLinks}>
          {links.map((l) => (
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
  );
}
