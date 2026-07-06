"use client";

/**
 * ClinicLinksSection — /{handle} 본인 프로필 "연결된 병원" 관리 섹션 (B5, 계획 §8.3).
 *
 * ProfileView 의 '프로필·설정' 아코디언 안에서만 마운트(본인 + 펼침 시) — 지연 로드.
 *   - 목록: GET /api/member/clinic-links (member_list_clinic_links RPC, active 명함 수신분 전체).
 *   - active 항목: "연결 해제" → ConfirmDialog(공용) → POST /{linkId}/revoke → 목록 갱신 + 토스트.
 *   - pending 항목: 동의 화면(/onboarding/clinic-link/[id])으로 재진입 링크(알림을 지운 경우의 보조 경로).
 *   - 연결 이력이 0건이면 섹션 자체를 렌더하지 않음 — 제휴 병원 이용자 외 대다수 회원의
 *     프로필에 빈 섹션을 늘어놓지 않기 위함(RecordNotesView '내 후기' 0건 숨김과 동일 관례).
 *     로드 실패 시에도 조용히 숨김(보조 섹션 — 프로필 본체를 막지 않음).
 *
 * 타인 프로필 미노출은 ProfileView 의 isOwner 게이트가 담당(이 컴포넌트는 본인 컨텍스트 전제).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/lib/toast";
import styles from "../../app.module.css";

/** GET /api/member/clinic-links 응답 행 — member_list_clinic_links RPC(0345) 컬럼. */
type ClinicLinkItem = {
  link_id: number;
  status: "pending" | "active" | "rejected" | "revoked";
  clinic_display_name: string | null;
  consent_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
};

/** 상태 라벨 + 칩 색 — pending 만 기존 recBadgeHeal(주의 톤) 토큰 재사용, 나머지는 CSS 변수. */
const STATUS_META: Record<
  ClinicLinkItem["status"],
  { label: string; className?: string; style?: React.CSSProperties }
> = {
  pending: { label: "동의 대기" },
  active: {
    label: "연결됨",
    style: { background: "var(--primary-soft)", color: "var(--primary-active)" },
  },
  revoked: { label: "해제됨", style: { background: "var(--bg)", color: "var(--text-muted)" } },
  rejected: { label: "거절", style: { background: "var(--bg)", color: "var(--text-muted)" } },
};

/** timestamptz → "YYYY.MM.DD" (없으면 ""). 연결일 = consent_at 우선, 없으면 요청일(created_at). */
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10).replaceAll("-", ".");
}

export default function ClinicLinksSection() {
  const [items, setItems] = useState<ClinicLinkItem[] | null>(null); // null=로딩/실패(미노출)
  const [revokeTarget, setRevokeTarget] = useState<ClinicLinkItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/member/clinic-links", { cache: "no-store" });
        if (!res.ok) return; // 실패 시 조용히 숨김(위 파일 주석)
        const j = (await res.json()) as { items?: ClinicLinkItem[] };
        if (!cancelled) setItems(j.items ?? []);
      } catch {
        /* 숨김 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const revoke = async () => {
    if (!revokeTarget || revoking) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/member/clinic-links/${revokeTarget.link_id}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        // 목록 즉시 갱신 — 해제된 항목을 revoked 로 전환.
        setItems((prev) =>
          (prev ?? []).map((it) =>
            it.link_id === revokeTarget.link_id
              ? { ...it, status: "revoked" as const, revoked_at: new Date().toISOString() }
              : it,
          ),
        );
        showToast("연결을 해제했어요. 병원의 추가 입력이 멈춰요.");
      } else {
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
        showToast(j?.userMessage || "연결 해제에 실패했어요. 잠시 후 다시 시도해 주세요.", {
          tone: "danger",
        });
      }
    } catch {
      showToast("연결 해제에 실패했어요. 네트워크 상태를 확인해 주세요.", { tone: "danger" });
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  // 로딩 중·실패·0건 — 섹션 자체 미노출(위 파일 주석의 관례 결정).
  if (!items || items.length === 0) return null;

  return (
    <section className={`${styles.card} ${styles.mb20}`}>
      <h2 className={styles.recNotesTitle} style={{ marginBottom: 4 }}>
        연결된 병원
      </h2>
      <p className={styles.muted} style={{ fontSize: 12.5, marginBottom: 10 }}>
        연결을 해제하면 병원의 추가 입력이 멈춰요. 이미 담긴 시술노트는 내 기록에 그대로 남아요.
      </p>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((it) => {
          const meta = STATUS_META[it.status];
          return (
            <div
              key={it.link_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.clinic_display_name ?? "병원"}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {fmtDate(it.consent_at ?? it.created_at)}
                </p>
              </div>

              <span
                className={`${styles.recBadge} ${it.status === "pending" ? styles.recBadgeHeal : ""}`}
                style={meta.style}
              >
                {meta.label}
              </span>

              {it.status === "active" && (
                <button
                  type="button"
                  onClick={() => setRevokeTarget(it)}
                  className={`${styles.btn} ${styles.btnGhost}`}
                >
                  연결 해제
                </button>
              )}
              {it.status === "pending" && (
                <Link
                  href={`/onboarding/clinic-link/${it.link_id}`}
                  className={`${styles.btn} ${styles.btnGhost}`}
                >
                  확인하기
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* 연결 해제 확인 — 공용 ConfirmDialog 재사용. */}
      <ConfirmDialog
        open={!!revokeTarget}
        title="병원 연결을 해제할까요?"
        description={`${revokeTarget?.clinic_display_name ?? "병원"}의 추가 입력이 멈춰요.\n이미 담긴 시술노트는 내 기록에 그대로 남아요.`}
        confirmLabel={revoking ? "해제 중…" : "연결 해제"}
        cancelLabel="취소"
        tone="danger"
        onConfirm={revoke}
        onCancel={() => {
          if (!revoking) setRevokeTarget(null);
        }}
      />
    </section>
  );
}
