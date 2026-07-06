"use client";

/**
 * ClinicLinkConsentClient — 병원 연결 등록 동의 폼 본체 (B5, 계획 §8.3 확정 문구).
 *
 * 흐름: GET /api/member/clinic-links/[id] 로 연결 1건 로드(active 명함 쿠키 컨텍스트 일관)
 *   → pending 이면 동의 화면(제공 항목 고지 + 체크박스 + 동의/거절)
 *   → respond POST {consent} → 완료 화면(동의: 내 기록 보기 / 거절: 홈).
 *   pending 이 아니면(이미 처리) 해당 상태 안내만 표시.
 *
 * ⚠ 의도적 범위 제한(B5): backfill_legal_name 체크박스는 넣지 않음 — consent 만 전송.
 *   (병원 입력 실명을 내 프로필 legal_name 에 저장할지는 별도 단계에서 다룸. API 스키마의
 *   backfill_legal_name 은 optional 이라 미전송 시 RPC 기본 false.)
 */

import { useEffect, useState } from "react";
import Link from "next/link";

/** GET /api/member/clinic-links/[id] 응답 행 — member_get_clinic_link RPC(0345) 컬럼. */
type LinkDetail = {
  link_id: number;
  status: "pending" | "active" | "rejected" | "revoked";
  clinic_display_name: string | null;
  requested_legal_name: string | null;
  consent_at: string | null;
  created_at: string | null;
};

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "form"; link: LinkDetail } // status=pending — 동의 화면
  | { kind: "already"; link: LinkDetail } // 이미 처리된 연결 — 상태 안내만
  | { kind: "done-consent" }
  | { kind: "done-reject" };

/** 관리자 톤 카드(C10) — --line 테두리 · --r-card. */
const cardBox = "rounded-[var(--r-card)] border border-[var(--line)] bg-white p-5";

/** 에러 body 에서 userMessage 추출 — API 는 실패 시 { userMessage } 를 담아 준다. */
async function readUserMessage(res: Response, fallback: string): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { userMessage?: string; message?: string };
  return j?.userMessage || j?.message || fallback;
}

export default function ClinicLinkConsentClient({ linkId }: { linkId: number }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // 연결 1건 로드 — 본인 수신만(타인·미존재는 404).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/member/clinic-links/${linkId}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setPhase({
            kind: "error",
            message: await readUserMessage(res, "연결 정보를 불러오지 못했어요."),
          });
          return;
        }
        const link = (await res.json()) as LinkDetail;
        if (cancelled) return;
        setPhase(link.status === "pending" ? { kind: "form", link } : { kind: "already", link });
      } catch {
        if (!cancelled)
          setPhase({ kind: "error", message: "연결 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  // 동의/거절 응답 — pending 아니면 409(link_not_pending) → 최신 상태 재조회 후 안내.
  const respond = async (consent: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setActionErr(null);
    try {
      const res = await fetch(`/api/member/clinic-links/${linkId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent }), // backfill_legal_name 의도적 미전송(위 파일 주석)
      });
      if (res.ok) {
        setPhase(consent ? { kind: "done-consent" } : { kind: "done-reject" });
        return;
      }
      if (res.status === 409) {
        // 이미 처리된 연결(다른 기기에서 응답 등) — 현재 상태를 다시 받아 안내 화면으로.
        const detail = await fetch(`/api/member/clinic-links/${linkId}`, { cache: "no-store" });
        if (detail.ok) {
          const link = (await detail.json()) as LinkDetail;
          setPhase({ kind: "already", link });
          return;
        }
      }
      setActionErr(await readUserMessage(res, "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } catch {
      setActionErr("요청을 처리하지 못했어요. 네트워크 상태를 확인해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- 로딩 / 에러 ---------- */
  if (phase.kind === "loading") {
    return (
      <p className="py-16 text-center text-sm text-[var(--ink-500)]">불러오는 중이에요…</p>
    );
  }
  if (phase.kind === "error") {
    return (
      <div className={`${cardBox} text-center`}>
        <p className="text-[15px] font-bold text-[var(--ink-900)]">{phase.message}</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-[var(--r-btn)] bg-[var(--tt-blue)] px-6 text-[14px] font-semibold text-white hover:bg-[var(--tt-blue-deep)]"
        >
          홈으로 가기
        </Link>
      </div>
    );
  }

  /* ---------- 완료 — 동의 ---------- */
  if (phase.kind === "done-consent") {
    return (
      <div className={`${cardBox} text-center`}>
        <h1 className="text-xl font-bold text-[var(--ink-900)]">연결됐어요.</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-500)]">
          병원이 작성한 시술노트가 내 기록에 자동으로 담겨요.
        </p>
        <Link
          href="/notes"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[var(--r-btn)] bg-[var(--tt-blue)] px-7 text-[15px] font-semibold text-white hover:bg-[var(--tt-blue-deep)]"
        >
          내 기록 보기
        </Link>
      </div>
    );
  }

  /* ---------- 완료 — 거절 ---------- */
  if (phase.kind === "done-reject") {
    return (
      <div className={`${cardBox} text-center`}>
        <h1 className="text-xl font-bold text-[var(--ink-900)]">거절했어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-500)]">
          병원 연결 요청을 거절했어요. 내 정보는 병원에 전달되지 않아요.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[var(--r-btn)] bg-[var(--tt-blue)] px-7 text-[15px] font-semibold text-white hover:bg-[var(--tt-blue-deep)]"
        >
          홈으로 가기
        </Link>
      </div>
    );
  }

  /* ---------- 이미 처리된 연결(pending 아님) — 상태 안내만 ---------- */
  if (phase.kind === "already") {
    const { link } = phase;
    const clinicName = link.clinic_display_name ?? "병원";
    const notice =
      link.status === "active"
        ? {
            title: "이미 연결된 병원이에요.",
            body: `${clinicName}과(와) 이미 연결돼 있어요. 병원이 작성한 시술노트가 내 기록에 자동으로 담겨요.`,
            href: "/notes",
            cta: "내 기록 보기",
          }
        : link.status === "rejected"
          ? {
              title: "이미 거절한 요청이에요.",
              body: "이 병원 연결 요청은 이미 거절 처리됐어요.",
              href: "/",
              cta: "홈으로 가기",
            }
          : {
              title: "해제된 연결이에요.",
              body: "이 병원 연결은 해제된 상태예요. 병원의 추가 입력이 멈춰 있어요.",
              href: "/",
              cta: "홈으로 가기",
            };
    return (
      <div className={`${cardBox} text-center`}>
        <h1 className="text-xl font-bold text-[var(--ink-900)]">{notice.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-500)]">{notice.body}</p>
        <Link
          href={notice.href}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[var(--r-btn)] bg-[var(--tt-blue)] px-7 text-[15px] font-semibold text-white hover:bg-[var(--tt-blue-deep)]"
        >
          {notice.cta}
        </Link>
      </div>
    );
  }

  /* ---------- 동의 화면(pending) — §2.7 재설계(본인확인 최상단·수직 버튼 위계) ---------- */
  const { link } = phase;
  const clinicName = link.clinic_display_name ?? "병원";

  // ③ 병원에 제공되는 내 정보 — 칩 목록(계획 §2.7). 라벨만 표시(값은 동의 후 스냅샷됨).
  const infoChips = [
    "아이디",
    "이름",
    "생년월일",
    "이메일",
    "피부 정보(성별·피부타입·피부고민·얼굴형·피부색·관심시술)",
  ];

  return (
    <>
      {/* 헤더 — 짧은 제목 + 부제 */}
      <header className="mb-5 text-center">
        <h1 className="text-xl font-bold leading-snug text-[var(--ink-900)]">병원 연결 동의</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-500)]">
          {clinicName}이(가) 내 시술노트를 대신 작성하고 내 정보를 받아 가요.
        </p>
      </header>

      {/* ① 본인 확인 — 최상단·강조(--tt-blue-tint 배경 / --tt-blue-soft 테두리) */}
      <div className="rounded-[var(--r-card)] border border-[var(--tt-blue-soft)] bg-[var(--tt-blue-tint)] p-5">
        <p className="text-[13px] font-semibold text-[var(--tt-blue-deep)]">병원이 등록한 이름</p>
        <p className="mt-1 text-lg font-bold text-[var(--ink-900)]">
          {link.requested_legal_name || "—"}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-500)]">
          본인이 맞는지 확인해 주세요. 아니면 아래에서 거절해요.
        </p>
      </div>

      {/* ② 병원에 제공되는 내 정보 — 칩 */}
      <div className={`${cardBox} mt-3`}>
        <p className="text-[13px] font-semibold text-[var(--ink-700)]">병원에 제공되는 내 정보</p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {infoChips.map((c) => (
            <li
              key={c}
              className="rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 py-1 text-[13px] text-[var(--ink-700)]"
            >
              {c}
            </li>
          ))}
        </ul>
      </div>

      {/* ③ 이중 동의 고지 */}
      <div className={`${cardBox} mt-3`}>
        <p className="text-[13.5px] leading-[1.7] text-[var(--ink-700)]">
          ✓ 병원이 내 시술 내역을 시술노트에 대신 작성해요.
        </p>
        <p className="mt-1 text-[13.5px] leading-[1.7] text-[var(--ink-700)]">
          ✓ 위 정보를 병원에 제공해요(제3자 제공, 개인정보보호법 §17).
        </p>
      </div>

      {/* ④ 통제 안내(muted) */}
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-500)]">
        기록 삭제·연결 해제는 언제든 가능해요. 해제하면 병원의 추가 입력이 멈춰요.
      </p>

      {/* ⑤ 체크박스 게이트 — 체크해야 동의 버튼 활성 */}
      <div className={`${cardBox} mt-4`}>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-[3px] h-4 w-4 cursor-pointer accent-[var(--tt-blue)]"
          />
          <span className="text-[13.5px] leading-[1.6] text-[var(--ink-900)]">
            위 정보 제공과 시술노트 대행 작성에 동의합니다.
          </span>
        </label>
      </div>

      {/* 버튼 수직 위계 — 풀폭 primary(동의) → 아래 약한 텍스트(거절) */}
      {actionErr && (
        <p className="mt-3 text-center text-[12.5px] font-medium text-red-600" role="alert">
          {actionErr}
        </p>
      )}
      <button
        type="button"
        onClick={() => respond(true)}
        disabled={!agreed || submitting}
        className="mt-4 h-12 w-full rounded-[var(--r-btn)] bg-[var(--tt-blue)] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--tt-blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "처리 중…" : "동의하고 연결하기"}
      </button>
      <button
        type="button"
        onClick={() => respond(false)}
        disabled={submitting}
        className="mt-2 h-10 w-full text-[14px] font-medium text-[var(--ink-500)] transition-colors hover:text-[var(--ink-700)] disabled:opacity-50"
      >
        연결 거절하기
      </button>
    </>
  );
}
