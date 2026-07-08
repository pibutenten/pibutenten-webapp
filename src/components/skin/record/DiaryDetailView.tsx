"use client";

/**
 * DiaryDetailView — /notes/[id] 시술 기록 상세 페이지 본문(클라이언트).
 *   공용 셸(AppShell, active="내 노트") 안에
 *   detailHead(뒤로가기 /notes + svg + h1 "시술 기록") + 기존 카드/버튼/텍스트 구조.
 *   DB 조회·권한·notFound 가드는 서버 page.tsx 가 담당하고, 여기선 조회 결과(diary)를
 *   props 로 받아 표시용 가공(날짜·시술 제목·의료진·지도 링크)만 수행해 렌더한다.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../AppShell";
import styles from "../app.module.css";
import { showToast } from "@/lib/toast";

// 서버 page.tsx 의 DetailRow 와 동일 구조(조회 결과 1건).
export type DiaryDetail = {
  id: number;
  visited_on: string | null; // "YYYY-MM-DD" 또는 NULL(날짜 미상, precision='unknown' 마이그 0302)
  clinic_name: string | null;
  clinic_addr: string | null;
  clinic_tel: string | null;
  doctor_name: string | null;
  manager_name: string | null;
  diary_body: string | null;
  /** 작성 주체(마이그 0343) — 'clinic'(병원 대행)이면 헤더에 "병원 입력" 배지 (B5, §8.3). */
  source: "member" | "clinic";
  diary_procedures: {
    id: number; // diary_procedures.id — 후기 FK 판정 앵커(2c). procedure_ko 텍스트매칭 대신 이 id 로 '이미 씀' 판정.
    procedure_ko: string;
    unit_text: string | null;
    price: number | null;
    note: string | null;
    sort_order: number;
  }[];
  // 이 방문(visit_id)에 연결된 내 후기 + 각 후기의 시술 경과(review_checkin) 입력 시점(마이그 0292). 없으면 빈 배열.
  //   diary_procedure_id: 그 후기가 어느 시술(diary_procedures.id)에 연결됐는지 — FK 판정 키(2c).
  //     구 standalone 후기(diary_linked 이전)는 NULL → 시술별 판정 불가(그 시술은 '쓰기' 노출, 무회귀).
  //   card.shortcode: '내 후기 보기/수정' 링크 목적지(/review/{shortcode}/edit).
  linked_reviews?:
    | {
        id: number;
        procedure_ko: string | null;
        diary_procedure_id: number | null;
        card?: { shortcode: string | null } | null;
        review_checkin?: { timepoint: string }[] | null;
      }[]
    | null;
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const cardBox = "rounded-[var(--radius)] bg-white p-5";

/* 시술 경과 타임포인트 — 당일(작성 시 입력, 상태만) / 1주·1달·4달(체크인 폼 진입).
   value 는 review_checkin.timepoint CHECK 와 일치. 딥링크 폼은 week1/month1/month4 만 받음(checkin-shared). */
const PROGRESS_TIMEPOINTS: { value: string; label: string; link: boolean }[] = [
  { value: "day0", label: "당일", link: false },
  { value: "week1", label: "1주", link: true },
  { value: "month1", label: "1달", link: true },
  { value: "month4", label: "4달", link: true },
];

export default function DiaryDetailView({ diary: d }: { diary: DiaryDetail }) {
  const router = useRouter();
  // 삭제 확인 모달·진행 상태 — 본인 노트 삭제(C4). 이 화면은 page.tsx 가 RLS 로 본인 소유만 로드하므로
  //   렌더되면 곧 owner(수정·삭제 노출 가능).
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/visits/${d.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string; message?: string };
        showToast(j?.userMessage || j?.message || "삭제에 실패했어요", { tone: "danger" });
        setDeleting(false);
        return;
      }
      setConfirmDelete(false);
      showToast("시술 기록을 삭제했어요");
      router.push("/notes");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요", { tone: "danger" });
      setDeleting(false);
    }
  }

  // visited_on 이 NULL("날짜 잘 기억 안 나요", 마이그 0302)이면 split/Date 파싱을 건너뛰고 "날짜 미상" 표시.
  const dateUnknown = !d.visited_on;
  const [y, m, day] = dateUnknown ? ["", "", ""] : d.visited_on!.split("-");
  const weekday = dateUnknown ? "" : DOW[new Date(`${d.visited_on}T00:00:00`).getDay()];
  const procs = [...d.diary_procedures].sort((a, b) => a.sort_order - b.sort_order);
  const procTitle = procs.map((p) => p.procedure_ko).join(" · ") || "시술 기록";
  const medics = [d.doctor_name ? `${d.doctor_name} 원장님` : null, d.manager_name ? `${d.manager_name} 실장님` : null]
    .filter(Boolean)
    .join(" · ");
  const mapName = d.clinic_name ? encodeURIComponent(d.clinic_name) : "";
  // 이 방문에 연결된 내 후기 — 각 후기(시술)별 시술 경과(타임포인트) 입력 현황 표시·진입. 없으면 표시 안 함.
  const linkedReviews = d.linked_reviews ?? [];
  // 시술별 '이미 후기 씀' 판정 — diary_procedure_id(FK) → 그 후기 로 맵. procedure_ko 텍스트매칭 금지(2c).
  //   구 standalone(diary_procedure_id=NULL) 후기는 맵에 들어가지 않아 판정 불가 → 해당 시술은 '쓰기' 노출(무회귀).
  const reviewByDiaryProc = new Map<number, (typeof linkedReviews)[number]>();
  for (const r of linkedReviews) {
    if (r.diary_procedure_id != null) reviewByDiaryProc.set(r.diary_procedure_id, r);
  }

  return (
    <AppShell
      active="내 노트"
      /* 2뎁스 헤더 variant(R2-3) — 구 인라인 detailBack(Link /notes)에서 전환: 모바일은 헤더 좌측
         로고 자리 뒤로가기(이력 있으면 back, 직접 진입 fallback=/notes), 데스크탑은 본문 뒤로 행. */
      backHeader={{ fallbackHref: "/notes" }}
    >
      {/* 제목 행 — 뒤로가기는 셸 헤더(backHeader)로 이전, h1 만 유지(중복 뒤로 제거). */}
      <div className={styles.detailHead}>
        <h1 className={styles.detailTitle}>시술 기록</h1>
      </div>

      <section className="mx-auto w-full max-w-[680px] space-y-3">
        {/* 헤더 — 날짜·시술·병원·의료진 + 빠른 액션 */}
        <div className={cardBox}>
          <p className="text-[12px] font-bold text-[var(--primary-active)]">
            {dateUnknown ? "날짜 미상" : `${y}.${m}.${day} · ${weekday}요일`}
            <span className="ml-1 font-medium text-[var(--text-muted)]">· 나만 봐요</span>
            {/* "병원 입력" 배지 — 병원 대행 작성(source='clinic', 마이그 0343)일 때만.
                recBadge 토큰 재사용 + 브랜드 CSS 변수 색(내 노트 목록 ClinicBadge 와 동일 톤). */}
            {d.source === "clinic" && (
              <span
                className={`${styles.recBadge} ml-1.5`}
                style={{ background: "var(--primary-soft)", color: "var(--primary-active)" }}
              >
                병원 입력
              </span>
            )}
          </p>
          <p className="mt-1 text-[20px] font-bold text-[var(--text)]">{procTitle}</p>
          {d.clinic_name && <p className="mt-2 text-[14px] font-semibold text-[var(--text)]">{d.clinic_name}</p>}
          {medics && <p className="text-[13px] text-[var(--text-secondary)]">{medics}</p>}
          {(d.clinic_tel || d.clinic_name) && (
            <div className="mt-3 flex gap-2">
              {d.clinic_tel && (
                <a href={`tel:${d.clinic_tel}`} className="flex flex-1 items-center justify-center rounded-md bg-[var(--primary-soft)] py-2.5 text-[12.5px] font-semibold text-[var(--primary-active)]">
                  전화하기
                </a>
              )}
              {d.clinic_name && (
                <a href={`https://map.naver.com/p/search/${mapName}`} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white py-2.5 text-[12.5px] font-semibold text-[#03C75A] ring-1 ring-inset ring-[var(--border)]">
                  네이버 지도
                </a>
              )}
              {d.clinic_name && (
                <a href={`tmap://search?name=${mapName}`} rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white py-2.5 text-[12.5px] font-semibold text-[#1A56DB] ring-1 ring-inset ring-[var(--border)]">
                  티맵
                </a>
              )}
            </div>
          )}
          {d.clinic_addr && <p className="mt-2 text-[12px] text-[var(--text-muted)]">{d.clinic_addr}</p>}
        </div>

        {/* 받은 시술 — 시술명 · 용량 · 가격 · 메모 */}
        {procs.length > 0 && (
          <div className={cardBox + " space-y-2"}>
            {procs.map((p) => {
              // FK 판정 — 이 시술(diary_procedures.id)에 연결된 내 후기가 있으면 '보기/수정', 없으면 '쓰기'.
              //   already: diary_procedure_id 로만 매칭(procedure_ko 텍스트 비교 안 함). shortcode 있으면 편집 경로로.
              const already = reviewByDiaryProc.get(p.id);
              const reviewShortcode = already?.card?.shortcode ?? null;
              return (
                <div key={p.id} className="rounded-md bg-[var(--bg)] p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[14px] font-bold text-[var(--primary-active)]">
                      {p.procedure_ko}
                      {p.unit_text && <span className="ml-1 text-[12.5px] font-medium text-[var(--text-secondary)]">{p.unit_text}</span>}
                    </span>
                    {p.price != null && <span className="text-[13px] font-semibold text-[var(--text)]">{p.price.toLocaleString("ko-KR")}원</span>}
                  </div>
                  {p.note && <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{p.note}</p>}
                  <div className="mt-2 flex justify-end">
                    {already ? (
                      reviewShortcode ? (
                        // 이미 이 시술에 후기 작성함 — 후기 전용 에디터(/review/{shortcode}/edit)로. (개별 후기 noindex, 열람=수정 폼)
                        <Link
                          href={`/review/${reviewShortcode}/edit`}
                          className="text-[12px] font-semibold text-[var(--primary-active)] hover:underline"
                        >
                          내 후기 보기/수정
                        </Link>
                      ) : (
                        // 후기는 있으나 카드 shortcode 미확정(검토 중 등) — 중복 작성 방지 위해 '쓰기' 대신 안내만(검수 치명 반영).
                        <span className="text-[12px] font-medium text-[var(--text-muted)]">후기 검토 중</span>
                      )
                    ) : (
                      // 아직 없음(또는 구 standalone 판정 불가) — 그 방문·시술 지정해 새 후기 작성.
                      <Link
                        href={`/review/new?procedure=${encodeURIComponent(p.procedure_ko)}&visit=${d.id}&dp=${p.id}`}
                        className="text-[12px] font-semibold text-[var(--primary-active)] hover:underline"
                      >
                        시술후기 쓰기
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 시술 경과(타임포인트) — 각 후기(시술)별 당일/1주/1달/4달 입력 현황 + 진입.
            당일(day0)은 작성 시 입력(상태만), 1주/1달/4달은 체크인 폼(/reviews/{id}/checkins)으로 진입(입력 시 수정). */}
        {linkedReviews.length > 0 && (
          <div className={cardBox + " space-y-3"}>
            <p className="text-[13px] font-semibold text-[var(--text)]">시술 경과 기록</p>
            {linkedReviews.map((r) => {
              const done = new Set((r.review_checkin ?? []).map((c) => c.timepoint));
              return (
                <div key={r.id}>
                  <p className="text-[13.5px] font-bold text-[var(--primary-active)]">{r.procedure_ko ?? "시술"}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {PROGRESS_TIMEPOINTS.map((tp) => {
                      const isDone = done.has(tp.value);
                      const cls =
                        "rounded-full px-3 py-1 text-[12.5px] transition-colors " +
                        (isDone
                          ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-active)]"
                          : tp.link
                            ? "bg-white text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)] hover:bg-[var(--primary-soft)]"
                            : "bg-[var(--bg)] text-[var(--text-muted)]");
                      // 당일 — 작성 시 입력. 링크 없이 상태만(입력됨 ✓ / 미입력).
                      if (!tp.link) {
                        return (
                          <span key={tp.value} className={cls}>
                            {tp.label}{isDone ? " ✓" : ""}
                          </span>
                        );
                      }
                      // 1주/1달/4달 — 체크인 폼으로 진입(입력됨이면 ✓·수정, 아니면 ＋·기록).
                      return (
                        <Link key={tp.value} href={`/reviews/${r.id}/checkins?t=${tp.value}`} className={cls}>
                          {tp.label}{isDone ? " ✓" : " ＋"}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
              1주·1달·4달 경과를 기록하면 변화가 시계열로 쌓여요.
            </p>
          </div>
        )}

        {/* 오늘의 시술 노트(비공개 메모) */}
        {d.diary_body && (
          <div className={cardBox}>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{d.diary_body}</p>
          </div>
        )}

        {/* 본인 노트 관리(C4) — 수정(편집 페이지)·삭제(확인 모달). 상세는 RLS 로 본인 소유만 로드되므로 노출.
            source='clinic' 노트도 회원이 diary 필드·시술목록을 수정 가능(병원 지점 스냅샷만 서버가 보존). */}
        <div className={cardBox + " flex gap-2"}>
          <Link
            href={`/notes/${d.id}/edit`}
            className="flex flex-1 items-center justify-center rounded-md bg-[var(--primary-soft)] py-2.5 text-[13px] font-semibold text-[var(--primary-active)]"
          >
            수정
          </Link>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex flex-1 items-center justify-center rounded-md bg-white py-2.5 text-[13px] font-semibold text-[var(--accent)] ring-1 ring-inset ring-[var(--border)] transition-colors hover:bg-[var(--accent-soft)]"
          >
            삭제
          </button>
        </div>
      </section>

      {/* 삭제 확인 모달 — 확인 시 DELETE /api/visits/{id}(delete_visit) → /notes 이동 + 토스트. */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => { if (!deleting) setConfirmDelete(false); }}
        >
          <div
            className="w-full max-w-[340px] rounded-[var(--radius)] bg-white p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[17px] font-extrabold text-[var(--text)]">이 기록을 삭제할까요?</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
              삭제하면 내 노트에서 사라지고 되돌릴 수 없어요.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="block flex-1 rounded-md border border-[var(--border)] bg-white py-3 text-[14.5px] font-bold text-[var(--text-secondary)] disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void doDelete()}
                disabled={deleting}
                className="block flex-1 rounded-md bg-[var(--accent)] py-3 text-[14.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
