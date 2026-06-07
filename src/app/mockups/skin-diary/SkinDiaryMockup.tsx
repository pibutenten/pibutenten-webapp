"use client";

/**
 * 피부일기 통합 — 검토용 디자인 목업 (시스템 미반영).
 *
 * 우리 앱 실제 디자인 언어로 새로 제작:
 *  - 테두리 없는 흰 카드 + 부드러운 navy-tint 그림자(var(--shadow)) + 둥근 모서리
 *  - globals.css 토큰 색만 사용 (primary/secondary/accent/accent-save …)
 *  - fade-in-up 등장 애니메이션, 파스텔 포인트, 둥근 칩
 * layout.tsx 가 TopNav/푸터/1080px/반응형을 자동 적용 → 여기는 <main> 콘텐츠만.
 */

import { useState } from "react";

/* ───────────────── 공용 ───────────────── */

function Card({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <div className={`fade-in-up rounded-[18px] bg-white p-5 shadow-[var(--shadow)] ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function PrivateBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#FBEFD9] px-2 py-[3px] text-[10.5px] font-bold text-[#B6790F]">나만 봐요</span>;
}
function PublicBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-[var(--secondary-light)]/60 px-2 py-[3px] text-[10.5px] font-bold text-[var(--secondary)]" style={{ background: "rgba(190,233,232,0.5)" }}>평가만 익명 공개</span>;
}

const inputCls =
  "w-full rounded-[12px] border border-transparent bg-[var(--bg)] px-3.5 py-3 text-[14.5px] text-[var(--text)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--primary)] focus:bg-white focus:outline-none";

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  const c = color ?? "var(--primary)";
  return (
    <button type="button" onClick={onClick}
      className="shrink-0 rounded-full px-3.5 py-[7px] text-[13px] transition-all active:scale-95"
      style={active ? { background: c, color: "#fff", fontWeight: 700, boxShadow: "0 2px 8px -2px rgba(27,73,101,.25)" } : { background: "#EEF0F3", color: "#6B7280", fontWeight: 500 }}>
      {children}
    </button>
  );
}

function FieldTitle({ children, badge }: { children: React.ReactNode; badge?: "private" | "public" }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-[14px] font-bold text-[var(--text)]">{children}</span>
      {badge === "private" && <PrivateBadge />}
      {badge === "public" && <PublicBadge />}
    </div>
  );
}

/* ───────────────── 데이터 ───────────────── */

const KO_TAGS = ["써마지","울쎄라","슈링크","포텐자","올리지오","울트라셀","리쥬란","쥬베룩","스컬트라","물광주사","보톡스","필러"];
const EN2KO: Record<string, string> = { thermage:"써마지", ulthera:"울쎄라", shurink:"슈링크", potenza:"포텐자", oligio:"올리지오", botox:"보톡스", filler:"필러", rejuran:"리쥬란", sculptra:"스컬트라" };
const HOSPITALS = [
  { n:"힐하우스피부과의원", a:"서울 강남구 테헤란로", tel:"02-1234-5678", d:0.4 },
  { n:"강남리더스피부과의원", a:"서울 강남구 강남대로", tel:"02-555-0101", d:0.7 },
  { n:"청담미라클피부과", a:"서울 강남구 청담동", tel:"02-540-2020", d:1.2 },
  { n:"분당제일피부과의원", a:"경기 성남시 분당구", tel:"031-707-5050", d:8.1 },
];
const PAINS: [string, string][] = [["없음","😊"],["조금","🙂"],["보통","😐"],["꽤","😣"],["심함","😖"]];
const DT = ["없음","1~2일","3~5일","약 1주","2주 이상"];
const RE = ["있어요","없어요","고민 중"];
const CHANGED = ["리프팅","탄력","쫀쫀함","볼륨","작은얼굴","턱선","피부톤","피부결","모공","생기"];
const EFF = ["시술 직후","1~2주 후","한 달쯤 후","두세 달 후","효과 못 느낌"];

type Proc = {
  id: number; label: string; isNew: boolean; open: boolean;
  stars: number; pain: string; dt: string; re: string;
  eff: string[]; onset: string; price: string; pub: string;
};
type View = "entry" | "form" | "cal" | "timeline" | "detail" | "noti";

/* ───────────────── 메인 ───────────────── */

export default function SkinDiaryMockup() {
  const [view, setView] = useState<View>("entry");
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1900); };

  const TABS: [View, string][] = [
    ["entry","진입"],["form","일기 작성"],["cal","캘린더"],
    ["timeline","타임라인"],["detail","상세"],["noti","알림"],
  ];

  return (
    <div className="pb-12">
      {/* 검토용 세그먼트 네비 (가벼운 캡션 + pill) */}
      <div className="mb-5 mt-1">
        <p className="mb-2 text-center text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">검토용 미리보기 · 시스템 미반영</p>
        <div className="mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-[var(--shadow-sm)]">
          {TABS.map(([v, label]) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-all"
              style={view === v ? { background: "var(--primary)", color: "#fff" } : { background: "transparent", color: "var(--text-muted)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "entry" && <EntryView go={setView} toast={showToast} />}
      {view === "form" && <FormView go={setView} toast={showToast} />}
      {view === "cal" && <CalendarView go={setView} toast={showToast} />}
      {view === "timeline" && <TimelineView go={setView} toast={showToast} />}
      {view === "detail" && <DetailView go={setView} />}
      {view === "noti" && <NotiView go={setView} toast={showToast} />}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[200] -translate-x-1/2 rounded-full bg-[var(--secondary)] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[var(--shadow-lg)]">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ───────────────── ① 진입 ───────────────── */

function EntryView({ go, toast }: { go: (v: View) => void; toast: (m: string) => void }) {
  const opts = [
    { tt:"나의 피부일기 남기기", ds:"병원·날짜·시술·후기·메모까지. 일기장처럼 차곡차곡.", grad:"linear-gradient(135deg,#4CBFF2,#1B4965)", icon:"📖" },
    { tt:"시술 후기만 남기기", ds:"병원·방문은 접고 평가만 빠르게. (데이터는 일기에 함께 쌓여요.)", grad:"linear-gradient(135deg,#F6C36B,#F59E0B)", icon:"✍️" },
    { tt:"끄적끄적", ds:"자유로운 메모와 포스팅.", grad:"linear-gradient(135deg,#A7B0BA,#77868F)", icon:"💭" },
  ];
  return (
    <section className="mx-auto w-full max-w-[600px]">
      {/* 감성 헤더 */}
      <div className="fade-in-up relative mb-5 overflow-hidden rounded-[22px] px-6 py-8 text-center" style={{ background: "linear-gradient(135deg,#E9F6FE 0%,#EAF7F4 100%)" }}>
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-50 blur-2xl" style={{ background: "#9FD9F6" }} />
        <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full opacity-40 blur-2xl" style={{ background: "#BEE9E8" }} />
        <h1 className="relative text-[23px] font-extrabold leading-tight text-[var(--secondary)]">무엇을 남길까요?</h1>
        <p className="relative mt-1.5 text-[13.5px] font-medium text-[var(--text-secondary)]">피부과 전문의와 함께하는 나의 피부일기</p>
      </div>

      <div className="space-y-3">
        {opts.map((o, i) => (
          <button key={o.tt} type="button" onClick={() => { go("form"); toast("같은 일기 체계로 작성해요"); }}
            className="fade-in-up group flex w-full items-center gap-4 rounded-[18px] bg-white p-4 text-left shadow-[var(--shadow)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]"
            style={{ animationDelay: `${i * 70}ms` }}>
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] text-[24px] shadow-[0_4px_12px_-4px_rgba(27,73,101,.4)]" style={{ background: o.grad }}>{o.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-extrabold text-[var(--text)]">{o.tt}</span>
              <span className="mt-1 block text-[12.5px] leading-relaxed text-[var(--text-muted)]">{o.ds}</span>
            </span>
            <span className="text-[18px] text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5">›</span>
          </button>
        ))}
      </div>
      <p className="fade-in-up mt-5 text-center text-[12px] leading-relaxed text-[var(--text-muted)]" style={{ animationDelay: "240ms" }}>
        어떤 칸도 필수가 아니에요. 비워둬도 저장돼요.<br />옛날 시술이라 기억이 안 나도, 병원을 몰라도 괜찮아요.
      </p>
    </section>
  );
}

/* ───────────────── ② 일기 작성 ───────────────── */

function FormView({ go, toast }: { go: (v: View) => void; toast: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [procs, setProcs] = useState<Proc[]>([]);
  const [pid, setPid] = useState(0);
  const [tag, setTag] = useState("");
  const [finish, setFinish] = useState<"done" | "later">("later");
  const today = new Date().toISOString().slice(0, 10);
  const results = q ? HOSPITALS.filter((h) => h.n.includes(q)) : [];

  function addTag(raw: string) {
    const t = raw.trim(); if (!t) return;
    const low = t.toLowerCase(); let label = t, isNew = true;
    if (/[a-z]/i.test(t)) { if (EN2KO[low]) { label = EN2KO[low]; isNew = false; } }
    else if (KO_TAGS.includes(t)) isNew = false;
    if (procs.some((p) => p.label === label)) { setTag(""); return; }
    const nid = pid + 1; setPid(nid);
    setProcs([...procs, { id: nid, label, isNew, open: true, stars: 0, pain: "", dt: "", re: "", eff: [], onset: "", price: "", pub: "" }]);
    setTag("");
  }
  const upd = (id: number, patch: Partial<Proc>) => setProcs((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  function status(p: Proc): "기록만" | "지켜보는 중" | "후기 작성됨" {
    const now = p.stars || p.pain || p.dt || p.re || p.price;
    const later = p.eff.length || p.onset || p.pub;
    if (now && later) return "후기 작성됨";
    if (now || later) return "지켜보는 중";
    return "기록만";
  }

  return (
    <section className="mx-auto w-full max-w-[600px]">
      <div className="fade-in-up mb-5 text-center">
        <h1 className="text-[22px] font-extrabold text-[var(--secondary)]">오늘의 시술을 기록해요</h1>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">나만 보는 일기 + 익명으로만 모이는 평가</p>
      </div>

      <div className="space-y-4">
        {/* 01 병원 */}
        <Card delay={0}>
          <FieldTitle badge="private"><span className="mr-1.5 text-[var(--primary-active)]">01</span>어디서 받으셨어요?</FieldTitle>
          <p className="-mt-1.5 mb-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">피부과를 검색해 선택하면 연락처·홈페이지가 자동으로 채워져요.</p>
          <input className={inputCls} placeholder="병원 이름 검색 (예: 강남, 힐하우스…)" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} />
          {!picked && results.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-[12px] bg-[var(--bg)]">
              {results.map((h) => (
                <button key={h.n} type="button" onClick={() => { setPicked(h.n); setQ(h.n); }}
                  className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left transition-colors hover:bg-[var(--primary-soft)]">
                  <span><span className="block text-[14px] font-semibold text-[var(--text)]">{h.n}</span>
                    <span className="block text-[11.5px] text-[var(--text-muted)]">{h.a}</span></span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--primary-active)]">{h.d}km</span>
                </button>
              ))}
            </div>
          )}
          {picked && (
            <div className="mt-3 rounded-[14px] bg-[var(--primary-soft)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-extrabold text-[var(--primary-active)]">{picked}</span>
                <button type="button" onClick={() => { setPicked(null); setQ(""); }} className="text-[11.5px] font-semibold text-[var(--text-secondary)] underline">다시 선택</button>
              </div>
              <div className="mt-3 space-y-2">
                <input className={inputCls + " bg-white"} defaultValue={HOSPITALS.find((h) => h.n === picked)?.tel} />
                <input className={inputCls + " bg-white"} placeholder="카카오톡 채널 · 있으면 직접 입력" />
              </div>
            </div>
          )}
        </Card>

        {/* 02 방문 정보 */}
        <Card delay={60}>
          <FieldTitle badge="private"><span className="mr-1.5 text-[var(--primary-active)]">02</span>방문 정보</FieldTitle>
          <div className="grid grid-cols-2 gap-3">
            {[["시술 날짜","date","",today],["총 결제금액","number","패키지면 총액만",""],["시술의사","text","원장님 성함",""],["상담실장","text","실장님 성함",""]].map(([lb, type, ph, dv], i) => (
              <div key={lb as string}>
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--text-secondary)]">{lb}{i > 0 && <span className="ml-1 font-normal text-[var(--text-muted)]">선택</span>}</label>
                <input type={type as string} className={inputCls} placeholder={ph as string} defaultValue={dv as string} />
              </div>
            ))}
          </div>
        </Card>

        {/* 03 받은 시술 */}
        <Card delay={120}>
          <FieldTitle><span className="mr-1.5 text-[var(--primary-active)]">03</span>오늘 받은 시술</FieldTitle>
          <p className="-mt-1.5 mb-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">타이핑 후 Enter로 추가. 영어로 쓰면 사전에 있을 때 한글로 바꿔드려요.</p>
          {procs.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {procs.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-[13px] font-bold text-white shadow-[0_2px_8px_-2px_rgba(27,73,101,.3)]">
                  {p.label}{p.isNew && <span className="rounded bg-white/25 px-1.5 py-px text-[9px]">신규</span>}
                  <button type="button" onClick={() => setProcs(procs.filter((x) => x.id !== p.id))} className="-mr-0.5 text-[15px] leading-none opacity-80">×</button>
                </span>
              ))}
            </div>
          )}
          <input className={inputCls} placeholder="예: 써마지, thermage, 보톡스…" value={tag}
            onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tag); } }} />
        </Card>

        {/* 04 시술별 후기 */}
        <Card delay={180}>
          <FieldTitle badge="public"><span className="mr-1.5 text-[var(--primary-active)]">04</span>시술별 후기</FieldTitle>
          <p className="-mt-1.5 mb-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">받은 시술이 카드로 떠요. 펼쳐 후기를 남기거나, 안 펼치면 기록만 됩니다.</p>
          {procs.length === 0 ? (
            <div className="rounded-[14px] bg-[var(--bg)] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
              <div className="mb-1 text-[22px] opacity-60">🗂️</div>위에서 시술을 먼저 선택해 주세요.
            </div>
          ) : (
            <div className="space-y-3">
              {procs.map((p) => {
                const st = status(p);
                const stStyle = st === "후기 작성됨" ? { background: "#E2F4EA", color: "#2E9E68" } : st === "지켜보는 중" ? { background: "#FBEFD9", color: "#B6790F" } : { background: "#EEF0F3", color: "#8A9099" };
                return (
                  <div key={p.id} className="overflow-hidden rounded-[16px] transition-all" style={{ background: p.open ? "#fff" : "var(--bg)", boxShadow: p.open ? "0 0 0 1.5px var(--primary)" : "none" }}>
                    <button type="button" onClick={() => upd(p.id, { open: !p.open })} className="flex w-full items-center justify-between gap-2 px-4 py-3.5">
                      <span className="text-[15.5px] font-extrabold text-[var(--primary-active)]">{p.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={stStyle}>{st}</span>
                        <span className="text-[13px] text-[var(--text-muted)]">{p.open ? "▴" : "▾"}</span>
                      </span>
                    </button>
                    {p.open && (
                      <div className="space-y-5 px-4 pb-5 pt-1">
                        <div>
                          <p className="mb-2 text-[13.5px] font-bold text-[var(--text)]">만족도</p>
                          <div className="flex gap-1">
                            {[1,2,3,4,5].map((i) => (
                              <button key={i} type="button" onClick={() => upd(p.id, { stars: i })} className="flex w-11 items-center justify-center text-[34px] leading-none transition-transform active:scale-110">
                                <span style={{ color: i <= p.stars ? "var(--accent-save)" : "#E3E7EB" }}>★</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-[13.5px] font-bold text-[var(--text)]">통증</p>
                          <div className="flex justify-between">
                            {PAINS.map(([lb, emo]) => {
                              const on = p.pain === lb;
                              return (
                                <button key={lb} type="button" onClick={() => upd(p.id, { pain: lb })} className="flex w-11 flex-col items-center gap-1">
                                  <span className="text-[30px] leading-none transition-all" style={{ filter: on ? "none" : "grayscale(1)", opacity: on ? 1 : 0.4 }}>{emo}</span>
                                  <span className="text-[10px]" style={{ color: on ? "var(--text)" : "var(--text-muted)", fontWeight: on ? 700 : 400 }}>{lb}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-[13.5px] font-bold text-[var(--text)]">다운타임</p>
                          <div className="flex flex-wrap gap-1.5">{DT.map((x) => <Chip key={x} active={p.dt === x} onClick={() => upd(p.id, { dt: x })}>{x}</Chip>)}</div>
                        </div>
                        <div>
                          <p className="mb-2 text-[13.5px] font-bold text-[var(--text)]">재시술 의향</p>
                          <div className="flex flex-wrap gap-1.5">{RE.map((x) => <Chip key={x} active={p.re === x} onClick={() => upd(p.id, { re: x })}>{x}</Chip>)}</div>
                        </div>
                        {/* 시간 경과 안내 밴드 */}
                        <div className="rounded-[14px] px-4 py-3.5" style={{ background: "linear-gradient(135deg,#FDF4E3,#FBEFD9)" }}>
                          <p className="text-[12.5px] font-bold text-[#B6790F]">⏱ 시간이 지나야 아는 칸이에요</p>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-[#9A7320]">아래는 시술 직후엔 비워둬도 돼요. “나중에 마저 쓸게요”로 저장하면 4일·1주·1달 뒤 알림이 채우러 와요.</p>
                        </div>
                        <div>
                          <p className="mb-2 text-[13.5px] font-bold text-[var(--text)]">달라진 점 <span className="font-normal text-[var(--text-muted)]">여러 개</span></p>
                          <div className="flex flex-wrap gap-1.5">
                            {CHANGED.map((x) => { const on = p.eff.includes(x); return <Chip key={x} active={on} onClick={() => upd(p.id, { eff: on ? p.eff.filter((e) => e !== x) : [...p.eff, x] })}>{x}</Chip>; })}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-[13.5px] font-bold text-[var(--text)]">효과는 언제부터?</p>
                          <div className="flex flex-wrap gap-1.5">{EFF.map((x) => <Chip key={x} active={p.onset === x} onClick={() => upd(p.id, { onset: x })}>{x}</Chip>)}</div>
                        </div>
                        <div>
                          <FieldTitle badge="private">이 시술 단독 가격</FieldTitle>
                          <input type="number" className={inputCls} placeholder="단독 결제가 (알면)" value={p.price} onChange={(e) => upd(p.id, { price: e.target.value })} />
                          <p className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">패키지로 묶여 단가를 모르면 비워두세요. 단독가만 가격 집계에 들어가요.</p>
                        </div>
                        <div>
                          <FieldTitle badge="public">생생한 후기</FieldTitle>
                          <textarea maxLength={400} rows={3} className={inputCls + " resize-y leading-relaxed"} placeholder="다른 분들이 궁금해할 만한 점을 들려주세요." value={p.pub} onChange={(e) => upd(p.id, { pub: e.target.value })} />
                          <p className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">의료광고성 표현·병원·의사 실명 언급은 자동 검수돼요.</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* 05 일기 메모 */}
        <Card delay={240}>
          <FieldTitle badge="private"><span className="mr-1.5 text-[var(--primary-active)]">05</span>오늘의 시술 일기</FieldTitle>
          <textarea rows={3} className={inputCls + " resize-y leading-relaxed"} placeholder="오늘 어땠는지, 기억해두고 싶은 것…" />
        </Card>

        {/* 저장 */}
        <Card delay={300}>
          <p className="text-[14px] font-bold text-[var(--text)]">저장할게요</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">아직 모르는 칸이 있어도 괜찮아요. 나중에 마저 쓰면 4일·1주·1달 뒤 살짝 알려드려요.</p>
          <div className="mt-3 flex gap-2.5">
            {([["done","다 썼어요","완료로 저장"],["later","나중에 마저 쓸게요","알림으로 회수"]] as const).map(([v, t, d]) => (
              <button key={v} type="button" onClick={() => setFinish(v)}
                className="flex-1 rounded-[14px] p-3.5 text-center transition-all"
                style={finish === v ? { background: "var(--primary-soft)", boxShadow: "0 0 0 1.5px var(--primary)" } : { background: "var(--bg)" }}>
                <span className="block text-[13.5px] font-extrabold" style={{ color: finish === v ? "var(--primary-active)" : "var(--text)" }}>{t}</span>
                <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{d}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { toast(finish === "done" ? "완료로 저장했어요" : "저장! 4일·1주·1달 뒤 알려드릴게요"); setTimeout(() => go("timeline"), 900); }}
            className="mt-4 w-full rounded-[14px] bg-[var(--primary)] py-3.5 text-[15px] font-extrabold text-white shadow-[0_8px_20px_-8px_rgba(76,191,242,.9)] transition-colors hover:bg-[var(--primary-dark)]">
            기록 저장하기
          </button>
        </Card>
      </div>
    </section>
  );
}

/* ───────────────── ③ 캘린더 ───────────────── */

const RECORDS: Record<number, { proc: string; st: "done" | "watch" }> = {
  2: { proc: "울쎄라", st: "watch" }, 4: { proc: "써마지 · 스컬트라", st: "watch" },
  12: { proc: "보톡스", st: "done" }, 20: { proc: "리쥬란", st: "done" },
};

function CalendarView({ go, toast }: { go: (v: View) => void; toast: (m: string) => void }) {
  const [sel, setSel] = useState<number | null>(4);
  const dow = ["일","월","화","수","목","금","토"];
  const first = new Date(2026, 5, 1).getDay();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: 30 }, (_, i) => i + 1)];
  const selRec = sel ? RECORDS[sel] : null;

  return (
    <section className="mx-auto w-full max-w-[600px]">
      <Card className="!p-6" delay={0}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[12px] font-bold text-[var(--primary-active)]">2026</p>
            <p className="text-[22px] font-extrabold leading-tight text-[var(--secondary)]">6월</p>
          </div>
          <span className="flex gap-2">
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--primary-soft)]">‹</button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--primary-soft)]">›</button>
          </span>
        </div>
        <div className="grid grid-cols-7">{dow.map((d, i) => <div key={d} className="pb-2 text-center text-[11.5px] font-bold" style={{ color: i === 0 ? "#E8849A" : i === 6 ? "#6FA8D8" : "var(--text-muted)" }}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-y-1.5">
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;
            const rec = RECORDS[d];
            const isSel = sel === d;
            return (
              <div key={`d${d}`} className="flex justify-center">
                <button type="button" disabled={!rec} onClick={() => { if (rec) setSel(d); }}
                  className="relative flex h-11 w-11 flex-col items-center justify-center rounded-full text-[14px] transition-all"
                  style={rec
                    ? { background: rec.st === "watch" ? "#FBEFD9" : "var(--primary-soft)", color: rec.st === "watch" ? "#B6790F" : "var(--primary-active)", fontWeight: 800, boxShadow: isSel ? `0 0 0 2px ${rec.st === "watch" ? "var(--accent-save)" : "var(--primary)"}` : "none" }
                    : { color: "var(--text-secondary)" }}>
                  {d}
                  {rec && <span className="absolute bottom-[7px] h-[5px] w-[5px] rounded-full" style={{ background: rec.st === "watch" ? "var(--accent-save)" : "var(--primary)" }} />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex justify-center gap-5 border-t border-[var(--bg-soft)] pt-4 text-[11.5px] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--primary)" }} />기록 완료</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent-save)" }} />지켜보는 중</span>
        </div>
      </Card>

      {/* 선택한 날 미리보기 */}
      {selRec && (
        <Card className="mt-4" delay={80}>
          <button type="button" onClick={() => { toast(`6월 ${sel}일 기록 열기`); setTimeout(() => go("detail"), 500); }} className="flex w-full items-center gap-3.5 text-left">
            <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[14px]" style={{ background: selRec.st === "watch" ? "#FBEFD9" : "var(--primary-soft)" }}>
              <span className="text-[16px] font-extrabold leading-none" style={{ color: selRec.st === "watch" ? "#B6790F" : "var(--primary-active)" }}>{sel}</span>
              <span className="mt-0.5 text-[9px] font-bold text-[var(--text-muted)]">6월</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold text-[var(--text)]">{selRec.proc}</span>
              <span className="mt-0.5 block text-[12px] text-[var(--text-muted)]">{selRec.st === "watch" ? "효과를 지켜보는 중이에요" : "기록을 마쳤어요"}</span>
            </span>
            <span className="text-[18px] text-[var(--text-muted)]">›</span>
          </button>
        </Card>
      )}
      <p className="mt-3 text-center text-[12px] text-[var(--text-muted)]">날짜를 누르면 그날 기록이 열려요. 진료 갈 때 내 이력을 한눈에.</p>
    </section>
  );
}

/* ───────────────── ④ 타임라인 ───────────────── */

const TL = [
  { d:"06.12", dow:"금", proc:"보톡스", sub:"강남리더스 · 만족도 ★★★★★", st:"done" as const, rows:[["만족도","★★★★★"],["통증","조금"],["효과","잔주름"],["단독가","220,000원"]] },
  { d:"06.04", dow:"목", proc:"써마지 · 스컬트라", sub:"힐하우스 · 1건 작성 / 1건 지켜보는 중", st:"watch" as const, rows:[["병원","힐하우스피부과"],["총액","1,650,000원"],["써마지","지켜보는 중"],["스컬트라","후기 작성됨"]] },
  { d:"05.20", dow:"화", proc:"리쥬란", sub:"청담미라클 · 만족도 ★★★★☆", st:"done" as const, rows:[["만족도","★★★★☆"],["효과","피부결 · 속건조"],["효과시점","두세 달 후"]] },
  { d:"05.02", dow:"토", proc:"울쎄라", sub:"분당제일 · 효과 지켜보는 중", st:"watch" as const, rows:[["만족도","★★★★☆"],["통증","꽤"],["효과 / 효과시점","아직 비어 있어요"]] },
];

function TimelineView({ go, toast }: { go: (v: View) => void; toast: (m: string) => void }) {
  const [open, setOpen] = useState<number | null>(1);
  return (
    <section className="mx-auto w-full max-w-[600px]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[15px] font-extrabold text-[var(--secondary)]">시술 타임라인</p>
        <button type="button" onClick={() => toast("내 기록을 텍스트로 복사했어요")} className="rounded-full bg-white px-3.5 py-2 text-[12px] font-bold text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">↧ 내보내기</button>
      </div>
      <div className="relative pl-7">
        {/* 세로 연결선 */}
        <div className="absolute bottom-2 left-[9px] top-2 w-[2px] rounded-full" style={{ background: "linear-gradient(var(--primary-light),var(--bg-soft))" }} />
        <div className="space-y-3">
          {TL.map((t, i) => (
            <div key={t.d} className="relative fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
              {/* 점 */}
              <span className="absolute -left-[26px] top-4 h-3.5 w-3.5 rounded-full border-[2.5px] border-white" style={{ background: t.st === "done" ? "var(--primary)" : "var(--accent-save)", boxShadow: "0 0 0 1.5px " + (t.st === "done" ? "var(--primary-light)" : "#F6CE8A") }} />
              <div className="overflow-hidden rounded-[16px] bg-white shadow-[var(--shadow)]">
                <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 p-4 text-left">
                  <span className="w-[42px] shrink-0 text-center">
                    <span className="block text-[15px] font-extrabold leading-none text-[var(--primary-active)]">{t.d}</span>
                    <span className="mt-1 block text-[10px] font-semibold text-[var(--text-muted)]">{t.dow}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-extrabold text-[var(--text)]">{t.proc}</span>
                    <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{t.sub}</span>
                  </span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold" style={t.st === "done" ? { background:"#E2F4EA", color:"#2E9E68" } : { background:"#FBEFD9", color:"#B6790F" }}>{t.st === "done" ? "완료" : "지켜보는 중"}</span>
                </button>
                {open === i && (
                  <div className="px-4 pb-4">
                    <div className="rounded-[12px] bg-[var(--bg)] p-3.5">
                      {t.rows.map((r) => (
                        <div key={r[0]} className="flex justify-between py-1.5 text-[13px]">
                          <span className="font-semibold text-[var(--text-muted)]">{r[0]}</span><span className="font-bold text-[var(--text)]">{r[1]}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => go("detail")} className="flex-1 rounded-[12px] bg-[var(--primary-soft)] py-2.5 text-[12.5px] font-bold text-[var(--primary-active)]">상세 보기</button>
                      <button type="button" className="flex-1 rounded-[12px] bg-[var(--bg)] py-2.5 text-[12.5px] font-bold text-[var(--text-secondary)]">수정</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────── ⑤ 상세 ───────────────── */

function DetailView({ go }: { go: (v: View) => void }) {
  return (
    <section className="mx-auto w-full max-w-[600px] space-y-4">
      {/* 헤더 카드 */}
      <div className="fade-in-up relative overflow-hidden rounded-[20px] p-6 text-white shadow-[var(--shadow-lg)]" style={{ background: "linear-gradient(135deg,#4CBFF2,#1B4965)" }}>
        <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/15 blur-xl" />
        <p className="relative text-[12.5px] font-semibold text-white/85">2026.06.04 · 목요일</p>
        <h1 className="relative mt-1 text-[22px] font-extrabold">써마지 · 스컬트라</h1>
        <span className="relative mt-3 inline-block rounded-full bg-white/20 px-3 py-1 text-[11.5px] font-bold backdrop-blur">지켜보는 중</span>
      </div>

      {/* 방문 정보 (비공개) */}
      <Card delay={60}>
        <FieldTitle badge="private">방문 정보</FieldTitle>
        {[["병원","힐하우스피부과의원"],["시술의사 · 실장","김OO 원장 · 박OO"],["총 결제금액","1,650,000원"]].map((r) => (
          <div key={r[0]} className="flex justify-between border-b border-[var(--bg-soft)] py-2.5 text-[13px] last:border-0">
            <span className="font-semibold text-[var(--text-muted)]">{r[0]}</span><span className="font-bold text-[var(--text)]">{r[1]}</span>
          </div>
        ))}
        <div className="mt-3 flex gap-2.5">
          <button type="button" className="flex-1 rounded-[12px] bg-[var(--primary-soft)] py-3 text-[12.5px] font-bold text-[var(--primary-active)]">전화하기</button>
          <button type="button" className="flex-1 rounded-[12px] bg-[var(--bg)] py-3 text-[12.5px] font-bold text-[var(--text-secondary)]">채널 들어가기</button>
        </div>
      </Card>

      {/* 시술별 */}
      <Card delay={120}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[15px] font-extrabold text-[var(--primary-active)]">써마지</span>
          <span className="rounded-full bg-[#FBEFD9] px-2.5 py-1 text-[10px] font-bold text-[#B6790F]">지켜보는 중</span>
        </div>
        {[["만족도","★★★★☆"],["통증","꽤"],["효과 / 효과시점","아직 비어 있어요"],["단독가","980,000원"]].map((r) => (
          <div key={r[0]} className="flex justify-between border-b border-[var(--bg-soft)] py-2.5 text-[13px] last:border-0">
            <span className="font-semibold text-[var(--text-muted)]">{r[0]}</span>
            <span className="font-bold" style={{ color: r[1].includes("비어") ? "var(--accent-save)" : "var(--text)" }}>{r[1]}</span>
          </div>
        ))}
        <button type="button" onClick={() => go("form")} className="mt-3 w-full rounded-[12px] bg-[var(--primary)] py-3 text-[12.5px] font-bold text-white">이어서 작성하기</button>
      </Card>

      <Card delay={160}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[15px] font-extrabold text-[var(--primary-active)]">스컬트라</span>
          <span className="rounded-full bg-[#E2F4EA] px-2.5 py-1 text-[10px] font-bold text-[#2E9E68]">후기 작성됨</span>
        </div>
        {[["만족도","★★★★★"],["효과","볼륨 · 탄력"],["효과시점","한 달쯤 후"]].map((r) => (
          <div key={r[0]} className="flex justify-between border-b border-[var(--bg-soft)] py-2.5 text-[13px] last:border-0">
            <span className="font-semibold text-[var(--text-muted)]">{r[0]}</span><span className="font-bold text-[var(--text)]">{r[1]}</span>
          </div>
        ))}
      </Card>

      {/* 일기 메모 */}
      <div className="fade-in-up rounded-[18px] p-5" style={{ background: "linear-gradient(135deg,#FDF4E3,#FBEFD9)", animationDelay: "200ms" }}>
        <div className="mb-2 flex items-center gap-2"><span className="text-[13.5px] font-bold text-[#B6790F]">오늘의 시술 일기</span><PrivateBadge /></div>
        <p className="text-[13.5px] leading-relaxed text-[#7A6320]">붓기는 이틀쯤. 김원장님이 다음엔 6개월 뒤 보자고 하셨다. 스컬트라는 확실히 볼륨이 산다…</p>
      </div>
    </section>
  );
}

/* ───────────────── ⑥ 알림 ───────────────── */

function NotiView({ go, toast }: { go: (v: View) => void; toast: (m: string) => void }) {
  const items = [
    { tag:"1단계 · 4일 뒤", emoji:"🩹", t:"회복은 어떠세요?", m:"써마지 받으신 지 4일 됐어요. 붓기·통증이 어땠는지 기록해 둘까요?", meta:"힐하우스피부과 · 2026.06.04", last:false },
    { tag:"2단계 · 1주 뒤", emoji:"🌤️", t:"일주일 지났어요", m:"효과가 조금 느껴지시나요? 달라진 점을 골라두면 나중에 비교하기 좋아요.", meta:"써마지 · 다운타임 종료 시점", last:false },
    { tag:"3단계 · 1달 뒤 (마지막)", emoji:"✨", t:"한 달 됐어요", m:"이제 효과가 안정됐을 거예요. 최종 만족도와 효과를 마무리해 볼까요? 이 알림은 마지막이에요.", meta:"써마지 · 효과 안정 시점", last:true },
  ];
  return (
    <section className="mx-auto w-full max-w-[600px]">
      <p className="mb-3 text-[15px] font-extrabold text-[var(--secondary)]">미완성 회수 알림 <span className="text-[12px] font-semibold text-[var(--text-muted)]">4일 · 1주 · 1달 · 3번까지</span></p>
      <div className="space-y-3">
        {items.map((n, i) => (
          <Card key={n.tag} delay={i * 60}>
            <div className="mb-2.5 inline-block rounded-full bg-[#FBEFD9] px-2.5 py-1 text-[10px] font-bold text-[#B6790F]">{n.tag}</div>
            <div className="flex gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-[21px] shadow-[0_4px_12px_-4px_rgba(27,73,101,.4)]" style={{ background: "linear-gradient(135deg,#4CBFF2,#1B4965)" }}>{n.emoji}</span>
              <div className="min-w-0">
                <p className="text-[14.5px] font-extrabold text-[var(--text)]">{n.t}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{n.m}</p>
                <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{n.meta}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => go("form")} className="rounded-full bg-[var(--primary)] px-4 py-2 text-[12px] font-bold text-white">{n.last ? "마무리하기" : "지금 채우기"}</button>
                  {!n.last && <button type="button" className="rounded-full bg-[var(--bg)] px-4 py-2 text-[12px] font-bold text-[var(--text-secondary)]">나중에</button>}
                  <button type="button" onClick={() => toast("이 기록은 그만 알릴게요")} className="rounded-full bg-[var(--bg)] px-4 py-2 text-[12px] font-bold text-[var(--text-secondary)]">그만 알림</button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="mb-3 mt-7 text-[15px] font-extrabold text-[var(--secondary)]">시술 주기 리마인드 <span className="text-[12px] font-semibold text-[var(--text-muted)]">별개 트랙</span></p>
      <Card delay={200}>
        <div className="flex gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-[21px] shadow-[0_4px_12px_-4px_rgba(27,73,101,.4)]" style={{ background: "linear-gradient(135deg,#87C4E5,#1B4965)" }}>📅</span>
          <div className="min-w-0">
            <p className="text-[14.5px] font-extrabold text-[var(--text)]">써마지 받으신 지 1년 됐어요</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">작년 6월에 받으셨어요. 보통 이맘때 다시 찾는 분이 많아요. (권유가 아니라 시술 주기 안내예요.)</p>
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">내 기록 기준 · 2025.06.04</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => go("timeline")} className="rounded-full bg-[var(--primary)] px-4 py-2 text-[12px] font-bold text-white">내 기록 보기</button>
              <button type="button" className="rounded-full bg-[var(--bg)] px-4 py-2 text-[12px] font-bold text-[var(--text-secondary)]">닫기</button>
            </div>
          </div>
        </div>
      </Card>
      <p className="mt-4 text-center text-[12px] text-[var(--text-muted)]">채우거나 “그만 알림”을 누르면 남은 알림은 즉시 멈춰요.</p>
    </section>
  );
}
