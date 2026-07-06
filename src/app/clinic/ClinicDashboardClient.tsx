"use client";

/**
 * ClinicDashboardClient — /clinic 병원 대시보드 본문 (병원계정 B4, 계획 §8.1·§8.4).
 *
 * 3섹션 + 작성 화면:
 *   ① 환자 등록 — 아이디+이름+생년월일(+등록번호) → POST /api/clinic/links (동의 요청).
 *      회원 이름·생일 "원본" 은 절대 표시하지 않음(§8.1) — 화면의 값은 전부 병원이 입력한
 *      값 또는 동의 시 회원이 제공한 스냅샷(clinic_member_links.patient_*)뿐.
 *   ② 환자 목록/검색 — GET /api/clinic/patients?q= (이름·등록번호·아이디). 행 클릭 → 상세.
 *   ③ 환자 상세 — 스냅샷(생일·이메일·피부 프로필) + 병원 항목(등록번호·전화·주소) 수정 폼.
 *      PATCH /api/clinic/patients/{linkId} 는 **전체 교체 계약**: 화면에서 수정하지 않는
 *      회원 스냅샷 필드(patient_name·birthdate·email·skin_profile)도 로드된 현재값을
 *      그대로 함께 전송해야 한다(생략=NULL 소거 — clinic_update_patient 0345).
 *   ④ 시술노트 작성 — status='active' 환자만. DiaryForm(mode='clinic') 임베드,
 *      저장 완료(onClinicSaved) 시 작성 화면을 닫고 목록으로 복귀.
 *
 * 규칙(§8.4): 라이트 테마, 색은 globals.css CSS 변수만(하드코딩 금지), 그림자 미사용,
 *   "필수/선택" 글자 라벨 미표시(검증만), input 16px(form-styles), 존댓말 문구, 모바일 우선.
 *
 * ※ deferred — 헤더 "오늘 작성 건수"(§8.1)는 병원이 자기 작성 노트를 조회할 RPC 부재로
 *   이번 범위 제외(page.tsx 주석 참조).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DiaryForm } from "@/components/skin/record/SkinDiaryForms";
import BirthdateSelect from "@/components/forms/BirthdateSelect";
import { inputCls, labelCls } from "@/lib/form-styles";
import { showToast } from "@/lib/toast";
import { GENDERS, SKIN_LABEL, FACE_LABEL } from "@/lib/profile-options";
import { FITZPATRICK_TONES } from "@/lib/fitzpatrick";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";

/** get_clinic_patients / get_clinic_patient RPC 1행 — /api/clinic/patients 응답 items[] 형태. */
export type ClinicPatientItem = {
  link_id: number;
  /** pending(동의 대기) | active(연결됨) | rejected(거절) | revoked(해제) */
  status: string;
  member_handle: string | null;
  patient_name: string | null;
  patient_birthdate: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  patient_address: string | null;
  registration_number: string | null;
  patient_skin_profile: Record<string, unknown> | null;
  consent_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

type ClinicDoctorOption = { id: string; name: string };

type Props = {
  /** 지점명 — active 병원 명함 display_name (예: "힐하우스피부과의원 강남점"). */
  clinicName: string;
  /** 소속 재직 원장(doctors WHERE clinic_id=지점 AND is_affiliated) — DiaryForm 드롭다운. */
  doctors: ClinicDoctorOption[];
  /** 시술 사전(tag_dictionary is_procedure) — /write 와 동일 소스(getReviewProcedures). */
  procedures: ProcedureOption[];
  /** 초기 환자 목록(서버 조회) — 이후 갱신은 GET /api/clinic/patients?q=. */
  initialPatients: ClinicPatientItem[];
};

/** 흰 글상자 — DiaryForm formBox 와 동일 규칙(테두리 X·음영 X). */
const boxCls = "rounded-[var(--radius)] bg-white p-5";

/** 상태 배지 — 4상태 라벨·톤(CSS 변수만). */
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "동의 대기", cls: "bg-[var(--bg)] text-[var(--text-secondary)]" },
  active: { label: "연결됨", cls: "bg-[var(--primary-soft)] text-[var(--primary-active)]" },
  rejected: { label: "거절", cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  revoked: { label: "해제", cls: "bg-[var(--bg)] text-[var(--text-muted)]" },
};

function StatusBadge({ status }: { status: string }) {
  const b = STATUS_BADGE[status] ?? { label: status, cls: "bg-[var(--bg)] text-[var(--text-muted)]" };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${b.cls}`}>
      {b.label}
    </span>
  );
}

const GENDER_LABEL: Record<string, string> = Object.fromEntries(
  GENDERS.map((g) => [g.key, g.label]),
);

/**
 * 피부 프로필 jsonb → 읽기 좋은 행 목록.
 * 키는 member_respond_link(0345)가 만드는 스냅샷 6종:
 *   gender / skin_type / skin_concerns / face_shape / fitzpatrick / interested_procedures.
 * 값 라벨은 각 SSOT(profile-options·fitzpatrick)에서 파생(하드코딩 금지). 미상 키·형은 생략.
 */
function skinProfileRows(
  sp: Record<string, unknown> | null,
): { label: string; value: string; tone?: string }[] {
  if (!sp) return [];
  const rows: { label: string; value: string; tone?: string }[] = [];
  const joinStrs = (v: unknown): string | null =>
    Array.isArray(v) && v.length > 0
      ? v.filter((x): x is string => typeof x === "string" && x !== "").join(" · ") || null
      : null;

  if (typeof sp.gender === "string" && sp.gender)
    rows.push({ label: "성별", value: GENDER_LABEL[sp.gender] ?? sp.gender });
  if (typeof sp.skin_type === "string" && sp.skin_type)
    rows.push({ label: "피부타입", value: SKIN_LABEL[sp.skin_type] ?? sp.skin_type });
  const concerns = joinStrs(sp.skin_concerns);
  if (concerns) rows.push({ label: "피부고민", value: concerns });
  if (typeof sp.face_shape === "string" && sp.face_shape)
    rows.push({ label: "얼굴형", value: FACE_LABEL[sp.face_shape] ?? sp.face_shape });
  if (typeof sp.fitzpatrick === "number") {
    const t = FITZPATRICK_TONES.find((x) => x.v === sp.fitzpatrick);
    if (t) rows.push({ label: "피부색", value: `${t.v}단계 · ${t.caption}`, tone: t.tone });
  }
  const interests = joinStrs(sp.interested_procedures);
  if (interests) rows.push({ label: "관심시술", value: interests });
  return rows;
}

/** timestamptz → "YYYY. M. D." (KST 로컬). 파싱 실패 시 null. */
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ko-KR");
}

type Screen = "home" | "detail" | "write";

export default function ClinicDashboardClient({
  clinicName,
  doctors,
  procedures,
  initialPatients,
}: Props) {
  const [screen, setScreen] = useState<Screen>("home");

  /* ── ② 환자 목록/검색 ───────────────────────────────── */
  const [items, setItems] = useState<ClinicPatientItem[]>(initialPatients);
  const [q, setQ] = useState("");
  const [loadingList, setLoadingList] = useState(false);

  const refreshList = useCallback(async (search: string) => {
    setLoadingList(true);
    try {
      const res = await fetch(`/api/clinic/patients?q=${encodeURIComponent(search)}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
        showToast(j?.userMessage || "목록을 불러오지 못했어요", { tone: "danger" });
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { items?: ClinicPatientItem[] };
      setItems(Array.isArray(j?.items) ? j.items : []);
    } catch {
      showToast("네트워크 오류가 발생했어요", { tone: "danger" });
    } finally {
      setLoadingList(false);
    }
  }, []);

  // 검색 디바운스(300ms). 첫 렌더는 서버 초기 목록을 그대로 쓰므로 스킵.
  const firstSearchRef = useRef(true);
  useEffect(() => {
    if (firstSearchRef.current) {
      firstSearchRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      void refreshList(q.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [q, refreshList]);

  /* ── ① 환자 등록 폼 ─────────────────────────────────── */
  const [regHandle, setRegHandle] = useState("");
  const [regName, setRegName] = useState("");
  const [regBirth, setRegBirth] = useState(""); // BirthdateSelect 합성값 "YYYY-MM-DD" | ""
  const [regNo, setRegNo] = useState("");
  const [registering, setRegistering] = useState(false);
  // BirthdateSelect 는 3분할 상태를 내부 보유 — 등록 성공 리셋은 key 리마운트로(2인 검수 반영:
  //   value="" 는 '불완전 입력 중'과 구분 불가라 effect 동기화 대신 리마운트가 안전).
  const [regFormKey, setRegFormKey] = useState(0);

  async function submitRegister() {
    if (registering) return;
    const handle = regHandle.trim().replace(/^@/, "").toLowerCase();
    const name = regName.trim();
    if (!handle) {
      showToast("회원 아이디를 입력해주세요");
      return;
    }
    if (!name) {
      showToast("이름을 입력해주세요");
      return;
    }
    if (!regBirth) {
      showToast("생년월일을 선택해주세요");
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch("/api/clinic/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          legal_name: name,
          birthdate: regBirth,
          registration_number: regNo.trim() || null,
        }),
      });
      if (!res.ok) {
        // match_failed(400)·이미 pending/active(409)·429 등 — 서버 userMessage 그대로 안내.
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
        showToast(j?.userMessage || "요청에 실패했어요. 잠시 후 다시 시도해주세요.", {
          tone: "danger",
        });
        return;
      }
      showToast("동의 요청을 보냈어요. 회원이 동의하면 시술노트를 작성할 수 있어요.", {
        durationMs: 4500,
      });
      setRegHandle("");
      setRegName("");
      setRegBirth("");
      setRegNo("");
      setRegFormKey((k) => k + 1); // BirthdateSelect 내부 3분할 상태까지 리셋(리마운트)
      await refreshList(q.trim());
    } catch {
      showToast("네트워크 오류가 발생했어요", { tone: "danger" });
    } finally {
      setRegistering(false);
    }
  }

  /* ── ③ 환자 상세 + 병원 항목 수정 ────────────────────── */
  const [selected, setSelected] = useState<ClinicPatientItem | null>(null);
  const [editRegNo, setEditRegNo] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddr, setEditAddr] = useState("");
  const [savingDetail, setSavingDetail] = useState(false);
  // 상세 fresh 재로드가 도착하기 전에 병원이 입력을 시작했으면 폼 초기화를 덮어쓰지 않는다.
  const editTouchedRef = useRef(false);

  const initEditFields = useCallback((row: ClinicPatientItem) => {
    setEditRegNo(row.registration_number ?? "");
    setEditPhone(row.patient_phone ?? "");
    setEditAddr(row.patient_address ?? "");
  }, []);

  async function openDetail(row: ClinicPatientItem) {
    editTouchedRef.current = false;
    setSelected(row);
    initEditFields(row);
    setScreen("detail");
    // 전체 교체 계약(PATCH) — 목록 값이 낡았을 수 있어 단건을 fresh 재로드해 스냅샷 필드를
    // 최신으로 유지한다. 재로드 실패 시 낡은 목록 값이 PATCH 로 되쓰여질 수 있어 경고 토스트
    // (2인 검수 반영 — 저장 자체는 허용하되 병원이 인지하고 진행).
    try {
      const res = await fetch(`/api/clinic/patients/${row.link_id}`, { cache: "no-store" });
      const fresh = res.ok
        ? ((await res.json().catch(() => null)) as ClinicPatientItem | null)
        : null;
      if (!fresh || typeof fresh.link_id !== "number") {
        showToast("최신 정보를 불러오지 못했어요. 저장 전에 내용을 한 번 더 확인해주세요.", {
          tone: "danger",
        });
        return;
      }
      setSelected(fresh);
      if (!editTouchedRef.current) initEditFields(fresh);
    } catch {
      showToast("최신 정보를 불러오지 못했어요. 저장 전에 내용을 한 번 더 확인해주세요.", {
        tone: "danger",
      });
    }
  }

  async function saveDetail() {
    if (!selected || savingDetail) return;
    setSavingDetail(true);
    try {
      const res = await fetch(`/api/clinic/patients/${selected.link_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_number: editRegNo.trim() || null,
          patient_phone: editPhone.trim() || null,
          patient_address: editAddr.trim() || null,
          // ⚠️ 전체 교체 계약 — 화면에서 수정하지 않는 회원 스냅샷 필드도 로드된 현재값을
          //    그대로 전송(생략하면 clinic_update_patient 가 NULL 로 소거).
          patient_name: selected.patient_name,
          patient_birthdate: selected.patient_birthdate,
          patient_email: selected.patient_email,
          patient_skin_profile: selected.patient_skin_profile,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
        showToast(j?.userMessage || "저장에 실패했어요", { tone: "danger" });
        return;
      }
      const next: ClinicPatientItem = {
        ...selected,
        registration_number: editRegNo.trim() || null,
        patient_phone: editPhone.trim() || null,
        patient_address: editAddr.trim() || null,
      };
      setSelected(next);
      setItems((prev) => prev.map((it) => (it.link_id === next.link_id ? next : it)));
      showToast("저장했어요");
    } catch {
      showToast("네트워크 오류가 발생했어요", { tone: "danger" });
    } finally {
      setSavingDetail(false);
    }
  }

  /* ── ④ 시술노트 작성(DiaryForm mode='clinic') ─────────── */
  const [writing, setWriting] = useState<ClinicPatientItem | null>(null);
  const [writeDirty, setWriteDirty] = useState(false);
  const [confirmLeaveWrite, setConfirmLeaveWrite] = useState(false);

  function startWrite(row: ClinicPatientItem) {
    setWriteDirty(false);
    setWriting(row);
    setScreen("write");
  }

  // 작성 화면 상단 "목록으로" — 작성 중(dirty)이면 이탈 확인(DiaryForm 내부 가드는
  // 라우트 이동만 가로채므로, 이 화면 내 상태 전환은 여기서 확인한다).
  function requestCloseWrite() {
    if (writeDirty) {
      setConfirmLeaveWrite(true);
      return;
    }
    closeWrite();
  }

  function closeWrite() {
    setConfirmLeaveWrite(false);
    setWriteDirty(false);
    setWriting(null);
    setScreen("home");
  }

  /* ════════════════ 작성 화면 ════════════════ */
  if (screen === "write" && writing) {
    return (
      <>
        <div className="mx-auto w-full max-w-[680px] pt-2">
          <button
            type="button"
            onClick={requestCloseWrite}
            className="text-[13.5px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text)]"
          >
            ← 목록으로
          </button>
        </div>
        {/* 저장 완료(onClinicSaved) 시 이 화면을 즉시 닫으므로 DiaryForm 내부 완료 모달은
            표시되지 않는다 — 완료 안내는 아래 토스트가 담당. */}
        <DiaryForm
          key={writing.link_id} // 환자 전환 시 폼 상태 완전 리셋(2인 검수 반영 — 상태 오염 차단)
          mode="clinic"
          clinicPatient={{
            linkId: writing.link_id,
            patientName: writing.patient_name,
            memberHandle: writing.member_handle,
          }}
          clinicDoctors={doctors}
          procedures={procedures}
          toast={(m) => showToast(m)}
          go={() => {
            /* 더미 — 병원 모드 화면 전환은 onClinicSaved 가 담당 */
          }}
          onDirtyChange={setWriteDirty}
          onClinicSaved={() => {
            closeWrite();
            showToast("시술노트를 저장했어요. 회원에게 알림이 발송돼요.", {
              durationMs: 4500,
            });
            void refreshList(q.trim());
          }}
        />
        {/* 이탈 확인 모달 — DiaryForm 의 이탈 모달과 동일 문구·톤. */}
        {confirmLeaveWrite && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
            onClick={() => setConfirmLeaveWrite(false)}
          >
            <div
              className="w-full max-w-[340px] rounded-[var(--radius)] bg-white p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[17px] font-extrabold text-[var(--text)]">작성을 멈추고 나갈까요?</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                지금 나가면 작성 중인 내용은 저장되지 않아요.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmLeaveWrite(false)}
                  className="block flex-1 rounded-md bg-[var(--primary)] py-3 text-[14.5px] font-bold text-white"
                >
                  계속 쓰기
                </button>
                <button
                  type="button"
                  onClick={closeWrite}
                  className="block flex-1 rounded-md border border-[var(--border)] bg-white py-3 text-[14.5px] font-bold text-[var(--text-secondary)]"
                >
                  나가기
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /* ════════════════ 상세 화면 ════════════════ */
  if (screen === "detail" && selected) {
    const spRows = skinProfileRows(selected.patient_skin_profile);
    const consentDate = fmtDate(selected.consent_at);
    return (
      <section className="mx-auto w-full max-w-[680px] py-6">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setScreen("home");
          }}
          className="text-[13.5px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          ← 목록으로
        </button>

        {/* 스냅샷 — 동의 시 회원이 제공한 정보(clinic_member_links.patient_*).
            동의 전(pending)에는 병원이 등록 시 입력한 값만 존재한다(§8.1 원본 미표시). */}
        <div className={`${boxCls} mt-3`}>
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-[18px] font-bold text-[var(--text)]">
              {selected.patient_name || selected.member_handle || "환자"}
            </h1>
            <StatusBadge status={selected.status} />
          </div>
          <dl className="mt-4 space-y-2.5">
            <div className="flex gap-3">
              <dt className="w-[72px] shrink-0 text-[13px] text-[var(--text-muted)]">아이디</dt>
              <dd className="min-w-0 flex-1 break-all text-[13.5px] text-[var(--text)]">
                {selected.member_handle ? `@${selected.member_handle}` : "—"}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-[72px] shrink-0 text-[13px] text-[var(--text-muted)]">생년월일</dt>
              <dd className="min-w-0 flex-1 text-[13.5px] text-[var(--text)]">
                {selected.patient_birthdate ?? "—"}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-[72px] shrink-0 text-[13px] text-[var(--text-muted)]">이메일</dt>
              <dd className="min-w-0 flex-1 break-all text-[13.5px] text-[var(--text)]">
                {selected.patient_email ?? "—"}
              </dd>
            </div>
            {consentDate && (
              <div className="flex gap-3">
                <dt className="w-[72px] shrink-0 text-[13px] text-[var(--text-muted)]">동의일</dt>
                <dd className="min-w-0 flex-1 text-[13.5px] text-[var(--text)]">{consentDate}</dd>
              </div>
            )}
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
                      {/* 피부색 스와치 — 색값은 FITZPATRICK_TONES SSOT 파생(하드코딩 아님). */}
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

        {/* 병원 항목 수정 — 등록번호·전화·주소(병원 운영값, 회원과 동기화 안 됨). */}
        <div className={`${boxCls} mt-4`}>
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
                onChange={(e) => {
                  editTouchedRef.current = true;
                  setEditRegNo(e.target.value);
                }}
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
                onChange={(e) => {
                  editTouchedRef.current = true;
                  setEditPhone(e.target.value);
                }}
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
                onChange={(e) => {
                  editTouchedRef.current = true;
                  setEditAddr(e.target.value);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => void saveDetail()}
              disabled={savingDetail}
              className="h-11 w-full rounded-md bg-[var(--primary)] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingDetail ? "저장 중…" : "저장하기"}
            </button>
          </div>
        </div>

        {/* 시술노트 작성 — 동의 완료(active)만. 그 외 상태는 사유 안내. */}
        {selected.status === "active" ? (
          <button
            type="button"
            onClick={() => startWrite(selected)}
            className="mt-4 h-12 w-full rounded-md bg-[var(--primary)] text-[15.5px] font-bold text-white transition-colors hover:bg-[var(--primary-dark)]"
          >
            시술노트 작성
          </button>
        ) : (
          <p className="mt-4 text-center text-[13px] leading-relaxed text-[var(--text-muted)]">
            {selected.status === "pending"
              ? "회원의 동의를 기다리고 있어요. 동의가 완료되면 시술노트를 작성할 수 있어요."
              : selected.status === "rejected"
                ? "회원이 연결 요청을 거절했어요."
                : "연결이 해제되어 시술노트를 작성할 수 없어요."}
          </p>
        )}
      </section>
    );
  }

  /* ════════════════ 홈(대시보드) ════════════════ */
  return (
    <section className="mx-auto w-full max-w-[680px] py-6">
      {/* 헤더 — 지점명(병원 명함 display_name). "오늘 작성 건수"는 deferred(파일 상단 주석). */}
      <header className="mb-5">
        <h1 className="text-[20px] font-bold leading-[1.4] text-[var(--text)]">{clinicName}</h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          회원의 동의를 받은 뒤 시술노트를 대신 작성할 수 있어요.
        </p>
      </header>

      {/* ① 환자 등록 */}
      <div className={boxCls}>
        <h2 className="text-[16px] font-bold text-[var(--text)]">환자 등록</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
          아이디·이름·생년월일이 일치하는 회원에게 동의 요청 알림이 발송돼요.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className={labelCls}>회원 아이디</label>
            <input
              className={inputCls}
              value={regHandle}
              maxLength={30}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="예: pibutenten"
              onChange={(e) => setRegHandle(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>이름</label>
            <input
              className={inputCls}
              value={regName}
              maxLength={50}
              spellCheck={false}
              placeholder="환자 실명"
              onChange={(e) => setRegName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>생년월일</label>
            <BirthdateSelect
              key={regFormKey}
              value={regBirth}
              onChange={setRegBirth}
              className="flex gap-1.5"
            />
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
            onClick={() => void submitRegister()}
            disabled={registering}
            className="h-11 w-full rounded-md bg-[var(--primary)] text-[15px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {registering ? "요청 보내는 중…" : "동의 요청 보내기"}
          </button>
        </div>
      </div>

      {/* ② 환자 목록/검색 */}
      <div className={`${boxCls} mt-4`}>
        <h2 className="text-[16px] font-bold text-[var(--text)]">환자 목록</h2>
        <input
          className={`${inputCls} mt-3`}
          value={q}
          autoComplete="off"
          spellCheck={false}
          placeholder="이름·등록번호·아이디 검색"
          onChange={(e) => setQ(e.target.value)}
        />
        {loadingList && (
          <p className="mt-4 text-center text-[12.5px] text-[var(--text-muted)]">불러오는 중…</p>
        )}
        {!loadingList && items.length === 0 && (
          <p className="mt-4 text-center text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            {q.trim()
              ? "검색 결과가 없어요."
              : "아직 등록된 환자가 없어요. 위에서 환자를 등록해보세요."}
          </p>
        )}
        {!loadingList && items.length > 0 && (
          <div className="mt-2">
            {items.map((it) => (
              <button
                key={it.link_id}
                type="button"
                onClick={() => void openDetail(it)}
                className="flex w-full items-center gap-2 border-b border-[var(--border)] px-1 py-3 text-left last:border-0 hover:bg-[var(--primary-soft)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-[var(--text)]">
                    {it.patient_name || it.member_handle || "이름 미입력"}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--text-muted)]">
                    {it.member_handle ? `@${it.member_handle}` : "아이디 없음"}
                    {it.registration_number ? ` · ${it.registration_number}` : ""}
                  </span>
                </span>
                <StatusBadge status={it.status} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
