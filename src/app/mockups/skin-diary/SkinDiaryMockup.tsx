"use client";

/**
 * 피부일기 통합 — 검토용 디자인 목업 (시스템 미반영).
 *
 * 실제 앱 패턴 준수:
 *  - 글상자 = 피드 Card.tsx 와 동일(테두리 X·음영 X, 흰 박스 on 회색 배경).
 *  - 폼 컨트롤(별점/통증/칩/효과칩/단일선택) = ReviewForm 그대로 복제.
 *  - 끄적끄적 = CardEditor(제목/본문/태그) 구조. 시술후기만 = ReviewForm(가격 없음).
 *  - 장식 이모지 없음(통증 표정만 실제 폼 컨트롤이라 유지).
 * layout.tsx 가 TopNav/푸터/1080px/반응형 자동 적용 → 여기는 <main> 콘텐츠만.
 *
 * 구조 (원장 지시 2026-06-07):
 *  - 시술후기만: 기존 후기폼 그대로. 가격은 후기에 두지 않음(피부일기 비공개로 이동).
 *  - 피부일기: 날짜 → 병원(지도검색) → 의사/실장 → 받은 시술(행마다 가격·비고, 나만 보기)
 *              → 오늘의 시술 일기 → 저장하기. 받은 시술마다 "아래에 형제 글상자"로 후기칸이
 *              닫힌 채 생성 → [후기 작성하기]로 열고 한 번 더 누르면 닫힘 / [나중에 쓰기]는
 *              3·7·30일 뒤 알림.
 *  - 내 일기: 우상단 토글(달력/목록). 목록=요약본(연도 표시·모두 펼치기/닫기). 항목 클릭→상세.
 *  - 상세: 평가지표 제외, 비공개 메모(병원·의사·실장·연락처·가격·비고·일기)만.
 */

import { useMemo, useState, type CSSProperties } from "react";

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
    ["diary","피부일기"],["reviewonly","시술후기만"],
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

      <MockFab open={fabOpen} setOpen={setFabOpen} go={setScreen} />
    </div>
  );
}

/* ════════════════ 플로팅(+) 메뉴 — 우하단. 실제 FAB 대체 데모 ════════════════
   실제 layout 의 FloatingWriteButton(끄적끄적/시술후기/보관)을 목업에선 숨기고,
   '나의 피부일기 / 시술 후기 / 끄적끄적' 3개로 펼치는 메뉴로 대체.
   (앱 전환 시 하단 중앙 + 버튼으로 이동 예정.) */

function MockFab({ open, setOpen, go }: { open: boolean; setOpen: (b: boolean) => void; go: (s: Screen) => void }) {
  const items: [Screen, string, React.ReactNode][] = [
    ["diary", "나의 피부일기 남기기", (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
    )],
    ["reviewonly", "시술 후기 남기기", (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 17.3l-5.6 3.3 1.5-6.3-4.9-4.3 6.4-.5L12 3.5l2.6 6 6.4.5-4.9 4.3 1.5 6.3z" /></svg>
    )],
  ];
  return (
    <>
      {open && <div className="fixed inset-0 z-30" aria-hidden onClick={() => setOpen(false)} />}
      <div className="fixed z-40 flex flex-col items-end gap-3" style={{ bottom: "calc(env(safe-area-inset-bottom,0px) + 20px)", right: 20 }}>
        {open && items.map(([s, label, icon]) => (
          <button key={s} type="button" onClick={() => { go(s); setOpen(false); }} className="flex items-center gap-2" style={{ animation: "fab-pop .18s ease-out both" }}>
            <span className="hidden rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-[var(--text)] shadow-[0_4px_12px_rgba(0,0,0,0.12)] sm:block">{label}</span>
            <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full shadow-[0_6px_16px_rgba(139,195,222,0.35)]" style={{ background: "#7FD0F8" }}>{icon}</span>
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

/** 후기 정량 컨트롤 — 후기폼/일기 공용. 가격 없음(가격은 피부일기 비공개로 이동). */
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

/* ════════════════ ② 시술 후기만 (실제 ReviewForm 그대로, 가격 없음) ════════════════ */

function ReviewOnlyForm({ toast, go }: { toast: (m: string) => void; go: (s: Screen) => void }) {
  const [proc, setProc] = useState("");
  const [v, setV] = useState<ReviewState>(emptyReview());
  const set = (p: Partial<ReviewState>) => setV((s) => ({ ...s, ...p }));
  const selected = PROCEDURES.find((p) => p.value === proc);
  return (
    <section className="mx-auto w-full max-w-[640px]">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">시술 후기를 남겨주세요</h1>
      <div className={formBox}>
        <div>
          {selected && (
            <div className="relative flex items-center justify-center">
              <div className="py-1 text-center"><span className="text-[18px] font-bold leading-[1.4]" style={{ color: CAT_COLOR[selected.cat] ?? "var(--primary)" }}>{selected.label}</span></div>
              <button type="button" onClick={() => setProc("")} className="absolute right-0 cursor-pointer text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-secondary)]">다시 선택</button>
            </div>
          )}
          {!proc && <ProcedurePicker value={proc} onChange={setProc} />}
        </div>
        <div className={`space-y-5 transition-opacity ${proc ? "" : "pointer-events-none opacity-50"}`}>
          <ReviewControls v={v} set={set} />
        </div>
        <SubmitBar label="후기 올리기" onClick={() => { toast("후기를 올렸어요"); setTimeout(() => go("record"), 800); }} />
      </div>
    </section>
  );
}

/* ════════════════ ④ 나의 피부일기 ════════════════ */

const HOSPITALS = [
  { n: "라온피부과의원", a: "서울 강남구", tel: "02-000-1111", d: 0.4 },
  { n: "예담피부과의원", a: "서울 강남구", tel: "02-000-2222", d: 0.7 },
  { n: "맑은서울피부과의원", a: "서울 강남구", tel: "02-000-3333", d: 1.2 },
  { n: "온유피부과의원", a: "서울 서초구", tel: "02-000-4444", d: 1.9 },
  { n: "수피부과의원", a: "경기 성남시 분당구", tel: "031-000-5555", d: 8.1 },
];
const EN2KO: Record<string, string> = { thermage: "써마지", botox: "보톡스", filler: "필러", rejuran: "리쥬란", sculptra: "스컬트라" };

type DiaryProc = ReviewState & { id: number; label: string; price: string; unit: string; note: string; open: boolean; later: boolean };

function DiaryForm({ toast, go }: { toast: (m: string) => void; go: (s: Screen) => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [tel, setTel] = useState("");
  const [procs, setProcs] = useState<DiaryProc[]>([]);
  const [pid, setPid] = useState(0);
  const [tag, setTag] = useState("");
  const _d = new Date();
  const [date, setDate] = useState(`${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`);
  const [_y, _m, _dd] = date.split("-");
  const dateLabel = `${+_y}년 ${+_m}월 ${+_dd}일`;

  let results = q ? HOSPITALS.filter((h) => h.n.includes(q)) : showMap ? [...HOSPITALS] : [];
  if (showMap) results = [...results].sort((a, b) => a.d - b.d);

  function addTag(raw: string) {
    const t = raw.trim(); if (!t) return; const low = t.toLowerCase();
    let label = t; if (/[a-z]/i.test(t) && EN2KO[low]) label = EN2KO[low];
    if (procs.some((p) => p.label === label)) { setTag(""); return; }
    const nid = pid + 1; setPid(nid);
    setProcs([...procs, { ...emptyReview(), id: nid, label, price: "", unit: "", note: "", open: false, later: false }]);
    setTag("");
  }
  const upd = (id: number, p: Partial<DiaryProc>) => setProcs((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const reviewed = (p: DiaryProc) => !!(p.satisfaction || p.pain || p.downtime || p.revisit || p.effectAreas.length || p.effectOnset || p.oneliner);
  const tq = tag.trim(); const tlow = tq.toLowerCase();
  const acMatches = tq ? PROCEDURES.filter((p) => (p.label.includes(tq) || (EN2KO[tlow] && p.label === EN2KO[tlow])) && !procs.some((x) => x.label === p.label)).slice(0, 8) : [];
  const acExact = PROCEDURES.some((p) => p.label === tq) || !!EN2KO[tlow];

  return (
    <section className="mx-auto w-full max-w-[640px]">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">오늘의 시술을 기록해요</h1>

      {/* 메인 일기 글상자 */}
      <div className={formBox}>
        {/* 1. 날짜 — 클릭하면 달력 picker(투명 오버레이), 표시는 괄호 없이 */}
        <div>
          <label className={labelCls}>시술 받은 날짜 <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">나만 봐요</span></label>
          <div className="relative">
            <div className={inputCls + " flex items-center justify-between"}>
              <span className="text-[var(--text)]">{dateLabel}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></svg>
            </div>
            <input type="date" aria-label="시술 받은 날짜" value={date} onChange={(e) => setDate(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </div>
        </div>

        {/* 2. 병원 — 지도에서 쉽게 찾기 + 선택 시 전화번호 자동 채움 */}
        <div>
          <label className={labelCls}>어디서 받으셨어요? <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">나만 봐요</span></label>
          <input className={inputCls} placeholder="병원 이름" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} />
          {!picked && (
            <button type="button" onClick={() => { setShowMap(!showMap); setPicked(null); }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary-soft)] py-2.5 text-[13px] font-semibold text-[var(--primary-active)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
              지도에서 찾기
            </button>
          )}
          {showMap && !picked && (
            <div className="relative mt-2 flex h-[150px] items-center justify-center overflow-hidden rounded-md bg-[var(--bg-soft)]">
              <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)", backgroundSize: "26px 26px" }} />
              <div className="relative text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-7 w-7"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                <p className="mt-1 text-[12px] font-semibold text-[var(--text-secondary)]">현재 위치 주변 피부과</p>
              </div>
            </div>
          )}
          {!picked && results.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-md bg-[var(--bg)]">
              {results.map((h) => (
                <button key={h.n} type="button" onClick={() => { setPicked(h.n); setTel(h.tel); setQ(h.n); setShowMap(false); }} className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--primary-soft)]">
                  <span><span className="block text-[14px] font-semibold text-[var(--text)]">{h.n}</span><span className="block text-[11.5px] text-[var(--text-muted)]">{h.a}</span></span>
                  {showMap && <span className="shrink-0 text-[11.5px] font-bold text-[var(--primary-active)]">{h.d}km</span>}
                </button>
              ))}
            </div>
          )}
          {picked && (
            <div className="mt-2 rounded-md bg-[var(--bg)] p-3">
              <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[var(--text)]">{picked}</span>
                <button type="button" onClick={() => { setPicked(null); setQ(""); setTel(""); }} className="text-[11.5px] text-[var(--text-secondary)] underline">다시 선택</button></div>
              <div className="mt-2 space-y-2">
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold text-[var(--text-secondary)]">전화번호</label>
                  <input className={inputCls} value={tel} onChange={(e) => setTel(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold text-[var(--text-secondary)]">카카오톡 채널</label>
                  <input className={inputCls} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. 의사 / 실장 */}
        <div>
          <label className={labelCls}>시술의사 · 상담실장 <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">나만 봐요</span></label>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="시술의사 (선택)" />
            <input className={inputCls} placeholder="상담실장 (선택)" />
          </div>
        </div>

        {/* 4. 받은 시술 (행마다 가격·비고) */}
        <div>
          <label className={labelCls}>오늘 받은 시술 <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">가격·비고는 나만 봐요</span></label>
          {procs.length > 0 && (
            <div className="mb-2 space-y-2">
              {procs.map((p) => (
                <div key={p.id} className="space-y-1.5 rounded-md bg-[var(--bg)] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[var(--primary)] px-2.5 py-1 text-[12.5px] font-semibold text-white">{p.label}</span>
                    <button type="button" onClick={() => setProcs(procs.filter((x) => x.id !== p.id))} className="px-1 text-[16px] leading-none text-[var(--text-muted)]">×</button>
                  </div>
                  <div className="flex gap-1.5">
                    <input className={inputSm + " w-[120px] shrink-0"} placeholder="용량 (예: 600샷)" value={p.unit} onChange={(e) => upd(p.id, { unit: e.target.value })} />
                    <input inputMode="numeric" className={inputSm + " min-w-0 flex-1"} placeholder="가격" value={p.price ? Number(p.price).toLocaleString() : ""} onChange={(e) => upd(p.id, { price: e.target.value.replace(/[^0-9]/g, "") })} />
                  </div>
                  <input className={inputSm + " w-full"} placeholder="비고 (그 외 메모)" value={p.note} onChange={(e) => upd(p.id, { note: e.target.value })} />
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <input className={inputCls} placeholder="시술명" value={tag} autoComplete="off"
              onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tag); } }} />
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

        {/* 5. 오늘의 시술 일기 */}
        <div>
          <label className={labelCls}>오늘의 시술 일기 <span className="ml-1 rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">나만 봐요</span></label>
          <textarea rows={3} className={textareaCls} placeholder="오늘 어땠는지, 기억해두고 싶은 것…" />
        </div>

        <SubmitBar label="저장하기" onClick={() => { toast("저장했어요"); setTimeout(() => go("record"), 800); }} />
      </div>

      {procs.length > 0 && (
        <p className="mb-1 mt-5 px-2 text-center text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
          다른 분들을 위해 시술 후기를 남겨주세요.<br />
          <span className="text-[var(--text-muted)]">지금 당장 쓰기 어려우면 ‘나중에 쓰기’로 알림을 받을 수 있어요.</span>
        </p>
      )}

      {/* 형제 글상자 — 시술별 후기 (받은 시술마다 하나씩, 닫힌 상태) */}
      {procs.map((p) => {
        const isReviewed = reviewed(p);
        return (
          <div key={p.id} className={cardBox + " mt-3"}>
            {p.open ? (
              <button type="button" onClick={() => upd(p.id, { open: false })} className="flex w-full items-center justify-between gap-2 text-left">
                <span className="text-[15px] font-bold text-[var(--text)]">{p.label} 후기</span>
                <span className="shrink-0 text-[12px] font-medium text-[var(--text-muted)]">▴ 접기</span>
              </button>
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
            {p.open && (
              <div className="mt-4 space-y-5">
                <ReviewControls v={p} set={(patch) => upd(p.id, patch)} />
                <button type="button" onClick={() => { upd(p.id, { open: false }); toast("후기를 저장했어요"); }} className="w-full rounded-md bg-[var(--primary)] py-3 text-[13px] font-semibold text-white hover:bg-[var(--primary-dark)]">저장하기</button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ════════════════ ⑤ 내 일기 (달력 / 목록 토글) ════════════════ */

const RECORDS: Record<number, { proc: string; st: "done" | "watch" }> = {
  2: { proc: "울쎄라", st: "watch" }, 4: { proc: "써마지 · 스컬트라", st: "watch" },
  12: { proc: "보톡스", st: "done" }, 20: { proc: "리쥬란", st: "done" },
};

type SummaryItem = { id: string; date: string; proc: string; hospital: string; doctor: string; tel: string; price: string; memo: string; items: { name: string; unit: string }[] };
const SUMMARY: { year: number; items: SummaryItem[] }[] = [
  { year: 2026, items: [
    { id: "a", date: "06.12", proc: "보톡스", hospital: "예담피부과의원", doctor: "김민재 원장", tel: "02-000-2222", price: "220,000원", memo: "이마·미간", items: [{ name: "보톡스", unit: "이마 50u · 미간 20u" }] },
    { id: "b", date: "06.04", proc: "써마지 · 스컬트라", hospital: "라온피부과의원", doctor: "이서연 원장", tel: "02-000-1111", price: "1,650,000원", memo: "1년 주기로 받기로 함", items: [{ name: "써마지", unit: "600샷" }, { name: "스컬트라", unit: "2바이알" }] },
    { id: "c", date: "05.20", proc: "리쥬란", hospital: "맑은서울피부과의원", doctor: "박지호 원장", tel: "02-000-3333", price: "350,000원", memo: "리쥬란힐러", items: [{ name: "리쥬란", unit: "2cc" }] },
  ] },
  { year: 2025, items: [
    { id: "d", date: "11.03", proc: "써마지", hospital: "라온피부과의원", doctor: "이서연 원장", tel: "02-000-1111", price: "980,000원", memo: "1년 주기로 받기로", items: [{ name: "써마지", unit: "600샷" }] },
    { id: "e", date: "06.04", proc: "울쎄라", hospital: "수피부과의원", doctor: "정유진 원장", tel: "031-000-5555", price: "1,200,000원", memo: "300샷", items: [{ name: "울쎄라", unit: "300샷" }] },
  ] },
];

function RecordView({ go }: { go: (s: Screen) => void }) {
  const [mode, setMode] = useState<"cal" | "list">("list");
  return (
    <section className="mx-auto w-full max-w-[640px]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[16px] font-bold text-[var(--text)]">내 일기</span>
        <div className="flex gap-1 rounded-full bg-[#E8EAEE] p-1">
          {(["cal","list"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className="rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
              style={mode === m ? { background: "#fff", color: "var(--primary-active)" } : { background: "transparent", color: "#5C6470" }}>
              {m === "cal" ? "달력" : "목록"}
            </button>
          ))}
        </div>
      </div>
      {mode === "cal" ? <CalendarPanel go={go} /> : <SummaryPanel go={go} />}
    </section>
  );
}

function CalendarPanel({ go }: { go: (s: Screen) => void }) {
  const [sel, setSel] = useState<number | null>(4);
  const dow = ["일","월","화","수","목","금","토"];
  const first = new Date(2026, 5, 1).getDay();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: 30 }, (_, i) => i + 1)];
  const selRec = sel ? RECORDS[sel] : null;
  return (
    <>
      <div className={cardBox}>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[17px] font-bold text-[var(--text)]">2026년 6월</span>
          <span className="flex gap-1.5">
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg)] text-[var(--text-secondary)]">‹</button>
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg)] text-[var(--text-secondary)]">›</button>
          </span>
        </div>
        <div className="grid grid-cols-7">{dow.map((d, i) => <div key={d} className="pb-2 text-center text-[11.5px] font-semibold" style={{ color: i === 0 ? "#D98A9C" : i === 6 ? "#7FA8D0" : "var(--text-muted)" }}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-y-1.5">
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;
            const rec = RECORDS[d]; const isSel = sel === d;
            return (
              <div key={`d${d}`} className="flex justify-center">
                <button type="button" disabled={!rec} onClick={() => rec && setSel(d)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-[14px] transition-all"
                  style={rec ? { background: rec.st === "watch" ? "#FBEFD9" : "var(--primary-soft)", color: rec.st === "watch" ? "#B6790F" : "var(--primary-active)", fontWeight: 700, boxShadow: isSel ? `0 0 0 2px ${rec.st === "watch" ? "var(--accent-save)" : "var(--primary)"}` : "none" } : { color: "var(--text-secondary)" }}>
                  {d}{rec && <span className="absolute bottom-1.5 h-[5px] w-[5px] rounded-full" style={{ background: rec.st === "watch" ? "var(--accent-save)" : "var(--primary)" }} />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-center gap-5 border-t border-[var(--border)] pt-3 text-[11.5px] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--primary)" }} />기록 완료</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent-save)" }} />지켜보는 중</span>
        </div>
      </div>
      {selRec && (
        <button type="button" onClick={() => go("detail")} className={"mt-3 flex w-full items-center gap-3 text-left " + cardBox + " hover:bg-[var(--primary-soft)]"}>
          <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md" style={{ background: selRec.st === "watch" ? "#FBEFD9" : "var(--primary-soft)" }}>
            <span className="text-[15px] font-bold leading-none" style={{ color: selRec.st === "watch" ? "#B6790F" : "var(--primary-active)" }}>{sel}</span><span className="mt-0.5 text-[9px] font-semibold text-[var(--text-muted)]">6월</span>
          </span>
          <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-[var(--text)]">{selRec.proc}</span><span className="mt-0.5 block text-[12px] text-[var(--text-muted)]">탭하면 그날 기록을 봐요</span></span>
          <span className="text-[var(--text-muted)]">›</span>
        </button>
      )}
    </>
  );
}

function SummaryPanel({ go }: { go: (s: Screen) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const allIds = SUMMARY.flatMap((g) => g.items.map((i) => i.id));
  const allOpen = open.size === allIds.length;
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(allIds));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={toggleAll} className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">{allOpen ? "모두 닫기" : "모두 펼치기"}</button>
      </div>
      <div className="space-y-5">
        {SUMMARY.map((g) => (
          <div key={g.year}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[15px] font-extrabold text-[var(--text)]">{g.year}</span>
              <span className="text-[11.5px] text-[var(--text-muted)]">{g.year === 2026 ? "올해" : `${2026 - g.year}년 전`}</span>
            </div>
            <div className="space-y-2">
              {g.items.map((it) => {
                const isOpen = open.has(it.id);
                return (
                  <div key={it.id} className={cardBox + " !p-0 overflow-hidden"}>
                    <button type="button" onClick={() => toggle(it.id)} className="flex w-full items-center gap-3 p-4 text-left">
                      <span className="w-[42px] shrink-0 text-center text-[14px] font-bold text-[var(--primary-active)]">{it.date}</span>
                      <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-[var(--text)]">{it.proc}</span><span className="block truncate text-[11.5px] text-[var(--text-muted)]">{it.hospital}</span></span>
                      <span className="text-[12px] text-[var(--text-muted)]">{isOpen ? "▴" : "▾"}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[var(--border)] px-4 pb-3 pt-3">
                        <div className="mb-2.5 rounded-md bg-[var(--bg)] p-3">
                          {it.items.map((iv) => (
                            <div key={iv.name} className="flex items-baseline justify-between gap-2 py-0.5">
                              <span className="text-[13.5px] font-bold text-[var(--text)]">{iv.name}</span>
                              <span className="text-[12.5px] text-[var(--text-secondary)]">{iv.unit}</span>
                            </div>
                          ))}
                        </div>
                        <CompactRow k="병원" v={it.hospital} />
                        <CompactRow k="원장" v={it.doctor} />
                        <CompactRow k="전화" v={it.tel} />
                        <CompactRow k="가격" v={it.price} />
                        <CompactRow k="메모" v={it.memo} />
                        <button type="button" onClick={() => go("detail")} className="mt-2.5 w-full rounded-md bg-[var(--primary-soft)] py-2.5 text-[12.5px] font-semibold text-[var(--primary-active)]">상세 보기</button>
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

function CompactRow({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3 py-1 text-[13px]"><span className="shrink-0 font-medium text-[var(--text-muted)]">{k}</span><span className="text-right font-semibold text-[var(--text)]">{v}</span></div>;
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3 border-b border-[var(--border)] py-2.5 text-[13px] last:border-0"><span className="shrink-0 font-medium text-[var(--text-muted)]">{k}</span><span className="text-right font-semibold text-[var(--text)]">{v}</span></div>;
}

function DetailView({ go }: { go: (s: Screen) => void }) {
  return (
    <section className="mx-auto w-full max-w-[640px] space-y-3">
      <div className={cardBox}>
        <p className="text-[12px] font-bold text-[var(--primary-active)]">2026.06.04 · 목요일</p>
        <p className="mt-1 text-[20px] font-bold text-[var(--text)]">써마지 · 스컬트라</p>
        <span className="mt-2 inline-block rounded bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">나만 보는 기록</span>
        <div className="mt-3">
          <Row k="병원" v="라온피부과의원" />
          <Row k="연락처" v="02-000-1111" />
          <Row k="시술의사" v="이서연 원장" />
          <Row k="상담실장" v="○○ 실장" />
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="flex-1 rounded-md bg-[var(--primary-soft)] py-2.5 text-[12.5px] font-semibold text-[var(--primary-active)]">전화하기</button>
          <button type="button" className="flex-1 rounded-md bg-[var(--bg)] py-2.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">채널 들어가기</button>
        </div>
      </div>

      <div className={cardBox}>
        <p className="mb-2 text-[14px] font-bold text-[var(--text)]">받은 시술 메모</p>
        <div className="space-y-3">
          <div className="rounded-md bg-[var(--bg)] p-3">
            <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[var(--primary-active)]">써마지</span><span className="text-[13px] font-semibold text-[var(--text)]">980,000원</span></div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">600샷. 1년 주기로 받자고 하셨다.</p>
          </div>
          <div className="rounded-md bg-[var(--bg)] p-3">
            <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[var(--primary-active)]">스컬트라</span><span className="text-[13px] font-semibold text-[var(--text)]">670,000원</span></div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">2바이알. 볼 꺼진 부분 위주.</p>
          </div>
        </div>
      </div>

      <div className={cardBox}>
        <p className="mb-1 text-[13px] font-semibold text-[var(--text-secondary)]">오늘의 시술 일기</p>
        <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">붓기는 이틀쯤. 다음엔 6개월 뒤 보자고 하셨다. 스컬트라는 확실히 볼륨이 산다…</p>
      </div>

      <button type="button" onClick={() => go("record")} className="w-full rounded-md bg-[var(--bg)] py-2.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">← 내 일기으로</button>
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
    <section className="mx-auto w-full max-w-[640px]">
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
