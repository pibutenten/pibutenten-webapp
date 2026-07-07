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
import { showToast } from "@/lib/toast";
import { GENDERS } from "@/lib/profile-options";
import {
  ClinicShell,
  StatusBadge,
  skinProfileRows,
  fmtDate,
  fmtBirth,
  fmtVisitDate,
  fmtDateShort,
  fmtPrice,
  ageFromBirth,
  BOX,
  type ClinicPatientItem,
} from "../../_shared";

/** admin 필터폼과 동일한 입력·라벨 톤(C10) — h-9 · --line 테두리 · --tt-blue 포커스. */
const adminInputCls =
  "h-9 w-full rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-3 text-[16px] text-[var(--ink-900)] transition-colors placeholder:text-[var(--ink-300)] focus:border-[var(--tt-blue)] focus:outline-none";
const adminLabelCls = "mb-1.5 block text-sm font-semibold text-[var(--ink-700)]";

const GENDER_LABEL: Record<string, string> = Object.fromEntries(
  GENDERS.map((g) => [g.key, g.label]),
);

/** get_clinic_patient_visits(0350) 1행 = 그 환자의 시술노트 1건 + 자식 시술 항목. */
export type ClinicVisitItem = {
  diary_id: number;
  visited_on: string | null;
  visited_on_precision: string | null;
  doctor_name: string | null;
  doctor_id: string | null;
  manager_name: string | null;
  diary_body: string | null;
  total_price: number | null;
  next_appointment_date: string | null;
  created_at: string;
  updated_at: string;
  procedures:
    | {
        id: number;
        procedure_ko: string | null;
        tag_dict_ko: string | null;
        unit_text: string | null;
        price: number | null;
        note: string | null;
        sort_order: number | null;
      }[]
    | null;
};

export default function ClinicPatientDetailView({
  patient,
  visits,
}: {
  patient: ClinicPatientItem;
  visits: ClinicVisitItem[];
}) {
  const router = useRouter();
  const [editRegNo, setEditRegNo] = useState(patient.registration_number ?? "");
  const [editPhone, setEditPhone] = useState(patient.patient_phone ?? "");
  const [editAddr, setEditAddr] = useState(patient.patient_address ?? "");
  const [saving, setSaving] = useState(false);
  // 병원 기록 카드 접기/펼치기 — 기본 접힘. 입력값이 로드 스냅샷과 달라지면(편집 중) 자동 펼침 유지.
  const [recordOpen, setRecordOpen] = useState(false);
  const recordDirty =
    editRegNo !== (patient.registration_number ?? "") ||
    editPhone !== (patient.patient_phone ?? "") ||
    editAddr !== (patient.patient_address ?? "");
  const recordExpanded = recordOpen || recordDirty;
  // 접힘 시 헤더 오른쪽 요약 — 등록번호·전화·주소 중 값 있는 것만. 전부 비면 '미입력'.
  const recordSummary =
    [
      patient.registration_number?.trim(),
      patient.patient_phone?.trim(),
      patient.patient_address?.trim(),
    ]
      .filter((v): v is string => !!v)
      .join(" · ") || "미입력";

  const spRows = skinProfileRows(patient.patient_skin_profile);
  const consentDate = fmtDate(patient.consent_at);

  // 프로필 파생 표시값(§2.4) — 생일·만나이·성별. 없으면 "—".
  const birthText = fmtBirth(patient.patient_birthdate);
  // age_years 는 목록 v2 RPC 전용 — 단건 상세는 생일에서 직접 계산(위 ageFromBirth 주석).
  const ageText = ageFromBirth(patient.patient_birthdate);
  const genderRaw =
    patient.patient_skin_profile && typeof patient.patient_skin_profile.gender === "string"
      ? (patient.patient_skin_profile.gender as string)
      : "";
  const genderText = genderRaw ? (GENDER_LABEL[genderRaw] ?? genderRaw) : "—";

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
      <section className="mx-auto w-full max-w-[880px] py-6">
        {/* 스냅샷 — 동의 시 회원이 제공한 정보. pending 에는 병원 등록값만(§8.1 원본 미표시). */}
        <div className={BOX}>
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-[18px] font-bold text-[var(--ink-900)]">
              {patient.patient_name || patient.member_handle || "환자"}
            </h1>
            <StatusBadge status={patient.status} />
          </div>
          {/* 개인정보 — 2줄 인라인 압축(라벨 없이 · 구분). 세로 dl 폐기. */}
          <div className="mt-1.5 space-y-0.5 text-[13px] leading-relaxed text-[var(--ink-500)]">
            <p className="break-keep">
              {[
                patient.member_handle ? `@${patient.member_handle}` : null,
                birthText,
                ageText,
                genderText,
              ]
                .filter((t) => t && t !== "—")
                .join(" · ")}
            </p>
            {(patient.patient_email || consentDate) && (
              <p className="break-all">
                {[patient.patient_email, consentDate ? `동의 ${consentDate}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          {/* 피부 프로필 — 제목·구분선 없이 라벨(연회색)+값 인라인만(≈1~2줄). 성별은 개인정보와 중복이라 제외. */}
          {spRows.filter((r) => r.label !== "성별").length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
              {spRows
                .filter((r) => r.label !== "성별")
                .map((r) => (
                  <span key={r.label} className="inline-flex items-center gap-1 break-keep">
                    <span className="text-[var(--ink-300)]">{r.label}</span>
                    {r.tone && (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-[var(--line)]"
                        style={{ background: r.tone }}
                      />
                    )}
                    <span className="text-[var(--ink-700)]">{r.value}</span>
                  </span>
                ))}
            </div>
          )}
        </div>

        {/* ③ 시술 기록 타임라인 — 그 환자에게 병원이 쓴 시술노트 최근순(RPC가 이미 visited_on DESC 정렬).
            active 면 행 클릭=편집 진입, 그 외(revoked/rejected/pending)는 조회만(수정 차단 C2). */}
        <div className={`${BOX} mt-4`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-bold text-[var(--ink-900)]">시술 기록</h2>
            {visits.length > 0 && (
              <span className="text-[13px] text-[var(--ink-300)]">{visits.length}건</span>
            )}
          </div>

          {visits.length === 0 ? (
            <p className="mt-4 text-center text-[13px] leading-relaxed text-[var(--ink-500)]">
              아직 등록된 시술 기록이 없어요.
              {patient.status === "active" && (
                <>
                  <br />
                  아래 &lsquo;시술노트 작성&rsquo;으로 첫 기록을 남겨보세요.
                </>
              )}
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {visits.map((v) => (
                <VisitRow
                  key={v.diary_id}
                  visit={v}
                  linkId={patient.link_id}
                  editable={patient.status === "active"}
                />
              ))}
            </ul>
          )}
        </div>

        {/* 시술노트 작성 — active 만. 그 외 상태는 사유 안내. */}
        {patient.status === "active" ? (
          <Link
            href={`/clinic/visits/new?link=${patient.link_id}`}
            // ⚠ 흰 글씨 인라인 고정 — app.module.css `:where(.root) a{color:inherit}`(언레이어)가
            //   Tailwind text-white(레이어)를 이겨 링크 글씨가 어둡게 상속되던 것 차단(<a> 버튼 전용).
            style={{ color: "#fff" }}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-[var(--r-btn)] bg-[var(--tt-blue)] text-[15.5px] font-bold text-white transition-colors hover:bg-[var(--tt-blue-deep)]"
          >
            시술노트 작성
          </Link>
        ) : (
          <p className="mt-4 text-center text-[13px] leading-relaxed text-[var(--ink-500)]">
            {patient.status === "pending"
              ? "회원의 동의를 기다리고 있어요. 동의가 완료되면 시술노트를 작성할 수 있어요."
              : patient.status === "rejected"
                ? "회원이 연결 요청을 거절했어요."
                : "연결이 해제되어 시술노트를 작성할 수 없어요."}
          </p>
        )}

        {/* 병원 항목 수정 — 클릭 토글(기본 접힘). 접힘=요약 한 줄, 펼침=편집 폼. 편집 중이면 자동 펼침. */}
        <div className={`${BOX} mt-4`}>
          <button
            type="button"
            onClick={() => setRecordOpen((o) => !o)}
            aria-expanded={recordExpanded}
            aria-controls="clinic-record-panel"
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <h2 className="text-[16px] font-bold text-[var(--ink-900)]">병원 기록</h2>
            <span className="flex min-w-0 items-center gap-2">
              {!recordExpanded && recordSummary && (
                <span className="min-w-0 truncate text-[13px] text-[var(--ink-500)]">
                  {recordSummary}
                </span>
              )}
              <span
                aria-hidden
                className={`shrink-0 text-[13px] text-[var(--ink-300)] transition-transform ${
                  recordExpanded ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </span>
          </button>
          {recordExpanded && (
            <div className="mt-4" id="clinic-record-panel" role="region" aria-label="병원 기록 편집">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={adminLabelCls}>등록번호</label>
                  <input
                    className={adminInputCls}
                    value={editRegNo}
                    maxLength={100}
                    spellCheck={false}
                    placeholder="원내 등록번호"
                    onChange={(e) => setEditRegNo(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelCls}>전화번호</label>
                  <input
                    className={adminInputCls}
                    type="tel"
                    value={editPhone}
                    maxLength={50}
                    spellCheck={false}
                    placeholder="예: 010-1234-5678"
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className={adminLabelCls}>주소</label>
                  <input
                    className={adminInputCls}
                    value={editAddr}
                    maxLength={200}
                    spellCheck={false}
                    placeholder="환자 주소"
                    onChange={(e) => setEditAddr(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="mt-4 h-11 w-full rounded-[var(--r-btn)] bg-[var(--tt-blue)] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--tt-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "저장 중…" : "저장하기"}
              </button>
            </div>
          )}
        </div>
      </section>
    </ClinicShell>
  );
}

/**
 * 시술 기록 타임라인 1행. active 면 편집 페이지로 링크(→ 아이콘), 그 외 상태는 비활성 정적 행(C2 조회만).
 * 편집 경로(S3a 신설)는 문자열 참조만 — 이 파일이 그 라우트 파일에 의존하지 않음.
 */
function VisitRow({
  visit: v,
  linkId,
  editable,
}: {
  visit: ClinicVisitItem;
  linkId: number;
  editable: boolean;
}) {
  const dateText = fmtVisitDate(v.visited_on);
  const procNames = (v.procedures ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((p) => p.procedure_ko)
    .filter((n): n is string => typeof n === "string" && n !== "");
  const procSummary = procNames.length > 0 ? procNames.join(" · ") : "시술 기록";
  const doctorText = v.doctor_name ? `${v.doctor_name} 원장` : null;
  const priceText = fmtPrice(v.total_price);
  const nextText = fmtDateShort(v.next_appointment_date);

  const nextPill = nextText ? (
    <span className="shrink-0 rounded-full bg-[var(--tt-blue-tint)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tt-blue-deep)]">
      다음 {nextText}
    </span>
  ) : null;

  // 모바일(md↓): 날짜+다음예약 → 시술요약 → 원장·금액 세로. 데스크탑(md↑): 한 줄 가로.
  const inner = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-3">
        {/* 날짜(+ 모바일 다음예약 pill) */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[13px] font-bold text-[var(--tt-blue-deep)]">{dateText}</span>
          {nextPill && <span className="md:hidden">{nextPill}</span>}
        </div>
        {/* 시술요약 — 데스크탑에서 남는 폭 차지 + 말줄임 */}
        <p className="truncate text-[14px] font-semibold text-[var(--ink-900)] md:min-w-0 md:flex-1">
          {procSummary}
        </p>
        {/* 원장·금액(+ 데스크탑 다음예약 pill) */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-[var(--ink-500)] md:shrink-0 md:flex-nowrap">
          {doctorText && <span>{doctorText}</span>}
          {doctorText && priceText && <span className="text-[var(--ink-300)]">·</span>}
          {priceText && <span className="tabular-nums">{priceText}</span>}
          {nextPill && <span className="hidden md:inline-flex">{nextPill}</span>}
        </div>
      </div>
      {editable && (
        <span aria-hidden className="shrink-0 self-center text-[16px] text-[var(--ink-300)]">
          →
        </span>
      )}
    </>
  );

  const cls =
    "flex gap-3 rounded-[var(--r-btn)] border border-[var(--line)] p-3.5 transition-colors";

  if (editable) {
    return (
      <li>
        <Link
          href={`/clinic/patients/${linkId}/visits/${v.diary_id}/edit`}
          className={`${cls} hover:border-[var(--tt-blue)] hover:bg-[var(--tt-blue-tint)]`}
        >
          {inner}
        </Link>
      </li>
    );
  }
  return (
    <li className={cls} aria-disabled>
      {inner}
    </li>
  );
}
