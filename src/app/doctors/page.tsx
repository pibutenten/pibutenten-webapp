export default function DoctorsPage() {
  return (
    <section className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
        원장님 카드 자리
      </div>
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
        원장님 카드 자리 (예시)
      </div>
    </section>
  );
}
