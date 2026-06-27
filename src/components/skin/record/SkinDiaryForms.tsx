"use client";

/**
 * 시술노트 폼·조회 — 운영 컴포넌트.
 *  - DiaryForm: /write 시술기록(개인 노트) 작성 폼. 날짜→병원(검색)→의사/실장→받은 시술(가격·비고, 나만 보기)→노트→저장.
 *  - RecordView: /today 내 노트(달력/목록 토글). SummaryGroup/SummaryItem 으로 렌더.
 *  - 폼 컨트롤(별점/통증/칩/효과칩/단일선택)은 ReviewForm 패턴과 동일. 글상자=피드 Card.tsx 와 동일(테두리 X·음영 X).
 *  layout.tsx 가 TopNav/푸터/1080px/반응형 자동 적용 → 여기는 <main> 콘텐츠만.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { recordBadge } from "@/lib/diary-status";
import { chosungOf, isAllChosung } from "@/lib/hangul-chosung";
import {
  StarField,
  FaceField,
  ChoiceField,
  NumberChoiceField,
  EffectChip,
  PAIN_FACES,
  REVISIT_OPTIONS,
  RECOMMEND_OPTIONS,
  EFFECT_AREA_OPTIONS,
  EFFECT_AREA_COLORS,
  ONELINER_MAX,
  ONELINER_PLACEHOLDERS,
} from "@/components/review/review-controls";
import { DOWNTIME_OPTIONS, EFFECT_ONSET_OPTIONS } from "@/lib/review-options";

/* ── 실제 폼 공통 클래스 ── */
const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[16px] transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-0";
const inputSm =
  "rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-[16px] focus:border-[var(--primary)] focus:outline-none focus:ring-0";
const textareaCls =
  "w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[16px] leading-[1.6] focus:border-[var(--primary)] focus:outline-none focus:ring-0";
const labelCls = "mb-2 block text-sm font-semibold text-[var(--text)]";
/** 글상자 — 피드 카드와 동일: 테두리 X·음영 X. */
const formBox = "space-y-5 rounded-[var(--radius)] bg-white p-5";
const cardBox = "rounded-[var(--radius)] bg-white p-5";


/* 시술 picker — 실제 tag_dictionary(is_procedure) 기준. 카테고리 리프팅/스킨부스터 2종. */
const CAT_COLOR: Record<string, string> = { 리프팅: "#29B6F6", 스킨부스터: "#F48FB1" };
const PROCEDURES: { value: string; label: string; cat: string }[] = [
  ...["써마지","울쎄라","슈링크","올리지오","포텐자","텐써마","덴서티","울트라셀","티타늄","미라젯","세르프","올타이트","엠페이스","골드PTT"].map((l) => ({ value: l, label: l, cat: "리프팅" })),
  ...["리쥬란","쥬베룩","스컬트라","보톡스","프로파일로","울트라콜","스킨바이브","더엘주사","레디어스","레스틸렌","벨로테로","올리디아","힐로웨이브"].map((l) => ({ value: l, label: l, cat: "스킨부스터" })),
];

// 시술별 후기(아코디언 펼침) day0 평가 슬롯 — create_visit_with_entries 의 p_reviews 행 한 건에 매핑.
//   satisfaction/pain/effectFelt 는 1~5, revisit/downtime/effectOnset 은 영문 슬러그, recommend 는 1~5,
//   effectAreas 는 라벨 문자열 배열, oneliner 는 공개 한줄후기(is_public=true 일 때만 전송).
type ReviewState = {
  satisfaction: number;
  pain: number;
  downtime: string;
  revisit: string;
  effectAreas: string[];
  effectOnset: string;
  oneliner: string;
  // 추천의향(recommend, 1~5) — revisit 와 별개. visit 경로 전용(0=미선택).
  recommend: number;
  // 효과 체감도(effect_felt, 1~5) day0 — 0=미선택.
  effectFelt: number;
  // 공개 옵트인 — true 면 평가 익명 공개(카드·집계 생성), false 면 비공개 시계열 기록만.
  isPublic: boolean;
};
const emptyReview = (): ReviewState => ({ satisfaction: 0, pain: 0, downtime: "", revisit: "", effectAreas: [], effectOnset: "", oneliner: "", recommend: 0, effectFelt: 0, isPublic: false });

type Screen = "diary" | "reviewonly" | "record" | "detail" | "noti";

/* 시술노트(DiaryForm)는 "최근에 받은 기록"이라 날짜를 달력으로 정확히 받는다.
   어림시기(올해/작년/연중 등 회고형)는 시술후기 폼(ReviewForm) 전용 — 여기엔 두지 않는다. */


/* ════════════════ ④ 나의 시술노트 ════════════════ */

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

// open = 메모 입력 펼침(기존). reviewOpen = 시술별 후기 아코디언 펼침(신규, Phase 3b). later = 예약(미사용).
//   inDict = 시술명이 tag_dictionary(is_procedure) 사전에 있는지. false(자유입력 신규태그)면
//   후기(procedure_reviews)는 RPC 가 unknown_procedure 로 거부하므로 후기 아코디언을 막는다(기록만 허용).
type DiaryProc = ReviewState & { id: number; label: string; cat: string; note: string; open: boolean; later: boolean; reviewOpen: boolean; inDict: boolean };

/** 자동완성 사전 항목 — getReviewProcedures(ProcedureOption) 와 구조 호환(value/label/categoryLabel). */
type ProcDictItem = { value: string; label: string; categoryLabel?: string | null };

export function DiaryForm({ toast, go, procedures, reviewOnly = false, initialProcedure }: { toast: (m: string) => void; go: (s: Screen) => void; procedures?: ProcDictItem[]; reviewOnly?: boolean; initialProcedure?: string }) {
  // reviewOnly("시술 후기만") — 같은 visit 폼이지만 병원·방문 블록을 접은 상태로 시작.
  //   사용자가 "병원·방문 정보 추가" 를 누르면 펼친다(비공개 메타는 선택이므로 visit 만으로도 저장 가능).
  const [metaOpen, setMetaOpen] = useState(!reviewOnly);
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
  const pidRef = useRef(0); // 행 id 카운터 — 동기 증가라 연속 추가에도 충돌 없음.
  const [tag, setTag] = useState("");
  const [diary, setDiary] = useState(""); // 오늘의 시술 노트(비공개 메모) — 최대 400자.
  const [doctorName, setDoctorName] = useState(""); // 원장님(자유 입력)
  const [managerName, setManagerName] = useState(""); // 실장님(자유 입력)
  const [clinicHome, setClinicHome] = useState(""); // 병원 홈페이지(비공개)
  const [clinicKakao, setClinicKakao] = useState(""); // 카카오톡 채널(비공개, 직접 입력)
  const [totalPrice, setTotalPrice] = useState(""); // 총 결제금액(비공개, 일기 표시용 — 집계 제외)
  const [isComplete] = useState(true); // 항상 완성 저장(미완성·"나중에 마저" 토글 제거 — 사용자 요청).
  const [saving, setSaving] = useState(false);
  const [savedModal, setSavedModal] = useState(false); // 저장 완료 모달(→ 시술후기 유도).
  const [savedHasPublicReview, setSavedHasPublicReview] = useState(false); // 저장 시 공개 후기 포함 여부(모달 카피 분기).
  const [dupId, setDupId] = useState<number | null>(null); // 중복 추가 시 기존 행 0.5초 강조.
  const [acHi, setAcHi] = useState(-1); // 자동완성 키보드 하이라이트 인덱스(-1=없음).
  // 인라인 달력 — 날짜 영역 클릭 시 아래로 펼침. 바깥 클릭 시 닫힘.
  const [calOpen, setCalOpen] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);
  const calBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!calOpen) return;
    const h = (e: MouseEvent) => {
      if (calRef.current?.contains(e.target as Node) || calBtnRef.current?.contains(e.target as Node)) return;
      setCalOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [calOpen]);
  // 입력 후 다음 칸으로 커서 자동 이동(빠른 연속 입력): 병원 선택→원장님, 원장님 Enter→실장님, 실장님 Enter→시술명.
  const doctorRef = useRef<HTMLInputElement | null>(null);
  const managerRef = useRef<HTMLInputElement | null>(null);
  const tagRef = useRef<HTMLInputElement | null>(null);
  const _d = new Date();
  const [date, setDate] = useState(`${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`);
  const [_y, _m, _dd] = date.split("-");
  const dateLabel = `${+_y}년 ${+_m}월 ${+_dd}일`;
  const [calYear, setCalYear] = useState(+_y);
  const [calMonth, setCalMonth] = useState(+_m);
  const calDays = useMemo(() => {
    const first = new Date(calYear, calMonth - 1, 1).getDay();
    const total = new Date(calYear, calMonth, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < first; i++) arr.push(null);
    for (let i = 1; i <= total; i++) arr.push(i);
    return arr;
  }, [calYear, calMonth]);
  const prevCalMonth = () => { if (calMonth === 1) { setCalMonth(12); setCalYear((y) => y - 1); } else setCalMonth((m) => m - 1); };
  const nextCalMonth = () => { if (calMonth === 12) { setCalMonth(1); setCalYear((y) => y + 1); } else setCalMonth((m) => m + 1); };
  const selectCalDate = (day: number) => { setDate(`${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`); setCalOpen(false); };

  // 시술노트 저장값 — 달력에서 고른 날짜(date) 그대로 전송. precision 은 항상 'exact'.

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
      const nsTerm = term.replace(/\s/g, ""); // 공백 무시 검색: 입력어 공백 제거 → name_nospace 컬럼과 매칭
      const { data } = await sb
        .from("clinics").select("name,addr,tel,x_pos,y_pos")
        .ilike("name_nospace", `%${nsTerm}%`).order("name").limit(50); // 거리순 정렬 후보 넉넉히 → 가장 가까운 곳 우선(이름 같은 지점 다수 대비)
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
    const nsTerm = term.replace(/\s/g, ""); // 공백 무시 검색
    const { data } = await sb
      .from("clinics").select("name,addr,tel,x_pos,y_pos")
      .ilike("name_nospace", `%${nsTerm}%`).order("name").limit(20);
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

  // 자동완성 사전 — 서버 주입(tag_dictionary 라이브) 우선, 없으면(목업 단독) 정적 PROCEDURES 폴백.
  const procList = useMemo<{ label: string; cat: string }[]>(
    () =>
      procedures && procedures.length > 0
        ? procedures.map((p) => ({ label: p.label, cat: p.categoryLabel ?? "" }))
        : PROCEDURES.map((p) => ({ label: p.label, cat: p.cat })),
    [procedures],
  );

  // GA4 가벼운 이벤트 — 미로드 환경에선 조용히 무시.
  const trackProc = (event: string, params: Record<string, unknown>) => {
    try {
      (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", event, params);
    } catch {
      /* noop */
    }
  };

  function addTag(raw: string, method: "autocomplete" | "enter" | "free_text" = "enter") {
    const t = raw.trim(); if (!t) return;
    const low = t.toLowerCase();
    let label = t; if (/[a-z]/i.test(t) && EN2KO[low]) label = EN2KO[low];
    // 중복 — 추가하지 않고 기존 행 0.5초 강조.
    const exist = procs.find((p) => p.label === label);
    if (exist) { setTag(""); setDupId(exist.id); setTimeout(() => setDupId((c) => (c === exist.id ? null : c)), 600); return; }
    if (procs.length >= 10) { toast("시술은 최대 10개까지 추가할 수 있어요"); return; }
    // 사전 매칭 — procList(tag_dictionary is_procedure) 에 있으면 inDict=true.
    //   자유입력 신규태그(inDict=false)는 RPC 가 후기(procedure_reviews)를 거부하므로 후기 아코디언 차단(기록만).
    const matched = procList.find((p) => p.label === label);
    const cat = matched?.cat ?? "";
    const inDict = !!matched;
    const nid = (pidRef.current += 1);
    // "시술 후기만"(reviewOnly) 진입이면 사전 시술은 후기 아코디언을 자동 펼침(후기 작성이 주목적).
    const autoReviewOpen = reviewOnly && inDict;
    // 함수형 업데이트 + 동기 id — 연속 고속 추가에도 id 충돌·항목 유실 없음. 중복·상한은 최신 상태 기준 재확인.
    setProcs((prev) => (prev.some((p) => p.label === label) || prev.length >= 10 ? prev : [...prev, { ...emptyReview(), id: nid, label, cat, note: "", open: false, later: false, reviewOpen: autoReviewOpen, inDict }]));
    setTag("");
    setAcHi(-1);
    requestAnimationFrame(() => tagRef.current?.focus()); // 입력창 비우고 포커스 유지 → 이어서 다음 시술.
    trackProc("procedure_add", { method });
  }
  function removeProc(p: DiaryProc) {
    const hadNote = !!p.note.trim();
    setProcs((ps) => ps.filter((x) => x.id !== p.id));
    trackProc("procedure_remove", {});
    if (hadNote) toast("메모와 함께 삭제됐어요");
  }
  const upd = (id: number, p: Partial<DiaryProc>) => setProcs((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));

  // initialProcedure(?proc=) 프리필 — 시술노트 저장 후 후기 유도 동선. 마운트 1회, 사전에 있는 시술만.
  //   procList(서버 사전) 준비 후 해당 시술 행을 추가(reviewOnly 면 후기 아코디언 자동 펼침은 addTag 가 처리).
  const initProcDoneRef = useRef(false);
  useEffect(() => {
    if (initProcDoneRef.current) return;
    if (!initialProcedure) return;
    if (procList.length === 0) return; // 사전 로드 대기.
    initProcDoneRef.current = true;
    const matched = procList.find((p) => p.label === initialProcedure);
    if (!matched) return; // 사전에 없으면 프리필 생략(자유입력 후기 불가 — C-1 가드).
    const nid = (pidRef.current += 1);
    setProcs((prev) => (prev.some((p) => p.label === matched.label) ? prev : [...prev, { ...emptyReview(), id: nid, label: matched.label, cat: matched.cat, note: "", open: false, later: false, reviewOpen: reviewOnly, inDict: true }]));
  }, [procList, initialProcedure, reviewOnly]);

  const tq = tag.trim(); const tlow = tq.toLowerCase();
  // 부분일치 + 영문 별칭 + 초성('ㅇㅆ'→울쎄라). 이미 추가된 건 제외, 최대 8건.
  const acMatches = useMemo(() => {
    if (!tq) return [] as { label: string; cat: string }[];
    const cho = isAllChosung(tq);
    return procList
      .filter((p) => !procs.some((x) => x.label === p.label))
      .filter((p) => p.label.includes(tq) || (EN2KO[tlow] && p.label === EN2KO[tlow]) || (cho && chosungOf(p.label).includes(tq)))
      .slice(0, 8);
  }, [tq, tlow, procList, procs]);
  const acExact = procList.some((p) => p.label === tq) || !!EN2KO[tlow];
  // 입력이 바뀌면 키보드 하이라이트 초기화 — 옛 인덱스로 엉뚱한 선택 방지.
  useEffect(() => { setAcHi(-1); }, [tq]);
  // 자동완성 0건(직접 추가만 가능) — 사전 보강 소스용 1회 트래킹.
  const noMatchRef = useRef("");
  useEffect(() => {
    if (tq && acMatches.length === 0 && !acExact && noMatchRef.current !== tq) {
      noMatchRef.current = tq;
      try {
        (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "procedure_autocomplete_no_match", { q: tq });
      } catch {
        /* noop */
      }
    }
  }, [tq, acMatches.length, acExact]);

  // 후기 아코디언을 펼친(reviewOpen=true) + 사전 등록(inDict) 시술 = 후기 작성된 행. is_public 무관 procedure_reviews 1행 생성.
  //   inDict 가드: 자유입력 신규태그는 RPC 가 unknown_procedure 로 트랜잭션 전체를 롤백하므로 후기 행에서 제외(기록은 유지).
  //   diary_procedure_index = procs 안에서의 0-based 위치(RPC 가 diary_procedure_id 로 매핑, +1 보정은 RPC 내부).
  const openedReviews = useMemo(() => procs.filter((p) => p.reviewOpen && p.inDict), [procs]);


  // ★FIX-4: 공개 후기 최소 품질 게이트 — is_public=true 인데 만족도 등 지표·한줄후기를
  //   전부 비우면 빈 공개 카드가 피드/리포트에 노출된다. 공개 entry 는 최소 1개 지표
  //   또는 한줄후기(body)를 요구한다(비공개/기록만은 부분입력 그대로 허용).
  //   완성(is_complete) 저장에서만 공개가 실제 전송되므로, 미완성이면 게이트 면제.
  const emptyPublicReview = useMemo(
    () =>
      isComplete &&
      openedReviews.some(
        (p) =>
          p.isPublic &&
          p.satisfaction === 0 &&
          p.pain === 0 &&
          p.recommend === 0 &&
          p.effectFelt === 0 &&
          !p.downtime &&
          !p.revisit &&
          !p.effectOnset &&
          p.effectAreas.length === 0 &&
          !p.oneliner.trim(),
      ),
    [isComplete, openedReviews],
  );

  // 저장 — /api/visits POST (create_visit_with_entries RPC). visit + 시술목록 + 후기 + day0 원자 생성.
  //   완성(is_complete=true) 시 시술 1개 이상 필수. 미완성(나중에 마저) 면 0개 허용(RPC 가 면제).
  async function handleSave() {
    if (saving) return;
    if (isComplete && procs.length === 0) { toast("받은 시술을 1개 이상 추가해주세요"); return; }
    // ★관대화: 어림시기(계절/반기) 미선택은 더 이상 차단하지 않음 — 연 단위로 강등 저장.
    // ★FIX-4: 공개 후기인데 평가·한줄후기가 전부 비면 빈 공개 카드 생성 차단.
    if (emptyPublicReview) { toast("공개 후기는 만족도 등 평가를 하나 이상 남기거나 한줄후기를 적어주세요"); return; }
    setSaving(true);
    try {
      // 후기 행(reviews) — 펼쳐서 day0 평가가 들어간 시술만. 공개(is_public)면 한줄후기 body 포함.
      const reviews = procs
        .map((pr, i) => ({ pr, i }))
        .filter(({ pr }) => openedReviews.includes(pr))
        .map(({ pr, i }) => {
          // 미완성(임시저장, is_complete=false)이면 공개 카드를 만들지 않음(비공개 시계열로만 저장).
          //   "나중에 마저 쓸게요" 인데 공개글이 즉시 나가는 혼동 방지. 완성 저장 때 다시 공개 가능.
          const isPub = isComplete && pr.isPublic;
          // day0 체크인 — diary_linked 시계열의 시작점(부분 입력 허용, 0/빈값은 null).
          const checkin_day0 = {
            satisfaction: pr.satisfaction > 0 ? pr.satisfaction : null,
            recommend: pr.recommend > 0 ? pr.recommend : null,
            effect_felt: pr.effectFelt > 0 ? pr.effectFelt : null,
            pain: pr.pain > 0 ? pr.pain : null,
            changed_points: pr.effectAreas.length > 0 ? pr.effectAreas : null,
          };
          const hasAnyDay0 =
            checkin_day0.satisfaction != null ||
            checkin_day0.recommend != null ||
            checkin_day0.effect_felt != null ||
            checkin_day0.pain != null ||
            (checkin_day0.changed_points?.length ?? 0) > 0;
          return {
            diary_procedure_index: i,
            procedure_ko: pr.label,
            is_public: isPub,
            // 결론 칸(부분 입력) — diary_linked 는 nullable. 0/빈값은 null.
            satisfaction: pr.satisfaction > 0 ? pr.satisfaction : null,
            pain: pr.pain > 0 ? pr.pain : null,
            revisit: pr.revisit || null,
            effect_areas: pr.effectAreas.length > 0 ? pr.effectAreas : null,
            downtime: pr.downtime || null,
            effect_onset: pr.effectOnset || null,
            recommend: pr.recommend > 0 ? pr.recommend : null,
            // 공개 한줄후기(body) — is_public=true 일 때만. 라우트가 마스킹·검수 후 카드 생성.
            body: isPub ? (pr.oneliner.trim() || null) : null,
            checkin_day0: hasAnyDay0 ? checkin_day0 : null,
          };
        });

      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 시술노트는 달력으로 정확한 날짜를 받는다(어림시기는 시술후기 폼 전용).
          visited_on: date,
          visited_on_precision: "exact",
          clinic_name: picked || null,
          clinic_addr: addr.trim() || null,
          clinic_tel: tel.trim() || null,
          clinic_x: pickedXY?.x ?? null,
          clinic_y: pickedXY?.y ?? null,
          clinic_home: clinicHome.trim() || null,
          clinic_kakao: clinicKakao.trim() || null,
          doctor_name: doctorName.trim() || null,
          manager_name: managerName.trim() || null,
          diary_body: diary.trim() || null,
          total_price: totalPrice.trim() ? Number(totalPrice.replace(/[^0-9]/g, "")) || null : null,
          is_complete: isComplete,
          // 받은 시술 — 가격·용량 입력 폐지(총액으로 일원화), 메모(note)만. 컬럼·RPC 는 유지(미사용).
          procedures: procs.map((pr) => ({
            procedure_ko: pr.label,
            note: pr.note.trim() || null,
          })),
          reviews,
        }),
      });
      if (res.status === 401) { toast("로그인 후 저장할 수 있어요"); setSaving(false); return; }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string; userMessage?: string };
        toast(j?.userMessage || j?.message || "저장에 실패했어요");
        setSaving(false);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        blinded?: boolean;
        screening?: { userMessage?: string } | null;
      };
      setSaving(false);
      // 공개 후기 마스킹/검수 안내(있으면 1회).
      if (data.blinded) toast("병원·의사명으로 보이는 표현이 자동으로 가려졌습니다.");
      if (data.screening) { toast(data.screening.userMessage || "후기가 검토 대기로 전환되었습니다."); }
      setSavedHasPublicReview(reviews.some((r) => r.is_public));
      setSavedModal(true); // 저장 완료 → 후기 유도 모달.
    } catch {
      toast("네트워크 오류가 발생했어요");
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[680px] py-6">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)] fade-in-up">{reviewOnly ? "시술 후기를 남겨주세요" : "내가 받은 시술을 기록해요"}</h1>

      {/* 메인 노트 글상자 */}
      <div className={formBox}>
        {/* 1. 날짜 — 인라인 달력(시술노트=최근 기록이라 정확한 날짜). 어림시기 칩은 제거(시술후기 폼 전용). */}
        <div>
          <label className={labelCls}>언제 받으셨어요?</label>
          <button ref={calBtnRef} type="button" onClick={() => { const next = !calOpen; setCalOpen(next); if (next) { setCalYear(+_y); setCalMonth(+_m); requestAnimationFrame(() => calRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })); } }} className={inputCls + " flex items-center justify-between text-left"}>
            <span className="text-[var(--text)]">{dateLabel}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></svg>
          </button>
          {calOpen && (
            <div ref={calRef} className="mt-2 rounded-md border border-[var(--border)] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <button type="button" onClick={prevCalMonth} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg)]" aria-label="이전 달">&lsaquo;</button>
                <span className="text-[14px] font-semibold text-[var(--text)]">{calYear}년 {calMonth}월</span>
                <button type="button" onClick={nextCalMonth} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg)]" aria-label="다음 달">&rsaquo;</button>
              </div>
              <div className="mb-1 grid grid-cols-7 text-center text-[12px] text-[var(--text-muted)]">
                {["일","월","화","수","목","금","토"].map((d) => <span key={d}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 text-center">
                {calDays.map((d, i) => d ? (
                  <button key={i} type="button" onClick={() => selectCalDate(d)} className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] ${+_y === calYear && +_m === calMonth && +_dd === d ? "bg-[var(--primary)] font-bold text-white" : "text-[var(--text)] hover:bg-[var(--primary-soft)]"}`}>{d}</button>
                ) : <span key={i} />)}
              </div>
            </div>
          )}
        </div>

        {/* "시술 후기만"(reviewOnly) — 병원·의사·실장 등 visit 상세만 접고 시작. 펼치면 일반 visit 폼과 동일.
            ★FIX-1: 날짜·어림시기는 위에서 항상 노출되므로, 이 토글은 병원·방문 상세에만 적용된다. */}
        {reviewOnly && !metaOpen && (
          <button type="button" onClick={() => setMetaOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-soft)] py-3 text-[13px] font-semibold text-[var(--text-secondary)]">
            ＋ 병원·방문 정보 추가 <span className="text-[11.5px] font-normal text-[var(--text-muted)]">(선택, 나만 봐요)</span>
          </button>
        )}

        {/* 병원·의사·실장 블록 — reviewOnly 면 metaOpen 일 때만 노출. */}
        {metaOpen && (
        <>
        {/* 2. 병원 — 이름/지명 검색 → 결과에서 바로 선택(지도 없음). 선택 시 결과창이 부드럽게 접힘. */}
        <div>
          <label className={labelCls}>어디서 받으셨어요?</label>
          {/* 확정 전 검색 UI — 선택 시 closing 으로 잠깐 접었다가(슥) picked 확정. */}
          {(!picked || closing) && (
            <div className={`overflow-hidden transition-all duration-200 ease-out ${closing ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100"}`}>
              <input
                className={inputCls}
                spellCheck={false}
                autoComplete="off"
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
              <input className="mt-1.5 w-full bg-transparent py-0.5 text-[13px] text-[var(--text-secondary)] outline-none placeholder-[var(--text-muted)]" style={{ fontSize: "16px" }} value={addr} placeholder="주소" onChange={(e) => setAddr(e.target.value)} />
              <input className="w-full bg-transparent py-0.5 text-[13px] text-[var(--text-secondary)] outline-none placeholder-[var(--text-muted)]" style={{ fontSize: "16px" }} value={tel} placeholder="전화번호" onChange={(e) => setTel(e.target.value)} />
              {/* 병원 홈페이지·카카오톡 채널 — 비공개. addr/tel 과 같은 보더리스 라인. */}
              <input className="w-full bg-transparent py-0.5 text-[13px] text-[var(--text-secondary)] outline-none placeholder-[var(--text-muted)]" style={{ fontSize: "16px" }} value={clinicHome} placeholder="홈페이지 (선택)" maxLength={300} onChange={(e) => setClinicHome(e.target.value)} />
              <input className="w-full bg-transparent py-0.5 text-[13px] text-[var(--text-secondary)] outline-none placeholder-[var(--text-muted)]" style={{ fontSize: "16px" }} value={clinicKakao} placeholder="카카오톡 채널 (선택)" maxLength={300} onChange={(e) => setClinicKakao(e.target.value)} />
            </div>
          )}
        </div>

        {/* 3. 의사 / 실장 */}
        <div>
          <label className={labelCls}>누구에게 받으셨어요?</label>
          <div className="grid grid-cols-2 gap-2">
            <input ref={doctorRef} className={inputCls} placeholder="원장님" value={doctorName} maxLength={100} onChange={(e) => setDoctorName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); managerRef.current?.focus(); } }} />
            <input ref={managerRef} className={inputCls} placeholder="실장님" value={managerName} maxLength={100} onChange={(e) => setManagerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); tagRef.current?.focus(); } }} />
          </div>
        </div>
        </>
        )}

        {/* 4. 받은 시술 — 태그 입력(자동완성·초성) + 행마다 메모 3상태(선택). */}
        <div>
          <label className={labelCls}>어떤 시술을 받으셨어요?</label>
          {procs.length > 0 && (
            <div className="mb-2 space-y-2">
              {procs.map((p) => (
                <div key={p.id} className={"rounded-md bg-[var(--bg)] p-2.5 transition-shadow " + (dupId === p.id ? "ring-2 ring-[var(--primary)]" : "")}>
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-white" style={{ background: CAT_COLOR[p.cat] ?? "var(--primary)" }}>{p.label}</span>
                    {/* ③ 메모 작성됨(접힘) — 회색 알약, 탭하면 재수정. */}
                    {!p.open && p.note.trim() && (
                      <button type="button" onClick={() => upd(p.id, { open: true })} className="ml-auto max-w-[58%] truncate rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)]">{p.note.trim()}</button>
                    )}
                    {/* ① 메모 없음(기본) — ＋메모 점선 버튼. */}
                    {!p.open && !p.note.trim() && (
                      <button type="button" onClick={() => { upd(p.id, { open: true }); trackProc("procedure_memo_open", {}); }} className="ml-auto rounded-full border border-dashed border-[#CBD8E2] bg-white px-3 py-1.5 text-[13px] font-semibold text-[var(--text-muted)]">＋ 메모</button>
                    )}
                    <button type="button" tabIndex={-1} onClick={() => removeProc(p)} className="shrink-0 px-1 text-[16px] leading-none text-[var(--text-muted)]">×</button>
                  </div>
                  {/* ② 메모 입력 중 — 행 아래 펼침. 빈 값으로 포커스 아웃 → ①, 입력 후 → ③. */}
                  {p.open && (
                    <input
                      className={inputSm + " mt-2 w-full"}
                      placeholder="샷수, 바이알, 부위, 메모… (선택)"
                      value={p.note}
                      maxLength={60}
                      autoFocus
                      onChange={(e) => upd(p.id, { note: e.target.value })}
                      onBlur={(e) => { const v = e.target.value.trim(); upd(p.id, { open: false }); if (v) trackProc("procedure_memo_save", { length: v.length }); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                    />
                  )}

                  {/* 시술별 후기 아코디언 — 펼치면 평가 컨트롤(day0). 안 펼치면 "기록만".
                      자유입력 신규태그(inDict=false)는 후기 불가(RPC unknown_procedure 거부) → 안내만, 기록은 정상 저장. */}
                  {!p.inDict ? (
                    <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-[var(--text-muted)]">목록에 없는 시술이라 기록만 남길 수 있어요. 후기는 운영자가 시술을 등록한 뒤 작성할 수 있어요.</p>
                  ) : !p.reviewOpen ? (
                    <button type="button" onClick={() => upd(p.id, { reviewOpen: true })} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#CBE0F0] bg-white py-2 text-[12.5px] font-semibold text-[var(--primary-active)]">
                      ✍️ 이 시술 후기 쓰기 <span className="text-[11px] font-normal text-[var(--text-muted)]">(안 쓰면 기록만 남아요)</span>
                    </button>
                  ) : (
                    <ReviewAccordion p={p} onChange={(patch) => upd(p.id, patch)} onClose={() => upd(p.id, { reviewOpen: false })} />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <input
              ref={tagRef}
              className={`${inputCls} pr-9`}
              placeholder="시술명을 입력하세요 (예: 울쎄라)"
              value={tag}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => setTag(e.target.value)}
              onBlur={() => { setTimeout(() => { setTag(""); setAcHi(-1); }, 150); }}
              onKeyDown={(e) => {
                // 자동완성 키보드 네비 — ↑↓ 로 후보(+'직접 추가' 줄) 이동.
                const navLen = acMatches.length + (acExact ? 0 : 1);
                if (tq && navLen > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                  e.preventDefault();
                  setAcHi((cur) => Math.max(0, Math.min(navLen - 1, e.key === "ArrowDown" ? cur + 1 : cur - 1)));
                  return;
                }
                if (e.key !== "Enter") return;
                // 한글 IME 조합 중 Enter(229)는 조합 확정용 — 무시(중복 추가 방지).
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                // 하이라이트된 후보가 있으면 그걸 선택, 없으면 입력값 그대로 추가.
                if (tq && acHi >= 0) {
                  if (acHi < acMatches.length) addTag(acMatches[acHi].label, "autocomplete");
                  else addTag(tag, "free_text");
                } else {
                  addTag(tag, acExact ? "enter" : "free_text");
                }
              }}
            />
            {tag && (
              <button type="button" onClick={() => { setTag(""); tagRef.current?.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] leading-none text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="입력 지우기">&times;</button>
            )}
            {tq && acMatches.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[240px] overflow-auto rounded-md bg-white shadow-[var(--shadow-lg)]">
                {acMatches.map((m, i) => (
                  <button key={m.label} type="button" onMouseEnter={() => setAcHi(i)} onMouseDown={(e) => { e.preventDefault(); addTag(m.label, "autocomplete"); }}
                    className={"flex w-full items-center gap-2 border-b border-[var(--border)] px-3 py-2.5 text-left last:border-0 " + (acHi === i ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--primary-soft)]")}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CAT_COLOR[m.cat] ?? "var(--primary)" }} />
                    <span className="text-[14px] font-medium text-[var(--text)]">{m.label}</span>
                    {m.cat && <span className="ml-auto text-[11px] text-[var(--text-muted)]">{m.cat}</span>}
                  </button>
                ))}
                {!acExact && (
                  <button type="button" onMouseEnter={() => setAcHi(acMatches.length)} onMouseDown={(e) => { e.preventDefault(); addTag(tag, "free_text"); }}
                    className={"flex w-full items-center gap-2 px-3 py-2.5 text-left " + (acHi === acMatches.length ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--primary-soft)]")}>
                    <span className="text-[13px] font-semibold text-[var(--primary-active)]">＋ “{tq}” 직접 추가</span>
                    <span className="ml-auto text-[11px] text-[var(--text-muted)]">목록에 없음</span>
                  </button>
                )}
              </div>
            )}
          </div>
          {/* 추천 결과가 0건이면 드롭다운이 비어 보이므로, '직접 추가' 버튼을 입력창 바로 아래에 확실히 노출. */}
          {tq && acMatches.length === 0 && !acExact && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addTag(tag, "free_text")}
              className="mt-2 flex w-full items-center gap-2 rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-2.5 text-left">
              <span className="text-[13px] font-semibold text-[var(--primary-active)]">＋ “{tq}” 직접 추가</span>
              <span className="ml-auto text-[11px] text-[var(--text-muted)]">목록에 없음</span>
            </button>
          )}
          <p className="mt-2 px-0.5 text-[12px] leading-relaxed text-[var(--text-muted)]">메모는 선택사항이에요. 샷수·바이알 수·부위 등 기억하고 싶은 것만 적어주세요.</p>
        </div>

        {/* 5. 총 결제금액 — 비공개(일기 표시용, 집계 제외). 시술별 가격 입력은 폐지(총액 일원화). */}
        <div>
          <label className={labelCls}>총 결제금액 <span className="ml-1 text-[12px] font-normal text-[var(--text-muted)]">(선택 · 나만 봐요)</span></label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              className={inputCls + " pr-9"}
              placeholder="예: 350000"
              value={totalPrice ? Number(totalPrice.replace(/[^0-9]/g, "")).toLocaleString("ko-KR") : ""}
              onChange={(e) => setTotalPrice(e.target.value.replace(/[^0-9]/g, ""))}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--text-muted)]">원</span>
          </div>
        </div>

        {/* 6. 오늘의 시술 노트 — 비공개 메모, 최대 400자 (후기 카운터와 동일 표기) */}
        <div>
          <label className={labelCls}>오늘의 시술 노트 <span className="ml-1 text-[12px] font-normal text-[var(--text-muted)]">({diary.length} / 400)</span></label>
          <textarea rows={3} maxLength={400} value={diary} onChange={(e) => setDiary(e.target.value)} className={textareaCls} placeholder="오늘 어땠는지, 기억해두고 싶은 것…" />
        </div>

      </div>

      <div className="mt-4 flex justify-center">
        {/* 저장 — 항상 완성 저장("기록 저장하기" 파란 버튼). "다 썼어요/나중에 마저" 토글 제거(사용자 요청).
            빈 공개 후기면 비활성(아래 안내). */}
        <button type="button" onClick={handleSave} disabled={saving || emptyPublicReview} className="h-11 rounded-md bg-[var(--primary)] px-12 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60">{saving ? "저장 중…" : "기록 저장하기"}</button>
      </div>
      {/* 비활성 사유 안내 — 무음 차단 방지(왜 저장이 안 되는지 설명). 공개 후기 가드만 남김. */}
      {!saving && emptyPublicReview && (
        <p className="mt-2 text-center text-[12px] text-[var(--accent)]">
          공개 후기는 평가를 하나 이상 남기거나 한줄후기를 적어주세요.
        </p>
      )}

      {/* 저장 완료 모달 — 통합 폼에선 같은 화면에서 후기까지 작성하므로 완료 안내만. */}
      {savedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => { setSavedModal(false); go("record"); }}>
          <div className="w-full max-w-[340px] rounded-[var(--radius)] bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-[28px]" style={{ background: "var(--primary-soft)" }}>✅</div>
            <p className="text-[17px] font-extrabold text-[var(--text)]">{isComplete ? "기록을 완료했어요" : "임시 저장했어요"}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
              {savedHasPublicReview
                ? <>공개로 남긴 후기는 다른 분들께도 도움이 돼요.<br /><span className="text-[var(--text-muted)]">내 노트에서 언제든 다시 볼 수 있어요.</span></>
                : <>받은 시술이 내 노트 타임라인에 정리됐어요.<br /><span className="text-[var(--text-muted)]">경과는 나중에 이어서 기록할 수 있어요.</span></>}
            </p>
            <div className="mt-5 space-y-2">
              <button type="button" onClick={() => { setSavedModal(false); go("record"); }} className="block w-full rounded-md bg-[var(--primary)] py-3 text-[14.5px] font-bold text-white">내 노트 보러 가기</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * ReviewAccordion — 시술 행 안에서 펼쳐지는 시술별 후기(day0) 입력.
 *   평가 컨트롤(만족도·통증·다운타임·재시술·효과·추천의향·효과시기)은 review-controls 공용 모듈 재사용.
 *   공개 옵트인(is_public) 토글 + 공개 시 한줄후기. 가격은 비공개 표기(여기선 입력 없음 — 총액으로 일원화).
 *   day0 값 = 결론칸 시작점(부분 입력 허용). 펼침 자체가 procedure_reviews 1행 생성 신호(handleSave 의 reviewOpen).
 * ───────────────────────────────────────────────────────────── */
function ReviewAccordion({
  p,
  onChange,
  onClose,
}: {
  p: DiaryProc;
  onChange: (patch: Partial<DiaryProc>) => void;
  onClose: () => void;
}) {
  const onelinerPlaceholder = useMemo(
    () => ONELINER_PLACEHOLDERS[Math.floor(Math.random() * ONELINER_PLACEHOLDERS.length)],
    [],
  );
  function toggleEffect(v: string) {
    onChange({ effectAreas: p.effectAreas.includes(v) ? p.effectAreas.filter((x) => x !== v) : [...p.effectAreas, v] });
  }
  return (
    <div className="mt-2 space-y-4 rounded-md border border-[#DCEAF5] bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-bold text-[var(--primary-active)]">{p.label} 후기</span>
        <button type="button" onClick={onClose} className="text-[11.5px] text-[var(--text-secondary)] underline">접기(기록만)</button>
      </div>

      {/* 만족도 */}
      <StarField label="만족도" value={p.satisfaction} onChange={(v) => onChange({ satisfaction: v })} />
      {/* 통증 */}
      <FaceField label="통증" value={p.pain} onChange={(v) => onChange({ pain: v })} faces={PAIN_FACES} />
      {/* 다운타임 */}
      <ChoiceField label="다운타임이 얼마나 됐나요?" hint="붓기·멍·딱지 등이 가라앉고 일상이 편해질 때까지" value={p.downtime} onChange={(v) => onChange({ downtime: v })} options={DOWNTIME_OPTIONS} />
      {/* 재시술 의향 */}
      <ChoiceField label="재시술 의향 (내가 또 받을지)" value={p.revisit} onChange={(v) => onChange({ revisit: v })} options={REVISIT_OPTIONS} />
      {/* 추천의향(recommend) — revisit 와 별개. visit 경로 전용. */}
      <NumberChoiceField label="다른 분께 추천하시겠어요?" value={p.recommend} onChange={(v) => onChange({ recommend: v })} options={RECOMMEND_OPTIONS} />
      {/* 효과 체감도(effect_felt) — day0 시계열 시작점(별점 1~5). */}
      <StarField label="효과 체감도" value={p.effectFelt} onChange={(v) => onChange({ effectFelt: v })} />
      {/* 효과(달라진 점) — 멀티 칩 */}
      <div>
        <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
          이번 시술로 달라진 점을 모두 골라주세요
          <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">생각보다 많을 거예요 — 보통 4개 이상 고르세요.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {EFFECT_AREA_OPTIONS.map((opt, i) => (
            <EffectChip key={opt} active={p.effectAreas.includes(opt)} color={EFFECT_AREA_COLORS[i % EFFECT_AREA_COLORS.length]} onClick={() => toggleEffect(opt)}>{opt}</EffectChip>
          ))}
        </div>
      </div>
      {/* 효과 발현 시점 */}
      <ChoiceField label="효과는 언제부터 느끼셨어요?" value={p.effectOnset} onChange={(v) => onChange({ effectOnset: v })} options={EFFECT_ONSET_OPTIONS} />

      {/* 공개 옵트인 + 가시성 배지 */}
      <div className="rounded-md bg-[var(--bg-soft)] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-[var(--text)]">평가만 익명으로 공개할게요
            <span className="mt-0.5 block text-[11.5px] font-normal text-[var(--text-muted)]">병원·가격·날짜는 빼고, 평가 지표만 다른 분들께 보여요.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={p.isPublic}
            aria-label="평가 익명 공개"
            onClick={() => onChange({ isPublic: !p.isPublic })}
            className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            style={{ background: p.isPublic ? "var(--primary)" : "#CBD2D9" }}
          >
            <span className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform" style={{ transform: p.isPublic ? "translateX(22px)" : "translateX(2px)" }} />
          </button>
        </div>
        {/* 가시성 배지 */}
        <div className="mt-2">
          {p.isPublic ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--primary-active)]">👁 평가 공개</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E8EAEE] px-2.5 py-1 text-[11px] font-bold text-[#5C6470]">🔒 나만 봐요</span>
          )}
        </div>
      </div>

      {/* 공개 시에만 한줄후기(body) 입력 */}
      {p.isPublic && (
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
            생생한 후기를 남겨주세요 <span className="text-xs font-normal text-[var(--text-muted)]">(선택 · {p.oneliner.length} / {ONELINER_MAX})</span>
            <span className="mt-0.5 block text-[11.5px] font-normal text-[var(--text-muted)]">비워두면 평가 지표만 공개돼요.</span>
          </label>
          <textarea
            value={p.oneliner}
            onChange={(e) => onChange({ oneliner: e.target.value })}
            maxLength={ONELINER_MAX}
            rows={3}
            placeholder={onelinerPlaceholder}
            className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[16px] leading-[1.6] focus:border-[var(--primary)] focus:outline-none"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">의료광고성 표현·병원·의사 실명 언급은 금합니다.</p>
        </div>
      )}
    </div>
  );
}

/* ════════════════ ⑤ 내 노트 (달력 / 목록 토글) ════════════════ */

// SummaryItem.date = "MM.DD"(연도는 SummaryGroup.year). 시술노트 요약본 공용 타입.
export type SummaryItem = { id: string; date: string; proc: string; hospital: string; doctor: string; manager?: string; tel: string; price: string; memo: string; items: { name: string; unit: string }[] };
export type SummaryGroup = { year: number; items: SummaryItem[] };

// summary = 시술노트 요약본(연도 그룹). 호출자(/today RecordTab 등)가 실데이터를 prop 으로 주입.
//   openDetail: 항목 클릭 시 상세 진입 콜백. RecordTab 은 (id)=>/notes/${id}(게스트는 /signup) 전달.
export function RecordView({
  go,
  summary,
  openDetail,
}: {
  go: (s: Screen) => void;
  summary: SummaryGroup[];
  openDetail?: (id: string) => void;
}) {
  const [mode, setMode] = useState<"tl" | "cal" | "list">("tl");
  const TABS: [typeof mode, string][] = [["tl", "타임라인"], ["cal", "달력"], ["list", "목록"]];
  const total = summary.reduce((n, g) => n + g.items.length, 0);
  const open = openDetail ?? (() => go("detail"));
  return (
    <section className="mx-auto w-full max-w-[680px]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[16px] font-bold text-[var(--text)]">내 노트</span>
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
          <h3 className="text-[19px] font-extrabold leading-snug tracking-tight text-[var(--text)]">첫 노트를 쓰면<br />이렇게 정리돼요</h3>
          <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--text-secondary)]">받은 시술이 타임라인·달력·목록으로<br />한눈에 보이고, 다음 주기도 알려드려요.</p>
          <a href="/write" className="mt-[18px] inline-block rounded-full bg-[var(--primary)] px-[30px] py-3.5 text-[15.5px] font-extrabold text-white shadow-[0_6px_16px_rgba(76,191,242,.35)]">첫 노트 쓰러 가기</a>

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
        <div className="flex items-center gap-2">
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
                {iv.name}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

/* ─── 연달력 — 12개월 그리드(점·건수 배지) + 월 탭 시 하단 상세 ─── */
function CalendarPanel({ onOpen, summary }: { onOpen: (id: string) => void; summary: SummaryGroup[] }) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  // 기록 있는 연도 범위(없으면 올해만). 연 이동은 이 범위 안에서만. 미래 연도는 올해로 클램프.
  const years = summary.map((g) => g.year);
  const minYear = years.reduce((a, b) => Math.min(a, b), thisYear);
  const maxYear = Math.min(years.reduce((a, b) => Math.max(a, b), thisYear), thisYear);

  const latest = summary[0]?.items[0];
  const [year, setYear] = useState(summary[0]?.year ?? thisYear);

  // 표시 연도의 월별 기록.
  const monthItems = useMemo(() => {
    const map = new Map<number, SummaryItem[]>();
    for (const it of summary.find((g) => g.year === year)?.items ?? []) {
      const m = Number(it.date.split(".")[0]);
      map.set(m, [...(map.get(m) ?? []), it]);
    }
    return map;
  }, [summary, year]);

  // 선택 월 — 기본은 표시 연도에서 가장 최근(=첫) 기록 월.
  const defaultSel = useMemo(() => {
    const ms = [...monthItems.keys()].sort((a, b) => b - a);
    return ms[0] ?? null;
  }, [monthItems]);
  const [selMonth, setSelMonth] = useState<number | null>(
    year === (summary[0]?.year ?? thisYear) && latest ? Number(latest.date.split(".")[0]) : null,
  );
  const sel = selMonth ?? defaultSel;
  const selItems = sel ? (monthItems.get(sel) ?? []) : [];

  const moveYear = (delta: number) => {
    const ny = year + delta;
    if (ny < minYear || ny > maxYear) return;
    setYear(ny);
    setSelMonth(null);
  };

  return (
    <>
      <div className={cardBox}>
        {/* 연도 네비 */}
        <div className="mb-4 flex items-center justify-center gap-6">
          <button type="button" disabled={year <= minYear} onClick={() => moveYear(-1)} className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--bg)] text-[var(--text-secondary)] disabled:opacity-30">‹</button>
          <span className="text-[19px] font-extrabold tracking-wide text-[var(--text)]">{year}</span>
          <button type="button" disabled={year >= maxYear} onClick={() => moveYear(1)} className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--bg)] text-[var(--text-secondary)] disabled:opacity-30">›</button>
        </div>
        {/* 12개월 그리드 */}
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const items = monthItems.get(m) ?? [];
            const count = items.length;
            const has = count > 0;
            const isNow = year === thisYear && m === thisMonth;
            const isFuture = year > thisYear || (year === thisYear && m > thisMonth);
            const isSel = sel === m;
            const base = "relative rounded-2xl px-1 py-3 text-center transition-all border-[1.5px] ";
            const style: CSSProperties = isNow
              ? { background: "var(--primary-soft)", borderColor: "var(--primary)" }
              : has
                ? { background: "#fff", borderColor: "#D9EDF9", boxShadow: isSel ? "0 0 0 2px var(--primary)" : "0 1px 4px rgba(34,43,53,.05)" }
                : { background: "var(--bg-soft)", borderColor: "transparent" };
            return (
              <button key={m} type="button" disabled={!has} onClick={() => setSelMonth(m)} className={base} style={style}>
                <span className="text-[14.5px] font-bold" style={{ color: isNow ? "var(--primary-active)" : isFuture ? "#C3CFDA" : has ? "var(--text)" : "var(--text-muted)" }}>{m}월</span>
                <span className="mt-1.5 flex h-[7px] items-center justify-center gap-[3px]">
                  {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                    <i key={i} className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--primary)" }} />
                  ))}
                </span>
                {has && (
                  <span className="absolute -right-1 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-extrabold text-white" style={{ background: "var(--primary)" }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택 월 상세 */}
      <div className={cardBox + " mt-3"}>
        {sel ? (
          <>
            <p className="mb-2.5 text-[13.5px] font-extrabold text-[var(--primary-active)]">{sel}월 · 기록 {selItems.length}건</p>
            {selItems.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-[13px] text-[var(--text-muted)]">이 달의 기록이 없어요.</p>
                <a href="/write" className="mt-2 inline-block text-[13px] font-bold text-[var(--primary-active)]">기록 추가하기</a>
              </div>
            ) : (
              <div className="space-y-2">
                {selItems.map((it) => {
                  const [mm, dd] = it.date.split(".");
                  const badge = recordBadge(it.items[0]?.name ?? it.proc, `${year}-${mm}-${dd}`);
                  return (
                    <button key={it.id} type="button" onClick={() => onOpen(it.id)} className="flex w-full items-center gap-3 rounded-[14px] bg-[var(--bg-soft)] px-3.5 py-3 text-left hover:bg-[var(--primary-soft)]">
                      <span className="min-w-[34px] text-[13px] font-extrabold text-[var(--primary-active)]">{Number(mm)}.{Number(dd)}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--text)]">{it.items.map((iv) => iv.name).join(" · ")}</span>
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={badge.tone === "mint" ? { background: "#E7FAF4", color: "#13967A" } : { background: "#FFF4E5", color: "#C97A1B" }}>{badge.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p className="py-4 text-center text-[13px] text-[var(--text-muted)]">기록 있는 달을 눌러 상세를 확인하세요.</p>
        )}
      </div>
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

