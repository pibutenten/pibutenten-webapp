"use client";

/**
 * DoctorProfileView — /doctors/[slug] "원장 공개 프로필" 본문 (클라이언트).
 *
 * 원칙(베타 승격, 2026-06-15): 선례 DoctorDashboardView·BetaProfileView 와 동일하게
 *   "상단바(헤더)만 베타 셸, 본문은 기존 운영 정보 구조를 최대한 유지". 큰 .card 박스에 욱여넣지 않는다.
 *   - 운영 page.tsx 의 본문(원장 hero · 프로필 학력/경력/전문분야/학회 · 답변 피드)을
 *     베타 톤(.card / .skinSection / .t 등 기존 클래스)로 자연스럽게 정리(재포장 X, 정보 구조 보존).
 *   - 데이터 fetch · 권한 · generateMetadata · JSON-LD 는 전부 서버 page.tsx 가 책임(여기는 표시만).
 *   - 셸은 active="마이"(미강조 톤) · back="/doctors"(공개 전문의 목록으로 복귀). wide 미사용(기본 좁은 중앙 정렬).
 *
 * 격리: beta-skin.module.css 무수정. 베타 기존 클래스 재사용 + 부분 인라인 style 만.
 */

import Image from "next/image";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { orcidUrl, type DoctorProfileData } from "@/lib/doctor-profile";
import type { DoctorTheme } from "@/lib/doctor-theme";
import type { BetaViewerState } from "../../beta-skin/beta-ui";
import { useBetaSearchRouting } from "../../beta-skin/beta-ui";
import BetaSkinShell from "../../beta-skin/BetaSkinShell";
import styles from "../../beta-skin/beta-skin.module.css";

const PAGE_SIZE = 20;

export default function DoctorProfileView({
  slug,
  name,
  intro,
  affiliation,
  photo,
  theme,
  profile,
  cards,
  count,
  hotIds,
  viewerStates,
}: {
  slug: string;
  name: string;
  intro: string | null;
  affiliation: string;
  photo: string;
  theme: DoctorTheme;
  profile: DoctorProfileData;
  cards: CardData[];
  count: number | null;
  hotIds: number[];
  viewerStates: Record<number, BetaViewerState>;
}) {
  const search = useBetaSearchRouting();

  return (
    <BetaSkinShell active="마이" back="/doctors" {...search}>
      {/* 원장 hero — 운영과 동일한 정보(인트로 인용 · 이름(H1) · 소속 · 누끼 사진).
          베타 톤: 은은한 원장 컬러 그라데이션을 .card 안에 담아 헤더 박스로 통일. */}
      <section
        className={`${styles.card} ${styles.mb20}`}
        style={{
          overflow: "hidden",
          background: `
            radial-gradient(ellipse at 0% 0%, ${theme.bg}30 0%, transparent 55%),
            radial-gradient(ellipse at 100% 100%, ${theme.bg}1a 0%, transparent 60%),
            linear-gradient(180deg, ${theme.bg}10 0%, #ffffff 100%)
          `,
        }}
      >
        {/* 모바일 — 인트로 인용(곡선 따옴표) · 이름/소속 · 사진 정중앙 (운영 모바일 레이아웃 정합) */}
        <div className="flex flex-col sm:hidden">
          {intro && (
            <p className="whitespace-pre-line text-center text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              {`\u201C${intro}\u201D`}
            </p>
          )}
          <div className="mt-5 text-center">
            <h1 className={styles.profileName} style={{ fontSize: 24 }}>
              {name}
            </h1>
            <p className={styles.profileSub} style={{ marginTop: 4 }}>
              {affiliation}
            </p>
          </div>
          <div className="relative mx-auto mt-3 h-[360px] w-[220px]">
            <Image
              src={photo}
              alt={`${name} 원장님`}
              fill
              sizes="220px"
              className="object-contain object-bottom"
              priority
            />
          </div>
        </div>

        {/* 데스크탑 — 좌(인트로 · 이름 · 소속) / 우(누끼 사진) 2단 (운영 데스크탑 레이아웃 정합).
            H1 은 모바일에만 두고(중복 방지) 데스크탑은 시각 표시만(div, aria-hidden). */}
        <div className="hidden items-end gap-3 sm:flex">
          <div className="flex flex-1 flex-col self-stretch pb-2 pt-6">
            {intro && (
              <p className="whitespace-pre-line text-[16px] leading-[1.7] text-[var(--text-secondary)]">
                {intro}
              </p>
            )}
            <div className="mt-auto pt-5">
              <div aria-hidden="true" className={styles.profileName} style={{ fontSize: 28 }}>
                {name}
              </div>
              <p className={styles.profileSub} style={{ marginTop: 4 }}>
                {affiliation}
              </p>
            </div>
          </div>
          <div className="relative h-[430px] w-[260px] shrink-0">
            <Image
              src={photo}
              alt={`${name} 원장님`}
              fill
              sizes="260px"
              className="object-contain object-bottom"
              priority
            />
          </div>
        </div>
      </section>

      {/* 프로필 강화 섹션 — profile_data 에 입력된 항목만 노출 (E-E-A-T 신뢰 신호).
          본인/외부인 분기 없음 — 모두 동일 공개 프로필. */}
      <DoctorProfileSection profile={profile} />

      {/* Q&A 헤더 — "답변 N편" (베타 sectionHead 톤) */}
      <div className={styles.sectionHead}>
        <h2>
          {name} 원장님의 답변{" "}
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-300)" }}>
            {count ?? 0}편
          </span>
        </h2>
      </div>

      {/* Q&A 피드 (해당 원장만) — 운영 Feed 컴포넌트 재사용. */}
      {!cards || cards.length === 0 ? (
        <div className={styles.card} style={{ textAlign: "center" }}>
          <p className={styles.muted}>아직 등록된 Q&amp;A가 없어요.</p>
        </div>
      ) : (
        <Feed
          initial={cards}
          pageSize={PAGE_SIZE}
          doctorSlug={slug}
          hotIds={hotIds}
          viewerStates={viewerStates}
          key={slug}
        />
      )}
    </BetaSkinShell>
  );
}

/**
 * 의사 프로필 확장 섹션 — `profile_data` JSONB에 입력된 항목만 노출.
 * 학력·경력·전문분야·학회·외부채널을 표시 → E-E-A-T 신뢰 신호 + AEO 인용 친화.
 * (운영 page.tsx 의 DoctorProfileSection 정보 구조 그대로 — 베타 .card/.skinSection 톤으로만 재배치)
 */
function DoctorProfileSection({ profile }: { profile: DoctorProfileData }) {
  // 좌측: 학력 → 경력 → 전문 분야 → 자격 (이력서 상단 흐름)
  const leftItems: { title: string; values: string[] }[] = [];
  if (profile.education && profile.education.length > 0)
    leftItems.push({ title: "학력", values: profile.education });
  if (profile.career && profile.career.length > 0)
    leftItems.push({ title: "경력", values: profile.career });
  if (profile.expertise && profile.expertise.length > 0)
    leftItems.push({ title: "전문 분야", values: profile.expertise });
  if (profile.boardCertifiedYear)
    leftItems.push({
      title: "자격",
      values: [`${profile.boardCertifiedYear}년 전문의 취득`],
    });

  // 우측: 학회 → 학회 활동 → 출판·저서 (소속/저작 신호)
  const rightItems: { title: string; values: string[] }[] = [];
  if (profile.memberOf && profile.memberOf.length > 0)
    rightItems.push({ title: "학회", values: profile.memberOf });
  if (profile.societyRoles && profile.societyRoles.length > 0)
    rightItems.push({ title: "학회 활동", values: profile.societyRoles });
  if (profile.publications && profile.publications.length > 0)
    rightItems.push({ title: "출판·저서", values: profile.publications });

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

  if (
    leftItems.length === 0 &&
    rightItems.length === 0 &&
    externalLinks.length === 0
  )
    return null;

  return (
    <section className={`${styles.card} ${styles.mb20}`}>
      <h2 className={styles.skinTitle} style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>
        프로필
      </h2>
      {/* 모바일: 위→아래 단일 흐름 / 데스크탑: 좌·우 2컬럼 분할 */}
      <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {leftItems.length > 0 && <ProfileDl items={leftItems} />}
        {rightItems.length > 0 && (
          <ProfileDl items={rightItems} className="mt-2.5 sm:mt-0" />
        )}
      </div>
      {externalLinks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
          {externalLinks.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.t}
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileDl({
  items,
  className,
}: {
  items: { title: string; values: string[] }[];
  className?: string;
}) {
  return (
    <dl className={`space-y-2.5 ${className ?? ""}`}>
      {items.map((it) => (
        <div
          key={it.title}
          className="grid grid-cols-[52px_1fr] items-baseline gap-3 text-[13.5px] sm:grid-cols-[64px_1fr]"
        >
          <dt className="font-medium text-[var(--ink-500)]">{it.title}</dt>
          <dd className="text-[var(--ink-700,var(--text-secondary))]">
            {it.values.map((v, idx) => (
              <span key={`${it.title}-${idx}`} className="block leading-[1.7]">
                {v}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
