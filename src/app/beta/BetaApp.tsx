"use client";

/**
 * 피부텐텐 베타 — 새 앱/웹 통합 구조를 "실제처럼" 체험하는 화면.
 *  - 액자·토글 없음. 기기 화면에 꽉 차는 진짜 반응형(폰=하단 5탭, 데스크탑=상단 내비).
 *  - 피드는 실제 운영 DB 데이터(page.tsx 서버 fetch → props).
 *  - 같은 호스트(pibutenten.kr/beta)라 로그인 상태 그대로 유지. 개인 탭은 로그인 게이팅.
 *  - noindex (page.tsx).
 */

import { useState } from "react";

const C = "#4cbff2";

export type FeedPost = {
  id: number;
  kind: "qa" | "post" | "review" | "review_summary";
  title: string;
  excerpt: string;
  author: string;
  time: string;
  likes: number;
  comments: number;
  tags: string[];
  rating: number | null;
};

/* ── 아이콘 (인라인 SVG) ── */
type IcoName = "book" | "pen" | "grid" | "bag" | "user" | "search" | "bell" | "heart" | "chat" | "bookmark" | "star" | "chevL" | "chevR" | "x";
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
    case "x": return <svg {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>;
  }
}
function Logo({ h = 28 }: { h?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand-logo.svg" alt="피부텐텐" style={{ height: h, width: "auto" }} />;
}
function Stars({ n, size = 12 }: { n: number; size?: number }) {
  return <span className="flex">{[1, 2, 3, 4, 5].map((s) => <span key={s} style={{ color: s <= n ? "#fbbf24" : "#e5e7eb" }}><Ico name="star" size={size} fill={s <= n} /></span>)}</span>;
}
function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-full border px-3 py-1.5 text-sm transition-all" style={on ? { background: C, color: "#fff", borderColor: C } : { background: "#fff", color: "#4b5563", borderColor: "#e5e7eb" }}>{children}</button>;
}
const KIND_BADGE: Record<FeedPost["kind"], { label: string; bg: string; fg: string }> = {
  qa: { label: "Q&A", bg: "#f3e8ff", fg: "#a855f7" },
  review: { label: "후기", bg: "#e8f6fd", fg: C },
  post: { label: "끄적끄적", bg: "#f3f4f6", fg: "#6b7280" },
  review_summary: { label: "리포트", bg: "#e0f2fe", fg: "#0284c7" },
};

/* ── 메인 셸 (실제 반응형) ── */
type Tab = "record" | "write" | "feed" | "shop" | "my";
const TABS: { key: Tab; label: string; icon: IcoName }[] = [
  { key: "record", label: "시술 기록", icon: "book" },
  { key: "write", label: "글쓰기", icon: "pen" },
  { key: "feed", label: "피드", icon: "grid" },
  { key: "shop", label: "쇼핑", icon: "bag" },
  { key: "my", label: "마이페이지", icon: "user" },
];

export default function BetaApp({ posts, reports, isLoggedIn }: { posts: FeedPost[]; reports: FeedPost[]; isLoggedIn: boolean }) {
  const [tab, setTab] = useState<Tab>("feed");
  const [search, setSearch] = useState(false);

  const screen = (
    tab === "record" ? <RecordScreen isLoggedIn={isLoggedIn} /> :
    tab === "write" ? <WriteScreen /> :
    tab === "feed" ? <FeedScreen posts={posts} reports={reports} /> :
    tab === "shop" ? <ShopScreen /> :
    <MyScreen isLoggedIn={isLoggedIn} />
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#f4f5f7]">
      {/* 데스크탑 상단 내비 */}
      <header className="hidden h-16 items-center gap-6 border-b border-gray-100 bg-white px-6 md:flex">
        <Logo h={30} />
        <nav className="flex items-center gap-5">
          {TABS.filter((t) => t.key !== "my").map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className="text-[15px] font-semibold transition-colors" style={{ color: tab === t.key ? C : "#4b5563" }}>{t.label}</button>
          ))}
        </nav>
        <div className="flex-1" />
        <button type="button" className="p-1 text-gray-600"><Ico name="search" /></button>
        <button type="button" className="p-1 text-gray-600"><Ico name="bell" /></button>
        <button type="button" onClick={() => setTab("my")} className="p-1" style={{ color: tab === "my" ? C : "#4b5563" }}><Ico name="user" /></button>
      </header>

      {/* 모바일 상단 헤더 */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-4 md:hidden">
        {!search && <Logo h={26} />}
        {search && <input autoFocus placeholder="시술명, 키워드 검색" className="flex-1 text-sm outline-none placeholder-gray-400" />}
        <div className="flex-1" />
        <button type="button" onClick={() => setSearch((v) => !v)} className="p-1 text-gray-600"><Ico name={search ? "x" : "search"} /></button>
      </header>

      {/* 콘텐츠 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl">{screen}</div>
      </main>

      {/* 모바일 하단 5탭 */}
      <nav className="flex shrink-0 border-t border-gray-100 bg-white md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setSearch(false); }} className="flex flex-1 flex-col items-center gap-0.5 py-2" style={{ color: tab === t.key ? C : "#9ca3af" }}>
            <Ico name={t.icon} size={20} /><span className="text-[10px] font-medium">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ── 로그인 게이트 ── */
function LoginGate({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "#e8f6fd", color: C }}><Ico name="user" size={30} /></div>
      <p className="text-base font-bold text-gray-800">{title}</p>
      <p className="mt-2 text-sm text-gray-400">로그인하면 내 정보가 표시됩니다.</p>
      <a href="/login" className="mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-white" style={{ background: C }}>로그인</a>
    </div>
  );
}

/* ── 피드 (실제 DB 데이터) ── */
function FeedScreen({ posts, reports }: { posts: FeedPost[]; reports: FeedPost[] }) {
  const [tab, setTab] = useState<"전체" | "Q&A" | "시술 후기" | "커뮤니티" | "리포트">("전체");
  const [liked, setLiked] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const organic = posts.filter((p) => p.kind !== "review_summary");
  const list =
    tab === "전체" ? organic :
    tab === "Q&A" ? organic.filter((p) => p.kind === "qa") :
    tab === "시술 후기" ? organic.filter((p) => p.kind === "review") :
    tab === "커뮤니티" ? organic.filter((p) => p.kind === "post") :
    reports;
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-3">
        {(["전체", "Q&A", "시술 후기", "커뮤니티", "리포트"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className="whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all" style={tab === t ? { background: C, color: "#fff", borderColor: C } : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }}>{t}</button>
        ))}
      </div>
      <div className="px-4 pb-8 pt-3">
        {list.length === 0 ? <p className="mt-16 text-center text-sm text-gray-400">표시할 글이 없어요.</p> : (
          <div className="space-y-3">
            {list.map((p) => {
              const b = KIND_BADGE[p.kind];
              return (
                <div key={`${p.kind}-${p.id}`} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: b.bg, color: b.fg }}>{b.label}</span>
                    {p.rating != null && <Stars n={p.rating} size={11} />}
                    <span className="ml-auto text-xs text-gray-400">{p.time}</span>
                  </div>
                  <h3 className="mb-1 font-semibold leading-snug text-gray-900">{p.title}</h3>
                  {p.excerpt && <p className="mb-3 line-clamp-2 text-sm text-gray-500">{p.excerpt}</p>}
                  {p.tags.length > 0 && <div className="mb-3 flex flex-wrap gap-1">{p.tags.map((t) => <span key={t} className="rounded-full px-2 py-0.5 text-xs" style={{ background: "#e8f6fd", color: C }}>#{t}</span>)}</div>}
                  <div className="flex items-center gap-3 border-t border-gray-50 pt-2">
                    <span className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium" style={{ background: "#e8f6fd", color: C }}>{p.author.slice(0, 1)}</span>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 시술 기록 (로그인 게이팅 · 실제 기록 연결 예정) ── */
function RecordScreen({ isLoggedIn }: { isLoggedIn: boolean }) {
  if (!isLoggedIn) return <LoginGate title="내 시술 기록" />;
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-bold text-gray-900">시술 기록</span>
        <div className="flex gap-1 rounded-full bg-gray-100 p-0.5">
          {["연표", "달력", "목록"].map((v, i) => (
            <span key={v} className="rounded-full px-3 py-1 text-sm" style={i === 0 ? { background: "#fff", color: "#111", fontWeight: 600 } : { color: "#9ca3af" }}>{v}</span>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-700">아직 시술 기록이 없어요.</p>
        <p className="mt-1 text-xs text-gray-400">글쓰기 → ‘시술기록하기’에서 첫 기록을 남겨보세요.</p>
      </div>
    </div>
  );
}

/* ── 글쓰기 (끄적끄적 / 시술기록하기 / 시술후기) ── */
const TREAT_LIFTING = ["써마지", "올쎄라", "슈링크", "올리지오", "포텐자", "텐써마", "덴서티", "울트라셀"];
const TREAT_SKIN = ["보톡스", "리쥬란", "물광주사", "엑소좀", "스킨보톡스", "피코토닝"];
const PAIN_ICONS = ["😊", "🙂", "😐", "😬", "😣"];
const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const DOWNTIME = ["없음", "1~2일", "3~5일", "약 1주", "2주 이상"];
const REDO = ["있어요", "없어요", "고민 중"];
const EFFECTS = ["리프팅", "탄력", "쫀쫀함", "볼륨", "작은얼굴", "턱선", "피부톤", "피부결", "잔주름", "모공", "생기", "없음"];
const TIMING = ["시술 직후", "1~2주 후", "한 달쯤 후", "두세 달 후", "효과 못 느낌"];
function WriteScreen() {
  const [cat, setCat] = useState<"끄적끄적" | "시술기록하기" | "시술후기">("끄적끄적");
  return (
    <div className="p-4">
      <div className="mb-4 flex gap-2">
        {(["끄적끄적", "시술기록하기", "시술후기"] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} className="rounded-full border px-3 py-1.5 text-sm font-medium transition-all" style={cat === c ? { background: C, color: "#fff", borderColor: C } : { background: "#fff", color: "#4b5563", borderColor: "#e5e7eb" }}>{c}</button>
        ))}
      </div>
      {cat === "끄적끄적" && <FreeWrite />}
      {cat === "시술기록하기" && <RecordForm />}
      {cat === "시술후기" && <ReviewForm />}
    </div>
  );
}
function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return <div><p className="mb-2 text-sm text-gray-700">{label} {note && <span className="text-gray-400">*{note}</span>}</p>{children}</div>;
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
        <div className="mb-2 flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs" style={{ background: "#e8f6fd", color: C }}>#{t}<button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))}><Ico name="x" size={10} /></button></span>)}</div>
        <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && tagInput.trim()) { setTags((p) => [...p, tagInput.trim().replace(/^#/, "")]); setTagInput(""); } }} placeholder="#태그 입력" className="w-full rounded-full border border-gray-200 px-3 py-1.5 text-sm outline-none" />
      </div>
      <button type="button" className="w-full rounded-xl py-3.5 font-semibold text-white" style={{ background: C }}>게시하기</button>
    </div>
  );
}
function RecordForm() {
  const [picked, setPicked] = useState<string[]>(["써마지"]);
  const [tab, setTab] = useState<"리프팅" | "스킨부스터">("리프팅");
  const [diary, setDiary] = useState("");
  const toggle = (v: string) => setPicked((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v]);
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <Field label="언제 받으셨어요?" note="나만 봐요"><div className="rounded-lg border border-gray-200 px-3 py-2.5"><input type="date" defaultValue="2026-06-09" className="w-full text-sm text-gray-800 outline-none" /></div></Field>
        <Field label="어디서 받으셨어요?" note="나만 봐요"><input placeholder="지역, 병원명으로 검색" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none placeholder-gray-400" /></Field>
        <Field label="누구에게 받으셨어요?" note="나만 봐요"><div className="flex gap-2"><input placeholder="원장님" className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none placeholder-gray-400" /><input placeholder="실장님" className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none placeholder-gray-400" /></div></Field>
        <Field label="어떤 시술을 받으셨어요?" note="가격·비고는 나만 봐요">
          <div className="mb-2 flex gap-2">{(["리프팅", "스킨부스터"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className="text-sm font-medium" style={{ color: tab === t ? C : "#9ca3af" }}>{t}</button>)}</div>
          <div className="flex flex-wrap gap-2">{(tab === "리프팅" ? TREAT_LIFTING : TREAT_SKIN).map((t) => <Chip key={t} on={picked.includes(t)} onClick={() => toggle(t)}>{t}</Chip>)}</div>
        </Field>
        <Field label="오늘의 시술기록" note={`나만 봐요 (${diary.length}/400)`}><textarea value={diary} onChange={(e) => setDiary(e.target.value.slice(0, 400))} placeholder="오늘 어땠는지, 기억해두고 싶은 것..." className="h-24 w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none placeholder-gray-400" /></Field>
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
      <div className="flex border-b border-gray-200">{(["리프팅", "스킨부스터"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className="flex-1 border-b-2 py-2.5 text-sm font-medium transition-all" style={tab === t ? { borderColor: C, color: C } : { borderColor: "transparent", color: "#9ca3af" }}>{t}</button>)}</div>
      <div className="flex flex-wrap gap-2">{(tab === "리프팅" ? TREAT_LIFTING : TREAT_SKIN).map((t) => <Chip key={t} on={picked.includes(t)} onClick={() => tog(picked, t, setPicked)}>{t}</Chip>)}</div>
      <div><p className="mb-3 font-semibold text-gray-800">만족도</p><div className="flex gap-2">{[1, 2, 3, 4, 5].map((s) => <button key={s} type="button" onClick={() => setRating(s)} style={{ color: s <= rating ? "#fbbf24" : "#e5e7eb" }}><Ico name="star" size={28} fill={s <= rating} /></button>)}</div></div>
      <div><p className="mb-3 font-semibold text-gray-800">통증</p><div className="flex gap-3">{PAIN_ICONS.map((ic, i) => <button key={i} type="button" onClick={() => setPain(i)} className="flex flex-col items-center gap-1"><span className="text-2xl transition-all" style={pain === i ? { transform: "scale(1.25)" } : undefined}>{ic}</span><span className="text-xs" style={{ color: pain === i ? C : "#9ca3af", fontWeight: pain === i ? 600 : 400 }}>{PAIN_LABELS[i]}</span></button>)}</div></div>
      <div><p className="mb-3 font-semibold text-gray-800">다운타임이 얼마나 됐나요?</p><div className="flex flex-wrap gap-2">{DOWNTIME.map((d) => <Chip key={d} on={downtime === d} onClick={() => setDowntime(d)}>{d}</Chip>)}</div></div>
      <div><p className="mb-3 font-semibold text-gray-800">재시술 의향</p><div className="flex gap-2">{REDO.map((r) => <Chip key={r} on={redo === r} onClick={() => setRedo(r)}>{r}</Chip>)}</div></div>
      <div><p className="font-semibold text-gray-800">이번 시술로 달라진 점을 모두 골라주세요!</p><p className="mb-3 text-xs text-gray-400">생각보다 많을 거예요 — 보통 4개 이상 고르세요.</p><div className="flex flex-wrap gap-2">{EFFECTS.map((e) => <Chip key={e} on={effects.includes(e)} onClick={() => tog(effects, e, setEffects)}>{e}</Chip>)}</div></div>
      <div><p className="mb-3 font-semibold text-gray-800">효과는 언제부터 느끼셨어요?</p><div className="flex flex-wrap gap-2">{TIMING.map((t) => <Chip key={t} on={timing === t} onClick={() => setTiming(t)}>{t}</Chip>)}</div></div>
      <div><div className="mb-2 flex items-center justify-between"><p className="font-semibold text-gray-800">생생한 후기를 남겨주세요</p><span className="text-xs text-gray-400">{text.length}/400</span></div><textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 400))} placeholder="다른 분들이 궁금해할 만한 점을 들려주세요." className="h-24 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none placeholder-gray-300" /><p className="mt-1 text-xs text-gray-400">의료광고성 표현·병원·의사 실명 언급은 금합니다.</p></div>
      <button type="button" className="w-full rounded-xl py-3.5 font-semibold text-white" style={{ background: C }}>후기 올리기</button>
    </div>
  );
}

/* ── 쇼핑 (준비중) ── */
function ShopScreen() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "#e8f6fd", color: C }}><Ico name="bag" size={30} /></div>
      <p className="text-lg font-bold text-gray-800">쇼핑 준비중</p>
      <p className="mt-2 text-sm text-gray-400">곧 만나보실 수 있어요.</p>
    </div>
  );
}

/* ── 마이페이지 (로그인 게이팅 · 설정 중심) ── */
function MyScreen({ isLoggedIn }: { isLoggedIn: boolean }) {
  if (!isLoggedIn) return <LoginGate title="마이페이지" />;
  const groups: { title: string; items: string[] }[] = [
    { title: "내 활동", items: ["알림", "내가 쓴 글", "저장한 글"] },
    { title: "설정", items: ["닉네임·계정", "알림 설정", "개인정보 설정"] },
  ];
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#e8f6fd", color: C }}><Ico name="user" size={26} /></div>
        <div><p className="font-bold text-gray-900">내 계정</p><p className="text-xs text-gray-400">로그인됨</p></div>
      </div>
      {groups.map((g) => (
        <div key={g.title} className="mb-3">
          <p className="mb-1.5 px-1 text-xs font-medium text-gray-400">{g.title}</p>
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {g.items.map((it, i) => (
              <button key={it} type="button" className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm text-gray-800" style={i > 0 ? { borderTop: "1px solid #f3f4f6" } : undefined}>{it}<Ico name="chevR" size={16} className="text-gray-300" /></button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="w-full rounded-2xl bg-white py-3.5 text-sm font-medium text-gray-500 shadow-sm">로그아웃</button>
    </div>
  );
}
