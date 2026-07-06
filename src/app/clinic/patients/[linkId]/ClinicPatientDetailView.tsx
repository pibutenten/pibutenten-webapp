"use client";

/**
 * ClinicPatientDetailView — /clinic/patients/[linkId] 환자 상세 (B4 재설계).
 *
 * 서버가 get_clinic_patient(0345)로 fresh 로드한 1건을 받는다(force-dynamic → 매 진입 최신,
 * 구 버전의 클라 재로드/stale 경고 불필요). 병원 항목(등록번호·전화·주소) 수정은
 * PATCH /api/clinic/patients/[linkId] — 전체 교체 계약이라 회원 스냅샷 필드도 로드값 그대로 동봉.
 * status='active' 면 시술노트 작성(/clinic/visits/new?link=)으로.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { inputCls, labelCls } from "@/lib/form-styles";
import { showToast } from "@/lib/toast";
import {
  ClinicShell,
  StatusBadge,
  skinProfileRows,
  fmtDate,
  BOX,
  type ClinicPatientItem,
} from "../../_shared";

export default function ClinicPatientDetailView({ patient }: { patient: ClinicPatientItem }) {
  const router = useRouter();
  const [editRegNo, setEditRegNo] = useState(patient.registration_number ?? "");
  const [editPhone, setEditPhone] = useState(patient.patient_phone ?? "");
  const [editAddr, setEditAddr] = useState(patient.patient_address ?? "");
  const [saving, setSaving] = useState(false);

  const spRows = skinProfileRows(patient.patient_skin_profile);
  const consentDate = fmtDate(patient.consent_at);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clinic/patients/${patient.link_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_number: editRegNo.trim() || null,
          patient_phone: editPhone.trim() || null,
          patient_address: editAddr.trim() || null,
          // 전체 교체 계약 — 수정하지 않는 회원 스냅샷 필드도 로드값 그대로 전송(생략=NULL 소거).
          patient_name: patient.patient_name,
          patient_birthdate: patient.patient_birthdate,
          patient_email: patient.patient_email,
          patient_skin_profile: patient.patient_skin_profile,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
        showToast(j?.userMessage || "저장에 실패했어요", { tone: "danger" });
        return;
      }
      showToast("저장했어요");
      // 서버 patient prop(전체 교체 계약의 스냅샷 원본)을 최신화 — 다음 저장이 stale 값을
      //   되쓰지 않도록(검수 반영). force-dynamic 이라 refresh 시 get_clinic_patient 재조회.
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요", { tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ClinicShell back="/clinic/patients">
      <section className="mx-auto w-full max-w-[680px] py-6">
        {/* 스냅샷 — 동의 시 회원이 제공한 정보. pending 에는 병원 등록값만(§8.1 원본 미표시). */}
        <div className={BOX}>
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-[18px] font-bold text-[var(--text)]">
              {patient.patient_name || patient.member_handle || "환자"}
            </h1>
            <StatusBadge status={patient.status} />
          </div>
          <dl className="mt-4 space-y-2.5">
            <Row label="아이디" value={patient.member_handle ? `@${patient.member_handle}` : "—"} />
            <Row label="생년월일" value={patient.patient_birthdate ?? "—"} />
            <Row label="이메일" value={patient.patient_email ?? "—"} />
            {consentDate && <Row label="동의일" value={consentDate} />}
          </dl>

          {spRows.length > 0 && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <h2 className="text-[14px] font-bold text-[var(--text)]">피부 프로필</h2>
              <dl className="mt-2.5 space-y-2.5">
                {spRows.map((r) => (
                  <div key={r.label} className="flex gap-3">
                    <dt className="w-[72px] shrink-0 text-[13px] text-[var(--text-muted)]">
                      {r.label}
                    </dt>
                    <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px] text-[var(--text)]">
                      {r.tone && (
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--border)]"
                          style={{ background: r.tone }}
                        />
                      )}
                      <span className="min-w-0 break-keep">{r.value}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        {/* 병원 항목 수정 */}
        <div className={`${BOX} mt-4`}>
          <h2 className="text-[16px] font-bold text-[var(--text)]">병원 기록</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelCls}>등록번호</label>
              <input
                className={inputCls}
                value={editRegNo}
                maxLength={100}
                spellCheck={false}
                placeholder="원내 등록번호"
                onChange={(e) => setEditRegNo(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>전화번호</label>
              <input
                className={inputCls}
                type="tel"
                value={editPhone}
                maxLength={50}
                spellCheck={false}
                placeholder="예: 010-1234-5678"
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>주소</label>
              <input
                className={inputCls}
                value={editAddr}
                maxLength={200}
                spellCheck={false}
                placeholder="환자 주소"
                onChange={(e) => setEditAddr(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="h-11 w-full rounded-md bg-[var(--primary)] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "저장 중…" : "저장하기"}
            </button>
          </div>
        </div>

        {/* 시술노트 작성 — active 만. 그 외 상태는 사유 안내. */}
        {patient.status === "active" ? (
          <Link
            href={`/clinic/visits/new?link=${patient.link_id}`}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-[var(--primary)] text-[15.5px] font-bold text-white transition-colors hover:bg-[var(--primary-dark)]"
          >
            시술노트 작성
          </Link>
        ) : (
          <p className="mt-4 text-center text-[13px] leading-relaxed text-[var(--text-muted)]">
            {patient.status === "pending"
              ? "회원의 동의를 기다리고 있어요. 동의가 완료되면 시술노트를 작성할 수 있어요."
              : patient.status === "rejected"
                ? "회원이 연결 요청을 거절했어요."
                : "연결이 해제되어 시술노트를 작성할 수 없어요."}
          </p>
        )}
      </section>
    </ClinicShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[72px] shrink-0 text-[13px] text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 break-all text-[13.5px] text-[var(--text)]">{value}</dd>
    </div>
  );
}
