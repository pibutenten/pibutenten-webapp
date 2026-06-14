"use client";

/**
 * DoctorsListView — /doctors "피부과 전문의 목록" 본문 (클라이언트).
 *
 * 원칙(베타 승격, 2026-06-15): 선례 DoctorProfileView·DoctorDashboardView 와 동일하게
 *   "상단바(헤더)만 베타 셸, 본문은 기존 운영 정보 구조를 최대한 유지". 큰 .card 박스에 욱여넣지 않는다.
 *   - 운영 page.tsx 의 본문(헤더 타이틀 + 의사 카드 그리드(사진 위 원장 컬러 그라데이션·이름·title))을
 *     베타 톤으로 자연스럽게 정리(재포장 X, 정보 구조 보존). 그리드 컬럼·호버·그라데이션 운영과 동일.
 *   - 데이터 fetch · generateMetadata · JSON-LD 는 전부 서버 page.tsx 가 책임(여기는 표시만).
 *   - 셸은 active="마이"(미강조 톤) · back="/"(홈으로 복귀). wide 미사용(기본 좁은 중앙 정렬).
 *
 * 격리: beta-skin.module.css 무수정. 기존 운영 Tailwind 유틸·var(--*) 토큰 그대로 + 인라인 style.
 */

import Image from "next/image";
import Link from "next/link";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import BetaSkinShell from "../beta-skin/BetaSkinShell";
import { useBetaSearchRouting } from "../beta-skin/beta-ui";

export type DoctorListItem = {
  id: string;
  slug: string;
  name: string;
  title: string;
  photo_url: string | null;
  sort_order: number;
};

export default function DoctorsListView({
  doctors,
}: {
  doctors: DoctorListItem[];
}) {
  const search = useBetaSearchRouting();

  return (
    <BetaSkinShell active="마이" back="/" {...search}>
      {/* 헤더 타이틀 — 운영과 동일 정보(H1 + 보조 문장). 가운데 정렬 유지. */}
      <header className="mb-5 text-center">
        <h1 className="text-2xl font-bold text-[var(--text)]">피부과 전문의</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          피부텐텐의 피부과 전문의들이 직접 답합니다.
        </p>
      </header>

      {/* 의사 카드 그리드 — 운영 page.tsx 와 동일한 컬럼·호버·그라데이션·objectPosition 보존. */}
      <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4 min-[900px]:gap-4">
        {doctors.map((d) => {
          const theme = getDoctorTheme(d.slug);
          const photo = d.photo_url || getDoctorPhoto(d.slug);

          return (
            <Link
              key={d.id}
              href={`/doctors/${d.slug}`}
              aria-label={`${d.name} 원장님 소개로 이동`}
              // 마우스 호버 시 살짝 음영(그림자 + 살짝 위로). 기본 상태는 그림자 X.
              className="block overflow-hidden rounded-[var(--radius)] bg-white shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.08)]"
            >
              <div
                // 프로필 사진 뒤 원장 컬러 그라데이션(위는 진하게, 아래로 white 페이드).
                className="relative aspect-square w-full overflow-hidden"
                style={{
                  background: `linear-gradient(180deg, ${theme.bg}66 0%, ${theme.bg}33 45%, #ffffff 100%)`,
                }}
              >
                <Image
                  src={photo}
                  alt={`${d.name} 원장님`}
                  fill
                  sizes="(max-width: 900px) 50vw, 360px"
                  className="object-cover"
                  style={{
                    objectPosition: "50% 10%",
                    transform: `translate(${theme.offsetX ?? 0}px, ${theme.offsetY ?? 0}px)`,
                  }}
                  priority={d.sort_order <= 20}
                />
              </div>

              <div className="px-3 py-3 text-center">
                <h2 className="text-base font-bold text-[var(--text)]">
                  {d.name}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {d.title}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </BetaSkinShell>
  );
}
