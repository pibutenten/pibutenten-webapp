/**
 * weather-logic — "오늘의 피부 날씨" 순수 계산 로직·상수 (React 비의존).
 *
 * 데이터 소스: Open-Meteo(키 불필요, CC BY 4.0). 자외선·미세먼지=CAMS, 일사·기온·구름=위성/모델.
 * 동봉 명세서(전달용/오늘의-피부날씨-기술문서.md)와 1:1 일치 — 과학 상수(UVA_K·BLOCK_LUT·
 * PM 경계·이슬점 임계)는 임의 변경 금지. 런타임 LLM 호출 없음(메시지는 사전 뱅크에서 규칙 선택).
 *
 * 설계:
 *  - 두 API hourly 를 인덱스가 아니라 time 문자열로 병합(joinHourly) → 글로벌·DST·길이차 안전.
 *  - 낮밤은 API is_day 플래그로 판정(자체 태양고도식 없음).
 *  - UVA(노화)는 전천일사(shortwave)에서 유도 + 흐린 날 보정.
 *  - 건조도는 상대습도가 아니라 이슬점(Magnus)으로 판정.
 */

export const DEFAULT_LOC = { lat: 37.4994, lon: 127.0628, name: "대치동" } as const;

/* ───────── 분류·헬퍼 ───────── */

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const uvBand = (u: number) => (u < 3 ? "낮음" : u < 6 ? "보통" : u < 8 ? "높음" : u < 11 ? "매우높음" : "위험");

/** 미세먼지 통합 등급(PM2.5·PM10 중 나쁜 쪽, 0~3) + 라벨·색. 한국 환경기준. */
export const PM_GRADE_LABEL = ["좋음", "보통", "나쁨", "매우나쁨"] as const;
export const PM_GRADE_COLOR = ["#3FA98E", "#C9C04A", "#DE5A2C", "#A81E1E"] as const;
export function pmWorstGrade(p25: number, p10: number): 0 | 1 | 2 | 3 {
  const g25 = p25 <= 15 ? 0 : p25 <= 35 ? 1 : p25 <= 75 ? 2 : 3;
  const g10 = p10 <= 30 ? 0 : p10 <= 80 ? 1 : p10 <= 150 ? 2 : 3;
  return Math.max(g25, g10) as 0 | 1 | 2 | 3;
}

/** UVB 심각도(0~1) — 칩 색 그라데이션용. */
const uvSev = (u: number) => (u < 3 ? 0 : u < 6 ? 0.28 : u < 8 ? 0.55 : u < 11 ? 0.8 : 1);
/** 자외선 강도 → 초록→노랑→주황→빨강 5점 램프. */
export function uvRamp(sev: number): string {
  const s = [
    [63, 170, 142],
    [123, 170, 78],
    [224, 179, 57],
    [223, 119, 47],
    [201, 66, 49],
  ];
  const f = clamp(sev, 0, 1);
  const x = f * 4;
  const i = Math.floor(x);
  const t = x - i;
  const a = s[i];
  const b = s[Math.min(i + 1, 4)];
  const c = (k: number) => Math.round(a[k] + (b[k] - a[k]) * t);
  return `rgb(${c(0)} ${c(1)} ${c(2)})`;
}
export const uvbColor = (u: number) => uvRamp(uvSev(u));
export const uvaColor = (uva: number) => uvRamp(clamp(uva / 11, 0, 1));

/** 해 떠 있으나 약할 때는 0 대신 0.x 로 표기. */
export function uvText(u: number, sunUp: boolean): string {
  if (!sunUp) return "0";
  if (u >= 1) return String(Math.round(u));
  if (u >= 0.1) return u.toFixed(1);
  return "0";
}

/** 이슬점(Magnus 식). 피부 수분손실(TEWL)의 1차 결정인자 = 대기 수증기압 = 이슬점.
 *  (기온이 오르면 커지는 VPD 는 더운 날 건조경보·겨울 누락 역전이 생겨 피부엔 부적합.) */
export function dewPointC(T: number | null, RH: number | null): number | null {
  if (T == null || RH == null) return null;
  const a = 17.625;
  const b = 243.04;
  const g = Math.log(Math.max(1, RH) / 100) + (a * T) / (b + T);
  return (b * g) / (a - g);
}

/* ───────── UVA(노화): 전천일사 유도 + 흐린 날 보정 ───────── */
// UVA(W/m²) = G × 0.04(지표 일사 중 UVA 비율, 문헌 중앙값) → 지수화 ×(11/50) = G × 0.0088.
export const UVA_K = 0.0088;
export function uvaFromSW(sw: number | null | undefined, uv: number | null | undefined, uvClear: number | null | undefined): number {
  let corr = 1;
  if (uvClear != null && uvClear > 0.5) {
    const uvCMF = Math.min(1, Math.max(0, (uv || 0) / uvClear)); // 1=청천 … ~0.54=과흐림
    corr = 1 + 0.5 * (1 - uvCMF); // 과흐림 → ×~1.23
  }
  return Math.max(0, Math.round((sw || 0) * UVA_K * corr * 10) / 10);
}

/* ───────── 구름 차단율(서울 3년 실측 PCHIP LUT) ───────── */
// index = 구름량 %(0~100), 값 = 자외선 차단율 %. 완전 흐림에도 ~54% 투과(서울 9년 검증값).
export const BLOCK_LUT = [
  0.0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 3.5, 4.1, 4.7, 5.4, 6.0, 6.6, 7.2, 7.8, 8.3, 8.8, 9.3, 9.7, 10.0, 10.3, 10.6, 10.8,
  11.0, 11.3, 11.5, 11.7, 11.9, 12.1, 12.2, 12.4, 12.6, 12.8, 12.9, 13.1, 13.3, 13.4, 13.6, 13.8, 14.0, 14.2, 14.4, 14.6, 14.8,
  15.1, 15.3, 15.5, 15.7, 15.9, 16.2, 16.4, 16.6, 16.8, 17.0, 17.2, 17.4, 17.5, 17.7, 17.9, 18.0, 18.1, 18.2, 18.3, 18.4, 18.5,
  18.6, 18.6, 18.7, 18.8, 18.8, 18.9, 19.0, 19.1, 19.2, 19.3, 19.4, 19.5, 19.7, 19.8, 20.0, 20.4, 21.1, 22.0, 23.2, 24.6, 26.2,
  27.9, 29.6, 31.4, 33.2, 35.0, 36.7, 38.3, 39.8, 41.0, 42.1, 43.1, 44.1, 45.1, 46.0,
];
export function blockFromCloud(cc: number | null | undefined): number | null {
  if (cc == null) return null;
  const c = Math.max(0, Math.min(100, cc));
  const i = Math.floor(c);
  const f = c - i;
  const a = BLOCK_LUT[i];
  const b = BLOCK_LUT[Math.min(100, i + 1)];
  return Math.round(a + (b - a) * f);
}

/* ───────── 날씨 코드 ───────── */
const WX: Record<number, [string, string]> = {
  0: ["맑음", "☀️"], 1: ["대체로 맑음", "🌤️"], 2: ["부분 흐림", "⛅"], 3: ["흐림", "☁️"],
  45: ["안개", "🌫️"], 48: ["안개", "🌫️"], 51: ["약한 비", "🌦️"], 53: ["비", "🌦️"], 55: ["비", "🌧️"],
  61: ["비", "🌧️"], 63: ["비", "🌧️"], 65: ["강한 비", "🌧️"], 71: ["눈", "🌨️"], 73: ["눈", "❄️"], 75: ["많은 눈", "❄️"],
  80: ["소나기", "🌦️"], 81: ["소나기", "🌧️"], 82: ["강한 소나기", "🌧️"], 95: ["뇌우", "⛈️"], 96: ["뇌우", "⛈️"], 99: ["뇌우", "⛈️"],
};
export const wxLabel = (c: number): [string, string] => WX[c] ?? ["흐림", "☁️"];
export function wcls(code: number): "눈" | "비" | "맑음" | "구름" | "흐림" {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "눈";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) return "비";
  return code <= 1 ? "맑음" : code === 2 ? "구름" : "흐림";
}

/* ───────── 메시지 엔진 (사전 뱅크, 런타임 LLM 없음 · 의료법 §56 톤) ───────── */
const MSG: Record<string, string[]> = {
  UV_낮음: [
    "오늘 자외선은 순한 편이에요. 그래도 UVA는 1년 내내 일하니 데일리 선크림은 챙기세요.",
    "자외선 지수 낮음. 짧은 외출엔 부담 없지만, 노화 관리용 선크림은 습관처럼.",
    "자외선 약한 날입니다. 무리한 노출만 피하면 편안한 하루예요.",
    "오늘은 자외선 걱정이 적은 날. 기본 차단만 유지하세요.",
    "자외선 낮음 — 비타민D 합성엔 오히려 좋은 정도예요.",
  ],
  UV_보통: [
    "자외선 보통. 한두 시간 야외활동이면 선크림을 발라두세요.",
    "정오 무렵만 그늘을 활용해도 오늘 자외선의 절반을 피할 수 있어요.",
    "외출 전 가볍게 차단하고 나가기 좋은 날입니다.",
    "오늘 자외선은 적당하지만 점심시간 직사광선은 피하는 게 좋아요.",
    "선크림 한 번이면 충분한 날. 땀이 많으면 한 번 더 덧바르세요.",
  ],
  UV_높음: [
    "자외선 높음. 외출 시 선크림은 필수, 모자나 양산도 도움이 돼요.",
    "오늘 자외선 강한 편이에요. 정오 전후 야외활동은 짧게 가져가세요.",
    "2시간마다 선크림을 덧발라 주세요.",
    "햇빛이 센 날입니다. 그늘·선글라스로 눈과 피부를 함께 보호하세요.",
  ],
  UV_매우높음: [
    "자외선 매우 높음. 그늘·모자·선크림을 모두 챙기세요.",
    "맨살 노출 20분이면 붉어질 수 있어요. 차단을 든든히 하세요.",
    "가능하면 한낮 외출을 피하고, 덧바름을 잊지 마세요.",
    "강한 햇빛이 예상돼요. 긴팔·양산으로 직접 노출을 줄이세요.",
  ],
  UV_위험: [
    "자외선 위험 단계. 한낮 외출은 최소화하고 차단을 최대로 하세요.",
    "오늘 자외선은 적도 수준이에요. 그늘에서도 반사광에 노출될 수 있으니 주의.",
    "짧은 노출도 화상 위험이 있어요. 단단히 차단하세요.",
  ],
  UVA_cloudy: [
    "흐려도 방심 금물 — 구름을 통과한 노화 자외선(UVA)이 오늘은 강합니다.",
    "구름 낀 날이지만 UVA는 그대로예요. 창가에서도 차단을 챙기세요.",
    "햇빛이 약해 보여도 색소·주름을 만드는 UVA는 높은 날입니다.",
  ],
  PM_나쁨: [
    "미세먼지 나쁨. 외출 후엔 평소보다 꼼꼼히 세안하세요.",
    "오늘 공기가 탁해요. 클렌징을 신경 쓰고 보습으로 장벽을 지켜주세요.",
    "노폐물이 모공에 쌓이기 쉬우니 이중세안을 권해요.",
    "공기 질이 좋지 않은 날. 외출 시 가벼운 마스크도 피부에 도움이 돼요.",
  ],
  PM_매우나쁨: [
    "미세먼지 매우 나쁨. 장시간 외출은 줄이고 귀가 후 바로 세안하세요.",
    "공기가 많이 탁해요. 모공 막힘을 막으려면 꼼꼼한 세정이 중요해요.",
    "산화 스트레스가 커지는 날이라 항산화 보습이 도움이 됩니다.",
  ],
  TEMP_hot: [
    "더운 날엔 피지 분비가 늘어요. 가벼운 세안으로 산뜻하게 유지하세요.",
    "무더위 — 유분이 늘기 쉬우니 오일프리 제품과 수분 보충이 좋아요.",
    "땀과 피지가 섞이면 트러블이 생기기 쉬우니 자주 닦아내세요.",
    "모공이 넓어 보이기 쉬운 날. 시원한 세안과 진정 케어를 권해요.",
  ],
  TEMP_cold: [
    "한파엔 피부 장벽이 약해져요. 보습을 평소보다 두껍게 올려주세요.",
    "추운 날 건조가 심해집니다. 세안 직후 3분 안에 보습을 마치세요.",
    "피부가 당기기 쉬운 날. 고보습 크림으로 마무리하세요.",
  ],
  HUM_dry: [
    "공기가 매우 건조해요. 수분 보습과 미스트로 당김을 막아주세요.",
    "건조 주의 — 실내 가습과 보습을 함께 챙기면 좋아요.",
    "피부가 쉽게 마르는 날. 보습 단계를 한 겹 더 추가하세요.",
  ],
  HUM_humid: [
    "습한 날엔 피지·땀으로 번들거리기 쉬워요. 가벼운 제형으로 산뜻하게.",
    "끈적임이 느껴지는 날. 가벼운 세안을 자주 해 모공을 비워주세요.",
  ],
  SNOW: [
    "눈은 자외선을 최대 80% 반사해요. 설경·스키장에선 선크림과 선글라스 필수.",
    "설반사로 자외선이 두 배가 될 수 있어요. 겨울이라도 차단을 챙기세요.",
  ],
  RAIN: [
    "비 오는 날 자외선은 낮지만 0은 아니에요. 길게 다니면 가볍게라도 차단하세요.",
    "비 그친 뒤 다시 강해질 수 있어요. 외출 전 자외선을 한 번 확인하세요.",
  ],
  AGING: [
    "오늘은 노화 자외선(UVA)이 강한 편이에요. 색소·주름 관리엔 데일리 차단이 중요합니다.",
    "UVA가 높은 날 — 흐림과 상관없이 실내 창가에서도 차단을 챙기세요.",
    "주름·탄력에 영향을 주는 UVA가 높아요. 자외선 차단제로 미리 막아두세요.",
    "노화 자외선이 센 날입니다. 외출이 길면 2~3시간마다 덧발라 주세요.",
  ],
  CALM: [
    "공기가 비교적 맑은 날이에요. 피부엔 편안한 하루입니다.",
    "오늘은 큰 부담 없는 날. 기본 루틴만 잘 지키면 충분해요.",
    "무난한 하루예요. 세안과 보습, 기본을 챙기세요.",
  ],
};

/** 날짜 시드 회전 — 같은 날엔 고정, 날마다 변화. */
function pickSeed(arr: string[], salt: number): string {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return arr[(seed + salt) % arr.length];
}

export type AdviceInput = {
  uv: number;
  uva: number;
  pmGrade: number;
  tempMax: number;
  dew: number | null;
  weather: ReturnType<typeof wcls>;
};
/** 위험도 순으로 키 정렬 → 1순위=헤드라인(접힌 카드), 2순위=팁(상세). */
export function buildAdvice(s: AdviceInput): { headline: string; tip: string } {
  const keys: string[] = [];
  if (s.pmGrade >= 3) keys.push("PM_매우나쁨");
  if (s.uv >= 11) keys.push("UV_위험");
  if (s.uva >= 10) keys.push("AGING");
  if (s.uv >= 8) keys.push("UV_매우높음");
  if (s.pmGrade === 2) keys.push("PM_나쁨");
  if (s.uva >= 7) keys.push("AGING");
  if (s.tempMax >= 33) keys.push("TEMP_hot");
  if (s.tempMax <= 0) keys.push("TEMP_cold");
  if (s.weather === "눈") keys.push("SNOW");
  if (s.uv >= 6) keys.push("UV_높음");
  if ((s.weather === "흐림" || s.weather === "구름" || s.weather === "비") && s.uva >= 5) keys.push("UVA_cloudy");
  if (s.dew != null && s.dew <= 5) keys.push("HUM_dry");
  if (s.tempMax >= 31) keys.push("TEMP_hot");
  if (s.uv >= 3) keys.push("UV_보통");
  if (s.weather === "비") keys.push("RAIN");
  if (s.dew != null && s.dew >= 20) keys.push("HUM_humid");
  if (!keys.length) keys.push(s.uv < 3 ? "UV_낮음" : "CALM");
  const uniq = [...new Set(keys)];
  return {
    headline: pickSeed(MSG[uniq[0]], 0),
    tip: uniq[1] ? pickSeed(MSG[uniq[1]], 7) : pickSeed(MSG.CALM, 7),
  };
}

/* ───────── API 호출 + 시각 병합 ───────── */

type AQ = {
  current?: { uv_index?: number; uv_index_clear_sky?: number; pm2_5?: number; pm10?: number };
  hourly?: { time?: string[]; uv_index?: number[]; uv_index_clear_sky?: number[]; pm2_5?: number[]; pm10?: number[] };
  error?: boolean;
  reason?: string;
};
type WX = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    apparent_temperature?: number;
    shortwave_radiation?: number;
    is_day?: number;
  };
  hourly?: { time?: string[]; cloud_cover?: number[]; shortwave_radiation?: number[]; is_day?: number[] };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
  error?: boolean;
  reason?: string;
};

export type HourRow = {
  time: string;
  uv?: number;
  uvClear?: number;
  pm25?: number;
  pm10?: number;
  cloud?: number;
  sw?: number;
  isDay?: number;
};

/** 두 API hourly 를 time 문자열 Key 로 병합(인덱스 가정 금지 — 길이차·DST 안전). */
function joinHourly(aq: AQ, wx: WX): HourRow[] {
  const m = new Map<string, HourRow>();
  const A = aq.hourly ?? {};
  const W = wx.hourly ?? {};
  const at = A.time ?? [];
  for (let i = 0; i < at.length; i++) {
    m.set(at[i], { time: at[i], uv: A.uv_index?.[i], uvClear: A.uv_index_clear_sky?.[i], pm25: A.pm2_5?.[i], pm10: A.pm10?.[i] });
  }
  const wt = W.time ?? [];
  for (let j = 0; j < wt.length; j++) {
    const r = m.get(wt[j]) ?? { time: wt[j] };
    r.cloud = W.cloud_cover?.[j];
    r.sw = W.shortwave_radiation?.[j];
    r.isDay = W.is_day?.[j];
    m.set(wt[j], r);
  }
  return [...m.values()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/* ───────── 가공 결과 타입 ───────── */

export type WeatherChip = { key: string; label: string; value: string; color: string; frac: number };
export type WeatherKpi = {
  key: "tanning" | "aging" | "pm" | "block";
  label: string;
  value: string;
  level: string;
  color: string;
  sub: string;
  frac: number; // 0~1, 최대값 대비 현재 위치
  minLabel: string; // 게이지 좌측 눈금(예 "0")
  maxLabel: string; // 게이지 우측 눈금(예 "11", "100%", "매우나쁨")
  seg?: number; // 세그먼트 게이지 구간 수(미세먼지 4단계). 없으면 연속 바.
};
export type WeatherHour = {
  h: number;
  t: Date;
  up: boolean;
  uv: number;
  uva: number;
  pm25: number | null;
  pm10: number | null;
  block: number; // 차단율 %
};
export type WeatherDay = {
  label: string;
  md: string;
  emoji: string;
  rainProb: number;
  tMin: number;
  tMax: number;
  rangeLeft: number;
  rangeWidth: number;
  isToday: boolean;
  uvb: number;
  uva: number;
  pmGrade: 0 | 1 | 2 | 3;
  trans: number | null; // 평균 투과율 0~1
};
export type WeatherSnapshot = {
  name: string;
  temp: number;
  feels: number;
  cond: string;
  headline: string;
  tip: string;
  uvNow: number;
  uvaNow: number;
  sunUp: boolean;
  pmGrade: 0 | 1 | 2 | 3;
  blockNow: number;
  todayMin: number; // 오늘 최저기온
  todayMax: number; // 오늘 최고기온
  tempFrac: number; // 0~1, 오늘 최저~최고 레인지에서 현재 기온 위치
  humidity: number; // 상대습도 %
  humLabel: string; // 피부 관점 습도 라벨(건조/적정/촉촉) — 이슬점 기준
  chips: WeatherChip[];
  kpis: WeatherKpi[];
  hours: WeatherHour[];
  days: WeatherDay[];
  weekNote: string;
};

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** API 두 곳 호출 → WeatherSnapshot 으로 가공. (네트워크 예외는 throw.) */
export async function fetchWeather(lat: number, lon: number, name: string, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const getJSON = async <T,>(u: string): Promise<T> => {
    const r = await fetch(u, { signal });
    const j = (await r.json()) as T & { error?: boolean; reason?: string };
    if (j.error) throw new Error(j.reason || "API error");
    return j;
  };
  const [aq, wx] = await Promise.all([
    getJSON<AQ>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&current=uv_index,uv_index_clear_sky,pm2_5,pm10&hourly=uv_index,uv_index_clear_sky,pm2_5,pm10&past_days=1&forecast_days=7&timezone=auto`,
    ),
    getJSON<WX>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,shortwave_radiation,is_day` +
        `&hourly=cloud_cover,shortwave_radiation,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&past_days=1&forecast_days=7&timezone=auto`,
    ),
  ]);
  return computeSnapshot(aq, wx, name);
}

function computeSnapshot(aq: AQ, wx: WX, name: string): WeatherSnapshot {
  const cur = aq.current ?? {};
  const wcur = wx.current ?? {};
  const D = wx.daily ?? {};
  const uvNow = cur.uv_index ?? 0;
  const pm25 = cur.pm2_5 ?? 0;
  const pm10 = cur.pm10 ?? 0;
  const temp = Math.round(wcur.temperature_2m ?? 0);
  const feels = Math.round(wcur.apparent_temperature ?? temp);
  const [cond] = wxLabel(wcur.weather_code ?? 3);
  const sunUp = wcur.is_day === 1;
  const uvaNow = uvaFromSW(wcur.shortwave_radiation ?? 0, cur.uv_index ?? 0, cur.uv_index_clear_sky ?? 0);

  const rows = joinHourly(aq, wx);

  // 오늘 최고치 + 구름 차단(실측 기반)
  const day0 = new Date().toLocaleDateString("en-CA");
  let uvPeak = 0;
  let clrPeak = 0;
  let uvaPeak = 0;
  for (const r of rows) {
    if ((r.time || "").slice(0, 10) !== day0) continue;
    uvPeak = Math.max(uvPeak, r.uv || 0);
    clrPeak = Math.max(clrPeak, r.uvClear || 0);
    uvaPeak = Math.max(uvaPeak, uvaFromSW(r.sw, r.uv, r.uvClear));
  }
  const dIdx = Math.max(0, (D.time ?? []).indexOf(day0));
  const dayBlock = clrPeak > 0.5 ? clamp(Math.round((1 - uvPeak / clrPeak) * 100), 0, 99) : 0;
  const clearNow = cur.uv_index_clear_sky ?? 0;
  const blockNow = sunUp && clearNow > 0.5 ? clamp(Math.round((1 - uvNow / clearNow) * 100), 0, 99) : dayBlock;
  const pmG = pmWorstGrade(pm25, pm10);
  const todayMax = Math.round(D.temperature_2m_max?.[dIdx] ?? temp);
  const todayMin = Math.round(D.temperature_2m_min?.[dIdx] ?? temp);
  const tempFrac = clamp((temp - todayMin) / Math.max(1, todayMax - todayMin), 0, 1);
  const dew = dewPointC(wcur.temperature_2m ?? null, wcur.relative_humidity_2m ?? null);
  const humidity = Math.round(wcur.relative_humidity_2m ?? 0);
  // 피부 관점 습도 라벨 — 이슬점 기준(건조 ≤5, 촉촉 ≥20, 그 외 적정). 명세 §4.2.
  const humLabel = dew == null ? "—" : dew <= 5 ? "건조" : dew >= 20 ? "촉촉" : "적정";

  const adv = buildAdvice({ uv: uvNow, uva: uvaNow, pmGrade: pmG, tempMax: todayMax, dew, weather: wcls(wcur.weather_code ?? 3) });

  // 게이지 표시용 비율(0~1). 과학값은 그대로, 표시만 최대값 대비 위치로 환산.
  const uvbFrac = sunUp ? clamp(uvNow / 11, 0, 1) : 0;
  const uvaFrac = clamp(uvaNow / 11, 0, 1);
  const pmFrac = pmG / 3;
  const transNow = 100 - blockNow; // 현재 자외선 통과율 %
  const transDay = 100 - dayBlock;

  const chips: WeatherChip[] = [
    { key: "uvb", label: "UVB 홍반", value: uvText(uvNow, sunUp), color: uvbColor(uvNow), frac: uvbFrac },
    { key: "uva", label: "UVA 노화", value: String(uvaNow), color: uvaColor(uvaNow), frac: uvaFrac },
    { key: "pm", label: "미세먼지", value: PM_GRADE_LABEL[pmG], color: PM_GRADE_COLOR[pmG], frac: pmFrac },
    { key: "block", label: "구름투과", value: `${transNow}%`, color: "#3C8CC8", frac: transNow / 100 },
  ];
  const kpis: WeatherKpi[] = [
    { key: "tanning", label: "UVB 홍반", value: uvText(uvNow, sunUp), level: uvBand(uvNow), color: uvbColor(uvNow), sub: `오늘 최고 ${Math.round(uvPeak)}`, frac: uvbFrac, minLabel: "0", maxLabel: "11" },
    { key: "aging", label: "UVA 노화", value: String(uvaNow), level: uvaNow >= 9 ? "강함" : uvaNow >= 5 ? "보통" : "약함", color: uvaColor(uvaNow), sub: `오늘 최고 ${uvaPeak}`, frac: uvaFrac, minLabel: "0", maxLabel: "11" },
    { key: "pm", label: "미세먼지", value: String(Math.round(pm25)), level: PM_GRADE_LABEL[pmG], color: PM_GRADE_COLOR[pmG], sub: `PM10 ${Math.round(pm10)}㎍`, frac: pmFrac, minLabel: "좋음", maxLabel: "매우나쁨", seg: 4 },
    { key: "block", label: "구름투과", value: `${transDay}%`, level: "자외선 통과", color: "#3C8CC8", sub: `구름 차단 ${dayBlock}%`, frac: transDay / 100, minLabel: "0", maxLabel: "100%" },
  ];

  // 시간별 시리즈: 과거 24h ~ 향후 24h
  const hours: WeatherHour[] = [];
  const startMs = Date.now() - 24 * 36e5;
  for (const r of rows) {
    if (hours.length >= 49) break;
    const t = new Date(r.time);
    if (t.getTime() < startMs - 18e5) continue;
    const up = r.isDay === 1;
    const uvi = r.uv ?? 0;
    const clr = r.uvClear ?? 0;
    hours.push({
      h: t.getHours(),
      t,
      up,
      uv: up ? uvi : 0,
      uva: up ? uvaFromSW(r.sw, r.uv, r.uvClear) : 0,
      pm25: r.pm25 ?? null,
      pm10: r.pm10 ?? null,
      block: up && clr > 0.5 ? clamp(Math.round((1 - uvi / clr) * 100), 0, 99) : (blockFromCloud(r.cloud) ?? dayBlock),
    });
  }

  // 주간 집계
  const aUV: Record<string, number> = {};
  const aUVA: Record<string, number> = {};
  const aPM: Record<string, number> = {};
  const aTRs: Record<string, number> = {};
  const aTRn: Record<string, number> = {};
  const aHasUV: Record<string, boolean> = {};
  for (const r of rows) {
    const d = (r.time || "").slice(0, 10);
    const up = r.isDay === 1;
    const uv = r.uv;
    const clr = r.uvClear || 0;
    if (up && clr > 0.5) aHasUV[d] = true;
    aUV[d] = Math.max(aUV[d] ?? 0, uv || 0);
    if (up) aUVA[d] = Math.max(aUVA[d] ?? 0, uvaFromSW(r.sw, r.uv, r.uvClear));
    aPM[d] = Math.max(aPM[d] ?? 0, clamp(Math.max((r.pm25 || 0) / 75, (r.pm10 || 0) / 150), 0, 1.25));
    if (up && clr > 0.5) {
      aTRs[d] = (aTRs[d] || 0) + (1 - (uv || 0) / clr);
      aTRn[d] = (aTRn[d] || 0) + 1;
    }
  }
  const dTime = D.time ?? [];
  let lastIdx = dIdx - 1;
  for (let i = dIdx; i < dTime.length; i++) {
    if (aHasUV[dTime[i]]) lastIdx = i;
    else break;
  }
  let wkLo = 99;
  let wkHi = -99;
  for (let i = dIdx; i <= lastIdx; i++) {
    wkLo = Math.min(wkLo, D.temperature_2m_min?.[i] ?? 0);
    wkHi = Math.max(wkHi, D.temperature_2m_max?.[i] ?? 0);
  }
  const span = Math.max(1, wkHi - wkLo);
  const days: WeatherDay[] = [];
  for (let i = dIdx; i <= lastIdx; i++) {
    const d = dTime[i];
    const dt = new Date(d + "T00:00");
    const isToday = i === dIdx;
    const tmin = D.temperature_2m_min?.[i] ?? 0;
    const tmax = D.temperature_2m_max?.[i] ?? 0;
    const sev = aPM[d] ?? 0;
    const pmGd = (sev < 0.2 ? 0 : sev < 0.467 ? 1 : sev < 1 ? 2 : 3) as 0 | 1 | 2 | 3;
    days.push({
      label: isToday ? "오늘" : DAY_KO[dt.getDay()],
      md: `${dt.getMonth() + 1}/${dt.getDate()}`,
      emoji: wxLabel(D.weather_code?.[i] ?? 3)[1],
      rainProb: Math.round(D.precipitation_probability_max?.[i] ?? 0),
      tMin: Math.round(tmin),
      tMax: Math.round(tmax),
      rangeLeft: ((tmin - wkLo) / span) * 100,
      rangeWidth: ((tmax - tmin) / span) * 100,
      isToday,
      uvb: Math.round(aUV[d] ?? 0),
      uva: Math.round(aUVA[d] ?? 0),
      pmGrade: pmGd,
      trans: aTRn[d] ? 1 - aTRs[d] / aTRn[d] : null,
    });
  }
  const ndays = lastIdx - dIdx + 1;

  return {
    name,
    temp,
    feels,
    cond,
    headline: adv.headline,
    tip: adv.tip,
    uvNow,
    uvaNow,
    sunUp,
    pmGrade: pmG,
    blockNow,
    todayMin,
    todayMax,
    tempFrac,
    humidity,
    humLabel,
    chips,
    kpis,
    hours,
    days,
    weekNote: `자외선 예보가 가능한 날까지 표시됩니다(현재 ${ndays}일). 구름투과는 단기 예보가 더 정확합니다. 출처: CAMS · Open-Meteo.com`,
  };
}

/** 그래프 겹쳐보기 4지표 메타(정규화·절대표시·색). */
export const OVERLAYS: {
  key: "tanning" | "aging" | "pm" | "block";
  label: string;
  color: string;
  norm: (o: WeatherHour) => number; // 0~100+
  abs: (o: WeatherHour) => string;
  dot: (o: WeatherHour) => string;
}[] = [
  { key: "tanning", label: "UVB 홍반", color: "#E0382E", norm: (o) => ((o.up ? o.uv : 0) / 11) * 100, abs: (o) => uvText(o.uv, o.up), dot: () => "#E0382E" },
  { key: "aging", label: "UVA 노화", color: "#B45CB0", norm: (o) => ((o.up ? o.uva : 0) / 11) * 100, abs: (o) => String(o.up ? o.uva : 0), dot: () => "#B45CB0" },
  {
    key: "pm",
    label: "미세먼지",
    color: "#7C8893",
    norm: (o) => clamp(Math.max((o.pm25 || 0) / 75, (o.pm10 || 0) / 150), 0, 1.25) * 100,
    abs: (o) => `${PM_GRADE_LABEL[pmWorstGrade(o.pm25 || 0, o.pm10 || 0)]} ${o.pm25 == null ? "–" : Math.round(o.pm25)}`,
    dot: (o) => PM_GRADE_COLOR[pmWorstGrade(o.pm25 || 0, o.pm10 || 0)],
  },
  { key: "block", label: "구름투과", color: "#3C8CC8", norm: (o) => 100 - o.block, abs: (o) => `${100 - o.block}%`, dot: () => "#3C8CC8" },
];

/** 현재 시각에 가장 가까운 hours 인덱스. */
export function nowIndex(hrs: WeatherHour[]): number {
  const now = Date.now();
  let best = 0;
  let bd = Infinity;
  hrs.forEach((o, i) => {
    const dd = Math.abs(o.t.getTime() - now);
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  });
  return best;
}

export const ampm = (h: number) => (h === 0 ? "오전 12시" : h < 12 ? `오전 ${h}시` : h === 12 ? "오후 12시" : `오후 ${h - 12}시`);
