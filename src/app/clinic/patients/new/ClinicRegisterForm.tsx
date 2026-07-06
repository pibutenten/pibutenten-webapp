"use client";

/**
 * ClinicRegisterForm — /clinic/patients/new 환자 등록 (S2 Wave B2 재설계, 계획 §2.2·C8·C11).
 *
 * 아이디+이름+생년월일(+등록번호) → POST /api/clinic/links (동의 요청).
 * 성공 시 환자 목록(/clinic/patients)으로 이동. 회원 이름·생일 "원본" 미표시(§8.1).
 *
 * 디자인: 관리자 대시보드 톤(C10) — --ink/--tt-blue/--line 토큰, admin 필터폼 입력·버튼 규칙.
 *
 * 결과 분기(에러 코드는 서버가 HTTP status 로만 구분 — body 는 { message } 표준 응답):
 *  - 성공(2xx) → /clinic/patients
 *  - 409(link_already_pending / link_already_active, C8) → 재요청 안 함. "이미 등록된 환자예요"
 *    안내 + 환자 목록에서 확인 링크(/clinic/patients?q={handle})로 그 환자 확인 유도.
 *  - 400(match_failed, C11) → 아이디·생년월일 재확인 안내(서버 message 우선). 회원이 본인 계정에서
 *    생년월일 수정 후 재등록하면 연결됨.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BirthdateSelect from "@/components/forms/BirthdateSelect";
import { showToast } from "@/lib/toast";
import { ClinicShell, BOX } from "../../_shared";

/** admin 필터폼과 동일한 입력·버튼 톤(C10) — h-9 · --line 테두리 · --tt-blue 포커스/버튼. */
const adminInputCls =
  "h-9 w-full rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-3 text-[16px] text-[var(--ink-900)] transition-colors placeholder:text-[var(--ink-300)] focus:border-[var(--tt-blue)] focus:outline-none";
const adminLabelCls = "mb-1.5 block text-sm font-semibold text-[var(--ink-700)]";

/** 이미 등록됨(409) 시 안내 카드 데이터. */
type Dup = { handle: string };

export default function ClinicRegisterForm() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [birth, setBirth] = useState(""); // "YYYY-MM-DD" | ""
  const [regNo, setRegNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dup, setDup] = useState<Dup | null>(null); // 이미 등록된 환자(409)
  const [matchErr, setMatchErr] = useState<string | null>(null); // 매칭 실패(400)

  async function submit() {
    if (submitting) return;
    const h = handle.trim().replace(/^@/, "").toLowerCase();
    const nm = name.trim();
    if (!h) return showToast("회원 아이디를 입력해주세요");
    if (!nm) return showToast("이름을 입력해주세요");
    if (!birth) return showToast("생년월일을 선택해주세요");

    setSubmitting(true);
    setDup(null);
    setMatchErr(null);
    try {
      const res = await fetch("/api/clinic/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: h,
          legal_name: nm,
          birthdate: birth,
          registration_number: regNo.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          userMessage?: string;
          message?: string;
        };
        const serverMsg = j?.userMessage || j?.message;
        // C8 — 이미 pending/active 인 연결(409): 재요청하지 않고 그 환자로 이동 안내.
        if (res.status === 409) {
          setDup({ handle: h });
          return;
        }
        // C11 — 아이디·생년월일 불일치(400 match_failed): 재확인 + 회원 생일 수정 안내.
        //  서버 message 우선(있으면 사용)하되, C11 복구 힌트("회원이 본인 계정에서 생일 수정 후
        //  재등록")가 빠져 있으면 덧붙여 항상 노출한다.
        if (res.status === 400) {
          const recovery =
            "회원이 본인 계정에서 생년월일을 수정한 뒤 다시 등록하면 연결돼요.";
          const base =
            serverMsg || "아이디와 생년월일을 다시 확인해 주세요.";
          setMatchErr(base.includes("수정한 뒤") ? base : `${base} ${recovery}`);
          return;
        }
        showToast(serverMsg || "요청에 실패했어요. 잠시 후 다시 시도해주세요.", { tone: "danger" });
        return;
      }
      showToast("동의 요청을 보냈어요. 회원이 동의하면 시술노트를 작성할 수 있어요.", {
        durationMs: 4500,
      });
      router.push("/clinic/patients");
    } catch {
      showToast("네트워크 오류가 발생했어요", { tone: "danger" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ClinicShell back="/clinic/patients">
      <section className="mx-auto w-full max-w-[680px] py-6">
        <h1 className="mb-4 text-[20px] font-bold text-[var(--ink-900)]">환자 등록</h1>
        <div className={BOX}>
          <p className="text-[13px] leading-relaxed text-[var(--ink-500)]">
            입력한 회원에게 동의 요청 알림이 발송돼요.
          </p>

          {/* C8 — 이미 등록된 환자(409): 재요청 대신 그 환자로 이동 안내. */}
          {dup && (
            <div className="mt-4 rounded-[var(--r-btn)] border border-[var(--tt-blue-soft)] bg-[var(--tt-blue-tint)] p-4">
              <p className="text-[14px] font-semibold text-[var(--ink-900)]">이미 등록된 환자예요</p>
              <Link
                href={`/clinic/patients?q=${encodeURIComponent(dup.handle)}`}
                className="mt-2 inline-flex h-9 items-center rounded-[var(--r-btn)] bg-[var(--tt-blue)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--tt-blue-deep)]"
              >
                환자 목록에서 확인
              </Link>
            </div>
          )}

          {/* C11 — 매칭 실패(400): 재확인 + 회원 본인 생일 수정 안내. */}
          {matchErr && (
            <p
              className="mt-4 rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--bg)] p-3 text-[13px] leading-relaxed text-[var(--ink-700)]"
              role="alert"
            >
              {matchErr}
            </p>
          )}

          <div className="mt-4 space-y-4">
            <div>
              <label className={adminLabelCls}>회원 아이디</label>
              <input
                className={adminInputCls}
                value={handle}
                maxLength={30}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="예: pibutenten"
                onChange={(e) => setHandle(e.target.value)}
              />
            </div>
            <div>
              <label className={adminLabelCls}>이름</label>
              <input
                className={adminInputCls}
                value={name}
                maxLength={50}
                spellCheck={false}
                placeholder="환자 실명"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className={adminLabelCls}>생년월일</label>
              <BirthdateSelect value={birth} onChange={setBirth} className="flex gap-1.5" />
            </div>
            <div>
              <label className={adminLabelCls}>등록번호</label>
              <input
                className={adminInputCls}
                value={regNo}
                maxLength={100}
                spellCheck={false}
                placeholder="원내 등록번호"
                onChange={(e) => setRegNo(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="h-11 w-full rounded-[var(--r-btn)] bg-[var(--tt-blue)] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--tt-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "요청 보내는 중…" : "동의 요청 보내기"}
            </button>
          </div>
        </div>
      </section>
    </ClinicShell>
  );
}
