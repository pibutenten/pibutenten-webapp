"use client";

import { useSession } from "@/lib/session-context";

/**
 * 홈 상단 브랜드 소개 글상자 — 비로그인 방문자(+ 검색 크롤러)에게만 노출.
 *
 * 목적:
 *  1) SEO — 홈에 "눈에 보이는" 브랜드 소개 텍스트(구글 스니펫 유도, "피부텐텐" 검색 설명 개선).
 *  2) 신규 방문객에게 "여기가 뭐 하는 곳인지" + 앱 설치 유도(클릭 시 /app 다운로드 페이지).
 *
 * 스타일(2026-07-11 원장 요청): 투데이 그라데이션 글상자(.greetCard)와 동일 배경 + 흰 글씨.
 *  - 위 2줄(브랜드 소개·기능 요약) 굵게(700). 3줄째(브랜드 태그라인)는 2줄과 같은 크기(13px)·
 *    보통 굵기·약한 흰색으로 위계만 낮춤.
 *  - 글상자 전체가 /app(앱 다운로드) 링크. 글자색은 인라인 style 로 지정(무계층 `:where(.root) a{
 *    color:inherit}` reset 이 클래스는 이기지만 인라인은 못 이김 — 흰 글씨 보존).
 *
 * 노출 규칙:
 *  - 로그인 회원(session !== null) → 숨김(앱 피드 깔끔 유지).
 *  - 비로그인/크롤러 → 노출(SSR 첫 렌더 session=null 이라 HTML 포함, 크롤러가 확실히 봄).
 */
export default function HomeBrandIntro() {
  const session = useSession();
  if (session) return null;

  return (
    <a
      href="/app"
      aria-label="피부텐텐 앱 다운로드 — 피부과 전문의가 함께하는 피부 시술 커뮤니티"
      style={{
        display: "block",
        textDecoration: "none",
        // 투데이 그라데이션 글상자(.greetCard)와 동일 배경.
        background: "linear-gradient(135deg, #1e9fe0 0%, #5ed0ff 60%, #8fe0ff 100%)",
        borderRadius: "var(--radius)",
        padding: "16px 18px",
        marginBottom: "16px",
        color: "#fff",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "16.5px",
          fontWeight: 700,
          color: "#fff",
          lineHeight: 1.5,
          // 줄바꿈 시 한글 단어 단위로(어절 유지) — '커뮤니티'가 '커뮤/니티'로 쪼개지지 않게.
          wordBreak: "keep-all",
        }}
      >
        피부과 전문의가 함께하는 피부 시술 커뮤니티
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: "14px",
          fontWeight: 700,
          lineHeight: 1.6,
          color: "#fff",
        }}
      >
        오늘의 피부 날씨 · 나의 피부 다이어리 · 시술 후기
      </p>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: "14px",
          fontWeight: 400,
          lineHeight: 1.5,
          color: "rgba(255, 255, 255, 0.85)",
        }}
      >
        피부텐텐 | 피부가 예뻐지는 모든 이야기
      </p>
    </a>
  );
}
