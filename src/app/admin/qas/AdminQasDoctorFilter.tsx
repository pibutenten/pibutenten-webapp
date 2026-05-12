"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Doctor = { id: string; slug: string; name: string };

type Props = {
  doctors: Doctor[];
  currentSlug: string;
  /** 다른 filter들도 navigate 시 함께 보존하기 위한 base path. 예: "/admin/qas?status=published&q=foo" */
  basePath: string;
};

/**
 * 관리자 전용 doctor 필터 select.
 *
 * - onChange 즉시 navigate (검색 버튼 X)
 * - 다른 필터(status/type/category/pick/q)는 basePath에 이미 포함되어 있어 유지됨
 * - "전체 원장"이면 doctor 파라미터 제거
 */
export default function AdminQasDoctorFilter({
  doctors,
  currentSlug,
  basePath,
}: Props) {
  const router = useRouter();
  const [, startNav] = useTransition();

  function handleChange(nextSlug: string) {
    const url = new URL(basePath, "http://x");
    if (nextSlug) {
      url.searchParams.set("doctor", nextSlug);
    } else {
      url.searchParams.delete("doctor");
    }
    // 페이지 번호는 doctor 변경 시 리셋
    url.searchParams.delete("page");
    const next = `${url.pathname}${url.search}`;
    startNav(() => router.push(next));
  }

  return (
    <select
      id="admin-qas-doctor-filter"
      value={currentSlug}
      onChange={(e) => handleChange(e.target.value)}
      className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
    >
      <option value="">전체 원장</option>
      {doctors.map((d) => (
        <option key={d.id} value={d.slug}>
          {d.name}
        </option>
      ))}
    </select>
  );
}
