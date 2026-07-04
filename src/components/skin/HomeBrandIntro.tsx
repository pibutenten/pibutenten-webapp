"use client";

import { useSession } from "@/lib/session-context";

/**
 * 홈 상단 브랜드 소개 띠 — 비로그인 방문자(+ 검색 크롤러)에게만 노출.
 *
 * 목적:
 *  1) SEO — 홈에 "눈에 보이는" 브랜드 소개 텍스트가 없어(sr-only h1 만) 구글이 시술 카드
 *     본문을 스니펫으로 발췌하던 것을, 브랜드 소개문으로 유도. "피부텐텐" 검색 결과 설명 개선.
 *  2) 신규 방문객에게 "여기가 뭐 하는 곳인지" 1줄 안내.
 *
 * 문구는 앱스토어 등록 포지셔닝과 일치(docs/plans/store-listing.md §2):
 *   피부 날씨 → 피부 다이어리 → 피부과 전문의 Q&A → 시술 후기.
 *
 * 노출 규칙:
 *  - 로그인 회원(session !== null) → 숨김. 앱 피드 깔끔 유지.
 *  - 비로그인/크롤러 → 노출. 고정(sticky) 아님 → 스크롤 내리면 위로 사라짐(일반 흐름).
 *  - SSR/첫 렌더는 session=null 이라 HTML 에 포함(크롤러가 확실히 봄). 로그인 사용자는
 *    마운트 후 쿠키 확인되면 숨김(짧은 표시 후 사라짐 — 앱 UX 영향 미미).
 */
export default function HomeBrandIntro() {
  const session = useSession();
  if (session) return null;

  return (
    <section
      aria-label="피부텐텐 소개"
      style={{
        background: "var(--primary-soft)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "14px 16px",
        marginBottom: "16px",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--text)",
          lineHeight: 1.5,
        }}
      >
        피부과 전문의가 함께하는 피부 시술 커뮤니티
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: "13px",
          lineHeight: 1.6,
          color: "var(--text-secondary)",
        }}
      >
        오늘의 피부 날씨 · 나의 피부 다이어리 · 시술 후기
      </p>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: "12px",
          lineHeight: 1.5,
          color: "var(--text-muted)",
        }}
      >
        피부텐텐 | 피부가 예뻐지는 모든 이야기
      </p>
    </section>
  );
}
