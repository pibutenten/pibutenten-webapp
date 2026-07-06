"use client";

/**
 * ClinicRegisterForm — /clinic/patients/new 환자 등록 (B4 재설계).
 *
 * 아이디+이름+생년월일(+등록번호) → POST /api/clinic/links (동의 요청).
 * 성공 시 환자 목록(/clinic/patients)으로 이동. 회원 이름·생일 "원본" 미표시(§8.1).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import BirthdateSelect from "@/components/forms/BirthdateSelect";
import { inputCls, labelCls } from "@/lib/form-styles";
import { showToast } from "@/lib/toast";
import { ClinicShell, BOX } from "../../_shared";

export default function ClinicRegisterForm() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [birth, setBirth] = useState(""); // "YYYY-MM-DD" | ""
  const [regNo, setRegNo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    const h = handle.trim().replace(/^@/, "").toLowerCase();
    const nm = name.trim();
    if (!h) return showToast("회원 아이디를 입력해주세요");
    if (!nm) return showToast("이름을 입력해주세요");
    if (!birth) return showToast("생년월일을 선택해주세요");

    setSubmitting(true);
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
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
        showToast(j?.userMessage || "요청에 실패했어요. 잠시 후 다시 시도해주세요.", {
          tone: "danger",
        });
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
        <h1 className="mb-4 text-[20px] font-bold text-[var(--text)]">환자 등록</h1>
        <div className={BOX}>
          <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
            아이디·이름·생년월일이 일치하는 회원에게 동의 요청 알림이 발송돼요.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelCls}>회원 아이디</label>
              <input
                className={inputCls}
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
              <label className={labelCls}>이름</label>
              <input
                className={inputCls}
                value={name}
                maxLength={50}
                spellCheck={false}
                placeholder="환자 실명"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>생년월일</label>
              <BirthdateSelect value={birth} onChange={setBirth} className="flex gap-1.5" />
            </div>
            <div>
              <label className={labelCls}>등록번호</label>
              <input
                className={inputCls}
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
              className="h-11 w-full rounded-md bg-[var(--primary)] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "요청 보내는 중…" : "동의 요청 보내기"}
            </button>
          </div>
        </div>
      </section>
    </ClinicShell>
  );
}
