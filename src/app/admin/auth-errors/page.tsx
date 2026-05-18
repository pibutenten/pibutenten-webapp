/**
 * /admin/auth-errors — 회원가입/로그인 OAuth 콜백 에러 운영 추적기 (PR-OPS, 2026-05-19).
 *
 * 데이터 출처: `auth_callback_errors` 테이블 (0135).
 * 접근: admin (super or doctor admin) 전용 — RLS 가 강제.
 *
 * UI 최소 구성 (1차):
 *   - 상단: 최근 24h / 7d / 30d 발생 건수.
 *   - 본문: 최근 50건 표 (시각 / provider / step / error_kind / email / error_id).
 *   - PII 는 모두 마스킹된 값만 표시 (DB 저장 시 이미 마스킹됨).
 *   - error_id 클릭 → Vercel logs 에서 grep 검색 안내.
 *
 * 향후 확장 (별도 PR): 그래프 / 필터 / "해결됨" 토글 / 같은 IP 그루핑.
 */
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "회원가입 에러 로그",
  robots: { index: false, follow: false },
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
  magiclink: "Magic Link",
  unknown: "(unknown)",
};

type Row = {
  error_id: string;
  created_at: string;
  provider: string;
  step: string;
  error_kind: string;
  error_message: string | null;
  attempted_email_masked: string | null;
  ip_masked: string | null;
  user_agent: string | null;
};

function formatKstShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default async function AuthErrorsPage() {
  await requireAdminPage("/admin/auth-errors");
  const supabase = await createSupabaseServerClient();

  // 최근 50건
  const { data: rowsData, error: listErr } = await supabase
    .from("auth_callback_errors")
    .select(
      "error_id, created_at, provider, step, error_kind, error_message, attempted_email_masked, ip_masked, user_agent",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (rowsData ?? []) as Row[];

  // 기간별 카운트 — head:true + count
  const now = new Date();
  const since = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const [c24h, c7d, c30d] = await Promise.all([
    supabase
      .from("auth_callback_errors")
      .select("error_id", { count: "exact", head: true })
      .gte("created_at", since(24 * 60 * 60 * 1000)),
    supabase
      .from("auth_callback_errors")
      .select("error_id", { count: "exact", head: true })
      .gte("created_at", since(7 * 24 * 60 * 60 * 1000)),
    supabase
      .from("auth_callback_errors")
      .select("error_id", { count: "exact", head: true })
      .gte("created_at", since(30 * 24 * 60 * 60 * 1000)),
  ]);

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1">
        <BackButton />
      </div>
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          회원가입 에러 로그
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Google·Kakao·Naver·Magic Link 콜백에서 발생한 에러 (개인정보 마스킹 적용)
        </p>
      </div>

      {listErr && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          에러 로그 조회 실패 — 잠시 후 다시 시도해 주세요.
        </div>
      )}

      {/* 기간별 발생 건수 */}
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <CountCard label="최근 24시간" value={c24h.count ?? 0} />
        <CountCard label="최근 7일" value={c7d.count ?? 0} />
        <CountCard label="최근 30일" value={c30d.count ?? 0} />
      </div>

      {/* 최근 50건 */}
      <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
        최근 50건
      </h2>
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
            <tr>
              <th className="px-3 py-2 font-medium">시각 (KST)</th>
              <th className="px-3 py-2 font-medium">채널</th>
              <th className="px-3 py-2 font-medium">단계</th>
              <th className="px-3 py-2 font-medium">종류</th>
              <th className="px-3 py-2 font-medium">이메일</th>
              <th className="px-3 py-2 font-medium">IP</th>
              <th className="px-3 py-2 font-medium">상세</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-[var(--text-muted)]"
                >
                  최근 발생한 에러가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.error_id}
                  className="border-t border-[var(--border)] align-top"
                >
                  <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">
                    {formatKstShort(r.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    {PROVIDER_LABEL[r.provider] ?? r.provider}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">
                    {r.step}
                  </td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px]">
                      {r.error_kind}
                    </code>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)]">
                    {r.attempted_email_masked ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)]">
                    {r.ip_masked ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">
                    {r.error_message ? (
                      <details>
                        <summary className="cursor-pointer text-[11px] hover:text-[var(--primary)]">
                          보기
                        </summary>
                        <div className="mt-1 max-w-md whitespace-pre-wrap break-all text-[11px]">
                          {r.error_message}
                        </div>
                        <div className="mt-1 text-[10px]">
                          ID:{" "}
                          <code className="font-mono">{r.error_id}</code>
                        </div>
                      </details>
                    ) : (
                      <code className="font-mono text-[10px]">{r.error_id.slice(0, 8)}</code>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-[var(--text-muted)]">
        ※ 이메일·IP 는 저장 시점에 마스킹된 값만 표시됩니다. 원본 상세가
        필요하면 같은 error_id 로 Vercel 서버 로그를 확인해 주세요.
      </p>
    </section>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
