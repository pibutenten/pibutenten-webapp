import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase 연결 테스트 페이지.
 * /debug/supabase 에서 키 인증·네트워크 도달 여부를 확인할 수 있다.
 * 추후 운영 단계에서는 삭제하거나 환경변수로 게이팅 권장.
 */
export const dynamic = "force-dynamic";

export default async function DebugSupabasePage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("doctors")
    .select("*")
    .limit(1);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(missing)";
  const keyHead = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").slice(
    0,
    24,
  );

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--primary)]">
        Supabase 연결 테스트
      </h1>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 text-sm shadow-[var(--shadow-sm)]">
        <dl className="space-y-2">
          <div>
            <dt className="text-[var(--text-muted)] text-xs">URL</dt>
            <dd className="font-mono break-all">{url}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)] text-xs">
              Publishable key (앞 24자)
            </dt>
            <dd className="font-mono break-all">{keyHead}…</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)] text-xs">
              from(&quot;doctors&quot;).select() 결과
            </dt>
            <dd className="font-mono break-all">
              {error ? (
                <span className="text-red-600">
                  {error.code ?? "ERR"}: {error.message}
                </span>
              ) : (
                <span className="text-emerald-700">
                  OK · rows = {data?.length ?? 0}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        에러 코드가 <code>42P01</code>(테이블 없음) 이면 연결은 성공이고
        마이그레이션만 안 된 상태입니다.
      </p>
    </section>
  );
}
