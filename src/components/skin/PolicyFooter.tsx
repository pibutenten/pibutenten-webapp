import Link from "next/link";
import { FOOTER_ITEMS } from "@/lib/policy-nav";

/**
 * PolicyFooter — 앱 셸 페이지 내부에 두는 신뢰·법적 길목(SNS 표준 in-page 푸터).
 *
 * 배경: 앱 셸 전환으로 전역 SiteFooter 가 앱 셸 라우트에서 렌더되지 않게 되면서
 *   /about·/terms·/privacy 등으로 가는 길목이 사라졌다(사용자 보고). 상단 네비에 박지 않고
 *   "마이" 류 페이지 하단에 두는 것이 원칙 → 본 컴포넌트를 마이 화면들 최하단에 임베드한다.
 *
 * 내용·순서: 운영 SiteFooter 와 1:1(SSOT = FOOTER_ITEMS). 다만 앱 셸 디자인 시스템 안에
 *   살므로 운영 글로벌 토큰(--border/--text-muted…) 대신 앱 토큰(--ink-500/--line/--tt-blue-deep)을
 *   인라인으로 사용한다. CSS 모듈(app.module.css)은 수정 금지 대상이라 전용 클래스를 만들지 않는다.
 */

const LINK_STYLE: React.CSSProperties = {
  color: "var(--ink-500)",
  textDecoration: "none",
  fontSize: 12.5,
  lineHeight: 1.9,
};

export default function PolicyFooter() {
  return (
    <footer
      style={{
        marginTop: 20,
        padding: "18px 16px 28px",
        borderTop: "1px solid var(--line)",
        color: "var(--ink-500)",
      }}
    >
      <p style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>
        피부텐텐 · 피부과 전문의가 직접 답하는 리프팅 · 스킨부스터 · 안티에이징 · 피부시술 커뮤니티 · 주식회사
        진솔컴퍼니
      </p>

      <nav
        aria-label="사이트 정책"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 14px",
          marginBottom: 12,
        }}
      >
        <Link href="/doctors" style={LINK_STYLE}>
          전문의
        </Link>
        {FOOTER_ITEMS.map((item) => (
          <Link key={item.key} href={item.href} style={LINK_STYLE}>
            {item.label}
          </Link>
        ))}
      </nav>

      <p style={{ fontSize: 11.5, lineHeight: 1.7, marginBottom: 10 }}>
        본 콘텐츠는 일반적인 의학 정보 제공을 목적으로 하며, 개별 진단·치료를 대체하지 않습니다. 증상이 있으면 의료진과
        상담하세요.{" "}
        <Link href="/disclaimer" style={{ ...LINK_STYLE, color: "var(--tt-blue-deep)" }}>
          자세히 보기
        </Link>
      </p>

      <p style={{ fontSize: 11.5, lineHeight: 1.7 }}>
        문의:{" "}
        <a href="mailto:pibutenten@gmail.com" style={{ ...LINK_STYLE, color: "var(--tt-blue-deep)" }}>
          pibutenten@gmail.com
        </a>{" "}
        · 신고는{" "}
        <Link href="/report" style={{ ...LINK_STYLE, color: "var(--tt-blue-deep)" }}>
          콘텐츠 신고
        </Link>
      </p>
    </footer>
  );
}
