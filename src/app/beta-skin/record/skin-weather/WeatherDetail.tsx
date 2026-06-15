"use client";

/**
 * WeatherDetail — "오늘의 피부 날씨" 상세 본문 (위치·온도 레인지·습도 헤더 + 4 KPI 게이지 +
 *   한 줄 팁 + 시간별 겹쳐보기 그래프 + 주간). /record/weather 페이지에서 사용.
 *   과학 로직은 weather-logic.ts. 지표는 절대값이 아니라 '최대값 대비 현재 위치(게이지)'로 표현.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./skin-weather.module.css";
import {
  OVERLAYS,
  PM_GRADE_COLOR,
  PM_GRADE_LABEL,
  ampm,
  nowIndex,
  type WeatherHour,
  type WeatherSnapshot,
} from "./weather-logic";

const clampFrac = (v: number) => Math.max(0, Math.min(1, v));
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function WeatherDetail({ snap }: { snap: WeatherSnapshot }) {
  const [emph, setEmph] = useState<string | null>(null);
  const toggleEmph = (k: string) => setEmph((v) => (v === k ? null : k));

  return (
    <div className={styles.detail}>
      {/* 헤더 — 위치 + 현재 기온 + 오늘 최저~최고 레인지(현재 위치) + 습도 */}
      <div className={styles.dHead}>
        <span className={styles.dLoc}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {snap.name}
        </span>
        <div className={styles.dTempRow}>
          <span className={styles.dTemp}>{snap.temp}°</span>
          <span className={styles.dCond}>
            {snap.cond}
            <b>체감 {snap.feels}°</b>
          </span>
        </div>
        {/* 온도·습도는 숫자만(게이지 없음) — 피부 관점에서 보조 정보. */}
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

      <div className={styles.kpis}>
        {snap.kpis.map((k) => (
          <button
            type="button"
            key={k.key}
            className={`${styles.kpi} ${emph === k.key ? styles.kpiOn : ""}`}
            style={emph === k.key ? { borderColor: k.color } : undefined}
            onClick={() => toggleEmph(k.key)}
          >
            <span className={styles.kpiTop}>
              <span className={styles.kpiN}>{k.label}</span>
              <span className={styles.kpiLv} style={{ color: k.color }}>
                {k.level}
              </span>
            </span>
            <span className={styles.kpiBig} style={{ color: k.color }}>
              {k.value}
            </span>
            {kpiGauge(k.frac, k.color, k.seg)}
            <span className={styles.kpiScale}>
              <span>{k.minLabel}</span>
              <span>{k.maxLabel}</span>
            </span>
            <span className={styles.kpiSub}>{k.sub}</span>
          </button>
        ))}
      </div>

      <div className={styles.tip}>{snap.tip}</div>

      <div className={styles.gcard}>
        <div className={styles.gttl}>
          시간별 흐름 <span>과거 24시간 ~ 향후 24시간</span>
        </div>
        <HourlyGraph hours={snap.hours} emph={emph} onEmph={toggleEmph} />
      </div>

      <div className={styles.secTitle}>주간 피부 날씨</div>
      <div className={styles.week}>
        {snap.days.map((d, i) => (
          <div className={`${styles.wday} ${d.isToday ? styles.wToday : ""}`} key={i}>
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
                  <i style={{ left: `${d.rangeLeft.toFixed(0)}%`, width: `${Math.max(8, d.rangeWidth).toFixed(0)}%` }} />
                </span>
                <span className={styles.wHi}>{d.tMax}°</span>
              </div>
            </div>
            <div className={styles.wSkin}>
              {skBar("UVB 홍반", d.uvb / 11, "#E0382E", String(d.uvb))}
              {skBar("UVA 노화", d.uva / 11, "#B45CB0", String(d.uva))}
              {skBar("미세먼지", d.pmGrade / 3, PM_GRADE_COLOR[d.pmGrade], PM_GRADE_LABEL[d.pmGrade])}
              {skBar("구름투과", d.trans == null ? 0 : d.trans, "#3C8CC8", d.trans == null ? "–" : `${Math.round(d.trans * 100)}%`)}
            </div>
          </div>
        ))}
      </div>
      <p className={styles.note}>{snap.weekNote}</p>
    </div>
  );
}

/** KPI 카드용 게이지 — 트랙 + 채움 + 현재 위치 마커. seg 가 있으면 구간 눈금. */
function kpiGauge(frac: number, color: string, seg?: number) {
  const pct = Math.round(clampFrac(frac) * 100);
  return (
    <span className={styles.kpiGauge}>
      <span className={styles.kpiTrack}>
        <i className={styles.kpiFill} style={{ width: `${pct}%`, background: color }} />
        {seg
          ? Array.from({ length: seg - 1 }, (_, i) => (
              <span key={i} className={styles.kpiTick} style={{ left: `${((i + 1) / seg) * 100}%` }} />
            ))
          : null}
        <i className={styles.kpiMarker} style={{ left: `${pct}%`, borderColor: color }} />
      </span>
    </span>
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
              <button type="button" key={m.key} className={styles.rk} style={{ borderColor: emph === m.key ? c : "transparent" }} onClick={() => onEmph(m.key)}>
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
