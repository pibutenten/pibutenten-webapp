"use client";

/**
 * 시술일기 통합 — 검토용 디자인 목업 (시스템 미반영).
 *
 * 실제 앱 패턴 준수:
 *  - 글상자 = 피드 Card.tsx 와 동일(테두리 X·음영 X, 흰 박스 on 회색 배경).
 *  - 폼 컨트롤(별점/통증/칩/효과칩/단일선택) = ReviewForm 그대로 복제.
 *  - 끄적끄적 = CardEditor(제목/본문/태그) 구조. 시술후기만 = ReviewForm(가격 없음).
 *  - 장식 이모지 없음(통증 표정만 실제 폼 컨트롤이라 유지).
 * layout.tsx 가 TopNav/푸터/1080px/반응형 자동 적용 → 여기는 <main> 콘텐츠만.
 *
 * 구조 (원장 지시 2026-06-07):
 *  - 시술후기만: 기존 후기폼 그대로. 가격은 후기에 두지 않음(시술일기 비공개로 이동).
 *  - 시술일기: 날짜 → 병원(지도검색) → 의사/실장 → 받은 시술(행마다 가격·비고, 나만 보기)
 *              → 오늘의 시술 일기 → 저장하기. 받은 시술마다 "아래에 형제 글상자"로 후기칸이
 *              닫힌 채 생성 → [후기 작성하기]로 열고 한 번 더 누르면 닫힘 / [나중에 쓰기]는
 *              3·7·30일 뒤 알림.
 *  - 내 일기: 우상단 토글(달력/목록). 목록=요약본(연도 표시·모두 펼치기/닫기). 항목 클릭→상세.
 *  - 상세: 평가지표 제외, 비공개 메모(병원·의사·실장·연락처·가격·비고·일기)만.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { recordBadge } from "@/lib/diary-status";

/* ── 실제 폼 공통 클래스 ── */
const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[14px] focus:border-[var(--primary)] focus:outline-none";
const inputSm =
  "rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-[13px] focus:border-[var(--primary)] focus:outline-none";
const textareaCls =
  "w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[14px] leading-[1.6] focus:border-[var(--primary)] focus:outline-none";
const labelCls = "mb-2 block text-sm font-semibold text-[var(--text)]";
/** 글상자 — 피드 카드와 동일: 테두리 X·음영 X. */
const formBox = "space-y-5 rounded-[var(--radius)] bg-white p-5";
const cardBox = "rounded-[var(--radius)] bg-white p-5";

/* ── 옵션 (실제 SSOT 값 그대로) ── */
const PAIN_FACES = [
  { face: "😊", label: "없음" }, { face: "🙂", label: "조금" }, { face: "😐", label: "보통" },
  { face: "😣", label: "꽤" }, { face: "😖", label: "심함" },
];
const REVISIT_OPTIONS = [
  { value: "yes", label: "있어요", color: "#4CBFF2" },
  { value: "no", label: "없어요", color: "#EA7E7B" },
  { value: "maybe", label: "고민 중", color: "#9AA1AC" },
];
const DOWNTIME_OPTIONS = [
  { value: "same_day", label: "없음" }, { value: "days_1_2", label: "1~2일" },
  { value: "days_3_5", label: "3~5일" }, { value: "week_1", label: "약 1주" },
  { value: "weeks_2_plus", label: "2주 이상" },
];
const EFFECT_ONSET_OPTIONS = [
  { value: "immediate", label: "시술 직후" }, { value: "weeks_1_2", label: "1~2주 후" },
  { value: "month_1", label: "한 달쯤 후" }, { value: "months_2_3", label: "두세 달 후" },
  { value: "still_watching", label: "효과 못 느낌" },
];
const EFFECT_AREA_OPTIONS = ["리프팅","탄력","쫀쫀함","볼륨","작은얼굴","턱선","이중턱","피부톤","피부결","잔주름","깊은주름","불독살","모공","생기","속건조","붉은기","트러블","피지","없음"];
const EFFECT_AREA_COLORS = ["#B0A0DE","#7FD0F8","#F59CB6","#FFCB8C","#A6D9A9","#C3B0E8","#79CCC3","#FFAF97","#9AA6DE","#CDC97A","#C9A8D6","#A8C2E6","#8FD4C8","#F4B8A0","#B8D88A","#F2A9C0","#D6B0A1","#E0C088","#C2C7CE"];

/* 시술 picker — 실제 tag_dictionary(is_procedure) 기준. 카테고리 리프팅/스킨부스터 2종. */
const CAT_COLOR: Record<string, string> = { 리프팅: "#29B6F6", 스킨부스터: "#F48FB1" };
const PROCEDURES: { value: string; label: string; cat: string }[] = [
  ...["써마지","울쎄라","슈링크","올리지오","포텐자","텐써마","덴서티","울트라셀","티타늄","미라젯","세르프","올타이트","엠페이스","골드PTT"].map((l) => ({ value: l, label: l, cat: "리프팅" })),
  ...["리쥬란","쥬베룩","스컬트라","보톡스","프로파일로","울트라콜","스킨바이브","더엘주사","레디어스","레스틸렌","벨로테로","올리디아","힐로웨이브"].map((l) => ({ value: l, label: l, cat: "스킨부스터" })),
];

type ReviewState = { satisfaction: number; pain: number; downtime: string; revisit: string; effectAreas: string[]; effectOnset: string; oneliner: string };
const emptyReview = (): ReviewState => ({ satisfaction: 0, pain: 0, downtime: "", revisit: "", effectAreas: [], effectOnset: "", oneliner: "" });

type Screen = "diary" | "reviewonly" | "record" | "detail" | "noti";

/* ════════════════ 메인 ════════════════ */

export default function SkinDiaryMockup() {
  const [screen, setScreen] = useState<Screen>("record");
  const [fabOpen, setFabOpen] = useState(false);
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1900); };

  const TABS: [Screen, string][] = [
    ["diary","시술일기"],["reviewonly","시술후기만"],
    ["record","내 일기"],["detail","상세"],["noti","알림"],
  ];

  return (
    <div className="pb-12">
      <div className="mb-5 mt-1">
        <p className="mb-2 text-center text-[11px] font-semibold text-[var(--text-muted)]">검토용 미리보기 · 시스템 미반영</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {TABS.map(([v, label]) => (
            <button key={v} type="button" onClick={() => setScreen(v)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={screen === v ? { background: "var(--primary)", color: "#fff" } : { background: "#E8EAEE", color: "#5C6470" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {screen === "diary" && <DiaryForm toast={showToast} go={setScreen} />}
      {screen === "reviewonly" && <ReviewOnlyForm toast={showToast} go={setScreen} />}
      {screen === "record" && <RecordView go={setScreen} />}
      {screen === "detail" && <DetailView go={setScreen} />}
      {screen === "noti" && <NotiView go={setScreen} toast={showToast} />}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[200] -translate-x-1/2 rounded-md bg-[var(--secondary)] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[var(--shadow-lg)]">{toast}</div>
      )}

      <MockFab open={fabOpen} setOpen={setFabOpen} go={setScreen} toast={showToast} />
    </div>
  );
}

/* ════════════════ 플로팅(+) 메뉴 — 우하단. 실제 FAB 대체 데모 ════════════════
   실제 layout 의 FloatingWriteButton(끄적끄적/시술후기/보관)을 목업에선 숨기고,
   '나의 시술일기 보기 / 시술일기 남기기 / 시술 후기 남기기 / 끄적끄적' 4개로 펼치는 메뉴로 대체.
   (앱 전환 시 하단 중앙 + 버튼으로 이동 예정.) */

function MockFab({ open, setOpen, go, toast }: { open: boolean; setOpen: (b: boolean) => void; go: (s: Screen) => void; toast: (m: string) => void }) {
  const items: { label: string; icon: React.ReactNode; onClick: () => void }[] = [
    { label: "나의 시술일기 보기", onClick: () => go("record"), icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
    ) },
    { label: "시술일기 남기기", onClick: () => go("diary"), icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
    ) },
    { label: "시술후기 남기기", onClick: () => go("reviewonly"), icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 17.3l-5.6 3.3 1.5-6.3-4.9-4.3 6.4-.5L12 3.5l2.6 6 6.4.5-4.9 4.3 1.5 6.3z" /></svg>
    ) },
    { label: "끄적끄적", onClick: () => toast("끄적끄적은 기존 글쓰기 화면으로 연결돼요"), icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
    ) },
  ];
  return (
    <>
      {open && <div className="fixed inset-0 z-30" aria-hidden onClick={() => setOpen(false)} />}
      <div className="fixed z-40 flex flex-col items-end gap-3" style={{ bottom: "calc(env(safe-area-inset-bottom,0px) + 20px)", right: 20 }}>
        {open && items.map((it) => (
          <button key={it.label} type="button" onClick={() => { it.onClick(); setOpen(false); }} className="flex items-center gap-2" style={{ animation: "fab-pop .18s ease-out both" }}>
            <span className="hidden rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-[var(--text)] shadow-[0_4px_12px_rgba(0,0,0,0.12)] sm:block">{it.label}</span>
            <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full shadow-[0_6px_16px_rgba(139,195,222,0.35)]" style={{ background: "#7FD0F8" }}>{it.icon}</span>
          </button>
        ))}
        <button type="button" onClick={() => setOpen(!open)} aria-label={open ? "작성 메뉴 닫기" : "작성 메뉴 열기"} aria-expanded={open}
          className="flex items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgba(139,195,222,0.35)] transition-all active:scale-95"
          style={{ width: 56, height: 56, backgroundColor: "#4CBFF2" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 transition-transform" style={{ transform: open ? "rotate(45deg)" : "none" }}>
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
        </button>
      </div>
      {/* 실제 layout FAB 숨김(목업 전용) + 위성 등장 애니메이션 */}
      <style>{`.fab-root{display:none!important}@keyframes fab-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}`}</style>
    </>
  );
}

/* ════════════════ 공통 후기 컨트롤 (ReviewForm 복제) ════════════════ */

function StarField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">만족도</label>
      <div className="flex justify-start gap-1" onMouseLeave={() => setHover(0)}>
        {[1,2,3,4,5].map((n) => {
          const gold = n <= value || (hover > 0 && n > value && n <= hover);
          const preview = hover > 0 && n > value && n <= hover;
          return (
            <button key={n} type="button" onClick={() => onChange(n)} onMouseEnter={() => setHover(n)}
              className="flex w-11 cursor-pointer items-center justify-center text-[34px] leading-none transition-transform active:scale-125">
              <span style={{ color: gold ? (preview ? "#F7CE8A" : "var(--accent-save)") : "#E3E7EB" }}>★</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FaceField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">통증</label>
      <div className="flex justify-start gap-1" onMouseLeave={() => setHover(0)}>
        {PAIN_FACES.map((f, i) => {
          const n = i + 1; const selected = n === value; const previewing = !selected && n === hover; const on = selected || previewing;
          return (
            <button key={n} type="button" onClick={() => onChange(n)} onMouseEnter={() => setHover(n)}
              className="flex w-11 cursor-pointer flex-col items-center justify-center gap-1 py-1 transition-transform active:scale-125">
              <span className="text-[30px] leading-none" style={{ filter: on ? "none" : "grayscale(1)", opacity: selected ? 1 : previewing ? 0.85 : 0.4 }}>{f.face}</span>
              <span className="text-[10px] font-medium" style={{ color: selected ? "var(--text)" : "var(--text-secondary)" }}>{f.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  let style: CSSProperties;
  if (active) style = color ? { backgroundColor: color, color: "#fff", fontWeight: 600 } : { backgroundColor: "#4CBFF2", color: "#fff", fontWeight: 600 };
  else if (color && hover) style = { backgroundColor: color + "22", color, fontWeight: 600 };
  else style = { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 };
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1 text-[13px] transition-transform active:scale-110" style={style}>
      {children}
    </button>
  );
}

function ChoiceField({ label, hint, value, onChange, options }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; color?: string }[] }) {
  return (
    <div>
      <label className={labelCls}>{label}{hint && <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">{hint}</span>}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => <Chip key={o.value} active={value === o.value} color={o.color} onClick={() => onChange(o.value)}>{o.label}</Chip>)}
      </div>
    </div>
  );
}

function EffectField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <label className={labelCls}>이번 시술로 달라진 점을 모두 골라주세요!
        <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">생각보다 많을 거예요 — 보통 4개 이상 고르세요.</span>
      </label>
      <div className="flex flex-wrap gap-1">
        {EFFECT_AREA_OPTIONS.map((opt, i) => {
          const active = value.includes(opt); const color = EFFECT_AREA_COLORS[i];
          return (
            <button key={opt} type="button" onClick={() => onChange(active ? value.filter((x) => x !== opt) : [...value, opt])}
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1 text-[13px] transition-transform active:scale-110"
              style={active ? { backgroundColor: color, color: "#fff", fontWeight: 600 } : { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 후기 정량 컨트롤 — 후기폼/일기 공용. 가격 없음(가격은 시술일기 비공개로 이동). */
function ReviewControls({ v, set }: { v: ReviewState; set: (p: Partial<ReviewState>) => void }) {
  return (
    <>
      <StarField value={v.satisfaction} onChange={(x) => set({ satisfaction: x })} />
      <FaceField value={v.pain} onChange={(x) => set({ pain: x })} />
      <ChoiceField label="다운타임이 얼마나 됐나요?" hint="붓기·멍·딱지 등이 가라앉고 일상이 편해질 때까지" value={v.downtime} onChange={(x) => set({ downtime: x })} options={DOWNTIME_OPTIONS} />
      <ChoiceField label="재시술 의향" value={v.revisit} onChange={(x) => set({ revisit: x })} options={REVISIT_OPTIONS} />
      <EffectField value={v.effectAreas} onChange={(x) => set({ effectAreas: x })} />
      <ChoiceField label="효과는 언제부터 느끼셨어요?" value={v.effectOnset} onChange={(x) => set({ effectOnset: x })} options={EFFECT_ONSET_OPTIONS} />
      <div>
        <label className={labelCls}>생생한 후기를 남겨주세요 <span className="text-xs font-normal text-[var(--text-muted)]">({v.oneliner.length} / 400)</span></label>
        <textarea maxLength={400} rows={3} className={textareaCls} placeholder="다른 분들이 궁금해할 만한 점을 들려주세요." value={v.oneliner} onChange={(e) => set({ oneliner: e.target.value })} />
        <p className="mt-1 text-xs text-[var(--text-muted)]">의료광고성 표현·병원·의사 실명 언급은 금합니다.</p>
      </div>
    </>
  );
}

/* 시술 잠금형 탭 picker (ReviewForm 복제, 실제 카테고리 색) */
function ProcedurePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tabs = useMemo(() => { const o: string[] = []; PROCEDURES.forEach((p) => { if (!o.includes(p.cat)) o.push(p.cat); }); return o; }, []);
  const [tab, setTab] = useState(tabs[0]);
  const chips = PROCEDURES.filter((p) => p.cat === tab);
  return (
    <div>
      <div className="flex justify-center gap-x-7">
        {tabs.map((t) => {
          const on = t === tab; const c = CAT_COLOR[t] ?? "var(--primary)";
          return (
            <button key={t} type="button" onClick={() => setTab(t)}
              className="shrink-0 cursor-pointer border-b-2 px-1 py-[6px] text-[14px] font-semibold transition-colors"
              style={{ color: on ? c : "var(--text-secondary)", borderBottomColor: on ? c : "transparent" }}>
              {t}
            </button>
          );
        })}
      </div>
      <div aria-hidden className="mb-3 mt-0 h-px w-full" style={{ background: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.10) 18%, rgba(0,0,0,0.10) 82%, transparent 100%)" }} />
      <div className="flex flex-wrap justify-center gap-1">
        {chips.map((p) => {
          const sel = value === p.value; const c = CAT_COLOR[p.cat] ?? "var(--primary)";
          return (
            <button key={p.value} type="button" onClick={() => onChange(p.value)}
              className="cursor-pointer rounded-full px-3 py-1 text-[13px] transition-colors active:scale-[0.97]"
              style={sel ? { backgroundColor: c + "1A", color: c, fontWeight: 700 } : { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 }}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubmitBar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-center border-t border-[var(--border)] pt-4">
      <button type="button" onClick={onClick} className="h-10 rounded-md bg-[var(--primary)] px-8 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-dark)]">{label}</button>
    </div>
  );
}

/**
 * 후기 작성 폼 본문(SSOT) — 시술후기만/시술일기-시술별 후기가 동일하게 사용.
 * 시술명(가운데·카테고리색·18px) + 우상단 액션(다시선택/접기) + ReviewControls + 하단 버튼.
 */
function ReviewFormBody({ cat, label, v, set, submitLabel, onSubmit, topRight }: {
  cat: string; label: string; v: ReviewState; set: (p: Partial<ReviewState>) => void;
  submitLabel: string; onSubmit: () => void; topRight?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="relative flex items-center justify-center">
        <div className="py-1 text-center"><span className="text-[18px] font-bold leading-[1.4]" style={{ color: CAT_COLOR[cat] ?? "var(--primary)" }}>{label}</span></div>
        {topRight && <div className="absolute right-0">{topRight}</div>}
      </div>
      <ReviewControls v={v} set={set} />
      <SubmitBar label={submitLabel} onClick={onSubmit} />
    </div>
  );
}

/* ════════════════ ② 시술 후기만 (실제 ReviewForm 그대로, 가격 없음) ════════════════ */

export function ReviewOnlyForm({ toast, go }: { toast: (m: string) => void; go: (s: Screen) => void }) {
  const [proc, setProc] = useState("");
  const [v, setV] = useState<ReviewState>(emptyReview());
  const set = (p: Partial<ReviewState>) => setV((s) => ({ ...s, ...p }));
  const selected = PROCEDURES.find((p) => p.value === proc);
  return (
    <section className="mx-auto w-full max-w-[680px]">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">시술후기를 남겨주세요</h1>
      <div className={formBox}>
        {selected ? (
          <ReviewFormBody
            cat={selected.cat}
            label={selected.label}
            v={v}
            set={set}
            submitLabel="후기 올리기"
            onSubmit={() => { toast("후기를 올렸어요"); setTimeout(() => go("record"), 800); }}
            topRight={<button type="button" onClick={() => setProc("")} className="cursor-pointer text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-secondary)]">다시 선택</button>}
          />
        ) : (
          <>
            <ProcedurePicker value={proc} onChange={setProc} />
            <div className="pointer-events-none space-y-5 opacity-50">
              <ReviewControls v={v} set={set} />
            </div>
            <SubmitBar label="후기 올리기" onClick={() => {}} />
          </>
        )}
      </div>
    </section>
  );
}

/* ════════════════ ④ 나의 시술일기 ════════════════ */

// 실제 clinics DB(전국 16,964 피부과) 검색 결과 한 건.
type ClinicHit = { name: string; addr: string; tel: string; x: number | null; y: number | null; dist?: number };
// 좌표 거리(km) — 심평원 XPos=경도, YPos=위도. 근사식(equirectangular)으로 정렬용.
// x,y 는 '도(deg) 차이'이며, 위도 보정 후 한 변환계수(deg→km = π/180 × 지구반경)로 km 환산.
function distKm(lat1: number, lng1: number, lat2: number | null, lng2: number | null): number | undefined {
  if (lat2 == null || lng2 == null) return undefined;
  const R = 6371; // 지구 반경(km)
  const DEG2KM = (Math.PI / 180) * R; // 위도 1도 ≈ 111.19km
  const x = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)); // 경도차(위도 보정)
  const y = lat2 - lat1; // 위도차
  return Math.sqrt(x * x + y * y) * DEG2KM;
}
const EN2KO: Record<string, string> = { thermage: "써마지", botox: "보톡스", filler: "필러", rejuran: "리쥬란", sculptra: "스컬트라" };

// 주소 → '시도(약칭) 시군구' 짧은 지역 라벨 (이름 같은 지점 구분용).
function regionLabel(addr: string): string {
  const t = (addr ?? "").trim().split(/\s+/);
  if (t.length === 0 || !t[0]) return "";
  const sido = t[0].replace(/(특별자치도|특별자치시|특별시|광역시|도|시)$/, "");
  return t[1] ? `${sido} ${t[1]}` : sido;
}

type DiaryProc = ReviewState & { id: number; label: string; cat: string; price: string; unit: string; note: string; open: boolean; later: boolean };

export function DiaryForm({ toast, go }: { toast: (m: string) => void; go: (s: Screen) => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedXY, setPickedXY] = useState<{ x: number; y: number } | null>(null); // 확정 병원 좌표(경도 x/위도 y)
  const [tel, setTel] = useState("");
  const [addr, setAddr] = useState("");
  // 실제 clinics DB 검색 결과 (이름 검색 / 지명·주소 / 내 위치).
  const [results, setResults] = useState<ClinicHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  // 결과창 부드러운 닫힘 — 병원 선택 시 잠깐 접었다가(슥) 확정.
  const [closing, setClosing] = useState(false);
  // 병원 검색 결과 키보드 네비게이션 — ↑↓ 로 하이라이트 이동, Enter 로 선택.
  const [hi, setHi] = useState(-1);
  // 결과 목록이 (비동기 검색으로) 바뀌면 하이라이트 초기화 — 옛 인덱스로 엉뚱한 선택 방지.
  useEffect(() => { setHi(-1); }, [results]);
  // 내 현재 위치 — 이름 검색 결과의 거리 표시·정렬 기준(ref, 재조회 불필요).
  const myLocRef = useRef<{ lat: number; lng: number } | null>(null);
  // 현재 결과가 '내 주변'(geolocation)에서 온 것인지 표시 — q 가 비었을 때 결과 유지 판정용.
  // ref 라서 검색 effect 의존성에 넣지 않아 자기-트리거 루프를 만들지 않음.
  const geoActiveRef = useRef(false);
  // 거리순 정렬용 위치 — 검색 시작(입력 포커스) 시 1회 요청. 자동 목록은 안 띄움. 권한 받으면 locReady++ 로 결과 재정렬.
  const [locReady, setLocReady] = useState(0);
  const locTriedRef = useRef(false);
  const [procs, setProcs] = useState<DiaryProc[]>([]);
  const [pid, setPid] = useState(0);
  const [tag, setTag] = useState("");
  const [diary, setDiary] = useState(""); // 오늘의 시술 일기(비공개 메모) — 최대 400자.
  const [doctorName, setDoctorName] = useState(""); // 원장님(자유 입력)
  const [managerName, setManagerName] = useState(""); // 실장님(자유 입력)
  const [saving, setSaving] = useState(false);
  // 시술을 추가하면 해당 행의 '용량' 칸으로 커서를 옮겨 이어서 입력하게 함.
  const [focusId, setFocusId] = useState<number | null>(null);
  const unitRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // 날짜 picker — 데스크탑 크롬은 필드 클릭만으론 안 열려서 showPicker()로 강제로 연다.
  const dateRef = useRef<HTMLInputElement | null>(null);
  const openDatePicker = () => { try { dateRef.current?.showPicker?.(); } catch { /* 미지원 브라우저는 네이티브 클릭 폴백 */ } };
  // 입력 후 다음 칸으로 커서 자동 이동(빠른 연속 입력): 병원 선택→원장님, 원장님 Enter→실장님, 실장님 Enter→시술명.
  const doctorRef = useRef<HTMLInputElement | null>(null);
  const managerRef = useRef<HTMLInputElement | null>(null);
  const tagRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (focusId != null && unitRefs.current[focusId]) {
      unitRefs.current[focusId]!.focus();
      setFocusId(null);
    }
  }, [focusId, procs]);
  const _d = new Date();
  const [date, setDate] = useState(`${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`);
  const [_y, _m, _dd] = date.split("-");
  const dateLabel = `${+_y}년 ${+_m}월 ${+_dd}일`;

  // clinics row[] → ClinicHit[] (내 위치 있으면 거리 계산 + 거리순 정렬).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function withDistSort(rows: any[]): ClinicHit[] {
    const ml = myLocRef.current;
    const hits = rows.map((d) => {
      const x = d.x_pos as number | null, y = d.y_pos as number | null;
      return { name: d.name as string, addr: (d.addr as string) ?? "", tel: (d.tel as string) ?? "", x, y, dist: ml ? distKm(ml.lat, ml.lng, y, x) : undefined };
    });
    if (ml) hits.sort((a, b) => (a.dist ?? 9e9) - (b.dist ?? 9e9));
    return hits;
  }

  // 검색 시작 시 1회 위치 요청 — 거리순 정렬용. 자동 목록은 안 띄움(검색해야 결과 표시). 거부 시 이름순 폴백.
  function requestLoc() {
    if (locTriedRef.current) return;
    locTriedRef.current = true;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { myLocRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setLocReady((c) => c + 1); },
      () => { /* 거부/실패 → 이름순 폴백 */ },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  // 병원 이름 검색 — 실제 clinics DB(전국 피부과)를 250ms 디바운스로 ilike 조회.
  useEffect(() => {
    if (picked) return;
    const term = q.trim();
    // q 가 비면 이름검색 결과는 비우고, 지명·내위치 결과(searchCenter)는 유지.
    if (term.length < 1) { if (!geoActiveRef.current) setResults([]); return; }
    let alive = true;
    geoActiveRef.current = false;
    setSearching(true); setGeoMsg(null);
    const t = setTimeout(async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .from("clinics").select("name,addr,tel,x_pos,y_pos")
        .ilike("name", `%${term}%`).order("name").limit(50); // 거리순 정렬 후보 넉넉히 → 가장 가까운 곳 우선(이름 같은 지점 다수 대비)
      if (!alive) return;
      setResults(withDistSort(data ?? []));
      setSearching(false);
    }, 120); // 더 실시간처럼 — 16,964건 DB 조회라 0 은 불가, 디바운스 최소화(쿼리 자체는 ~30ms).
    return () => { alive = false; clearTimeout(t); };
    // locReady: 위치 권한이 들어오면 재조회+거리순 재정렬.
  }, [q, picked, locReady]);

  // 특정 좌표 주변 clinics 를 bbox(약 5km) 조회 후 거리순 정렬 + 지도 중심 이동.
  async function loadNear(lat: number, lng: number) {
    geoActiveRef.current = true;
    setPicked(null);
    // DB 레벨 거리정렬 RPC(clinics_nearby) — 진짜 최근접 상위 20개를 정확히 반환.
    const sb = createSupabaseBrowserClient();
    const { data } = await sb.rpc("clinics_nearby", { in_lat: lat, in_lng: lng, in_km: 5, in_lim: 20 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hits = ((data ?? []) as any[]).map((d) => ({ name: d.name as string, addr: (d.addr as string) ?? "", tel: (d.tel as string) ?? "", x: d.x_pos as number | null, y: d.y_pos as number | null, dist: d.dist_km as number | undefined }));
    setResults(hits);
    if (hits.length === 0) setGeoMsg("이 주변에 등록된 피부과가 없어요.");
  }

  // Enter 검색 — 병원명 매칭을 먼저 확인하고, 매칭이 전혀 없을 때만 지명/주소 지오코딩.
  async function searchPlace() {
    const term = q.trim();
    if (!term) return;
    setGeoMsg(null); setSearching(true);
    // 1) 병원명 매칭 우선 (부분어 OK) — 있으면 그대로 사용, 지오코딩·에러 없음.
    const sb = createSupabaseBrowserClient();
    const { data } = await sb
      .from("clinics").select("name,addr,tel,x_pos,y_pos")
      .ilike("name", `%${term}%`).order("name").limit(20);
    const named = withDistSort(data ?? []);
    if (named.length > 0) {
      geoActiveRef.current = false;
      setResults(named); setSearching(false);
      return;
    }
    // 2) 이름 매칭 없음 → 지명/랜드마크/주소를 네이버 지역검색으로 좌표화(서버 라우트).
    let c: { lat: number; lng: number } | null = null;
    try {
      const r = await fetch(`/api/place-search?q=${encodeURIComponent(term)}`);
      const j = await r.json();
      if (j?.place) c = { lat: j.place.lat, lng: j.place.lng };
    } catch { /* 네트워크 실패 → 아래 안내 */ }
    if (!c) { setSearching(false); setGeoMsg("검색 결과가 없어요. 병원명을 더 입력해 주세요."); return; }
    await loadNear(c.lat, c.lng);
    setSearching(false);
  }

  // 병원 선택 → 결과창을 잠깐 접었다가(슥) 확정. (지도 없이 행 클릭 = 바로 선택)
  function confirmPick(h: ClinicHit) {
    geoActiveRef.current = false;
    setClosing(true);
    setTimeout(() => {
      setPicked(h.name);
      setPickedXY(h.x != null && h.y != null ? { x: h.x, y: h.y } : null);
      setTel(h.tel); setAddr(h.addr); setQ(h.name);
      setResults([]);
      setClosing(false);
      // 병원 확정 → 바로 원장님 칸으로 커서 이동(다음 렌더 후).
      requestAnimationFrame(() => doctorRef.current?.focus());
    }, 200);
  }

  // (검색 전 자동 '주변 병원' 노출 제거 — 검색해야만 결과창이 열림.)

  function addTag(raw: string) {
    const t = raw.trim(); if (!t) return; const low = t.toLowerCase();
    let label = t; if (/[a-z]/i.test(t) && EN2KO[low]) label = EN2KO[low];
    if (procs.some((p) => p.label === label)) { setTag(""); return; }
    const cat = PROCEDURES.find((p) => p.label === label)?.cat ?? "";
    const nid = pid + 1; setPid(nid);
    setProcs([...procs, { ...emptyReview(), id: nid, label, cat, price: "", unit: "", note: "", open: false, later: false }]);
    setTag("");
    setFocusId(nid);
  }
  const upd = (id: number, p: Partial<DiaryProc>) => setProcs((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const reviewed = (p: DiaryProc) => !!(p.satisfaction || p.pain || p.downtime || p.revisit || p.effectAreas.length || p.effectOnset || p.oneliner);
  const tq = tag.trim(); const tlow = tq.toLowerCase();
  const acMatches = tq ? PROCEDURES.filter((p) => (p.label.includes(tq) || (EN2KO[tlow] && p.label === EN2KO[tlow])) && !procs.some((x) => x.label === p.label)).slice(0, 8) : [];
  const acExact = PROCEDURES.some((p) => p.label === tq) || !!EN2KO[tlow];

  // 저장 — /api/diaries POST (create_diary RPC). 시술 1개 이상 필수.
  async function handleSave() {
    if (saving) return;
    if (procs.length === 0) { toast("받은 시술을 1개 이상 추가해주세요"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/diaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visited_on: date,
          clinic_name: picked || null,
          clinic_addr: addr.trim() || null,
          clinic_tel: tel.trim() || null,
          clinic_x: pickedXY?.x ?? null,
          clinic_y: pickedXY?.y ?? null,
          doctor_name: doctorName.trim() || null,
          manager_name: managerName.trim() || null,
          diary_body: diary.trim() || null,
          procedures: procs.map((pr) => ({
            procedure_ko: pr.label,
            unit_text: pr.unit.trim() || null,
            // price 입력은 숫자만 남도록 필터됨(정수문자열, "0" 포함) — 방어적으로 정수 보장.
            price: pr.price ? Math.floor(Number(pr.price)) : null,
            note: pr.note.trim() || null,
          })),
        }),
      });
      if (res.status === 401) { toast("로그인 후 저장할 수 있어요"); setSaving(false); return; }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        toast(j?.message || "저장에 실패했어요");
        setSaving(false);
        return;
      }
      toast("기록을 저장했어요");
      setTimeout(() => go("record"), 700);
    } catch {
      toast("네트워크 오류가 발생했어요");
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[680px]">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">오늘의 시술을 기록해요</h1>

      {/* 메인 일기 글상자 */}
      <div className={formBox}>
        {/* 1. 날짜 — 클릭하면 달력 picker(투명 오버레이), 표시는 괄호 없이 */}
        <div>
          <label className={labelCls}>언제 받으셨어요? <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">나만 봐요</span></label>
          <div className="relative">
            <div className={inputCls + " flex items-center justify-between"} aria-hidden>
              <span className="text-[var(--text)]">{dateLabel}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></svg>
            </div>
            {/* input 자체를 투명 클릭 영역으로 둠 → onClick 으로 showPicker(데스크탑), 미지원 브라우저는 input 네이티브 클릭이 폴백. */}
            <input ref={dateRef} type="date" aria-label="시술 받은 날짜" value={date} onClick={openDatePicker} onChange={(e) => setDate(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </div>
        </div>

        {/* 2. 병원 — 이름/지명 검색 → 결과에서 바로 선택(지도 없음). 선택 시 결과창이 부드럽게 접힘. */}
        <div>
          <label className={labelCls}>어디서 받으셨어요? <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">나만 봐요</span></label>
          {/* 확정 전 검색 UI — 선택 시 closing 으로 잠깐 접었다가(슥) picked 확정. */}
          {(!picked || closing) && (
            <div className={`overflow-hidden transition-all duration-200 ease-out ${closing ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100"}`}>
              <input
                className={inputCls}
                placeholder="지명, 병원명으로 검색"
                value={q}
                onFocus={requestLoc}
                onChange={(e) => { setQ(e.target.value); setPicked(null); setHi(-1); }}
                onKeyDown={(e) => {
                  // ↑↓ 결과 하이라이트 이동(결과 있을 때만).
                  if (results.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                    e.preventDefault();
                    setHi((cur) => {
                      const n = e.key === "ArrowDown" ? cur + 1 : cur - 1;
                      return Math.max(0, Math.min(results.length - 1, n));
                    });
                    return;
                  }
                  if (e.key !== "Enter") return;
                  // 한글 IME 조합 중 Enter(keyCode 229)는 조합 확정용 — 무시(포커스 이동·중복검색 방지).
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  e.preventDefault();
                  e.stopPropagation();
                  // 하이라이트된 결과가 있으면 그걸 선택, 없으면 지명/병원명 검색.
                  if (hi >= 0 && results[hi]) confirmPick(results[hi]);
                  else searchPlace();
                }}
              />
              {searching && <p className="mt-2 text-center text-[12px] text-[var(--text-muted)]">불러오는 중…</p>}
              {geoMsg && <p className="mt-2 text-center text-[12px] text-[var(--accent)]">{geoMsg}</p>}
              {/* 결과 목록 — 행 클릭 = 바로 선택. 길면 스크롤 */}
              {results.length > 0 && (
                <div className="mt-2 max-h-[232px] overflow-y-auto rounded-md bg-[var(--bg)]">
                  {results.map((h, i) => (
                    <button key={`${h.name}-${h.addr}-${i}`} type="button" onClick={() => confirmPick(h)} onMouseEnter={() => setHi(i)} className={`flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--primary-soft)] ${i === hi ? "bg-[var(--primary-soft)]" : ""}`}>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-[var(--text)]">{h.name} <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">{regionLabel(h.addr)}</span></span>
                        <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{h.addr}</span>
                      </span>
                      {h.dist != null && <span className="shrink-0 text-[11.5px] font-bold text-[var(--primary-active)]">{h.dist < 1 ? `${Math.round(h.dist * 1000)}m` : `${h.dist.toFixed(1)}km`}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {picked && (
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold text-[var(--text)]">{picked}</span>
                <button type="button" onClick={() => { setPicked(null); setPickedXY(null); setQ(""); setTel(""); setAddr(""); }} className="text-[11.5px] text-[var(--text-secondary)] underline">다시 선택</button>
              </div>
              {/* 회색 박스·라벨 제거 — 주소/전화는 거의 안 건드리므로 보더리스 미니멀 라인으로. */}
              <input className="mt-1.5 w-full bg-transparent py-0.5 text-[13px] text-[var(--text-secondary)] outline-none placeholder-[var(--text-muted)]" value={addr} placeholder="주소" onChange={(e) => setAddr(e.target.value)} />
              <input className="w-full bg-transparent py-0.5 text-[13px] text-[var(--text-secondary)] outline-none placeholder-[var(--text-muted)]" value={tel} placeholder="전화번호" onChange={(e) => setTel(e.target.value)} />
            </div>
          )}
        </div>

        {/* 3. 의사 / 실장 */}
        <div>
          <label className={labelCls}>누구에게 받으셨어요? <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">나만 봐요</span></label>
          <div className="grid grid-cols-2 gap-2">
            <input ref={doctorRef} className={inputCls} placeholder="원장님" value={doctorName} maxLength={100} onChange={(e) => setDoctorName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); managerRef.current?.focus(); } }} />
            <input ref={managerRef} className={inputCls} placeholder="실장님" value={managerName} maxLength={100} onChange={(e) => setManagerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); tagRef.current?.focus(); } }} />
          </div>
        </div>

        {/* 4. 받은 시술 (행마다 가격·비고) */}
        <div>
          <label className={labelCls}>어떤 시술을 받으셨어요? <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">가격·비고는 나만 봐요</span></label>
          {procs.length > 0 && (
            <div className="mb-2 space-y-2">
              {procs.map((p) => (
                <div key={p.id} className="space-y-1.5 rounded-md bg-[var(--bg)] p-2.5">
                  {/* 1행: 칩 + 용량·가격(칩 우측) + 삭제 */}
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-white" style={{ background: CAT_COLOR[p.cat] ?? "var(--primary)" }}>{p.label}</span>
                    <input ref={(el) => { unitRefs.current[p.id] = el; }} className={inputSm + " min-w-0 flex-1"} placeholder="용량" value={p.unit} onChange={(e) => upd(p.id, { unit: e.target.value })} />
                    <input inputMode="numeric" className={inputSm + " min-w-0 flex-1"} placeholder="가격" value={p.price ? Number(p.price).toLocaleString() : ""} onChange={(e) => upd(p.id, { price: e.target.value.replace(/[^0-9]/g, "") })} />
                    <button type="button" tabIndex={-1} onClick={() => setProcs(procs.filter((x) => x.id !== p.id))} className="shrink-0 px-1 text-[16px] leading-none text-[var(--text-muted)]">×</button>
                  </div>
                  {/* 2행: 메모 전체 너비 */}
                  <input className={inputSm + " w-full"} placeholder="메모" value={p.note} onChange={(e) => upd(p.id, { note: e.target.value })} />
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <input ref={tagRef} className={inputCls} placeholder={procs.length === 0 ? "시술명을 검색해보세요" : "함께 받은 다른 시술"} value={tag} autoComplete="off"
              onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key !== "Enter") return; if (e.nativeEvent.isComposing || e.keyCode === 229) return; e.preventDefault(); addTag(tag); }} />
            {tq && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[240px] overflow-auto rounded-md bg-white shadow-[var(--shadow-lg)]">
                {acMatches.map((m) => (
                  <button key={m.value} type="button" onMouseDown={(e) => { e.preventDefault(); addTag(m.value); }}
                    className="flex w-full items-center gap-2 border-b border-[var(--border)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--primary-soft)]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CAT_COLOR[m.cat] ?? "var(--primary)" }} />
                    <span className="text-[14px] font-medium text-[var(--text)]">{m.label}</span>
                    <span className="ml-auto text-[11px] text-[var(--text-muted)]">{m.cat}</span>
                  </button>
                ))}
                {!acExact && (
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); addTag(tag); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--primary-soft)]">
                    <span className="text-[13px] font-semibold text-[var(--primary-active)]">＋ “{tq}” 직접 추가</span>
                    <span className="ml-auto text-[11px] text-[var(--text-muted)]">목록에 없음</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 5. 오늘의 시술 일기 — 비공개 메모, 최대 400자 (후기 카운터와 동일 표기) */}
        <div>
          <label className={labelCls}>오늘의 시술 일기 <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">나만 봐요</span> <span className="ml-1 text-[12px] font-normal text-[var(--text-muted)]">({diary.length} / 400)</span></label>
          <textarea rows={3} maxLength={400} value={diary} onChange={(e) => setDiary(e.target.value)} className={textareaCls} placeholder="오늘 어땠는지, 기억해두고 싶은 것…" />
        </div>

      </div>

      {procs.length > 0 && (
        <p className="mb-1 mt-5 px-2 text-center text-[14px] leading-relaxed text-[var(--text-secondary)]">
          다른 분들을 위해 시술후기를 남겨주세요.<br />
          <span className="text-[var(--text-muted)]">지금 당장 쓰기 어려우면 나중에 알려드릴게요!</span>
        </p>
      )}

      {/* 형제 글상자 — 시술별 후기 (받은 시술마다 하나씩, 닫힌 상태) */}
      {procs.map((p) => {
        const isReviewed = reviewed(p);
        return (
          <div key={p.id} className={cardBox + " mt-3"}>
            {p.open ? (
              <ReviewFormBody
                cat={p.cat}
                label={p.label}
                v={p}
                set={(patch) => upd(p.id, patch)}
                submitLabel="후기 올리기"
                onSubmit={() => { upd(p.id, { open: false }); toast("후기를 저장했어요"); }}
                topRight={<button type="button" onClick={() => upd(p.id, { open: false })} className="cursor-pointer text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-secondary)]">접기</button>}
              />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold text-[var(--text)]">{p.label} 후기</span>
                <span className="flex shrink-0 items-center gap-2">
                  {p.later ? (
                    <>
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: "#B6790F", background: "#FBEFD9" }}>나중에 알림</span>
                      <button type="button" onClick={() => upd(p.id, { later: false })} className="text-[12px] font-semibold text-[var(--text-secondary)] underline">취소</button>
                    </>
                  ) : isReviewed ? (
                    <>
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: "#2E9E68", background: "#E2F4EA" }}>작성됨</span>
                      <button type="button" onClick={() => upd(p.id, { open: true })} className="rounded-md bg-[var(--bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">수정</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => upd(p.id, { open: true, later: false })} className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--primary-dark)]">후기 작성하기</button>
                      <button type="button" onClick={() => upd(p.id, { later: true })} className="rounded-md bg-[var(--bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">나중에 쓰기</button>
                    </>
                  )}
                </span>
              </div>
            )}
            {p.later && !p.open && (
              <p className="mt-2 text-[12px] text-[var(--text-muted)]">3일·7일·30일 뒤 알림으로 채울 수 있게 알려드릴게요.</p>
            )}
          </div>
        );
      })}

      <div className="mt-5 flex justify-center">
        <button type="button" onClick={handleSave} disabled={saving} className="h-11 rounded-md bg-[var(--primary)] px-12 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-wait disabled:opacity-60">{saving ? "저장 중…" : "기록 저장하기"}</button>
      </div>
    </section>
  );
}

/* ════════════════ ⑤ 내 일기 (달력 / 목록 토글) ════════════════ */

// SummaryItem.date = "MM.DD"(연도는 SummaryGroup.year). 실데이터(/record)·목업 공용 타입.
export type SummaryItem = { id: string; date: string; proc: string; hospital: string; doctor: string; manager?: string; tel: string; price: string; memo: string; items: { name: string; unit: string }[] };
export type SummaryGroup = { year: number; items: SummaryItem[] };
const SUMMARY: SummaryGroup[] = [
  { year: 2026, items: [
    { id: "a", date: "06.12", proc: "보톡스", hospital: "예담피부과의원", doctor: "김민재 원장", tel: "02-000-2222", price: "220,000원", memo: "이마·미간", items: [{ name: "보톡스", unit: "이마 50u · 미간 20u" }] },
    { id: "b", date: "06.04", proc: "써마지 · 스컬트라", hospital: "라온피부과의원", doctor: "이서연 원장", manager: "윤소희 실장님", tel: "02-000-1111", price: "1,650,000원", memo: "1년 주기로 받기로 함", items: [{ name: "써마지", unit: "600샷" }, { name: "스컬트라", unit: "2바이알" }] },
    { id: "c", date: "05.20", proc: "리쥬란", hospital: "맑은서울피부과의원", doctor: "박지호 원장", tel: "02-000-3333", price: "350,000원", memo: "리쥬란힐러", items: [{ name: "리쥬란", unit: "2cc" }] },
  ] },
  { year: 2025, items: [
    { id: "d", date: "11.03", proc: "써마지", hospital: "라온피부과의원", doctor: "이서연 원장", tel: "02-000-1111", price: "980,000원", memo: "1년 주기로 받기로", items: [{ name: "써마지", unit: "600샷" }] },
    { id: "e", date: "06.04", proc: "울쎄라", hospital: "수피부과의원", doctor: "정유진 원장", tel: "031-000-5555", price: "1,200,000원", memo: "300샷", items: [{ name: "울쎄라", unit: "300샷" }] },
  ] },
];

// summary 미지정(목업)이면 데모 데이터, /record 는 실제 diaries 를 prop 으로 전달.
//   openDetail: 항목 클릭 시 상세 진입. 미지정(목업)이면 go("detail")(목업 상세 화면).
//   /record 는 (id)=>router.push(`/record/${id}`) 를 전달해 실제 상세 라우트로 이동.
export function RecordView({
  go,
  summary = SUMMARY,
  openDetail,
}: {
  go: (s: Screen) => void;
  summary?: SummaryGroup[];
  openDetail?: (id: string) => void;
}) {
  const [mode, setMode] = useState<"tl" | "cal" | "list">("tl");
  const TABS: [typeof mode, string][] = [["tl", "타임라인"], ["cal", "달력"], ["list", "목록"]];
  const total = summary.reduce((n, g) => n + g.items.length, 0);
  const open = openDetail ?? (() => go("detail"));
  return (
    <section className="mx-auto w-full max-w-[680px]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[16px] font-bold text-[var(--text)]">내 일기</span>
        {total > 0 && (
          <div className="flex gap-1 rounded-full bg-[#E8EAEE] p-1">
            {TABS.map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className="rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
                style={mode === m ? { background: "#fff", color: "var(--primary-active)" } : { background: "transparent", color: "#5C6470" }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {total === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center shadow-[0_2px_12px_rgba(27,43,58,.06)]">
          <div className="mx-auto mb-4 flex h-[88px] w-[88px] items-center justify-center rounded-[28px] text-[40px]" style={{ background: "linear-gradient(135deg,#EAF7FE,#D3EEFB)" }}>📒</div>
          <h3 className="text-[19px] font-extrabold leading-snug tracking-tight text-[var(--text)]">첫 일기를 쓰면<br />이렇게 정리돼요</h3>
          <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--text-secondary)]">받은 시술이 타임라인·달력·목록으로<br />한눈에 보이고, 다음 주기도 알려드려요.</p>
          <a href="/write" className="mt-[18px] inline-block rounded-full bg-[var(--primary)] px-[30px] py-3.5 text-[15.5px] font-extrabold text-white shadow-[0_6px_16px_rgba(76,191,242,.35)]">첫 일기 쓰러 가기</a>

          {/* 고스트 미리보기 타임라인 — 기록 시 무엇이 생기는지 점선으로 예시 */}
          <div className="mt-[22px] text-left">
            <p className="mb-2.5 text-center text-[12.5px] font-bold text-[var(--text-muted)]">미리보기</p>
            <div className="relative pl-[50px] opacity-85">
              <span className="pointer-events-none absolute bottom-1.5 left-[19px] top-1.5 w-0.5 rounded bg-[#D8EAF5]" />
              {[
                { d: "오늘", t: "오늘 받은 시술 기록", s: "메모 · 회복 체크 · 다음 주기" },
                { d: "지난", t: "지난 기록이 쌓여요", s: "시술별 효과 비교까지" },
              ].map((g) => (
                <div key={g.t} className="relative mb-2.5">
                  <div className="absolute left-[-50px] top-2.5 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-[#BFDFF1] bg-[#F0F7FC] text-[12px] font-extrabold text-[#9CC8E2]">{g.d}</div>
                  <div className="rounded-[14px] border border-dashed border-[#CBE6F5] bg-[#F7FBFE] px-3.5 py-3">
                    <p className="text-[14px] font-bold text-[#7FAECB]">{g.t}</p>
                    <p className="mt-0.5 text-[12.5px] text-[#A4C4D8]">{g.s}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : mode === "tl" ? (
        <TimelinePanel onOpen={open} summary={summary} />
      ) : mode === "cal" ? (
        <CalendarPanel onOpen={open} summary={summary} />
      ) : (
        <SummaryPanel onOpen={open} summary={summary} />
      )}
    </section>
  );
}

/* ─── 타임라인(시그니처) — 좌측 날짜 원 + 세로 연결선, 미래→과거 한 줄 ─── */
function TimelinePanel({ onOpen, summary }: { onOpen: (id: string) => void; summary: SummaryGroup[] }) {
  // 전체 기록을 하나의 세로 타임라인으로(연도 내림차순·날짜 내림차순). 연도 바뀌면 라벨.
  const rows: ({ kind: "year"; year: number } | { kind: "rec"; it: SummaryItem; year: number })[] = [];
  for (const g of summary) {
    rows.push({ kind: "year", year: g.year });
    for (const it of g.items) rows.push({ kind: "rec", it, year: g.year });
  }

  return (
    <div className="relative pl-[58px]">
      {/* 세로 연결선 */}
      <span
        className="pointer-events-none absolute bottom-2 left-[23px] top-2 w-0.5 rounded"
        style={{ background: "linear-gradient(var(--primary) 0%, #CDEBFA 100%)" }}
      />
      {rows.map((row) =>
        row.kind === "year" ? (
          <div key={`y${row.year}`} className="mb-2 mt-1 text-[12px] font-extrabold text-[var(--text-muted)]">
            {row.year}
          </div>
        ) : (
          <RecTimelineCard key={row.it.id} it={row.it} year={row.year} onOpen={onOpen} />
        ),
      )}
    </div>
  );
}

function RecTimelineCard({ it, year, onOpen }: { it: SummaryItem; year: number; onOpen: (id: string) => void }) {
  const [mm, dd] = it.date.split(".");
  const visitedOn = `${year}-${mm}-${dd}`;
  const firstName = it.items[0]?.name ?? it.proc;
  const badge = recordBadge(firstName, visitedOn);
  const title = it.items.map((iv) => (iv.unit ? `${iv.name} ${iv.unit}` : iv.name)).join(" · ") || it.proc;
  const clinic = it.hospital + (it.doctor ? ` · ${it.doctor}` : "");
  return (
    <div className="relative mb-4">
      {/* 날짜 원(시그니처) */}
      <div className="absolute left-[-58px] top-3.5 flex h-[46px] w-[46px] flex-col items-center justify-center rounded-full border-2 border-[var(--primary)] bg-white shadow-[0_2px_12px_rgba(27,43,58,.06)]">
        <span className="text-[10px] font-bold leading-none text-[var(--text-muted)]">{Number(mm)}월</span>
        <span className="text-[17px] font-extrabold leading-tight text-[var(--primary-active)]">{Number(dd)}</span>
      </div>
      <button
        type="button"
        onClick={() => onOpen(it.id)}
        className="block w-full rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 text-left shadow-[0_2px_12px_rgba(27,43,58,.06)] transition-colors hover:border-[var(--primary)]"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[16.5px] font-extrabold tracking-tight text-[var(--text)]">{title}</h3>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
            style={badge.tone === "mint" ? { background: "#E7FAF4", color: "#13967A" } : { background: "#FFF4E5", color: "#C97A1B" }}
          >
            {badge.label}
          </span>
        </div>
        {clinic && <p className="mt-1 text-[13px] font-medium text-[var(--text-muted)]">{clinic}</p>}
        {it.memo && (
          <p className="mt-2.5 rounded-xl bg-[var(--bg-soft)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--text-secondary)]">{it.memo}</p>
        )}
        {it.items.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {it.items.map((iv) => (
              <span key={iv.name} className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--primary-active)]">
                #{iv.name}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

function CalendarPanel({ onOpen, summary }: { onOpen: (id: string) => void; summary: SummaryGroup[] }) {
  // 전체 일기 → "Y-M-D"(0패딩 없음) 키 맵. 같은 날 여러 방문도 누적.
  const dayMap = useMemo(() => {
    const map = new Map<string, SummaryItem[]>();
    for (const g of summary)
      for (const it of g.items) {
        const [mm, dd] = it.date.split(".");
        const key = `${g.year}-${Number(mm)}-${Number(dd)}`;
        map.set(key, [...(map.get(key) ?? []), it]);
      }
    return map;
  }, [summary]);

  // 초기 표시 = 가장 최근 기록의 연·월(없으면 올해 이번 달).
  const latest = summary[0]?.items[0];
  const initY = summary[0]?.year ?? new Date().getFullYear();
  const initM = latest ? Number(latest.date.split(".")[0]) : new Date().getMonth() + 1;
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: initY, m: initM });
  const [sel, setSel] = useState<number | null>(latest ? Number(latest.date.split(".")[1]) : null);

  const dow = ["일", "월", "화", "수", "목", "금", "토"];
  const first = new Date(ym.y, ym.m - 1, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const move = (delta: number) => {
    setSel(null);
    setYm(({ y, m }) => {
      const nm = m + delta;
      if (nm < 1) return { y: y - 1, m: 12 };
      if (nm > 12) return { y: y + 1, m: 1 };
      return { y, m: nm };
    });
  };
  const dayItems = (d: number) => dayMap.get(`${ym.y}-${ym.m}-${d}`) ?? [];
  const selItems = sel ? dayItems(sel) : [];

  return (
    <>
      <div className={cardBox}>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[17px] font-bold text-[var(--text)]">{ym.y}년 {ym.m}월</span>
          <span className="flex gap-1.5">
            <button type="button" onClick={() => move(-1)} className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg)] text-[var(--text-secondary)]">‹</button>
            <button type="button" onClick={() => move(1)} className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg)] text-[var(--text-secondary)]">›</button>
          </span>
        </div>
        <div className="grid grid-cols-7">{dow.map((d, i) => <div key={d} className="pb-2 text-center text-[11.5px] font-semibold" style={{ color: i === 0 ? "#D98A9C" : i === 6 ? "#7FA8D0" : "var(--text-muted)" }}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-y-1.5">
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;
            const has = dayItems(d).length > 0; const isSel = sel === d;
            return (
              <div key={`d${d}`} className="flex justify-center">
                <button type="button" disabled={!has} onClick={() => has && setSel(d)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-[14px] transition-all"
                  style={has ? { background: "var(--primary-soft)", color: "var(--primary-active)", fontWeight: 700, boxShadow: isSel ? "0 0 0 2px var(--primary)" : "none" } : { color: "var(--text-secondary)" }}>
                  {d}{has && <span className="absolute bottom-1.5 h-[5px] w-[5px] rounded-full" style={{ background: "var(--primary)" }} />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-center gap-5 border-t border-[var(--border)] pt-3 text-[11.5px] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--primary)" }} />시술 받은 날</span>
        </div>
      </div>
      {selItems.length > 0 && (
        <button type="button" onClick={() => onOpen(selItems[0].id)} className={"mt-3 flex w-full items-center gap-3 text-left " + cardBox + " hover:bg-[var(--primary-soft)]"}>
          <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md" style={{ background: "var(--primary-soft)" }}>
            <span className="text-[15px] font-bold leading-none" style={{ color: "var(--primary-active)" }}>{sel}</span><span className="mt-0.5 text-[9px] font-semibold text-[var(--text-muted)]">{ym.m}월</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold text-[var(--text)]">{selItems.flatMap((it) => it.items.map((iv) => iv.name)).join(" · ")}</span>
            <span className="mt-0.5 block truncate text-[12px] text-[var(--text-muted)]">{selItems[0].hospital}</span>
          </span>
          <span className="text-[var(--text-muted)]">›</span>
        </button>
      )}
    </>
  );
}

function SummaryPanel({ onOpen, summary }: { onOpen: (id: string) => void; summary: SummaryGroup[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const allIds = summary.flatMap((g) => g.items.map((i) => i.id));
  const allOpen = open.size === allIds.length;
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(allIds));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const thisYear = new Date().getFullYear();
  return (
    <>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={toggleAll} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">{allOpen ? "모두 닫기" : "모두 펼치기"}</button>
      </div>
      <div className="space-y-5">
        {summary.map((g) => (
          <div key={g.year}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[15px] font-extrabold text-[var(--text)]">{g.year}</span>
              <span className="text-[11.5px] text-[var(--text-muted)]">{g.year === thisYear ? "올해" : `${thisYear - g.year}년 전`}</span>
            </div>
            <div className="space-y-2">
              {g.items.map((it) => {
                const isOpen = open.has(it.id);
                return (
                  <div key={it.id} className={cardBox + " !p-0 overflow-hidden"}>
                    <button type="button" onClick={() => toggle(it.id)} className="flex w-full items-center gap-3 p-4 text-left">
                      <span className="w-[42px] shrink-0 text-center text-[14px] font-bold text-[var(--primary-active)]">{it.date}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-semibold text-[var(--text)]">{it.items.map((iv) => (iv.unit ? `${iv.name} ${iv.unit}` : iv.name)).join(" · ")}</span><span className="block truncate text-[11.5px] text-[var(--text-muted)]">{it.hospital}</span></span>
                      <span className="text-[12px] text-[var(--text-muted)]">{isOpen ? "▴" : "▾"}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[var(--border)] px-4 pb-3 pt-3">
                        {/* 받은 시술 — 각각 칩 (써마지 600샷) */}
                        <div className="flex flex-wrap gap-1.5">
                          {it.items.map((iv) => (
                            <span key={iv.name} className="rounded-full bg-[var(--bg)] px-3 py-1 text-[12.5px] font-semibold text-[var(--text)]">
                              {iv.name}{iv.unit ? <span className="ml-1 font-medium text-[var(--text-secondary)]">{iv.unit}</span> : null}
                            </span>
                          ))}
                        </div>
                        {/* 의료진 · 가격 · 메모 — 라벨 없이 한 줄로 옆으로 나열(컴팩트). 상세는 '상세 보기'에서. */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                          <span className="font-semibold text-[var(--text)]">{it.doctor}님{it.manager ? ` · ${it.manager}` : ""}</span>
                          <span className="text-[var(--text-muted)]">·</span>
                          <span className="font-semibold text-[var(--text)]">{it.price}</span>
                          {it.memo && <><span className="text-[var(--text-muted)]">·</span><span className="text-[var(--text-secondary)]">{it.memo}</span></>}
                        </div>
                        <button type="button" onClick={() => onOpen(it.id)} className="mt-2.5 w-full rounded-md bg-[var(--primary-soft)] py-2.5 text-[12.5px] font-semibold text-[var(--primary-active)]">상세 보기</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-[12px] text-[var(--text-muted)]">진료 갈 때 ‘모두 펼치기’로 그동안 받은 시술을 한눈에 정리해 보여줄 수 있어요.</p>
    </>
  );
}

/* ════════════════ ⑥ 상세 (평가 제외, 비공개 메모) ════════════════ */


function DetailView({ go }: { go: (s: Screen) => void }) {
  return (
    <section className="mx-auto w-full max-w-[680px] space-y-3">
      {/* 헤더 — 날짜·시술·병원·의료진(라벨 없이) + 빠른 액션 */}
      <div className={cardBox}>
        <p className="text-[12px] font-bold text-[var(--primary-active)]">2026.06.04 · 목요일 <span className="ml-1 font-medium text-[var(--text-muted)]">· 나만 봐요</span></p>
        <p className="mt-1 text-[20px] font-bold text-[var(--text)]">써마지 · 스컬트라</p>
        <p className="mt-2 text-[14px] font-semibold text-[var(--text)]">라온피부과의원</p>
        <p className="text-[13px] text-[var(--text-secondary)]">이서연 원장님 · ○○ 실장님</p>
        <div className="mt-3 flex gap-2">
          <a href="tel:02-000-1111" className="flex flex-1 items-center justify-center rounded-md bg-[var(--primary-soft)] py-2.5 text-[12.5px] font-semibold text-[var(--primary-active)]">전화하기</a>
          <a href="https://map.naver.com/p/search/라온피부과의원" target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white py-2.5 text-[12.5px] font-semibold text-[#03C75A] ring-1 ring-inset ring-[var(--border)]">네이버 지도</a>
          <a href="tmap://search?name=라온피부과의원" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white py-2.5 text-[12.5px] font-semibold text-[#1A56DB] ring-1 ring-inset ring-[var(--border)]">티맵</a>
        </div>
      </div>

      {/* 받은 시술 — 시술명 · 가격 · 메모 */}
      <div className={cardBox + " space-y-2"}>
        <div className="rounded-md bg-[var(--bg)] p-3">
          <div className="flex items-baseline justify-between"><span className="text-[14px] font-bold text-[var(--primary-active)]">써마지 <span className="text-[12.5px] font-medium text-[var(--text-secondary)]">600샷</span></span><span className="text-[13px] font-semibold text-[var(--text)]">980,000원</span></div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">1년 주기로 받자고 하셨다.</p>
        </div>
        <div className="rounded-md bg-[var(--bg)] p-3">
          <div className="flex items-baseline justify-between"><span className="text-[14px] font-bold text-[var(--primary-active)]">스컬트라 <span className="text-[12.5px] font-medium text-[var(--text-secondary)]">2바이알</span></span><span className="text-[13px] font-semibold text-[var(--text)]">670,000원</span></div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">볼 꺼진 부분 위주.</p>
        </div>
      </div>

      {/* 오늘의 시술 일기 */}
      <div className={cardBox}>
        <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">붓기는 이틀쯤. 다음엔 6개월 뒤 보자고 하셨다. 스컬트라는 확실히 볼륨이 산다…</p>
      </div>

      <button type="button" onClick={() => go("record")} className="w-full rounded-md bg-[var(--bg)] py-2.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">← 내 일기로</button>
    </section>
  );
}

/* ════════════════ ⑦ 알림 ════════════════ */

function NotiView({ go, toast }: { go: (s: Screen) => void; toast: (m: string) => void }) {
  const items = [
    { tag: "1단계 · 3일 뒤", t: "회복은 어떠세요?", m: "써마지 받으신 지 3일 됐어요. 붓기·통증이 어땠는지 후기를 채워볼까요?", meta: "힐하우스피부과 · 2026.06.04", last: false },
    { tag: "2단계 · 7일 뒤", t: "일주일 지났어요", m: "효과가 조금 느껴지시나요? 달라진 점을 골라두면 나중에 비교하기 좋아요.", meta: "써마지 · 다운타임 종료 시점", last: false },
    { tag: "3단계 · 30일 뒤 (마지막)", t: "한 달 됐어요", m: "이제 효과가 안정됐을 거예요. 최종 만족도와 효과를 마무리해 볼까요? 이 알림은 마지막이에요.", meta: "써마지 · 효과 안정 시점", last: true },
  ];
  return (
    <section className="mx-auto w-full max-w-[680px]">
      <p className="mb-3 text-[15px] font-bold text-[var(--text)]">‘나중에 쓰기’ 후기 알림 <span className="text-[12px] font-normal text-[var(--text-muted)]">3일 · 7일 · 30일, 3번까지</span></p>
      <div className="space-y-2.5">
        {items.map((n) => (
          <div key={n.tag} className={cardBox}>
            <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "#FBEFD9", color: "#B6790F" }}>{n.tag}</span>
            <p className="mt-2 text-[14.5px] font-semibold text-[var(--text)]">{n.t}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{n.m}</p>
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{n.meta}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => go("diary")} className="rounded-md bg-[var(--primary)] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[var(--primary-dark)]">{n.last ? "마무리하기" : "지금 채우기"}</button>
              {!n.last && <button type="button" className="rounded-md bg-[var(--bg)] px-4 py-2 text-[12px] font-semibold text-[var(--text-secondary)]">나중에</button>}
              <button type="button" onClick={() => toast("이 후기는 그만 알릴게요")} className="rounded-md bg-[var(--bg)] px-4 py-2 text-[12px] font-semibold text-[var(--text-secondary)]">그만 알림</button>
            </div>
          </div>
        ))}
      </div>

      <p className="mb-3 mt-7 text-[15px] font-bold text-[var(--text)]">시술 주기 리마인드 <span className="text-[12px] font-normal text-[var(--text-muted)]">별개 트랙</span></p>
      <div className={cardBox}>
        <p className="text-[14.5px] font-semibold text-[var(--text)]">써마지 받으신 지 1년 됐어요</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">작년 6월에 받으셨어요. 보통 이맘때 다시 찾는 분이 많아요. (권유가 아니라 시술 주기 안내예요.)</p>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">내 일기 기준 · 2025.06.04</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => go("record")} className="rounded-md bg-[var(--primary)] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[var(--primary-dark)]">내 일기 보기</button>
          <button type="button" className="rounded-md bg-[var(--bg)] px-4 py-2 text-[12px] font-semibold text-[var(--text-secondary)]">닫기</button>
        </div>
      </div>
    </section>
  );
}
