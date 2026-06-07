"use client";

/**
 * 피부일기 통합 — 검토용 디자인 목업 (시스템 미반영).
 * 실제 앱 className/컨트롤 패턴(globals.css 토큰, 후기폼 별점·표정·칩)을 그대로 사용한다.
 * layout.tsx 가 TopNav/SiteFooter/1080px 컨테이너/반응형을 자동 적용하므로
 * 여기서는 <main> 내부 콘텐츠만 작성한다.
 */

import { useState } from "react";

/* ───────────────── 공용 작은 컴포넌트 (실제 폼 스타일) ───────────────── */

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      {children}
    </div>
  );
}

function FieldLabel({
  children,
  badge,
}: {
  children: React.ReactNode;
  badge?: "private" | "public";
}) {
  return (
    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
      {children}
      {badge === "private" && (
        <span className="rounded-full bg-[#FEF3E2] px-2 py-[2px] text-[10.5px] font-bold text-[#C07A12]">
          🔒 나만 봐요
        </span>
      )}
      {badge === "public" && (
        <span className="rounded-full bg-[var(--primary-soft)] px-2 py-[2px] text-[10.5px] font-bold text-[var(--primary-active)]">
          👁 평가만 익명 공개
        </span>
      )}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[14px] focus:border-[var(--primary)] focus:outline-none";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full px-4 py-1 text-[13px] transition-colors active:scale-[0.97]"
      style={
        active
          ? { backgroundColor: "var(--primary)", color: "#fff", fontWeight: 600 }
          : { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 }
      }
    >
      {children}
    </button>
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
const CHANGED = ["리프팅","탄력","쫀쫀함","볼륨","작은얼굴","턱선","피부톤","피부결","모공","생기","없음"];
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
    ["entry","① 진입"],["form","② 일기 작성"],["cal","③ 캘린더"],
    ["timeline","④ 타임라인"],["detail","⑤ 상세"],["noti","⑥ 알림"],
  ];

  return (
    <div className="pb-10">
      {/* 검토용 안내 + 탭 */}
      <div className="-mx-4 mb-4 border-b border-[var(--border)] bg-[var(--secondary)] px-4 py-2 text-center text-[12px] leading-snug text-white sm:-mx-6 sm:px-6">
        <b className="text-[var(--secondary-light)]">검토용 목업</b> · 시스템 미반영 · 실제 헤더·로고·레이아웃·반응형 그대로
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className="rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors"
            style={view === v
              ? { backgroundColor: "var(--primary)", color: "#fff" }
              : { backgroundColor: "#E8EAEE", color: "#5C6470" }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "entry" && <EntryView go={setView} toast={showToast} />}
      {view === "form" && <FormView go={setView} toast={showToast} />}
      {view === "cal" && <CalendarView go={setView} toast={showToast} />}
      {view === "timeline" && <TimelineView go={setView} />}
      {view === "detail" && <DetailView go={setView} />}
      {view === "noti" && <NotiView go={setView} toast={showToast} />}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[200] -translate-x-1/2 rounded-[14px] bg-[var(--secondary)] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[var(--shadow-lg)]">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ───────────────── ① 진입 시트 ───────────────── */

function EntryView({ go, toast }: { go: (v: View) => void; toast: (m: string) => void }) {
  const opts = [
    { tt:"나의 피부일기 남기기", ds:"병원·날짜·시술·후기·메모까지. 일기장처럼 쌓여요.", bg:"linear-gradient(135deg,#4CBFF2,#1B87C9)" },
    { tt:"시술 후기만 남기기", ds:"병원·방문 정보는 접고 평가만 빠르게. (데이터는 일기에 함께 쌓여요.)", bg:"linear-gradient(135deg,#F6C36B,#F59E0B)" },
    { tt:"끄적끄적", ds:"자유로운 메모·포스팅.", bg:"linear-gradient(135deg,#A7B0BA,#77868F)" },
  ];
  return (
    <section className="mx-auto w-full max-w-[640px]">
      <h1 className="mb-1 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">무엇을 남길까요?</h1>
      <p className="mb-5 text-center text-[13px] text-[var(--text-muted)]">피부과 전문의와 함께하는 나의 피부일기</p>
      <div className="space-y-3">
        {opts.map((o) => (
          <button
            key={o.tt}
            type="button"
            onClick={() => { go("form"); toast("같은 일기 체계로 작성해요"); }}
            className="flex w-full items-center gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 text-left shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[22px]" style={{ background: o.bg }}>
              <span className="text-white">✎</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-bold text-[var(--text)]">{o.tt}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--text-muted)]">{o.ds}</span>
            </span>
            <span className="text-[var(--text-muted)]">›</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-[12px] leading-relaxed text-[var(--text-muted)]">
        어떤 칸도 필수가 아니에요. 비워둬도 저장돼요.<br />옛날 시술이라 기억이 안 나도, 병원을 몰라도 괜찮아요.
      </p>
    </section>
  );
}

/* ───────────────── ② 일기 작성 폼 ───────────────── */

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
    const t = raw.trim();
    if (!t) return;
    const low = t.toLowerCase();
    let label = t, isNew = true;
    if (/[a-z]/i.test(t)) { if (EN2KO[low]) { label = EN2KO[low]; isNew = false; } }
    else if (KO_TAGS.includes(t)) isNew = false;
    if (procs.some((p) => p.label === label)) { setTag(""); return; }
    const nid = pid + 1; setPid(nid);
    setProcs([...procs, { id: nid, label, isNew, open: true, stars: 0, pain: "", dt: "", re: "", eff: [], onset: "", price: "", pub: "" }]);
    setTag("");
  }
  function upd(id: number, patch: Partial<Proc>) {
    setProcs((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function status(p: Proc): "기록만" | "지켜보는 중" | "후기 작성됨" {
    const now = p.stars || p.pain || p.dt || p.re || p.price;
    const later = p.eff.length || p.onset || p.pub;
    if (now && later) return "후기 작성됨";
    if (now || later) return "지켜보는 중";
    return "기록만";
  }

  return (
    <section className="mx-auto w-full max-w-[640px]">
      <h1 className="mb-1 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">오늘의 시술을 기록해요</h1>
      <p className="mb-5 text-center text-[13px] text-[var(--text-muted)]">나만 보는 일기 + 익명으로만 모이는 평가</p>

      <div className="space-y-4">
        {/* 01 병원 */}
        <SectionCard>
          <FieldLabel badge="private">01 · 어디서 받으셨어요?</FieldLabel>
          <p className="-mt-1 mb-1 text-[12.5px] leading-snug text-[var(--text-muted)]">피부과를 검색해 선택하면 연락처·홈페이지가 자동으로 채워져요. 직접 고치셔도 됩니다.</p>
          <input className={inputCls} placeholder="병원 이름 검색 (예: 강남, 힐하우스…)" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} />
          {!picked && results.length > 0 && (
            <div className="overflow-hidden rounded-md border border-[var(--border)]">
              {results.map((h) => (
                <button key={h.n} type="button" onClick={() => { setPicked(h.n); setQ(h.n); }}
                  className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--primary-soft)]">
                  <span><span className="block text-[14px] font-semibold text-[var(--text)]">{h.n}</span>
                    <span className="block text-[11.5px] text-[var(--text-muted)]">{h.a}</span></span>
                  <span className="shrink-0 text-[11.5px] font-bold text-[var(--primary-active)]">{h.d}km</span>
                </button>
              ))}
            </div>
          )}
          {picked && (
            <div className="rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary-soft)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold text-[var(--primary-active)]">{picked}</span>
                <button type="button" onClick={() => { setPicked(null); setQ(""); }} className="text-[11.5px] text-[var(--text-secondary)] underline">다시 선택</button>
              </div>
              <div className="mt-2 space-y-1.5">
                <input className={inputCls} defaultValue={HOSPITALS.find((h) => h.n === picked)?.tel} />
                <input className={inputCls} placeholder="카카오톡 채널 · 있으면 직접 입력" />
              </div>
            </div>
          )}
        </SectionCard>

        {/* 02 방문 정보 */}
        <SectionCard>
          <FieldLabel badge="private">02 · 방문 정보</FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1.5 block text-[12.5px] font-semibold text-[var(--text-secondary)]">시술 날짜</label><input type="date" className={inputCls} defaultValue={today} /></div>
            <div><label className="mb-1.5 block text-[12.5px] font-semibold text-[var(--text-secondary)]">총 결제금액 <span className="font-normal text-[var(--text-muted)]">선택</span></label><input type="number" className={inputCls} placeholder="패키지면 총액만" /></div>
            <div><label className="mb-1.5 block text-[12.5px] font-semibold text-[var(--text-secondary)]">시술의사 <span className="font-normal text-[var(--text-muted)]">선택</span></label><input className={inputCls} placeholder="원장님 성함" /></div>
            <div><label className="mb-1.5 block text-[12.5px] font-semibold text-[var(--text-secondary)]">상담실장 <span className="font-normal text-[var(--text-muted)]">선택</span></label><input className={inputCls} placeholder="실장님 성함" /></div>
          </div>
        </SectionCard>

        {/* 03 받은 시술 */}
        <SectionCard>
          <FieldLabel>03 · 오늘 받은 시술</FieldLabel>
          <p className="-mt-1 mb-1 text-[12.5px] leading-snug text-[var(--text-muted)]">타이핑 후 Enter로 추가. 영어로 쓰면 사전에 있을 때 한글로 바꿔드려요.</p>
          {procs.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {procs.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-[13px] font-semibold text-white">
                  {p.label}{p.isNew && <span className="rounded bg-white/30 px-1.5 py-px text-[9px]">신규</span>}
                  <button type="button" onClick={() => setProcs(procs.filter((x) => x.id !== p.id))} className="text-[15px] leading-none opacity-80">×</button>
                </span>
              ))}
            </div>
          )}
          <input className={inputCls} placeholder="예: 써마지, thermage, 보톡스…" value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tag); } }} />
        </SectionCard>

        {/* 04 시술별 후기 (동적 아코디언) */}
        <SectionCard>
          <FieldLabel badge="public">04 · 시술별 후기</FieldLabel>
          <p className="-mt-1 mb-1 text-[12.5px] leading-snug text-[var(--text-muted)]">받은 시술이 카드로 떠요. 펼쳐 후기를 남기거나, 안 펼치면 기록만 됩니다.</p>
          {procs.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-6 text-center text-[13px] text-[var(--text-muted)]">
              위에서 시술을 먼저 선택해 주세요.
            </div>
          ) : (
            <div className="space-y-3">
              {procs.map((p) => {
                const st = status(p);
                return (
                  <div key={p.id} className={`overflow-hidden rounded-[var(--radius)] border ${p.open ? "border-[var(--primary)]" : "border-[var(--border)]"}`}>
                    <button type="button" onClick={() => upd(p.id, { open: !p.open })} className="flex w-full items-center justify-between gap-2 px-4 py-3">
                      <span className="text-[15px] font-bold text-[var(--primary-active)]">{p.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={st === "후기 작성됨" ? { background: "#E4F4EC", color: "#36936B" }
                            : st === "지켜보는 중" ? { background: "#FEF3E2", color: "#C07A12" }
                            : { background: "#ECEEF1", color: "#8A9099" }}>{st}</span>
                        <span className="text-[var(--text-muted)]">{p.open ? "▴" : "▾"}</span>
                      </span>
                    </button>
                    {p.open && (
                      <div className="space-y-4 border-t border-[var(--border)] px-4 pb-4 pt-3">
                        {/* 만족도 */}
                        <div>
                          <p className="mb-2 text-[13.5px] font-semibold text-[var(--text)]">만족도</p>
                          <div className="flex gap-1">
                            {[1,2,3,4,5].map((i) => (
                              <button key={i} type="button" onClick={() => upd(p.id, { stars: i })}
                                className="flex w-11 items-center justify-center text-[34px] leading-none">
                                <span style={{ color: i <= p.stars ? "var(--accent-save)" : "#E3E7EB" }}>★</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* 통증 */}
                        <div>
                          <p className="mb-2 text-[13.5px] font-semibold text-[var(--text)]">통증</p>
                          <div className="flex justify-between">
                            {PAINS.map(([lb, emo]) => {
                              const on = p.pain === lb;
                              return (
                                <button key={lb} type="button" onClick={() => upd(p.id, { pain: lb })} className="flex w-11 flex-col items-center gap-1">
                                  <span className="text-[30px] leading-none" style={{ filter: on ? "none" : "grayscale(1)", opacity: on ? 1 : 0.4 }}>{emo}</span>
                                  <span className="text-[10px]" style={{ color: on ? "var(--text)" : "var(--text-secondary)", fontWeight: on ? 700 : 400 }}>{lb}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {/* 다운타임 */}
                        <div>
                          <p className="mb-2 text-[13.5px] font-semibold text-[var(--text)]">다운타임</p>
                          <div className="flex flex-wrap gap-1.5">{DT.map((x) => <Chip key={x} active={p.dt === x} onClick={() => upd(p.id, { dt: x })}>{x}</Chip>)}</div>
                        </div>
                        {/* 재시술 */}
                        <div>
                          <p className="mb-2 text-[13.5px] font-semibold text-[var(--text)]">재시술 의향</p>
                          <div className="flex flex-wrap gap-1.5">{RE.map((x) => <Chip key={x} active={p.re === x} onClick={() => upd(p.id, { re: x })}>{x}</Chip>)}</div>
                        </div>
                        {/* 시간 경과 안내 밴드 */}
                        <div className="rounded-[var(--radius)] border border-dashed border-[#F0C277] bg-[#FEF3E2] px-3.5 py-3">
                          <p className="text-[12.5px] font-bold text-[#C07A12]">⏱ 시간이 지나야 아는 칸이에요</p>
                          <p className="mt-1 text-[11.5px] leading-snug text-[var(--text-secondary)]">아래는 시술 직후엔 비워둬도 돼요. “나중에 마저 쓸게요”로 저장하면 4일·1주·1달 뒤 알림이 채우러 와요.</p>
                        </div>
                        {/* 달라진 점 */}
                        <div>
                          <p className="mb-2 text-[13.5px] font-semibold text-[var(--text)]">달라진 점 (여러 개)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {CHANGED.map((x) => {
                              const on = p.eff.includes(x);
                              return <Chip key={x} active={on} onClick={() => upd(p.id, { eff: on ? p.eff.filter((e) => e !== x) : [...p.eff, x] })}>{x}</Chip>;
                            })}
                          </div>
                        </div>
                        {/* 효과시점 */}
                        <div>
                          <p className="mb-2 text-[13.5px] font-semibold text-[var(--text)]">효과는 언제부터?</p>
                          <div className="flex flex-wrap gap-1.5">{EFF.map((x) => <Chip key={x} active={p.onset === x} onClick={() => upd(p.id, { onset: x })}>{x}</Chip>)}</div>
                        </div>
                        {/* 단독가 */}
                        <div>
                          <FieldLabel badge="private">이 시술 단독 가격</FieldLabel>
                          <input type="number" className={inputCls} placeholder="단독 결제가 (알면)" value={p.price} onChange={(e) => upd(p.id, { price: e.target.value })} />
                          <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">패키지로 묶여 단가를 모르면 비워두세요. 단독가만 가격 집계에 들어가요.</p>
                        </div>
                        {/* 공개 후기 */}
                        <div className="border-t border-dashed border-[var(--border)] pt-3">
                          <FieldLabel badge="public">생생한 후기</FieldLabel>
                          <textarea maxLength={400} rows={3} className={inputCls + " resize-y leading-[1.6]"} placeholder="다른 분들이 궁금해할 만한 점을 들려주세요." value={p.pub} onChange={(e) => upd(p.id, { pub: e.target.value })} />
                          <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">의료광고성 표현·병원·의사 실명 언급은 자동 검수돼요.</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* 05 일기 메모 */}
        <SectionCard>
          <FieldLabel badge="private">05 · 오늘의 시술 일기</FieldLabel>
          <textarea rows={3} className={inputCls + " resize-y leading-[1.6]"} placeholder="오늘 어땠는지, 기억해두고 싶은 것…" />
        </SectionCard>

        {/* 저장 */}
        <SectionCard>
          <p className="text-sm font-semibold text-[var(--text)]">저장할게요</p>
          <p className="-mt-2 text-[12.5px] leading-snug text-[var(--text-muted)]">아직 모르는 칸이 있어도 괜찮아요. 나중에 마저 쓰면 4일·1주·1달 뒤 살짝 알려드려요.</p>
          <div className="flex gap-2">
            {([["done","다 썼어요","완료로 저장"],["later","나중에 마저 쓸게요","알림으로 회수"]] as const).map(([v, t, d]) => (
              <button key={v} type="button" onClick={() => setFinish(v)}
                className={`flex-1 rounded-md border p-3 text-center transition-colors ${finish === v ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] bg-white"}`}>
                <span className={`block text-[13.5px] font-bold ${finish === v ? "text-[var(--primary-active)]" : "text-[var(--text)]"}`}>{t}</span>
                <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{d}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-center border-t border-[var(--border)] pt-4">
            <button type="button" onClick={() => { toast(finish === "done" ? "완료로 저장했어요" : "저장! 4일·1주·1달 뒤 알려드릴게요"); setTimeout(() => go("timeline"), 900); }}
              className="h-10 rounded-md bg-[var(--primary)] px-8 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]">
              기록 저장하기
            </button>
          </div>
        </SectionCard>
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
  const dow = ["일","월","화","수","목","금","토"];
  const first = new Date(2026, 5, 1).getDay();
  const days = 30;
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <section className="mx-auto w-full max-w-[640px]">
      <SectionCard>
        <div className="flex items-center justify-between pb-2">
          <span className="text-[17px] font-bold text-[var(--text)]">2026년 6월</span>
          <span className="flex gap-1.5">
            <button type="button" className="h-8 w-8 rounded-md border border-[var(--border)] text-[var(--text-secondary)]">‹</button>
            <button type="button" className="h-8 w-8 rounded-md border border-[var(--border)] text-[var(--text-secondary)]">›</button>
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1">{dow.map((d) => <div key={d} className="py-1 text-center text-[11px] font-bold text-[var(--text-muted)]">{d}</div>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;
            const rec = RECORDS[d];
            return (
              <button key={d === null ? `e${i}` : `d${d}`} type="button" disabled={!rec} onClick={() => { if (rec) { toast(`6월 ${d}일 · ${rec.proc}`); setTimeout(() => go("detail"), 650); } }}
                className="relative flex aspect-square items-center justify-center rounded-[11px] text-[13px]"
                style={rec ? { background: rec.st === "watch" ? "#FEF3E2" : "var(--primary-soft)", border: `1px solid ${rec.st === "watch" ? "#F0C277" : "var(--primary-light)"}`, color: "var(--text)", fontWeight: 700 }
                  : { color: "var(--text)" }}>
                {d}
                {rec && <span className="absolute bottom-1.5 h-[5px] w-[5px] rounded-full" style={{ background: rec.st === "watch" ? "var(--accent-save)" : "var(--primary)" }} />}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-center gap-4 text-[11.5px] text-[var(--text-secondary)]">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--primary)" }} />기록 완료</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--accent-save)" }} />지켜보는 중</span>
        </div>
      </SectionCard>
      <p className="mt-3 text-center text-[12.5px] text-[var(--text-muted)]">날짜를 누르면 그날의 기록을 봐요. 진료 갈 때 내 이력을 한눈에 정리할 수 있어요.</p>
    </section>
  );
}

/* ───────────────── ④ 타임라인 ───────────────── */

const TL = [
  { d:"2026.06.12", dow:"금", proc:"보톡스", sub:"강남리더스 · 만족도 ★★★★★", st:"done" as const, rows:[["만족도","★★★★★"],["통증","조금"],["효과","잔주름"],["🔒 단독가","220,000원"]] },
  { d:"2026.06.04", dow:"목", proc:"써마지 · 스컬트라", sub:"힐하우스 · 1건 작성 / 1건 지켜보는 중", st:"watch" as const, rows:[["🔒 병원","힐하우스피부과"],["🔒 총액","1,650,000원"],["써마지","지켜보는 중"],["스컬트라","후기 작성됨"]] },
  { d:"2026.05.20", dow:"화", proc:"리쥬란", sub:"청담미라클 · 만족도 ★★★★☆", st:"done" as const, rows:[["만족도","★★★★☆"],["효과","피부결 · 속건조"],["효과시점","두세 달 후"]] },
  { d:"2026.05.02", dow:"토", proc:"울쎄라", sub:"분당제일 · 효과 지켜보는 중", st:"watch" as const, rows:[["만족도","★★★★☆"],["통증","꽤"],["효과 / 효과시점","아직 비어 있어요"]] },
];

function TimelineView({ go }: { go: (v: View) => void }) {
  const [open, setOpen] = useState<number | null>(1);
  return (
    <section className="mx-auto w-full max-w-[640px]">
      <div className="mb-3 flex">
        <button type="button" className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[12.5px] font-semibold text-[var(--text-secondary)]">↧ 텍스트로 내보내기</button>
      </div>
      <div className="space-y-3">
        {TL.map((t, i) => (
          <div key={t.d} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="w-[70px] shrink-0 text-[12px] font-bold leading-tight text-[var(--primary-active)]">{t.d}<span className="block text-[10.5px] font-semibold text-[var(--text-muted)]">{t.dow}요일</span></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-[var(--text)]">{t.proc}</span>
                <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{t.sub}</span>
              </span>
              <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold" style={t.st === "done" ? { background:"#E4F4EC", color:"#36936B" } : { background:"#FEF3E2", color:"#C07A12" }}>{t.st === "done" ? "완료" : "지켜보는 중"}</span>
            </button>
            {open === i && (
              <div className="border-t border-[var(--border)] px-4 pb-4">
                {t.rows.map((r, j) => (
                  <div key={r[0]} className="flex justify-between border-b border-[var(--border)] py-2.5 text-[13px] last:border-0">
                    <span className="font-semibold text-[var(--text-muted)]">{r[0]}</span><span className="font-semibold text-[var(--text)]">{r[1]}</span>
                  </div>
                ))}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => go("detail")} className="flex-1 rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] py-2 text-[12.5px] font-bold text-[var(--primary-active)]">상세 보기</button>
                  <button type="button" className="flex-1 rounded-md border border-[var(--border)] bg-white py-2 text-[12.5px] font-bold text-[var(--text-secondary)]">수정</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-[12px] text-[var(--text-muted)]">한 줄을 누르면 펼쳐져 상세가 보여요.</p>
    </section>
  );
}

/* ───────────────── ⑤ 상세 ───────────────── */

function DetailView({ go }: { go: (v: View) => void }) {
  return (
    <section className="mx-auto w-full max-w-[640px] space-y-3">
      <SectionCard>
        <div className="text-[12px] font-bold text-[var(--primary-active)]">2026.06.04 · 목요일</div>
        <div className="text-[20px] font-bold text-[var(--text)]">써마지 · 스컬트라</div>
        <span className="inline-block w-fit rounded-full bg-[#FEF3E2] px-2.5 py-1 text-[11px] font-bold text-[#C07A12]">지켜보는 중</span>
        <div>
          {[["🔒 병원","힐하우스피부과의원"],["🔒 시술의사 · 실장","김OO 원장 · 박OO"],["🔒 총 결제금액","1,650,000원"]].map((r) => (
            <div key={r[0]} className="flex justify-between border-b border-[var(--border)] py-2.5 text-[13px] last:border-0">
              <span className="font-semibold text-[var(--text-muted)]">{r[0]}</span><span className="font-semibold text-[var(--text)]">{r[1]}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className="flex-1 rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] py-2.5 text-[12.5px] font-bold text-[var(--primary-active)]">전화하기</button>
          <button type="button" className="flex-1 rounded-md border border-[var(--border)] bg-white py-2.5 text-[12.5px] font-bold text-[var(--text-secondary)]">채널 들어가기</button>
        </div>
      </SectionCard>

      <SectionCard>
        <p className="text-sm font-bold text-[var(--text)]">써마지 <span className="ml-1 rounded-full bg-[#FEF3E2] px-2 py-0.5 text-[10px] font-bold text-[#C07A12]">지켜보는 중</span></p>
        {[["만족도","★★★★☆"],["통증","꽤"],["효과 / 효과시점","아직 비어 있어요"],["🔒 단독가","980,000원"]].map((r) => (
          <div key={r[0]} className="flex justify-between border-b border-[var(--border)] py-2.5 text-[13px] last:border-0">
            <span className="font-semibold text-[var(--text-muted)]">{r[0]}</span>
            <span className="font-semibold" style={{ color: r[1].includes("비어") ? "var(--accent-save)" : "var(--text)" }}>{r[1]}</span>
          </div>
        ))}
        <button type="button" onClick={() => go("form")} className="w-full rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] py-2.5 text-[12.5px] font-bold text-[var(--primary-active)]">이어서 작성하기</button>
      </SectionCard>

      <SectionCard>
        <p className="text-sm font-bold text-[var(--text)]">스컬트라 <span className="ml-1 rounded-full bg-[#E4F4EC] px-2 py-0.5 text-[10px] font-bold text-[#36936B]">후기 작성됨</span></p>
        {[["만족도","★★★★★"],["효과","볼륨 · 탄력"],["효과시점","한 달쯤 후"]].map((r) => (
          <div key={r[0]} className="flex justify-between border-b border-[var(--border)] py-2.5 text-[13px] last:border-0">
            <span className="font-semibold text-[var(--text-muted)]">{r[0]}</span><span className="font-semibold text-[var(--text)]">{r[1]}</span>
          </div>
        ))}
      </SectionCard>

      <div className="rounded-[var(--radius)] border border-[#F0C277] bg-[#FEF3E2] p-4">
        <p className="text-[13px] font-bold text-[#C07A12]">🔒 오늘의 시술 일기</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">붓기는 이틀쯤. 김원장님이 다음엔 6개월 뒤 보자고 하셨다. 스컬트라는 확실히 볼륨이 산다…</p>
      </div>
    </section>
  );
}

/* ───────────────── ⑥ 알림 ───────────────── */

function NotiView({ go, toast }: { go: (v: View) => void; toast: (m: string) => void }) {
  const items = [
    { tag:"미완성 회수 · 1단계 / 4일 뒤", emoji:"🩹", t:"회복은 어떠세요?", m:"써마지 받으신 지 4일 됐어요. 붓기·통증이 어땠는지 기록해 둘까요?", meta:"힐하우스피부과 · 2026.06.04", last:false },
    { tag:"미완성 회수 · 2단계 / 1주 뒤", emoji:"🌤️", t:"일주일 지났어요", m:"효과가 조금 느껴지시나요? 달라진 점을 골라두면 나중에 비교하기 좋아요.", meta:"써마지 · 다운타임 종료 시점", last:false },
    { tag:"미완성 회수 · 3단계 / 1달 뒤 (마지막)", emoji:"✨", t:"한 달 됐어요", m:"이제 효과가 안정됐을 거예요. 최종 만족도와 효과를 마무리해 볼까요? 이 알림은 마지막이에요.", meta:"써마지 · 효과 안정 시점", last:true },
  ];
  return (
    <section className="mx-auto w-full max-w-[640px] space-y-3">
      {items.map((n) => (
        <div key={n.tag}>
          <div className="mb-1.5 inline-block rounded-full bg-[#FEF3E2] px-2.5 py-1 text-[10px] font-bold text-[#C07A12]">{n.tag}</div>
          <div className="flex gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[20px]" style={{ background: "linear-gradient(135deg,#4CBFF2,#1B4965)" }}>{n.emoji}</span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-[var(--text)]">{n.t}</p>
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--text-secondary)]">{n.m}</p>
              <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{n.meta}</p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={() => go("form")} className="rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-[12px] font-bold text-white">{n.last ? "마무리하기" : "지금 채우기"}</button>
                {!n.last && <button type="button" className="rounded-full border border-[var(--border)] bg-white px-3.5 py-1.5 text-[12px] font-bold text-[var(--text-secondary)]">나중에</button>}
                <button type="button" onClick={() => toast("이 기록은 그만 알릴게요")} className="rounded-full border border-[var(--border)] bg-white px-3.5 py-1.5 text-[12px] font-bold text-[var(--text-secondary)]">그만 알림</button>
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="my-1 h-px bg-[var(--border)]" />

      <div>
        <div className="mb-1.5 inline-block rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[10px] font-bold text-[var(--primary-active)]">시술 주기 리마인드 · 별개 트랙</div>
        <div className="flex gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[20px]" style={{ background: "linear-gradient(135deg,#87C4E5,#1B4965)" }}>📅</span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-[var(--text)]">써마지 받으신 지 1년 됐어요</p>
            <p className="mt-1 text-[12.5px] leading-snug text-[var(--text-secondary)]">작년 6월에 받으셨어요. 보통 이맘때 다시 찾는 분이 많아요. (권유가 아니라 시술 주기 안내예요.)</p>
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">내 기록 기준 · 2025.06.04</p>
            <div className="mt-2.5 flex gap-2">
              <button type="button" onClick={() => go("timeline")} className="rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-[12px] font-bold text-white">내 기록 보기</button>
              <button type="button" className="rounded-full border border-[var(--border)] bg-white px-3.5 py-1.5 text-[12px] font-bold text-[var(--text-secondary)]">닫기</button>
            </div>
          </div>
        </div>
      </div>
      <p className="pt-2 text-center text-[12px] text-[var(--text-muted)]">알림은 4일·1주·1달 3번까지만, 채우거나 “그만 알림”을 누르면 즉시 멈춰요.</p>
    </section>
  );
}
