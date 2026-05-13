"use client";

import { useEffect, useState } from "react";

/**
 * 도메인 이전 안내 팝업 — 첫 방문 시 1회 노출.
 *
 * 배경: pibutenten.com 이 cafe24 쇼핑몰에서 새 피부텐텐 웹앱(Vercel)로 이전됨.
 *   - 쇼핑은 pibutentenmall.com 으로 분리
 *   - pibutenten.com 은 시술·뷰티 정보 커뮤니티로 새 단장
 *
 * UX:
 *   - sessionStorage `pibutenten:migration-banner-dismissed` 로 dedup (탭 닫으면 다시 표시)
 *   - 모달 외부 클릭 또는 X 닫기 → 사라짐
 *   - "피부텐텐몰로 이동하기" → pibutentenmall.com 새 탭
 */
const KEY = "pibutenten:migration-banner-dismissed";

export default function MigrationBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(KEY)) return;
    // 약간 지연시켜 페이지 hydration 후 표시 (CLS 방지)
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    sessionStorage.setItem(KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-banner-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-3xl bg-gradient-to-b from-[#E3F0FA] to-[#F4F9FD] shadow-2xl"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
        }}
      >
        {/* 닫기 */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/60 hover:text-[var(--text)]"
          aria-label="닫기"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="px-7 pb-7 pt-9 text-center">
          {/* tt: 로고 */}
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
            <span className="text-xl font-bold tracking-tight text-[var(--primary)]">
              tt:
            </span>
          </div>

          {/* 헤드라인 */}
          <h2
            id="migration-banner-title"
            className="mb-1 text-[22px] font-bold leading-snug text-[var(--text)]"
          >
            <span className="font-medium">피부텐텐</span>이
            <br />더 전문적으로 <span className="text-[var(--primary)]">변화합니다!</span>
          </h2>

          {/* 안내 */}
          <p className="mt-3 text-[13px] leading-[1.7] text-[var(--text-secondary)]">
            안녕하세요, 피부텐텐입니다.
            <br />
            고객님께 최적화된 서비스를 제공하기 위해
            <br />
            이제부터{" "}
            <span className="font-semibold text-[var(--text)]">쇼핑몰</span>
            <span>과 </span>
            <span className="font-semibold text-[var(--text)]">커뮤니티</span>
            <span>가 분리 운영됩니다.</span>
          </p>

          {/* 카드 1 — 쇼핑몰 */}
          <a
            href="https://pibutentenmall.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden
              >
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[12px] font-semibold text-[var(--primary)]">
                pibutentenmall.com
              </div>
              <div className="mt-0.5 text-[14px] font-bold text-[var(--text)]">
                쇼핑은 피부텐텐몰에서
              </div>
              <div className="mt-0.5 text-[11.5px] text-[var(--text-secondary)]">
                더 편하게 만나보세요!
              </div>
              <div className="mt-1.5 text-[10.5px] text-[var(--text-muted)]">
                기존 회원정보/적립금은 그대로 유지됩니다
              </div>
            </div>
          </a>

          {/* 카드 2 — 커뮤니티 */}
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
                <path d="M17 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[12px] font-semibold text-[var(--primary)]">
                pibutenten.com
              </div>
              <div className="mt-0.5 text-[14px] font-bold text-[var(--text)]">
                시술, 뷰티 정보는 피부텐텐에서
              </div>
              <div className="mt-0.5 text-[11.5px] text-[var(--text-secondary)]">
                피부텐텐은 전문 뷰티 커뮤니티로
                <br />
                새롭게 단장합니다.
              </div>
            </div>
          </div>

          {/* 푸터 CTA */}
          <p className="mt-5 text-[13px] font-semibold text-[var(--text)]">
            이제부터 쇼핑은 &lsquo;피부텐텐몰&rsquo;에서 만나요!
          </p>
          <a
            href="https://pibutentenmall.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-full bg-[var(--text)] px-6 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--primary)]"
          >
            피부텐텐몰로 이동하기
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="ml-2 inline-block rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            계속 둘러보기
          </button>
        </div>
      </div>
    </div>
  );
}
