import Link from "next/link";

/**
 * 안내 페이지 본문 하단에 노출되는 사업자 정보 + 문의 (2026-05-22, 2026-05-28 갱신).
 *
 * SiteFooter 와 별개 — 안내 페이지에서는 본문 한참 읽고 내려온 사용자 위해
 * 회사 정보 + 문의처 + 신고 링크를 한 번 더 명시.
 *
 * 2026-05-28: 사업자등록번호 261-86-01781 (운영자 [확정정보]) + 주소·전화 추가.
 *   기존 110-86-12345 는 플레이스홀더였음.
 */

export default function InfoPageFooter() {
  return (
    <div className="mt-8 border-t border-[var(--border)] pt-6 text-[12px] leading-[1.7] text-[var(--text-muted)]">
      <p>
        <strong className="font-semibold text-[var(--text-secondary)]">
          주식회사 진솔컴퍼니
        </strong>{" "}
        · 대표 배정민 · 사업자등록번호 261-86-01781
      </p>
      <p className="mt-1">
        서울특별시 강남구 강남대로 518, 4층 · 전화 02-6953-0167
      </p>
      <p className="mt-1">
        문의:{" "}
        <a
          href="mailto:pibutenten@gmail.com"
          className="underline hover:text-[var(--primary)]"
        >
          pibutenten@gmail.com
        </a>{" "}
        · 콘텐츠 신고:{" "}
        <Link href="/report" className="underline hover:text-[var(--primary)]">
          /report
        </Link>
      </p>
    </div>
  );
}
