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

/** 요일 라벨 — DiaryDetailView 와 동일 규칙(월=1 … 일=0). */
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

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

/** "YYYY-MM-DD" → "YYYY.MM.DD" (§2.4 표기). 형식 불일치면 원본 그대로. */
function fmtBirth(raw: string | null): string {
  if (!raw) return "—";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : raw;
}

/** "YYYY-MM-DD" → "YYYY.MM.DD (요일)" (§2.4 연도 포함). 형식 불일치·null 이면 "날짜 미상". */
function fmtVisitDate(raw: string | null): string {
  if (!raw) return "날짜 미상";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return raw;
  const dow = DOW[new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).getDay()];
  return `${m[1]}.${m[2]}.${m[3]} (${dow})`;
}

/** "YYYY-MM-DD" → "YYYY.MM.DD" (다음 예약 pill용, 요일 없음). */
function fmtDateShort(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : raw;
}

/** 금액(원) → "12만" 등 만 단위 축약. 만 미만·비정수는 "N원". null 이면 null. */
function fmtPrice(v: number | null): string | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 10000 && v % 10000 === 0) return `${(v / 10000).toLocaleString("ko-KR")}만`;
  if (v >= 10000) {
    const man = Math.floor(v / 10000);
    const rest = v % 10000;
    return `${man}만 ${rest.toLocaleString("ko-KR")}`;
  }
  return `${v.toLocaleString("ko-KR")}원`;
}

/**
 * 생일("YYYY-MM-DD") → "만 N세". 단건 RPC get_clinic_patient(0345)는 age_years 를 반환하지
 * 않으므로(목록 v2 전용) 상세는 생일에서 직접 계산한다(RPC date_part(age()) 와 동일 만 나이).
 */
function ageFromBirth(raw: string | null): string {
  if (!raw) return "—";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const [by, bm, bd] = [+m[1], +m[2], +m[3]];
  const now = new Date();
  let age = now.getFullYear() - by;
  if (now.getMonth() + 1 < bm || (now.getMonth() + 1 === bm && now.getDate() < bd)) age -= 1;
  return age >= 0 && age <= 130 ? `만 ${age}세` : "—";
}

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
      <section className="mx-auto w-full max-w-[680px] py-6">
        {/* 스냅샷 — 동의 시 회원이 제공한 정보. pending 에는 병원 등록값만(§8.1 원본 미표시). */}
        <div className={BOX}>
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-[18px] font-bold text-[var(--ink-900)]">
              {patient.patient_name || patient.member_handle || "환자"}
            </h1>
            <StatusBadge status={patient.status} />
          </div>
          <dl className="mt-4 space-y-2.5">
            <Row label="아이디" value={patient.member_handle ? `@${patient.member_handle}` : "—"} />
            <Row label="생년월일" value={birthText} />
            <Row label="나이" value={ageText} />
            <Row label="성별" value={genderText} />
            <Row label="이메일" value={patient.patient_email ?? "—"} />
            {consentDate && <Row label="동의일" value={consentDate} />}
          </dl>

          {spRows.length > 0 && (
            <div className="mt-4 border-t border-[var(--line)] pt-4">
              <h2 className="text-[14px] font-bold text-[var(--ink-900)]">피부 프로필</h2>
              <dl className="mt-2.5 space-y-2.5">
                {spRows.map((r) => (
                  <div key={r.label} className="flex gap-3">
                    <dt className="w-[72px] shrink-0 text-[13px] text-[var(--ink-300)]">
                      {r.label}
                    </dt>
                    <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px] text-[var(--ink-700)]">
                      {r.tone && (
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--line)]"
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
          <h2 className="text-[16px] font-bold text-[var(--ink-900)]">병원 기록</h2>
          <div className="mt-4 space-y-4">
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
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="h-11 w-full rounded-[var(--r-btn)] bg-[var(--tt-blue)] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--tt-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "저장 중…" : "저장하기"}
            </button>
          </div>
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
      </section>
    </ClinicShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[72px] shrink-0 text-[13px] text-[var(--ink-300)]">{label}</dt>
      <dd className="min-w-0 flex-1 break-all text-[13.5px] text-[var(--ink-700)]">{value}</dd>
    </div>
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

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-[var(--tt-blue-deep)]">{dateText}</span>
          {nextText && (
            <span className="shrink-0 rounded-full bg-[var(--tt-blue-tint)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tt-blue-deep)]">
              다음 {nextText}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-[14px] font-semibold text-[var(--ink-900)]">
          {procSummary}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-[var(--ink-500)]">
          {doctorText && <span>{doctorText}</span>}
          {doctorText && priceText && <span className="text-[var(--ink-300)]">·</span>}
          {priceText && <span className="tabular-nums">{priceText}</span>}
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
