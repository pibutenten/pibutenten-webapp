"use client";

/**
 * WeatherDetail — "오늘의 피부 날씨" 상세 본문 (위치·일러스트·기상특보 배지·온도 레인지·습도 헤더 +
 *   파란 헤드라인 글상자 + 3 KPI 가로 게이지(UVB·UVA·미세먼지) + 한 줄 팁 + 시간별 겹쳐보기 그래프 + 주간).
 *   /record/weather 페이지에서 사용.
 *   과학 로직은 weather-logic.ts. 지표는 절대값이 아니라 '최대값 대비 현재 위치(게이지)'로 표현.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./skin-weather.module.css";
import WeatherIllustration from "./WeatherIllustration";
import {
  OVERLAYS,
  ampm,
  clamp,
  nowIndex,
  pmColor,
  pmText,
  uvaColor,
  uvaText,
  uvbColor,
  uvbText,
  type WeatherHour,
  type WeatherKpi,
  type WeatherSnapshot,
} from "./weather-logic";

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
  /* 구름투과율(block) — KPI 카드에선 제외하지만 헤더 보조 숫자로 노출. */
  const block = snap.kpis.find((k) => k.key === "block");
  return (
    <div className={styles.detail}>
      {/* 히어로(파란 그라데이션) — 헤드라인 최상단, 기온·상태 좌측 / 일러스트·최저최고습도 우측. */}
      <div className={styles.dHead}>
        <span className={styles.dLoc}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {snap.name}
        </span>

        {/* 헤드라인 — 히어로 최상단의 두 줄 카피(흰 글씨). */}
        {snap.headline && <p className={styles.dMsg}>{snap.headline}</p>}

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
          {/* 좌: 큰 기온 + 상태(맑음/체감/구름투과율) */}
          <div className={styles.dTempRow}>
            <span className={styles.dTemp}>{snap.temp}°C</span>
            <span className={styles.dCond}>
              {snap.cond}
              <b>체감 {snap.feels}°C</b>
              {block && <b>구름투과율 {block.value}</b>}
            </span>
          </div>
          {/* 우: 일러스트 + 최저/최고 + 습도 (reference: "20°C / 31°C" 한 줄 · "습도 40%" 한 줄). */}
          <div className={styles.dRight}>
            <WeatherIllustration illust={snap.illust} size={48} className={styles.dHero} />
            <div className={styles.dMetrics}>
              <span className={styles.metric}>
                <b>{snap.todayMin}°C</b> / <b>{snap.todayMax}°C</b>
              </span>
              <span className={styles.metric}>
                습도 <b>{snap.humidity}%</b>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 핵심 3 KPI — UVB 태닝·UVA 노화·미세먼지. 각 지표를 한 행씩(전체 너비) 노출.
          기온·구름투과율은 제외. 한 행 = (헤더) 라벨+sub 좌 / 등급 우 · (본문) 스펙트럼 게이지 + 큰 값 우. */}
      <div className={styles.kpis}>
        {snap.kpis
          .filter((k) => k.key !== "temp" && k.key !== "block")
          .map((k) => (
          <button
            type="button"
            key={k.key}
            className={`${styles.kpi} ${emph === k.key ? styles.kpiOn : ""}`}
            style={emph === k.key ? { borderColor: k.color } : undefined}
            onClick={() => onEmph(k.key)}
          >
            {/* 헤더 — 라벨(+최고/sub) 좌 · 등급 우(지표색). */}
            <span className={styles.kpiHead}>
              <span className={styles.kpiHeadL}>
                <span className={styles.kpiN}>{k.label}</span>
                {k.peak != null ? (
                  <span className={styles.kpiPeakWrap}>
                    최고{" "}
                    <b className={styles.kpiPeakVal} style={{ color: k.peakTextColor ?? k.textColor }}>
                      {k.peak}
                    </b>
                  </span>
                ) : k.sub ? (
                  <span className={styles.kpiSub}>{k.sub}</span>
                ) : null}
              </span>
              {k.level && (
                <span className={styles.kpiLv} style={{ color: k.textColor }}>
                  {k.level}
                </span>
              )}
            </span>
            {/* 본문 — 스펙트럼 게이지(가변폭) + 현재값(큰 숫자, 지표색). */}
            <span className={styles.kpiBody}>
              {vGauge(k)}
              <span className={styles.kpiBig} style={{ color: k.textColor }}>
                {k.value}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className={styles.gcard}>
        <div className={styles.gttl}>
          시간별 흐름 <span>과거 24시간 ~ 향후 24시간</span>
        </div>
        <HourlyGraph hours={snap.hours} emph={emph} onEmph={onEmph} />
      </div>

      <div className={styles.secTitle}>주간 피부 날씨</div>
      <div className={styles.week}>
        {snap.days.map((d, i) => (
          <div className={styles.wkRow} key={i}>
            {/* 좌측 — 큰 날짜 */}
            <div className={styles.wkDate}>
              <span className={styles.wkD}>{d.label}</span>
              <span className={styles.wkMd}>{d.md}</span>
            </div>
            {/* 우측 — 2줄: (윗줄) 날씨·온도(기온은 여기 애플바로 표현) / (아랫줄) 박스 4개(UVB·UVA·미세먼지·강수확률).
                라벨은 오늘 행에만 노출(아래 행은 위 라벨과 같은 열 정렬이라 중복 생략). */}
            <div className={styles.wkBody}>
              <div className={styles.wkLine1}>
                <span className={styles.wkEmoji}>{d.emoji}</span>
                {/* 강수확률(💧) 표시 제거 — 사용자 결정 2026-06-16. */}
                <span className={styles.wkTemp}>
                  <span className={styles.wkLo}>{d.tMin}°</span>
                  <span className={styles.wkRange}>
                    <i style={{ left: `${d.rangeLeft.toFixed(0)}%`, width: `${Math.max(8, d.rangeWidth).toFixed(0)}%`, background: `linear-gradient(90deg, ${d.tColorLo}, ${d.tColorHi})` }} />
                  </span>
                  <span className={styles.wkHi}>{d.tMax}°</span>
                </span>
              </div>
              <div className={styles.wkBoxes}>
                {/* 대기질(UV/PM) 예보가 없는 날(주 후반)은 null → "–" 중립 회색. */}
                {d.uvb == null
                  ? wkBox("UVB 태닝", "–", "#9AA5B1", "#9AA5B1", d.isToday)
                  : wkBox("UVB 태닝", String(d.uvb), uvbColor(d.uvb), uvbText(d.uvb), d.isToday)}
                {d.uva == null
                  ? wkBox("UVA 노화", "–", "#9AA5B1", "#9AA5B1", d.isToday)
                  : wkBox("UVA 노화", String(d.uva), uvaColor(d.uva), uvaText(d.uva), d.isToday)}
                {d.pm25 == null || d.pmGrade == null
                  ? wkBox("미세먼지", "–", "#9AA5B1", "#9AA5B1", d.isToday)
                  : wkBox("미세먼지", String(d.pm25), pmColor(d.pmGrade), pmText(d.pmGrade), d.isToday)}
                {/* 강수확률 — 정보값 → 파란색. */}
                {wkBox("강수확률", d.rainProb == null ? "–" : `${Math.round(d.rainProb)}%`, "#2E86C8", "#1E6FB0", d.isToday)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className={styles.note}>{snap.weekNote}</p>
    </div>
  );
}

/** 가로 스펙트럼 게이지 — 한 막대에 두 지점을 표현. 트랙에 안전(초록)→위험(빨강) 스펙트럼을 깔고:
 *   ① 0~현재값(frac): 진한 스펙트럼(현재 도달). ② 현재값~오늘 최고치(peakFrac): 같은 스펙트럼을
 *   흰 베일(.vBright)로 살짝 밝게(오늘 더 오를 구간). ③ 최고치 이후: 회색 마스크(.vMask, 미도달).
 *   현재값 위치=세로 마커(.vMarker, 현재 색 어둡게), 최고치 위치=위험도 색 테두리 동그라미(.vPeak).
 *   게이지는 장식이며 의미는 텍스트(값·등급)로 전달. UVB·UVA·미세먼지 공통. */
function vGauge(k: WeatherKpi) {
  const pct = Math.round(clamp(k.frac, 0, 1) * 100);
  const peakPct = Math.round(clamp(k.peakFrac ?? 0, 0, 1) * 100);
  // 최고치 표식은 peakFrac 가 있고, 현재 수치보다 의미 있게 오른쪽일 때만 — 같거나 더 왼쪽이면 현재값까지만.
  const showPeak = k.peakFrac != null && peakPct > pct + 1;
  // 회색(미도달) 마스크 시작점: 최고치를 표시하면 최고치 이후, 아니면 현재값 이후.
  const maskFrom = showPeak ? peakPct : pct;
  return (
    <span className={styles.vGauge}>
      <span className={styles.vTrack}>
        {showPeak && <i className={styles.vBright} style={{ left: `${pct}%`, right: `${100 - peakPct}%` }} />}
        <i className={styles.vMask} style={{ left: `${maskFrom}%` }} />
        {showPeak && (
          <i className={styles.vPeak} style={{ left: `${peakPct}%`, borderColor: k.peakColor ?? k.color }} />
        )}
        <i className={styles.vMarker} style={{ left: `${pct}%`, background: darken(k.color, 0.72) }} />
      </span>
    </span>
  );
}

/** #RRGGBB 를 어둡게(factor<1) — 마커 핀이 스펙트럼 채움보다 진하게 보이도록. 잘못된 입력은 중립 슬레이트. */
function darken(hex: string, factor: number): string {
  if (typeof hex !== "string" || hex[0] !== "#" || hex.length < 7) return "#2f3b47"; // 슬레이트: 어떤 배경에도 보이는 중립 핀
  const h = hex.slice(1);
  const r = Math.round(parseInt(h.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

/** #RRGGBB → rgba(연한 칸 배경용). 잘못된 입력은 중립 회색 폴백(옛 캐시·undefined 방어). */
function hexA(hex: string, a: number): string {
  if (typeof hex !== "string" || hex[0] !== "#" || hex.length < 7) return `rgba(154, 165, 177, ${a})`;
  const h = hex.slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 주간 정사각 박스 — 큰 숫자 + 라벨. 배경=fill 틴트(연), 숫자·라벨=text(가독 진한색).
 *  노랑처럼 밝은 fill 은 글씨가 안 보이므로 text 를 분리해 진하게(매우나쁨 text 는 나쁨보다 훨씬 진함). */
function wkBox(label: string, num: string, fill: string, text: string, showLabel: boolean) {
  return (
    <div className={styles.wkBox} key={label} style={{ background: hexA(fill, 0.17) }}>
      <span className={styles.wkBoxN} style={{ color: text }}>
        {num}
      </span>
      {showLabel && (
        <span className={styles.wkBoxL} style={{ color: text }}>
          {label}
        </span>
      )}
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

function HourlyGraph({ hours, emph, onEmph }: { hours: WeatherHour[]; emph: string | null; onEmph: (k: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navState = useRef({ canL: false, canR: false });
  const [, force] = useState(0);
  const [selIdx, setSelIdx] = useState(() => nowIndex(hours));

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
  const y = (v: number) => plotTop + plotH * (1 - clamp(v, 0, 100) / 100);
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
    const nowPos = hours.length ? Math.max(0, (nowMs - hours[0].t.getTime()) / 3600000) : 0;
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
    OVERLAYS.forEach((m) => {
      const dim = emph && emph !== m.key;
      const pts = hours.map((o, i) => ({ x: x(i), y: y(m.norm(o)) }));
      const d = smoothPath(pts);
      if (emph === m.key) {
        nodes.push(<path key={`f${m.key}`} d={`${d} L${pts[N - 1].x.toFixed(1)},${plotBot} L${pts[0].x.toFixed(1)},${plotBot} Z`} fill={m.color} opacity="0.07" />);
        nodes.push(<path key={`l${m.key}`} d={d} fill="none" stroke={m.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />);
      } else {
        nodes.push(
          <path key={`l${m.key}`} d={d} fill="none" stroke={m.color} strokeWidth={dim ? 1.6 : 2.4} opacity={dim ? 0.3 : 0.95} strokeLinejoin="round" strokeLinecap="round" />,
        );
      }
    });
    const xn = x(nowPos);
    nodes.push(<line key="now" x1={xn} y1={plotTop - 2} x2={xn} y2={plotBot} stroke="#1B2733" strokeWidth="1.3" strokeDasharray="3 3" opacity="0.5" />);
    nodes.push(<line key="sel" x1={selX} y1={plotTop - 2} x2={selX} y2={plotBot} stroke="#5B6B7A" strokeWidth="1.4" />);
    OVERLAYS.forEach((m) => {
      if (emph && emph !== m.key) return;
      nodes.push(<circle key={`d${m.key}`} cx={selX} cy={y(m.norm(sel))} r={emph === m.key ? 5.5 : 4.5} fill="#fff" stroke={m.dot(sel)} strokeWidth={emph === m.key ? 3 : 2.4} />);
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
  }, [emph, selIdx, hours]);

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
                <span className={styles.rkN}>{m.label}</span>
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

      <div className={styles.legend}>
        {OVERLAYS.map((m) => (
          <button type="button" key={m.key} className={styles.lg} style={{ opacity: !emph || emph === m.key ? 1 : 0.4 }} onClick={() => onEmph(m.key)}>
            <span className={styles.ls} style={{ background: m.color }} />
            {m.label}
          </button>
        ))}
      </div>
    </>
  );
}
