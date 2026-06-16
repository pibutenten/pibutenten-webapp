"use client";

/**
 * AdminAuthErrorsView — /admin/auth-errors 의 앱 스킨 셸 래퍼 (클라이언트).
 *
 * 원칙(Agent 5):
 *   - 상단바·배경만 AppShell 로 교체. 본문(기간 카운트 카드 + 최근 50건 표) 구조는 운영 그대로.
 *   - 색/라운드 토큰만 앱 톤으로 재조정 (운영 var(--text)/var(--border)/var(--bg-soft) → 앱 var(--ink-*)/var(--line)).
 *   - 데이터 fetch·가드는 server page.tsx 가 담당, 이 뷰는 props 로 받은 행·카운트만 렌더.
 *   - import 절대경로(@/appapp skin), 모든 링크 /admin/* (이 페이지는 외부 nav 없음).
 */

import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import styles from "@/components/skin/app.module.css";

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
  magiclink: "Magic Link",
  unknown: "(unknown)",
};

export type AuthErrorRow = {
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

type Props = {
  rows: AuthErrorRow[];
  c24h: number;
  c7d: number;
  c30d: number;
  listError: boolean;
};

export default function AdminAuthErrorsView({
  rows,
  c24h,
  c7d,
  c30d,
  listError,
}: Props) {
  const search = useSearchRouting();

  return (
    <AppShell active="마이" wide back="/admin" {...search}>
      <div className={styles.mb20}>
        <h1 className={styles.profileName}>회원가입 에러 로그</h1>
        <p className={styles.muted} style={{ marginTop: 4, fontSize: 12 }}>
          Google·Kakao·Naver·Magic Link 콜백에서 발생한 에러 (개인정보 마스킹 적용)
        </p>
      </div>

      {listError && (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            padding: "8px 12px",
            fontSize: 14,
            color: "#b91c1c",
          }}
        >
          에러 로그 조회 실패 — 잠시 후 다시 시도해 주세요.
        </div>
      )}

      {/* 기간별 발생 건수 */}
      <div
        style={{
          marginBottom: 24,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <CountCard label="최근 24시간" value={c24h} />
        <CountCard label="최근 7일" value={c7d} />
        <CountCard label="최근 30일" value={c30d} />
      </div>

      {/* 최근 50건 */}
      <h2
        style={{
          marginBottom: 8,
          fontSize: 14,
          fontWeight: 600,
          color: "var(--ink-700)",
        }}
      >
        최근 50건
      </h2>
      <div
        style={{
          overflowX: "auto",
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: "#fff",
        }}
      >
        <table
          style={{
            width: "100%",
            textAlign: "left",
            fontSize: 12,
            borderCollapse: "collapse",
          }}
        >
          <thead style={{ background: "#f4f6f8", color: "var(--ink-500)" }}>
            <tr>
              <th style={thCell}>시각 (KST)</th>
              <th style={thCell}>채널</th>
              <th style={thCell}>단계</th>
              <th style={thCell}>종류</th>
              <th style={thCell}>이메일</th>
              <th style={thCell}>IP</th>
              <th style={thCell}>상세</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    color: "var(--ink-500)",
                  }}
                >
                  최근 발생한 에러가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.error_id}
                  style={{
                    borderTop: "1px solid var(--line)",
                    verticalAlign: "middle",
                  }}
                >
                  <td
                    style={{
                      ...tdCell,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--ink-700)",
                    }}
                  >
                    {formatKstShort(r.created_at)}
                  </td>
                  <td style={tdCell}>
                    {PROVIDER_LABEL[r.provider] ?? r.provider}
                  </td>
                  <td style={{ ...tdCell, color: "var(--ink-700)" }}>
                    {r.step}
                  </td>
                  <td style={tdCell}>
                    <code
                      style={{
                        borderRadius: 4,
                        background: "#f4f6f8",
                        padding: "2px 6px",
                        fontSize: 11,
                      }}
                    >
                      {r.error_kind}
                    </code>
                  </td>
                  <td
                    style={{
                      ...tdCell,
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: "var(--ink-700)",
                    }}
                  >
                    {r.attempted_email_masked ?? "—"}
                  </td>
                  <td
                    style={{
                      ...tdCell,
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: "var(--ink-700)",
                    }}
                  >
                    {r.ip_masked ?? "—"}
                  </td>
                  <td style={{ ...tdCell, color: "var(--ink-500)" }}>
                    {r.error_message ? (
                      <details>
                        <summary
                          style={{ cursor: "pointer", fontSize: 11 }}
                        >
                          보기
                        </summary>
                        <div
                          style={{
                            marginTop: 4,
                            maxWidth: 448,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            fontSize: 11,
                          }}
                        >
                          {r.error_message}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 10 }}>
                          ID:{" "}
                          <code style={{ fontFamily: "monospace" }}>
                            {r.error_id}
                          </code>
                        </div>
                      </details>
                    ) : (
                      <code style={{ fontFamily: "monospace", fontSize: 10 }}>
                        {r.error_id.slice(0, 8)}
                      </code>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p
        style={{
          marginTop: 12,
          fontSize: 11,
          color: "var(--ink-500)",
        }}
      >
        ※ 이메일·IP 는 저장 시점에 마스킹된 값만 표시됩니다. 원본 상세가
        필요하면 같은 error_id 로 Vercel 서버 로그를 확인해 주세요.
      </p>
    </AppShell>
  );
}

const thCell: React.CSSProperties = {
  padding: "8px 12px",
  fontWeight: 500,
};

const tdCell: React.CSSProperties = {
  padding: "8px 12px",
};

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid var(--line)",
        background: "#fff",
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          fontSize: 24,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--ink-900)",
        }}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
