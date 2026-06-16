"use client";

/**
 * WeatherDetail — "오늘의 피부 날씨" 상세 본문 (UI개선안 §3).
 *   §3.1 헤더(위치·일러스트·기상특보 배지·기온/체감·최저/최고/습도·한 줄 메시지 — 기온은 헤더에만)
 *   §3.2 세로 게이지 3개(UVB·UVA·미세먼지) + §3.3 구름 = 4번째 세로 게이지(빨강 없이, 경각심 3장치)
 *   §3.4 시간별 흐름(UVB·UVA 면 기본, 미세먼지·구름 토글) + §3.5 이슬점 건조도 조건부 + 주간.
 *   과학 로직·등급 경계는 weather-logic.ts(무수정). 게이지는 '오늘 최고(envelope) + 지금(cur)' 2-레이어.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./skin-weather.module.css";
import WeatherIllustration from "./WeatherIllustration";
import {
  INFO_BLUE,
  SEVERITY_BAR,
  OVERLAYS,
  PM_GRADE_COLOR,
  PM_GRADE_LABEL,
  ampm,
  cloudCaption,
  nowIndex,
  pmView,
  uvaColor,
  uvaView,
  uvbColor,
  uvbView,
  uvText,
  type SkinMetricView,
  type WeatherHour,
  type WeatherKpi,
  type WeatherSnapshot,
} from "./weather-logic";

const clampFrac = (v: number) => Math.max(0, Math.min(1, v));
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** kpis 배열에서 key 로 항목을 안전하게 꺼낸다(없으면 undefined). */
function kpiOf(kpis: WeatherKpi[], key: WeatherKpi["key"]): WeatherKpi | undefined {
  return kpis.find((x) => x.key === key);
}

/** 기상특보 배지 색 톤(흰 상세 배경 위 — 종류별 옅은 틴트). */
const BADGE_TONE: Record<string, { bg: string; fg: string }> = {
  폭염: { bg: "#FFEFE6", fg: "#D9480F" },
  폭우: { bg: "#E7F0FA", fg: "#1C6FB8" },
  한파: { bg: "#EAF3FF", fg: "#1559B5" },
};

export default function WeatherDetail({
  snap,
  emph,
  onEmph,
}: {
  snap: WeatherSnapshot;
  /** 선택된 지표 키(상위 View 가 사이드바 설명·그래프 강조를 함께 구동). */
  emph: string | null;
  onEmph: (k: string) => void;
}) {
  // 주간 — 클릭한 날을 활성화(강조). 디폴트는 오늘.
  const [selDayIdx, setSelDayIdx] = useState(() => {
    const i = snap.days.findIndex((d) => d.isToday);
    return i >= 0 ? i : 0;
  });

  // §3.2 세로 게이지 3종 — 지금 값 기준 등급어·심각도색(홈 카드와 동일한 Wave1 헬퍼 재사용).
  //   미세먼지도 uvb/uva 와 같은 SEVERITY_COLOR 로 통일(기존 PM_GRADE_COLOR 대신).
  const uvbV = uvbView(snap.uvNow);
  const uvaV = uvaView(snap.uvaNow);
  const pmV = pmView(snap.pmGrade);
  const uvbKpi = kpiOf(snap.kpis, "tanning");
  const uvaKpi = kpiOf(snap.kpis, "aging");
  const pmKpi = kpiOf(snap.kpis, "pm");

  // §3.3 구름 게이지 — 도달(=통과)/차단. blockNow=구름 차단율 %, 도달=100−차단.
  const cloudReach = clampN(100 - snap.blockNow, 0, 100);
  // ⚠ 조건부 플래그(구현노트): '구름이 좀 있는데도 자외선 통과율이 높은 낮'에만 켠다.
  //   의도 = "흐려 보여 방심하기 쉬운데 실제 도달은 높음" 경고. 조건:
  //     ① snap.sunUp(낮) — 밤엔 자외선 0이라 경고 무의미 → 끔
  //     ② snap.blockNow >= 15 — 구름 차단이 약간이라도 있어야(완전 맑은 날은 굳이 경고 안 함)
  //     ③ cloudReach >= 70 — 그럼에도 통과율 70%+ (차단으로 가려져도 자외선은 그대로)
  //   (이전 식은 blockNow>=30 && cloudReach>=70 = blockNow>=30 && blockNow<=30 으로
  //    blockNow===30 일 때만 참이던 버그를 바로잡음.)
  const cloudWarn = snap.sunUp && snap.blockNow >= 15 && cloudReach >= 70;
  // 게이지 아래 한 줄(gNote) — 맑음/흐림/밤 분기. cloudCaption 과 같은 30% 경계를 재사용해
  //   맑은 날 "구름이 적어 …그대로 도달" / 흐린 날 "흐려도 …통과" / 밤(sunUp=false)엔 숨김.
  const cloudCap = cloudCaption(snap.blockNow, snap.sunUp); // 밤이면 null → gNote 생략
  const cloudCloudy = snap.blockNow >= 30; // 흐린 날 어법 여부(cloudCaption 과 동일 경계)

  // §3.5 건조도 — 이슬점 기준 라벨(humLabel: 건조/적정/촉촉)로 조건부 노출.
  const dryNote =
    snap.humLabel === "건조"
      ? "대기 수분이 낮아요 — 피부 수분이 쉽게 증발하니 보습을 한 겹 더 챙기세요."
      : snap.humLabel === "촉촉"
        ? "대기가 습해요 — 피지·유분이 늘기 쉬우니 가벼운 제형으로 산뜻하게."
        : null;

  return (
    <div className={styles.detail}>
      {/* 헤더(글상자) — 위치 + 기온 + 최저/최고/습도를 옆으로 펼쳐 한눈에. */}
      <div className={styles.dHead}>
        <span className={styles.dLoc}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {snap.name}
        </span>
        {snap.badges.length > 0 && (
          <div className={styles.dBadges}>
            {snap.badges.map((b) => {
              const tone = BADGE_TONE[b.kind];
              return (
                <span
                  className={styles.dBadge}
                  key={b.kind}
                  style={tone ? { background: tone.bg, color: tone.fg } : undefined}
                >
                  {b.label}
                </span>
              );
            })}
          </div>
        )}
        <div className={styles.dHeadMain}>
          <div className={styles.dTempRow}>
            <WeatherIllustration illust={snap.illust} size={52} className={styles.dHero} />
            <span className={styles.dTemp}>{snap.temp}°</span>
            <span className={styles.dCond}>
              {snap.cond}
              <b>체감 {snap.feels}°</b>
            </span>
          </div>
          {/* 온도·습도 숫자 — 우측으로 펼침(피부 관점 보조 정보). */}
          <div className={styles.dMetrics}>
            <span className={styles.metric}>
              최저 <b>{snap.todayMin}°</b>
            </span>
            <span className={styles.metricSep}>·</span>
            <span className={styles.metric}>
              최고 <b>{snap.todayMax}°</b>
            </span>
            <span className={styles.metricSep}>·</span>
            <span className={styles.metric}>
              습도 <b>{snap.humidity}%</b> <i className={styles.humTag}>{snap.humLabel}</i>
            </span>
          </div>
        </div>

        {/* 피부 팁 — 라벨 없이 구분선 아래 한 문장만 미니멀하게. */}
        <p className={styles.tip}>{snap.tip}</p>
      </div>

      {/* §3.2 세로 게이지 3개(UVB·UVA·미세먼지) + §3.3 구름(4번째 관). 섹션 제목 + 범례. */}
      <div className={styles.secTitle}>햇빛·미세먼지</div>
      <div className={styles.gLegend}>
        <span className={styles.gLg}>
          <i className={styles.gLgNow} />지금
        </span>
        <span className={styles.gLg}>
          <i className={styles.gLgPeak} />오늘 최고
        </span>
      </div>
      <div className={styles.gauges}>
        {tube("tanning", "UVB 홍반", uvbV, uvText(snap.uvNow, snap.sunUp), uvbKpi, emph, onEmph)}
        {tube("aging", "UVA 노화", uvaV, String(snap.sunUp ? snap.uvaNow : 0), uvaKpi, emph, onEmph)}
        {tube("pm", "미세먼지", pmV, pmKpi ? pmKpi.value : "–", pmKpi, emph, onEmph)}
        {cloudTube(cloudReach, snap.blockNow, cloudWarn, emph, onEmph)}
      </div>
      {/* 게이지 아래 한 줄 — 맑음/흐림 분기(밤이면 cloudCap===null 이라 통째로 숨김). */}
      {cloudCap && (
        <p className={styles.gNote}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6.5 19Z" />
          </svg>
          <span>
            {cloudCloudy ? (
              <>
                구름이 막아주는 자외선은 <b>{snap.blockNow}%뿐</b> — 흐려도 <b>{cloudReach}%</b>가 그대로 통과하니 차단은 필수예요.
              </>
            ) : (
              <>
                구름이 적어 자외선이 <b>{cloudReach}%</b> 그대로 도달해요 — 차단은 필수예요{snap.blockNow > 0 ? <>{" "}(구름 차단 <b>{snap.blockNow}%뿐</b>).</> : <>.</>}
              </>
            )}
          </span>
        </p>
      )}

      {/* §3.5 건조도(이슬점) — 건조/촉촉한 날만 노출. 적정엔 묻지 않음. */}
      {dryNote && <p className={styles.dryNote}>{dryNote}</p>}

      <div className={styles.gcard}>
        <div className={styles.gttl}>
          시간별 흐름 <span>과거 24시간 ~ 향후 24시간</span>
        </div>
        <HourlyGraph hours={snap.hours} emph={emph} onEmph={onEmph} />
      </div>

      <div className={styles.secTitle}>주간 피부 날씨</div>
      <div className={styles.week}>
        {snap.days.map((d, i) => (
          <button
            type="button"
            className={`${styles.wday} ${selDayIdx === i ? styles.wToday : ""}`}
            key={i}
            onClick={() => setSelDayIdx(i)}
            aria-pressed={selDayIdx === i}
          >
            <div className={styles.wTop}>
              <div className={styles.wDay}>
                {d.label}
                <small>{d.md}</small>
              </div>
              <div className={styles.wEmoji}>{d.emoji}</div>
              <div className={styles.wRain}>{d.rainProb > 0 ? `💧${d.rainProb}%` : ""}</div>
              <div className={styles.wTemp}>
                <span className={styles.wLo}>{d.tMin}°</span>
                <span className={styles.wRange}>
                  <i style={{ left: `${d.rangeLeft.toFixed(0)}%`, width: `${Math.max(8, d.rangeWidth).toFixed(0)}%`, background: d.tColor }} />
                </span>
                <span className={styles.wHi}>{d.tMax}°</span>
              </div>
            </div>
            <div className={styles.wSkin}>
              {skBar("UVB 홍반", d.uvb / 11, uvbColor(d.uvb), String(d.uvb))}
              {skBar("UVA 노화", d.uva / 11, uvaColor(d.uva), String(d.uva))}
              {skBar("미세먼지", d.pmGrade / 3, PM_GRADE_COLOR[d.pmGrade], PM_GRADE_LABEL[d.pmGrade])}
              {skBar("구름투과율", d.trans == null ? 0 : d.trans, "#2E86C8", d.trans == null ? "–" : `${Math.round(d.trans * 100)}%`)}
            </div>
          </button>
        ))}
      </div>
      <p className={styles.note}>{snap.weekNote}</p>
    </div>
  );
}

/* ───────── §3.2 세로 게이지(관 포맷) ───────── */
// 관 높이·0 기준선 위치(px). 채움은 '기준선 위 영역'만 사용 → 값 0 도 기준선 바로 위에 캡이 붙음.
// 컴팩트 재설계(2026-06-16): 128 → 100px 로 축소(거대해 보임 해소).
const TUBE_H = 100;
const TUBE_BASE = 6; // 바닥에서 0 기준선까지
const TUBE_FILL = TUBE_H - TUBE_BASE - 3; // 기준선 위 가용 높이(상단 3px 여유 — 극단값 캡이 관 밖으로 잘리지 않게)

/** §3.2 세로 게이지 1개(UVB·UVA·미세먼지) — 심각도 배경 그라데이션 재설계.
 *  구성(아래→위):
 *    - tube 배경 = 흰색 + 세로 심각도 그라데이션(.tube CSS, teal→red 연한 틴트). 값 0/낮아도
 *      위쪽 위험축이 붉게 보여 한눈에 읽힘. 0 기준선 아래에도 색이 깔림(허전함 제거).
 *    - 0 기준선(.base)
 *    - 오늘 최고 마커(.peakMark) = 최고값 높이에 가로선, '오늘최고 등급' 심각도색(peakColor).
 *    - 지금 캡(.cur) = 현재값 높이에 두꺼운 가로 캡, '지금 등급' 심각도색(v.color).
 *  텍스트: 위=지금값(크게)+등급 / 아래="오늘 최고 N"(최고등급색) / 맨아래=지표명(크게·진하게). */
function tube(
  key: WeatherKpi["key"],
  label: string,
  v: SkinMetricView,
  nowText: string,
  k: WeatherKpi | undefined,
  emph: string | null,
  onEmph: (k: string) => void,
) {
  const nowFrac = clampFrac(k?.frac ?? 0);
  const peakFrac = clampFrac(k?.peakFrac ?? nowFrac);
  const curH = TUBE_BASE + nowFrac * TUBE_FILL; // cur 캡 중심 높이(0이면 기준선 바로 위)
  const peakH = TUBE_BASE + peakFrac * TUBE_FILL; // 오늘 최고 마커 높이(기준선 기준)
  const peakColor = k?.peakColor ?? v.color; // 오늘최고 등급 색(밤·낮 차이 반영). 없으면 지금색.
  const showPeak = peakFrac > nowFrac + 0.02; // 최고가 지금보다 유의미하게 높을 때만 마커 노출
  const on = emph === key;
  return (
    <button
      type="button"
      key={key}
      className={`${styles.gz} ${on ? styles.gzOn : ""}`}
      style={on ? { borderColor: v.color } : undefined}
      onClick={() => onEmph(key)}
    >
      <span className={styles.gzNow} style={{ color: v.color }}>
        {nowText}
      </span>
      <span className={styles.gzGrade} style={{ color: v.color }}>
        {v.grade}
      </span>
      <span className={styles.tube}>
        {/* 0 기준선. */}
        <i className={styles.base} style={{ bottom: `${TUBE_BASE}px` }} />
        {/* 오늘 최고 마커 — 최고값 높이의 가로선(오늘최고 등급 심각도색). */}
        {showPeak && <i className={styles.peakMark} style={{ bottom: `${peakH}px`, background: peakColor }} />}
        {/* 지금 = 두꺼운 캡(선명한 바 색). */}
        <i className={styles.cur} style={{ bottom: `${curH}px`, background: SEVERITY_BAR[v.step] }} />
      </span>
      <span className={styles.gzPeak}>최고 {k?.peak ?? "–"}</span>
      <span className={styles.gzLab}>{label}</span>
    </button>
  );
}

/** §3.3 구름 = 4번째 세로 게이지(빨강 없이). 같은 관 포맷:
 *  위 얇은 회색 띠 = 구름 차단 N% / 아래 파랑 채움 = 그대로 도달 M%(고정 파랑). 파랑 안에 ↓.
 *  경각심은 색 아닌 3장치: ① "그대로 도달 M%" 문구 ② 라벨에만 ⚠ 액센트(조건부) ③ 작은 차단 vs 큰 도달 대비. */
function cloudTube(reach: number, block: number, warn: boolean, emph: string | null, onEmph: (k: string) => void) {
  const on = emph === "block";
  return (
    <button
      type="button"
      key="block"
      className={`${styles.gz} ${styles.gzCloud} ${on ? styles.gzOn : ""}`}
      style={on ? { borderColor: INFO_BLUE } : undefined}
      onClick={() => onEmph("block")}
    >
      <span className={styles.gzNow} style={{ color: INFO_BLUE }}>
        {reach}%
      </span>
      <span className={`${styles.gzGrade} ${styles.gzReach} ${warn ? styles.gzWarn : ""}`}>
        {warn && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        )}
        그대로 도달
      </span>
      <span className={styles.tube}>
        {/* 위 얇은 회색 띠 = 구름 차단. */}
        <i className={styles.cBlock} style={{ height: `${block}%` }} />
        {/* 아래 파랑 채움 = 그대로 도달(고정 파랑). */}
        <i className={styles.cPass} style={{ height: `${reach}%` }} />
        {/* 파랑 안 ↓ — 자외선이 그대로 내려옴을 암시. */}
        <svg className={styles.cRay} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
          <path d="M12 5v14" />
          <path d="m6 13 6 6 6-6" />
        </svg>
      </span>
      <span className={styles.gzPeak}>구름 차단 {block}%</span>
      <span className={styles.gzLab}>구름 통과</span>
    </button>
  );
}

function skBar(label: string, frac: number, color: string, val: string) {
  return (
    <div className={styles.sk} key={label}>
      <div className={styles.skH}>
        <span className={styles.skN}>{label}</span>
        <span className={styles.skV} style={{ color }}>
          {val}
        </span>
      </div>
      <div className={styles.skBar}>
        <i style={{ width: `${Math.round(clampFrac(frac) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

/* ───────── 시간별 겹쳐보기 그래프 ───────── */

/** Catmull-Rom → 부드러운 베지어 path. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  const t = 0.92;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * t;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * t;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * t;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * t;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/** §3.4 면(area)으로 강조하는 계열 = UVB·UVA. 미세먼지·구름은 회색 얇은 선(토글). */
const AREA_KEYS = new Set(["tanning", "aging"]);

function HourlyGraph({ hours, emph, onEmph }: { hours: WeatherHour[]; emph: string | null; onEmph: (k: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navState = useRef({ canL: false, canR: false });
  const [, force] = useState(0);
  const [selIdx, setSelIdx] = useState(() => nowIndex(hours));
  // §3.4 계열 표시 토글(상태 유지) — UVB·UVA 기본 노출, 미세먼지·구름은 숨김 시작.
  const [shown, setShown] = useState<Record<string, boolean>>({ tanning: true, aging: true, pm: false, block: false });
  const toggle = (k: string) => setShown((s) => ({ ...s, [k]: !s[k] }));
  // 표시 여부 = 토글 on 또는 emph 강조(게이지·사이드바에서 고른 지표는 그래프에서도 보이게).
  const isVisible = (k: string) => shown[k] || emph === k;

  const W = 21;
  const padL = 8;
  const padR = 12;
  const H = 158;
  const plotTop = 30;
  const plotBot = H - 18;
  const plotH = plotBot - plotTop;
  const N = hours.length;
  const totalW = padL + padR + N * W;
  const nowMs = Date.now();
  const todayStr = new Date().toDateString();

  const x = (t: number) => padL + t * W + W / 2;
  const y = (v: number) => plotTop + plotH * (1 - clampN(v, 0, 100) / 100);
  const selX = x(selIdx);

  const updNav = useCallback(() => {
    const g = scrollRef.current;
    if (!g) return;
    const max = g.scrollWidth - g.clientWidth;
    const xpos = g.scrollLeft;
    const canL = xpos > 2;
    const canR = xpos < max - 2 && max > 4;
    if (canL !== navState.current.canL || canR !== navState.current.canR) {
      navState.current = { canL, canR };
      force((v) => v + 1);
    }
  }, []);

  useEffect(() => {
    const g = scrollRef.current;
    if (g && g.clientWidth > 0) g.scrollLeft = Math.max(0, selX - g.clientWidth / 2);
    requestAnimationFrame(updNav);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = scrollRef.current;
    if (!g) return;
    const onScroll = () => updNav();
    g.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updNav);
    const onWheel = (e: WheelEvent) => {
      const max = g.scrollWidth - g.clientWidth;
      if (max <= 0) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      if ((g.scrollLeft <= 0 && d < 0) || (g.scrollLeft >= max && d > 0)) return;
      g.scrollLeft += d;
      e.preventDefault();
    };
    g.addEventListener("wheel", onWheel, { passive: false });
    let down = false;
    let sx = 0;
    let sl = 0;
    let moved = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      down = true;
      moved = 0;
      g.dataset.dragged = "0";
      sx = e.clientX;
      sl = g.scrollLeft;
      g.classList.add(styles.dragging);
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > moved) moved = Math.abs(dx);
      if (moved > 6) g.dataset.dragged = "1";
      g.scrollLeft = sl - dx;
    };
    const onUp = () => {
      if (down) {
        down = false;
        g.classList.remove(styles.dragging);
      }
    };
    g.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      g.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updNav);
      g.removeEventListener("wheel", onWheel);
      g.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updNav]);

  const page = () => Math.max(120, (scrollRef.current?.clientWidth ?? 200) * 0.8);
  const scrollBy = (dir: 1 | -1) => scrollRef.current?.scrollBy({ left: dir * page(), behavior: "smooth" });

  const sel = hours[selIdx];

  const svg = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    const nowPos = Math.max(0, (nowMs - hours[0].t.getTime()) / 3600000);
    const xnBg = Math.min(totalW - padR, padL + nowPos * W + W / 2);
    nodes.push(<rect key="bg" x={padL} y={plotTop - 4} width={Math.max(0, xnBg - padL)} height={plotH + 8} fill="#F2F5F8" />);
    hours.forEach((o, i) => {
      if (o.h === 0) {
        const xx = padL + i * W;
        const lbl = o.t.toDateString() === todayStr ? "오늘" : o.t.getTime() > nowMs ? "내일" : "어제";
        nodes.push(<line key={`m${i}`} x1={xx} y1={plotTop - 4} x2={xx} y2={plotBot + 2} stroke="#E2E8ED" />);
        nodes.push(
          <text key={`ml${i}`} x={xx + 5} y={plotTop - 8} fontSize="9" fill="#A9B4BD" fontWeight="700">
            {lbl}
          </text>,
        );
      }
    });
    nodes.push(<line key="base" x1={padL} y1={plotBot} x2={totalW - padR} y2={plotBot} stroke="#ECEFF2" />);
    // §3.4 — UVB·UVA 면 강조(기본), 미세먼지·구름 회색 얇은 선. 숨긴 계열은 그리지 않음.
    OVERLAYS.forEach((m) => {
      if (!isVisible(m.key)) return;
      const pts = hours.map((o, i) => ({ x: x(i), y: y(m.norm(o)) }));
      const d = smoothPath(pts);
      const area = AREA_KEYS.has(m.key);
      const strong = emph === m.key;
      if (area) {
        // UVB·UVA — 면으로 강조. emph 면 더 진하게.
        nodes.push(<path key={`f${m.key}`} d={`${d} L${pts[N - 1].x.toFixed(1)},${plotBot} L${pts[0].x.toFixed(1)},${plotBot} Z`} fill={m.color} opacity={strong ? 0.14 : 0.09} />);
        nodes.push(<path key={`l${m.key}`} d={d} fill="none" stroke={m.color} strokeWidth={strong ? 3 : 2.4} strokeLinejoin="round" strokeLinecap="round" />);
      } else {
        // 미세먼지·구름 — 회색 얇은 선(토글로 켤 때만). emph 시 본래색으로 또렷하게.
        nodes.push(
          <path key={`l${m.key}`} d={d} fill="none" stroke={strong ? m.color : "#B8C2CC"} strokeWidth={strong ? 2.4 : 1.6} opacity={strong ? 0.95 : 0.85} strokeLinejoin="round" strokeLinecap="round" />,
        );
      }
    });
    const xn = x(nowPos);
    nodes.push(<line key="now" x1={xn} y1={plotTop - 2} x2={xn} y2={plotBot} stroke="#1B2733" strokeWidth="1.3" strokeDasharray="3 3" opacity="0.5" />);
    nodes.push(<line key="sel" x1={selX} y1={plotTop - 2} x2={selX} y2={plotBot} stroke="#5B6B7A" strokeWidth="1.4" />);
    OVERLAYS.forEach((m) => {
      if (!isVisible(m.key)) return;
      nodes.push(<circle key={`d${m.key}`} cx={selX} cy={y(m.norm(sel))} r={emph === m.key ? 5 : 4} fill={m.dot(sel)} stroke="#fff" strokeWidth="1.6" />);
    });
    hours.forEach((o, i) => {
      if (i % 3 === 0) {
        const isNow = o.h === new Date().getHours() && o.t.toDateString() === todayStr;
        nodes.push(
          <text key={`t${i}`} x={x(i)} y={H - 5} fontSize="9.5" fill={isNow ? "#1B2733" : "#9AA6B0"} fontWeight={isNow ? 700 : 500} textAnchor="middle">
            {isNow ? "지금" : `${o.h}시`}
          </text>,
        );
      }
      nodes.push(
        <rect
          key={`h${i}`}
          x={padL + i * W}
          y={plotTop - 4}
          width={W}
          height={plotH + 22}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={() => {
            if (scrollRef.current?.dataset.dragged === "1") return;
            setSelIdx(i);
          }}
        />,
      );
    });
    return nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emph, selIdx, hours, shown]);

  const isNowSel = sel.t.getHours() === new Date().getHours() && sel.t.toDateString() === todayStr;
  const rtime = isNowSel ? "지금" : (sel.t.toDateString() === todayStr ? "" : sel.t.getTime() > nowMs ? "내일 " : "어제 ") + ampm(sel.h);

  return (
    <>
      <div className={styles.readout}>
        <span className={styles.rTime}>{rtime}</span>
        <div className={styles.rKpi}>
          {OVERLAYS.map((m) => {
            const c = m.dot(sel);
            return (
              <button type="button" key={m.key} className={`${styles.rk} ${emph === m.key ? styles.rkOn : ""}`} style={{ borderColor: emph === m.key ? c : "transparent" }} onClick={() => onEmph(m.key)}>
                <span className={styles.rkN}>
                  <i className={styles.rdot} style={{ background: c }} />
                  {m.label}
                </span>
                <span className={styles.rkV} style={{ color: m.key === "pm" ? c : m.color }}>
                  {m.abs(sel)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`${styles.graphwrap} ${navState.current.canL ? styles.canL : ""} ${navState.current.canR ? styles.canR : ""}`}>
        <div className={styles.gscroll} ref={scrollRef}>
          <svg width={totalW} height={H} viewBox={`0 0 ${totalW} ${H}`} style={{ display: "block" }}>
            {svg}
          </svg>
        </div>
        <button type="button" className={`${styles.gnav} ${styles.gnavL}`} aria-label="이전 시간대" disabled={!navState.current.canL} onClick={() => scrollBy(-1)}>
          ‹
        </button>
        <button type="button" className={`${styles.gnav} ${styles.gnavR}`} aria-label="다음 시간대" disabled={!navState.current.canR} onClick={() => scrollBy(1)}>
          ›
        </button>
      </div>

      {/* §3.4 범례 탭 = 계열 표시 토글(상태 유지). UVB·UVA 면 기본 on, 미세먼지·구름 off로 시작. */}
      <div className={styles.legend}>
        {OVERLAYS.map((m) => {
          const vis = isVisible(m.key);
          // 면 계열은 본래색 스와치, 토글 계열(미세먼지·구름)은 켤 때만 색·끄면 회색.
          const sw = AREA_KEYS.has(m.key) ? m.color : vis ? m.color : "#B8C2CC";
          return (
            <button type="button" key={m.key} className={`${styles.lg} ${vis ? "" : styles.lgOff}`} onClick={() => toggle(m.key)} aria-pressed={vis}>
              <span className={styles.ls} style={{ background: sw }} />
              {m.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
