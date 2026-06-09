"use client";

/**
 * 피부텐텐 앱/웹 통합 정보구조(IA) — 검토용 셸 목업 (시스템 미반영, mock 데이터).
 *
 * 확정 사항 반영:
 * - 5탭: 시술 기록 / 글쓰기 / 피드 / 쇼핑 / 마이페이지
 * - 모바일·앱: 하단 5탭 / 데스크탑: 상단 내비(좌 로고·시술기록·글쓰기·피드·쇼핑 / 우 검색·알림·마이)
 * - 글쓰기 분류: 끄적끄적 / 시술기록하기 / 시술후기
 * - 시술일기 → "시술기록" 용어 통일, 자유메모 칸 "오늘의 시술기록"
 * - 공개 프로필 제거(닉네임 클릭 비활성) / 마이페이지 = 알림·내 글·저장·설정·로그아웃
 * - 쇼핑 = "준비중" 자리만
 * - 알림: 앱에선 상단 벨 제거 → 마이페이지에서 확인 / 데스크탑은 상단 벨 유지
 *
 * 상단 토글로 모바일/데스크탑 미리보기를 전환해 둘 다 볼 수 있다.
 */

import { useState } from "react";

const C = "#4cbff2"; // primary

/* ───────────────────────── 아이콘 (인라인 SVG) ───────────────────────── */
type IcoName =
  | "book" | "pen" | "grid" | "bag" | "user" | "search" | "bell"
  | "heart" | "chat" | "bookmark" | "star" | "chevL" | "chevR"
  | "arrowL" | "x" | "calendar";

function Ico({ name, size = 20, className = "", fill = false }: { name: IcoName; size?: number; className?: string; fill?: boolean }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: fill ? "currentColor" : "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  switch (name) {
    case "book": return <svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case "pen": return <svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
    case "grid": return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "bag": return <svg {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
    case "bell": return <svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
    case "heart": return <svg {...p}><path d="M19 14c1.5-1.5 3-3.4 3-5.5A4.5 4.5 0 0 0 12 5 4.5 4.5 0 0 0 2 8.5c0 2.1 1.5 4 3 5.5l7 7z" /></svg>;
    case "chat": return <svg {...p}><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a8.4 8.4 0 0 1-.9-4A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z" /></svg>;
    case "bookmark": return <svg {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;
    case "star": return <svg {...p}><path d="m12 2 3 6.5 7 .9-5 4.9 1.3 7-6.3-3.4L5.7 21l1.3-7-5-4.9 7-.9z" /></svg>;
    case "chevL": return <svg {...p}><path d="m15 18-6-6 6-6" /></svg>;
    case "chevR": return <svg {...p}><path d="m9 18 6-6-6-6" /></svg>;
    case "arrowL": return <svg {...p}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>;
    case "x": return <svg {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
  }
}

/* ───────────────────────── mock 데이터 ───────────────────────── */
type Post = { id: number; type: "후기" | "Q&A" | "커뮤"; title: string; body: string; author: string; time: string; likes: number; comments: number; tags: string[]; rating?: number };

const POSTS: Post[] = [
  { id: 1, type: "후기", title: "써마지 후기 — 3개월 지났는데 진짜 효과 있어요", body: "시술 받고 처음엔 별로였는데 두세 달 지나니까 탄력이 확 올라왔어요.", author: "수디", time: "4일 전", likes: 34, comments: 12, tags: ["써마지", "리프팅"], rating: 4 },
  { id: 2, type: "Q&A", title: "리쥬란 맞고 나서 붓기가 얼마나 가나요?", body: "내일 시술 예정인데 다음날 출근 가능할지 궁금해서요.", author: "지유", time: "6시간 전", likes: 8, comments: 23, tags: ["리쥬란", "다운타임"] },
  { id: 3, type: "커뮤", title: "피부과 예약 취소하고 싶은데 망설여지는 이유", body: "이미 예약금 넣었고, 시술이 무서워서 계속 미루게 되는데...", author: "앤", time: "1일 전", likes: 55, comments: 7, tags: ["고민", "시술전"] },
  { id: 4, type: "후기", title: "보톡스 이마 후기 — 표정이 자연스러운가요?", body: "처음 맞아봤는데 이마가 완전히 굳을까봐 걱정됐어요.", author: "DJ", time: "4일 전", likes: 19, comments: 5, tags: ["보톡스", "이마"], rating: 5 },
  { id: 5, type: "커뮤", title: "끄적끄적 — 오늘 피부과 다녀왔어요", body: "써마지랑 스컬트라 같이 맞았는데 생각보다 안 아파서 다행.", author: "반짝이", time: "6일 전", likes: 42, comments: 9, tags: ["일상", "피부과"] },
];

type Rec = { id: number; month: number; day: number; items: string[]; clinic: string; year?: number };
const RECORDS: Rec[] = [
  { id: 1, month: 6, day: 12, items: ["보톡스 이마 50u · 미간 20u"], clinic: "예담피부과의원" },
  { id: 2, month: 6, day: 4, items: ["써마지 600샷", "스컬트라 2바이알"], clinic: "라온피부과의원" },
  { id: 3, month: 5, day: 20, items: ["리쥬란 2cc"], clinic: "맑은서울피부과의원" },
  { id: 4, month: 11, day: 3, items: ["써마지 600샷"], clinic: "라온피부과의원", year: 2025 },
];

const TREAT_LIFTING = ["써마지", "올쎄라", "슈링크", "올리지오", "포텐자", "텐써마", "덴서티", "울트라셀", "티타늄"];
const TREAT_SKIN = ["보톡스", "리쥬란", "물광주사", "엑소좀", "스킨보톡스", "피코토닝"];
const PAIN_ICONS = ["😊", "🙂", "😐", "😬", "😣"];
const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const DOWNTIME = ["없음", "1~2일", "3~5일", "약 1주", "2주 이상"];
const REDO = ["있어요", "없어요", "고민 중"];
const EFFECTS = ["리프팅", "탄력", "쫀쫀함", "볼륨", "작은얼굴", "턱선", "피부톤", "피부결", "잔주름", "모공", "생기", "없음"];
const TIMING = ["시술 직후", "1~2주 후", "한 달쯤 후", "두세 달 후", "효과 못 느낌"];

/* ───────────────────────── 공통 작은 컴포넌트 ───────────────────────── */
function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-sm transition-all"
      style={on ? { background: C, color: "#fff", borderColor: C } : { background: "#fff", color: "#4b5563", borderColor: "#e5e7eb" }}>
      {children}
    </button>
  );
}
function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return <span className="flex">{[1, 2, 3, 4, 5].map((s) => <span key={s} style={{ color: s <= n ? "#fbbf24" : "#e5e7eb" }}><Ico name="star" size={size} fill={s <= n} /></span>)}</span>;
}

/* ───────────────────────── 메인 ───────────────────────── */
type Tab = "record" | "write" | "feed" | "shop" | "my";
const TABS: { key: Tab; label: string; icon: IcoName }[] = [
  { key: "record", label: "시술 기록", icon: "book" },
  { key: "write", label: "글쓰기", icon: "pen" },
  { key: "feed", label: "피드", icon: "grid" },
  { key: "shop", label: "쇼핑", icon: "bag" },
  { key: "my", label: "마이페이지", icon: "user" },
];

export default function AppShellMockup() {
  const [mode, setMode] = useState<"mobile" | "desktop">("mobile");
  const [tab, setTab] = useState<Tab>("feed");
  const [search, setSearch] = useState(false);

  const screen = (
    tab === "record" ? <RecordScreen /> :
    tab === "write" ? <WriteScreen /> :
    tab === "feed" ? <FeedScreen /> :
    tab === "shop" ? <ShopScreen /> :
    <MyScreen />
  );

  return (
    <div className="py-6">
      {/* 검토용 안내 + 모드 토글 */}
      <div className="mx-auto mb-5 max-w-2xl px-4">
        <p className="mb-3 text-center text-[13px] text-gray-500">앱/웹 통합 구조 미리보기 · 검토용 목업 (실제 데이터 아님)</p>
        <div className="flex justify-center gap-1 rounded-full bg-gray-100 p-1 text-sm font-medium" style={{ width: "fit-content", margin: "0 auto" }}>
          {(["mobile", "desktop"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className="rounded-full px-4 py-1.5 transition-all"
              style={mode === m ? { background: "#fff", color: "#111", boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : { color: "#6b7280" }}>
              {m === "mobile" ? "📱 모바일 / 앱" : "🖥 데스크탑 웹"}
            </button>
          ))}
        </div>
      </div>

      {mode === "mobile" ? (
        /* ── 모바일/앱 프레임: 상단 헤더(로고·검색) + 콘텐츠 + 하단 5탭 ── */
        <div className="mx-auto flex w-full max-w-[400px] flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-[#f4f5f7] shadow-xl" style={{ height: 760 }}>
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-4">
            {!search && <span className="text-[17px] font-extrabold" style={{ color: C }}>피부텐텐</span>}
            {search && <input autoFocus placeholder="시술명, 키워드 검색" className="flex-1 text-sm outline-none placeholder-gray-400" />}
            <div className="flex-1" />
            <button type="button" onClick={() => setSearch((v) => !v)} className="p-1 text-gray-600">
              <Ico name={search ? "x" : "search"} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto">{screen}</div>
          <nav className="flex shrink-0 border-t border-gray-100 bg-white">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => { setTab(t.key); setSearch(false); }}
                className="flex flex-1 flex-col items-center gap-0.5 py-2"
                style={{ color: tab === t.key ? C : "#9ca3af" }}>
                <Ico name={t.icon} size={20} />
                <span className="text-[10px] font-medium">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      ) : (
        /* ── 데스크탑 웹: 상단 내비(좌 로고·메뉴 / 우 검색·알림·마이) ── */
        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-gray-200 bg-[#f4f5f7] shadow-xl">
          <header className="flex h-16 items-center gap-6 border-b border-gray-100 bg-white px-6">
            <span className="text-[19px] font-extrabold" style={{ color: C }}>피부텐텐</span>
            <nav className="flex items-center gap-5">
              {TABS.filter((t) => t.key !== "my").map((t) => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)}
                  className="text-[15px] font-semibold transition-colors"
                  style={{ color: tab === t.key ? C : "#4b5563" }}>
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="flex-1" />
            <button type="button" className="p-1 text-gray-600"><Ico name="search" /></button>
            <button type="button" className="p-1 text-gray-600"><Ico name="bell" /></button>
            <button type="button" onClick={() => setTab("my")} className="p-1" style={{ color: tab === "my" ? C : "#4b5563" }}><Ico name="user" /></button>
          </header>
          <div className="mx-auto max-w-2xl px-4 py-5" style={{ minHeight: 620 }}>{screen}</div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── 1. 시술 기록 (연표/달력/목록) ───────────────────────── */
function RecordScreen() {
  const [view, setView] = useState<"연표" | "달력" | "목록">("연표");
  const [year, setYear] = useState(2026);
  const recs = RECORDS.filter((r) => (r.year ?? 2026) === year);
  const months = [...new Set(recs.map((r) => r.month))].sort((a, b) => b - a);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-bold text-gray-900">시술 기록</span>
        <div className="flex gap-1 rounded-full bg-gray-100 p-0.5">
          {(["연표", "달력", "목록"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className="rounded-full px-3 py-1 text-sm transition-all"
              style={view === v ? { background: "#fff", color: "#111", fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,.06)" } : { color: "#6b7280" }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "연표" && (
        <>
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setYear((y) => y - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"><Ico name="chevL" size={16} /></button>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-900">{year} <span className="text-sm font-normal text-gray-500">{year === 2026 ? "올해" : "작년"}</span></div>
              <div className="text-sm text-gray-500">시술 {recs.length}회</div>
            </div>
            <button type="button" onClick={() => setYear((y) => y + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"><Ico name="chevR" size={16} /></button>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {months.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">이 해엔 기록이 없어요.</p> : months.map((m, i) => (
              <div key={m}>
                {i > 0 && <div className="border-t border-gray-100" />}
                <div className="flex gap-3 p-4">
                  <span className="w-8 shrink-0 pt-1 text-sm font-bold leading-5" style={{ color: C }}>{m}월</span>
                  <div className="flex-1 space-y-2">
                    {recs.filter((r) => r.month === m).map((r) => (
                      <div key={r.id} className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 text-sm font-semibold leading-5" style={{ color: C }}>{r.day}일</span>
                          <span className="flex flex-wrap gap-1.5">
                            {r.items.map((it) => <span key={it} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">{it}</span>)}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-gray-400">{r.clinic}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {view === "달력" && <p className="rounded-2xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm">달력 보기 — 시술 받은 날에 표시</p>}
      {view === "목록" && (
        <div className="space-y-2">
          {RECORDS.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-sm font-semibold" style={{ color: C }}>{String(r.month).padStart(2, "0")}.{String(r.day).padStart(2, "0")}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{r.items.join(" · ")}</p>
                  <p className="text-xs text-gray-400">{r.clinic}</p>
                </div>
              </div>
              <Ico name="chevR" size={14} className="text-gray-300" />
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-center text-xs text-gray-400">한 해 동안 어떤 시술을 언제 받았는지 한눈에 볼 수 있어요.</p>
    </div>
  );
}

/* ───────────────────────── 2. 글쓰기 (끄적끄적 / 시술기록하기 / 시술후기) ───────────────────────── */
function WriteScreen() {
  const [cat, setCat] = useState<"끄적끄적" | "시술기록하기" | "시술후기">("끄적끄적");
  return (
    <div className="p-4">
      <div className="mb-4 flex gap-2">
        {(["끄적끄적", "시술기록하기", "시술후기"] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)}
            className="rounded-full border px-3 py-1.5 text-sm font-medium transition-all"
            style={cat === c ? { background: C, color: "#fff", borderColor: C } : { background: "#fff", color: "#4b5563", borderColor: "#e5e7eb" }}>
            {c}
          </button>
        ))}
      </div>
      {cat === "끄적끄적" && <FreeWrite />}
      {cat === "시술기록하기" && <RecordForm />}
      {cat === "시술후기" && <ReviewForm />}
    </div>
  );
}

function FreeWrite() {
  const [tags, setTags] = useState<string[]>(["일상"]);
  const [tagInput, setTagInput] = useState("");
  return (
    <div className="space-y-4">
      <input placeholder="제목을 입력하세요" className="w-full border-b border-gray-200 py-2 text-base outline-none placeholder-gray-300" />
      <textarea placeholder="자유롭게 이야기를 나눠보세요 ✍️" className="h-40 w-full resize-none text-sm leading-relaxed outline-none placeholder-gray-300" />
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700"># 태그</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs" style={{ background: "#e8f6fd", color: C }}>
              #{t}<button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))}><Ico name="x" size={10} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && tagInput.trim()) { setTags((p) => [...p, tagInput.trim().replace(/^#/, "")]); setTagInput(""); } }}
            placeholder="#태그 입력" className="flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-sm outline-none" />
        </div>
      </div>
      <button type="button" className="w-full rounded-xl py-3.5 font-semibold text-white" style={{ background: C }}>게시하기</button>
    </div>
  );
}

function RecordForm() {
  const [date, setDate] = useState("2026-06-09");
  const [picked, setPicked] = useState<string[]>(["써마지"]);
  const [tab, setTab] = useState<"리프팅" | "스킨부스터">("리프팅");
  const [diary, setDiary] = useState("");
  const toggle = (v: string) => setPicked((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v]);
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <Field label="언제 받으셨어요?" note="나만 봐요">
          <div className="relative rounded-lg border border-gray-200 px-3 py-2.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-sm text-gray-800 outline-none" />
          </div>
        </Field>
        <Field label="어디서 받으셨어요?" note="나만 봐요">
          <input placeholder="지역, 병원명으로 검색" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none placeholder-gray-400" />
        </Field>
        <Field label="누구에게 받으셨어요?" note="나만 봐요">
          <div className="flex gap-2">
            <input placeholder="원장님" className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none placeholder-gray-400" />
            <input placeholder="실장님" className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none placeholder-gray-400" />
          </div>
        </Field>
        <Field label="어떤 시술을 받으셨어요?" note="가격·비고는 나만 봐요">
          <div className="mb-2 flex gap-2">
            {(["리프팅", "스킨부스터"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className="text-sm font-medium" style={{ color: tab === t ? C : "#9ca3af" }}>{t}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(tab === "리프팅" ? TREAT_LIFTING : TREAT_SKIN).map((t) => <Chip key={t} on={picked.includes(t)} onClick={() => toggle(t)}>{t}</Chip>)}
          </div>
        </Field>
        <Field label="오늘의 시술기록" note={`나만 봐요 (${diary.length}/400)`}>
          <textarea value={diary} onChange={(e) => setDiary(e.target.value.slice(0, 400))} placeholder="오늘 어땠는지, 기억해두고 싶은 것..." className="h-24 w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none placeholder-gray-400" />
        </Field>
        <button type="button" className="w-full rounded-lg py-3 font-medium text-white" style={{ background: C }}>기록 저장하기</button>
      </div>
    </div>
  );
}

function ReviewForm() {
  const [tab, setTab] = useState<"리프팅" | "스킨부스터">("리프팅");
  const [picked, setPicked] = useState<string[]>(["써마지"]);
  const [rating, setRating] = useState(4);
  const [pain, setPain] = useState(3);
  const [downtime, setDowntime] = useState("1~2일");
  const [redo, setRedo] = useState("있어요");
  const [effects, setEffects] = useState<string[]>(["탄력", "피부결"]);
  const [timing, setTiming] = useState("두세 달 후");
  const [text, setText] = useState("");
  const tog = (arr: string[], v: string, set: (x: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-gray-500">다른 분들을 위해 시술 후기를 남겨주세요.<br /><span style={{ color: C }}>지금 당장 쓰기 어려우면 나중에 알려드릴게요!</span></p>
      <div className="flex border-b border-gray-200">
        {(["리프팅", "스킨부스터"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className="flex-1 border-b-2 py-2.5 text-sm font-medium transition-all"
            style={tab === t ? { borderColor: C, color: C } : { borderColor: "transparent", color: "#9ca3af" }}>{t}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">{(tab === "리프팅" ? TREAT_LIFTING : TREAT_SKIN).map((t) => <Chip key={t} on={picked.includes(t)} onClick={() => tog(picked, t, setPicked)}>{t}</Chip>)}</div>
      <div>
        <p className="mb-3 font-semibold text-gray-800">만족도</p>
        <div className="flex gap-2">{[1, 2, 3, 4, 5].map((s) => <button key={s} type="button" onClick={() => setRating(s)} style={{ color: s <= rating ? "#fbbf24" : "#e5e7eb" }}><Ico name="star" size={28} fill={s <= rating} /></button>)}</div>
      </div>
      <div>
        <p className="mb-3 font-semibold text-gray-800">통증</p>
        <div className="flex gap-3">{PAIN_ICONS.map((ic, i) => (
          <button key={i} type="button" onClick={() => setPain(i)} className="flex flex-col items-center gap-1">
            <span className="text-2xl transition-all" style={pain === i ? { transform: "scale(1.25)" } : undefined}>{ic}</span>
            <span className="text-xs" style={{ color: pain === i ? C : "#9ca3af", fontWeight: pain === i ? 600 : 400 }}>{PAIN_LABELS[i]}</span>
          </button>
        ))}</div>
      </div>
      <div><p className="mb-3 font-semibold text-gray-800">다운타임이 얼마나 됐나요?</p><div className="flex flex-wrap gap-2">{DOWNTIME.map((d) => <Chip key={d} on={downtime === d} onClick={() => setDowntime(d)}>{d}</Chip>)}</div></div>
      <div><p className="mb-3 font-semibold text-gray-800">재시술 의향</p><div className="flex gap-2">{REDO.map((r) => <Chip key={r} on={redo === r} onClick={() => setRedo(r)}>{r}</Chip>)}</div></div>
      <div>
        <p className="font-semibold text-gray-800">이번 시술로 달라진 점을 모두 골라주세요!</p>
        <p className="mb-3 text-xs text-gray-400">생각보다 많을 거예요 — 보통 4개 이상 고르세요.</p>
        <div className="flex flex-wrap gap-2">{EFFECTS.map((e) => <Chip key={e} on={effects.includes(e)} onClick={() => tog(effects, e, setEffects)}>{e}</Chip>)}</div>
      </div>
      <div><p className="mb-3 font-semibold text-gray-800">효과는 언제부터 느끼셨어요?</p><div className="flex flex-wrap gap-2">{TIMING.map((t) => <Chip key={t} on={timing === t} onClick={() => setTiming(t)}>{t}</Chip>)}</div></div>
      <div>
        <div className="mb-2 flex items-center justify-between"><p className="font-semibold text-gray-800">생생한 후기를 남겨주세요</p><span className="text-xs text-gray-400">{text.length}/400</span></div>
        <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 400))} placeholder="다른 분들이 궁금해할 만한 점을 들려주세요." className="h-24 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none placeholder-gray-300" />
        <p className="mt-1 text-xs text-gray-400">의료광고성 표현·병원·의사 실명 언급은 금합니다.</p>
      </div>
      <button type="button" className="w-full rounded-xl py-3.5 font-semibold text-white" style={{ background: C }}>후기 올리기</button>
    </div>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm text-gray-700">{label} {note && <span className="text-gray-400">*{note}</span>}</p>
      {children}
    </div>
  );
}

/* ───────────────────────── 3. 피드 (전체/Q&A/시술후기/커뮤니티/리포트) ───────────────────────── */
function FeedScreen() {
  const [tab, setTab] = useState<"전체" | "Q&A" | "시술 후기" | "커뮤니티" | "리포트">("전체");
  const [liked, setLiked] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const filterMap: Record<string, string[]> = { "전체": ["후기", "Q&A", "커뮤"], "Q&A": ["Q&A"], "시술 후기": ["후기"], "커뮤니티": ["커뮤"], "리포트": [] };
  const list = tab === "리포트" ? [] : POSTS.filter((p) => filterMap[tab].includes(p.type));
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-3">
        {(["전체", "Q&A", "시술 후기", "커뮤니티", "리포트"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className="whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all"
            style={tab === t ? { background: C, color: "#fff", borderColor: C } : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }}>{t}</button>
        ))}
      </div>
      <div className="px-4 pb-6 pt-3">
        {tab === "리포트" ? <ReportView /> : (
          <div className="space-y-3">
            {list.map((p) => (
              <div key={p.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={p.type === "후기" ? { background: "#e8f6fd", color: C } : p.type === "Q&A" ? { background: "#f3e8ff", color: "#a855f7" } : { background: "#f3f4f6", color: "#6b7280" }}>{p.type}</span>
                  {p.rating && <Stars n={p.rating} size={11} />}
                  <span className="ml-auto text-xs text-gray-400">{p.time}</span>
                </div>
                <h3 className="mb-1 font-semibold leading-snug text-gray-900">{p.title}</h3>
                <p className="mb-3 line-clamp-2 text-sm text-gray-500">{p.body}</p>
                <div className="mb-3 flex flex-wrap gap-1">{p.tags.map((t) => <span key={t} className="rounded-full px-2 py-0.5 text-xs" style={{ background: "#e8f6fd", color: C }}>#{t}</span>)}</div>
                <div className="flex items-center gap-3 border-t border-gray-50 pt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium" style={{ background: "#e8f6fd", color: C }}>{p.author[0]}</span>
                    <span className="text-xs text-gray-500">{p.author}</span>
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <button type="button" onClick={() => setLiked((l) => l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id])} className="flex items-center gap-1" style={{ color: liked.includes(p.id) ? "#f87171" : "#d1d5db" }}>
                      <Ico name="heart" size={15} fill={liked.includes(p.id)} /><span className="text-xs text-gray-400">{p.likes + (liked.includes(p.id) ? 1 : 0)}</span>
                    </button>
                    <span className="flex items-center gap-1 text-gray-300"><Ico name="chat" size={15} /><span className="text-xs text-gray-400">{p.comments}</span></span>
                    <button type="button" onClick={() => setSaved((s) => s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id])} style={{ color: saved.includes(p.id) ? C : "#d1d5db" }}>
                      <Ico name="bookmark" size={15} fill={saved.includes(p.id)} />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportView() {
  const effects = [
    { name: "탄력", pct: 85, color: "#818cf8" }, { name: "피부결", pct: 85, color: "#a78bfa" },
    { name: "리프팅", pct: 38, color: "#f472b6" }, { name: "모공", pct: 31, color: "#38bdf8" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{["써마지", "슈링크", "보톡스", "리쥬란", "울쎄라"].map((t) => <span key={t} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm">{t}</span>)}</div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <p className="text-xs text-gray-400">피부텐텐 리포트</p>
          <h2 className="text-xl font-bold text-gray-900">써마지</h2>
        </div>
        <div className="border-b border-gray-100 p-4">
          <p className="mb-2 text-sm text-gray-800">경험한 분들의 <span className="font-bold" style={{ color: C }}>92%</span>가 다시 받고 싶어 해요.</p>
          <div className="mb-1 h-2.5 rounded-full bg-gray-100"><div className="h-2.5 rounded-full" style={{ width: "92%", background: C }} /></div>
        </div>
        <div className="border-b border-gray-100 p-4">
          <p className="mb-3 text-sm text-gray-700">만족도 <span className="font-bold">3.9점</span></p>
          <Stars n={4} size={16} />
        </div>
        <div className="p-4">
          <p className="mb-3 text-sm text-gray-700">써마지 받은 분들이 느낀 효과예요.</p>
          <div className="space-y-2">{effects.map((e) => (
            <div key={e.name} className="flex items-center gap-3">
              <span className="w-12 text-sm text-gray-700">{e.name}</span>
              <div className="h-2 flex-1 rounded-full bg-gray-100"><div className="h-2 rounded-full" style={{ width: `${e.pct}%`, background: e.color }} /></div>
              <span className="w-8 text-right text-xs text-gray-500">{e.pct}%</span>
            </div>
          ))}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 4. 쇼핑 (준비중) ───────────────────────── */
function ShopScreen() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "#e8f6fd", color: C }}><Ico name="bag" size={30} /></div>
      <p className="text-lg font-bold text-gray-800">쇼핑 준비중</p>
      <p className="mt-2 text-sm text-gray-400">곧 만나보실 수 있어요.</p>
    </div>
  );
}

/* ───────────────────────── 5. 마이페이지 (공개 프로필 없음 · 설정 중심) ───────────────────────── */
function MyScreen() {
  const groups: { title: string; items: string[] }[] = [
    { title: "내 활동", items: ["알림", "내가 쓴 글", "저장한 글"] },
    { title: "설정", items: ["닉네임·계정", "알림 설정", "개인정보 설정"] },
  ];
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#e8f6fd" }}><span className="text-xl" style={{ color: C }}>👤</span></div>
        <div>
          <p className="font-bold text-gray-900">반짝이</p>
          <p className="text-xs text-gray-400">피부텐텐 회원 · 시술 3회</p>
        </div>
      </div>
      {groups.map((g) => (
        <div key={g.title} className="mb-3">
          <p className="mb-1.5 px-1 text-xs font-medium text-gray-400">{g.title}</p>
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {g.items.map((it, i) => (
              <button key={it} type="button" className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm text-gray-800" style={i > 0 ? { borderTop: "1px solid #f3f4f6" } : undefined}>
                {it}<Ico name="chevR" size={16} className="text-gray-300" />
              </button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="w-full rounded-2xl bg-white py-3.5 text-sm font-medium text-gray-500 shadow-sm">로그아웃</button>
    </div>
  );
}
