"use client";

/**
 * WeatherDetail — "오늘의 피부 날씨" 상세 본문 (위치·일러스트·기상특보 배지·온도 레인지·습도 헤더 +
 *   6 KPI 세로 게이지 + 한 줄 팁 + 시간별 겹쳐보기 그래프 + 주간). /record/weather 페이지에서 사용.
 *   과학 로직은 weather-logic.ts. 지표는 절대값이 아니라 '최대값 대비 현재 위치(게이지)'로 표현.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./skin-weather.module.css";
import WeatherIllustration from "./WeatherIllustration";
import {
  OVERLAYS,
  ampm,
  colorWeek,
  nowIndex,
  sevPm25,
  sevUva,
  sevUvb,
  type WeatherHour,
  type WeatherKpi,
  type WeatherSnapshot,
} from "./weather-logic";

const clampFrac = (v: number) => Math.max(0, Math.min(1, v));
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

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

      {/* 핵심 4 KPI 세로 게이지만 — 기온은 헤더로(게이지에서 제외). 강수확률은 표시 안 함. */}
      <div className={styles.kpis}>
        {snap.kpis
          .filter((k) => k.key !== "temp")
          .map((k) => (
          <button
            type="button"
            key={k.key}
            className={`${styles.kpi} ${emph === k.key ? styles.kpiOn : ""}`}
            style={emph === k.key ? { borderColor: k.color } : undefined}
            onClick={() => onEmph(k.key)}
          >
            <span className={styles.kpiBig} style={{ color: k.color }}>
              {k.value}
            </span>
            {vGauge(k)}
            <span className={styles.kpiN}>{k.label}</span>
            <span className={styles.kpiMeta}>
              {k.level && (
                <span className={styles.kpiLv} style={{ color: k.color }}>
                  {k.level}
                </span>
              )}
              {k.peak != null ? (
                <span className={styles.kpiPeakWrap}>
                  최고{" "}
                  <b className={styles.kpiPeakVal} style={{ color: k.peakColor ?? k.color }}>
                    {k.peak}
                  </b>
                </span>
              ) : (
                <span className={styles.kpiSub}>{k.sub}</span>
              )}
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
          <div className={`${styles.wkRow} ${d.isToday ? styles.wkToday : ""}`} key={i}>
            {/* 좌측 — 큰 날짜 */}
            <div className={styles.wkDate}>
              <span className={styles.wkD}>{d.label}</span>
              <span className={styles.wkMd}>{d.md}</span>
            </div>
            {/* 우측 — 2줄: (윗줄) 날씨·강수·온도 / (아랫줄) 정사각 4박스 */}
            <div className={styles.wkBody}>
              <div className={styles.wkLine1}>
                <span className={styles.wkEmoji}>{d.emoji}</span>
                {/* 강수확률(💧) 표시 제거 — 사용자 결정 2026-06-16. */}
                <span className={styles.wkTemp}>
                  <span className={styles.wkLo}>{d.tMin}°</span>
                  <span className={styles.wkRange}>
                    <i style={{ left: `${d.rangeLeft.toFixed(0)}%`, width: `${Math.max(8, d.rangeWidth).toFixed(0)}%`, background: d.tColor }} />
                  </span>
                  <span className={styles.wkHi}>{d.tMax}°</span>
                </span>
              </div>
              <div className={styles.wkBoxes}>
                {wkBox("UVB 태닝", String(d.uvb ?? 0), colorWeek(sevUvb(d.uvb ?? 0)))}
                {wkBox("UVA 노화", String(d.uva ?? 0), colorWeek(sevUva(d.uva ?? 0)))}
                {wkBox("미세먼지", String(d.pm25 ?? 0), colorWeek(sevPm25(d.pm25 ?? 0)))}
                {/* 구름투과율은 위험도(빨강)가 아니라 정보값 → 파란색 고정. */}
                {wkBox("구름투과율", d.trans == null ? "–" : `${Math.round(d.trans * 100)}`, "#2E86C8")}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className={styles.note}>{snap.weekNote}</p>
    </div>
  );
}

/** 세로 막대 게이지 — 아래(0)에서 위로 채움. 지표 타입별:
 *   - 연속 채움(공통): frac 만큼 단색 채움.
 *   - UVB/UVA(peakFrac): 현재까지 진한 채움 + 오늘 최고까지 연한 채움 + 최고 지점 고스트 캡(외곽선).
 *   - 미세먼지(seg): seg 단계 세그먼트 구분선(가로).
 *   - 기온(rangeLoFrac~rangeHiFrac): 막대 중간에 떠 있는 범위 캡슐 + 0/max 눈금.
 *   게이지는 장식이며 의미는 텍스트(값·레벨·sub)로 전달. */
function vGauge(k: WeatherKpi) {
  const pct = Math.round(clampFrac(k.frac) * 100);
  const isRange = k.rangeLoFrac != null && k.rangeHiFrac != null;
  const loPct = isRange ? Math.round(clampFrac(k.rangeLoFrac!) * 100) : 0;
  const hiPct = isRange ? Math.round(clampFrac(k.rangeHiFrac!) * 100) : 0;
  const peakPct = k.peakFrac != null ? Math.round(clampFrac(k.peakFrac) * 100) : null;

  return (
    <span className={styles.vGauge}>
      <span className={styles.vTrack}>
        {isRange ? (
          /* 기온 — 최저~최고 범위 캡슐(막대 중간에 부유). */
          <i
            className={styles.vRange}
            style={{ bottom: `${loPct}%`, height: `${Math.max(3, hiPct - loPct)}%`, background: k.color }}
          />
        ) : (
          <>
            {/* UVB/UVA — 오늘 최고까지 연한 채움(현재 채움 뒤). */}
            {peakPct != null && peakPct > pct && (
              <i className={styles.vPeakFill} style={{ height: `${peakPct}%`, background: k.peakColor ?? k.color }} />
            )}
            {/* 현재까지 진한 채움. */}
            <i className={styles.vFill} style={{ height: `${pct}%`, background: k.color }} />
            {/* 미세먼지 — seg 단계 구분선. */}
            {k.seg
              ? Array.from({ length: k.seg - 1 }, (_, i) => (
                  <span key={i} className={styles.vTick} style={{ bottom: `${((i + 1) / k.seg!) * 100}%` }} />
                ))
              : null}
            {/* UVB/UVA — 오늘 최고 지점 고스트 캡(외곽선). */}
            {peakPct != null && peakPct > pct && (
              <i className={styles.vPeakCap} style={{ bottom: `${peakPct}%`, borderColor: k.peakColor ?? k.color }} />
            )}
          </>
        )}
      </span>
    </span>
  );
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

/** 주간 정사각 박스 — 큰 숫자 + 라벨. 칸 배경(연)·숫자·라벨 모두 같은 색(위험도/정보색). 테두리 없음. */
function wkBox(label: string, num: string, color: string) {
  return (
    <div className={styles.wkBox} key={label} style={{ background: hexA(color, 0.17) }}>
      <span className={styles.wkBoxN} style={{ color }}>
        {num}
      </span>
      <span className={styles.wkBoxL} style={{ color }}>
        {label}
      </span>
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
