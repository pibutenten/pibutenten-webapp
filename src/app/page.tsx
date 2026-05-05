import HeroSearch from "@/components/HeroSearch";
import CategoryTabs from "@/components/CategoryTabs";

export default function HomePage() {
  return (
    <section className="space-y-6">
      {/* Hero (타이틀 + 검색창) — 클라이언트 컴포넌트 (포커스 시 슬라이드) */}
      <HeroSearch />

      {/* Category tabs */}
      <CategoryTabs />

      {/* 인기 키워드 칩 (Q&A 임포트 후 자동 채워짐) */}
      <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white px-4 py-3 text-center text-xs text-[var(--text-muted)]">
        인기 키워드 칩 영역 (Q&A 임포트 후 자동 표시)
      </div>

      {/* Q&A 그리드 placeholder */}
      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
          곧 Q&A 콘텐츠가 채워집니다.
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
          영상 시간 검수 끝나는 대로 1180개 임포트 예정
        </div>
      </div>
    </section>
  );
}
