export default function SearchPage() {
  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-sm)]">
        <input
          type="search"
          placeholder="피부과 전문의가 솔직하게 답해드립니다!"
          className="w-full rounded-[var(--radius-sm)] bg-[var(--bg-soft)] px-3 py-2 text-center text-[15px] font-bold outline-none placeholder:font-normal placeholder:text-[var(--text-muted)]"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
          검색 결과가 이곳에 표시됩니다.
        </div>
      </div>
    </section>
  );
}
