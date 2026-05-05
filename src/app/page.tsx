import SearchBar from "@/components/SearchBar";
import CategoryTabs from "@/components/CategoryTabs";

export default function HomePage() {
  return (
    <section className="space-y-6">
      {/* Hero */}
      <header className="space-y-4 pt-2 text-center sm:pt-6">
        <h1 className="text-2xl font-bold text-[var(--primary)] sm:text-3xl">
          피부가 예뻐지는 모든 이야기
        </h1>
        <SearchBar />
      </header>

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
