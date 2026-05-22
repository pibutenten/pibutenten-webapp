import Link from "next/link";
import type { DoctorDashboardData } from "@/lib/doctor-dashboard";

/**
 * 의사 본인이 본인 핸들 페이지 진입 시 노출되는 대시보드 위젯 (2026-05-22 복원).
 *
 * 옛 /doctors/[slug] 의 DoctorOwnerWidget/DoctorOpsTools/DoctorCommentsWidget 4개 헬퍼를
 * 한 박스로 통합. /{handle} 의 isOwner+isDoctor 분기에서 렌더.
 *
 * 외부인 보기 모드에서는 절대 노출 X (서버에서 props 자체 전달 안 함).
 */

export default function DoctorDashboardWidget({
  data,
  doctorSlug,
}: {
  data: DoctorDashboardData;
  doctorSlug: string | null;
}) {
  const { statusCounts, recent7d, pendingPreview } = data;

  return (
    <section
      aria-label="의사 본인 대시보드"
      className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm"
    >
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[var(--text)]">
          내 대시보드
        </h2>
        <span className="text-[11px] text-[var(--text-muted)]">
          본인에게만 보임
        </span>
      </header>

      {/* 1) 상태별 카드 카운트 — 4열 */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="발행" value={statusCounts.published} />
        <Stat
          label="검수 대기"
          value={statusCounts.pending_review}
          accent={statusCounts.pending_review > 0}
        />
        <Stat label="초안" value={statusCounts.draft} />
        <Stat label="삭제" value={statusCounts.deleted} muted />
      </div>

      {/* 2) 검수 대기 카드 미리보기 */}
      {pendingPreview.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-amber-800">
              검수 대기 {statusCounts.pending_review}건
            </span>
            <Link
              href={
                doctorSlug
                  ? `/admin/cards?status=pending_review&doctor=${doctorSlug}`
                  : "/admin/cards?status=pending_review"
              }
              className="text-[11px] text-amber-700 underline hover:text-amber-900"
            >
              전체 보기 →
            </Link>
          </div>
          <ul className="space-y-1">
            {pendingPreview.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cards/${c.id}`}
                  className="line-clamp-1 text-[12.5px] text-amber-900 hover:underline"
                >
                  {c.question || "(제목 없음)"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3) 빠른 작업 버튼 */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/write"
          className="rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--primary-dark)]"
        >
          ✍️ 새 글 쓰기
        </Link>
        <Link
          href={
            doctorSlug ? `/admin/cards?doctor=${doctorSlug}` : "/admin/cards"
          }
          className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-[12px] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          전체 글 관리
        </Link>
        <Link
          href="/admin/comments"
          className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-[12px] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          댓글 관리
        </Link>
      </div>

      {/* 4) 최근 7일 인터랙션 미니 */}
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <div className="mb-2 text-[11px] text-[var(--text-muted)]">
          최근 7일 내 글 활동
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Mini label="조회" value={recent7d.views} />
          <Mini label="좋아요" value={recent7d.likes} />
          <Mini label="저장" value={recent7d.saves} />
          <Mini label="댓글" value={recent7d.comments} />
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent = false,
  muted = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 text-center " +
        (accent
          ? "border-amber-300 bg-amber-50"
          : "border-[var(--border)] bg-[var(--bg-soft)]")
      }
    >
      <div
        className={
          "text-[11px] " +
          (muted ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]")
        }
      >
        {label}
      </div>
      <div
        className={
          "mt-1 text-[20px] font-bold tabular-nums " +
          (accent
            ? "text-amber-800"
            : muted
              ? "text-[var(--text-muted)]"
              : "text-[var(--text)]")
        }
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--text)]">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
