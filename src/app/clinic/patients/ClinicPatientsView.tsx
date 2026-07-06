"use client";

/**
 * ClinicPatientsView — /clinic/patients 환자 목록/검색 (B4 재설계).
 *
 * 서버 초기 목록(get_clinic_patients)을 받고, 검색은 클라가 300ms 디바운스로
 * GET /api/clinic/patients?q= 재조회. 행 클릭 → /clinic/patients/[linkId] 상세.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { showToast } from "@/lib/toast";
import { inputCls } from "@/lib/form-styles";
import { ClinicShell, StatusBadge, BOX, type ClinicPatientItem } from "../_shared";

export default function ClinicPatientsView({
  initialPatients,
}: {
  initialPatients: ClinicPatientItem[];
}) {
  const [items, setItems] = useState<ClinicPatientItem[]>(initialPatients);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const refreshList = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clinic/patients?q=${encodeURIComponent(search)}`, {
        cache: "no-store",
      });
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
      setLoading(false);
    }
  }, []);

  // 검색 디바운스(300ms). 첫 렌더는 서버 초기 목록 사용 → 스킵.
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const t = setTimeout(() => void refreshList(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q, refreshList]);

  return (
    <ClinicShell back="/clinic">
      <section className="mx-auto w-full max-w-[680px] py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-[20px] font-bold text-[var(--text)]">환자 목록</h1>
          <Link
            href="/clinic/patients/new"
            className="shrink-0 rounded-full bg-[var(--primary)] px-4 py-2 text-[13px] font-semibold text-white"
          >
            + 환자 등록
          </Link>
        </div>

        <div className={BOX}>
          <input
            className={inputCls}
            value={q}
            autoComplete="off"
            spellCheck={false}
            placeholder="이름·등록번호·아이디 검색"
            onChange={(e) => setQ(e.target.value)}
          />
          {loading && (
            <p className="mt-4 text-center text-[12.5px] text-[var(--text-muted)]">불러오는 중…</p>
          )}
          {!loading && items.length === 0 && (
            <p className="mt-4 text-center text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              {q.trim()
                ? "검색 결과가 없어요."
                : "아직 등록된 환자가 없어요. ‘환자 등록’에서 추가해보세요."}
            </p>
          )}
          {!loading && items.length > 0 && (
            <div className="mt-2">
              {items.map((it) => (
                <Link
                  key={it.link_id}
                  href={`/clinic/patients/${it.link_id}`}
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
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </ClinicShell>
  );
}
