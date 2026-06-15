/**
 * WeatherIllustration — "오늘의 피부 날씨" hero 일러스트 (자체 제작 SVG, 10종).
 *
 * weather-logic 의 weatherIllust() 가 날씨코드+기온에서 파생한 `illust` 1종을 받아 그에 맞는
 *   SVG 를 그린다. 접힌 카드(파란 그라데 배경·흰 글자)와 상세 헤더 양쪽에서 재사용.
 *   - 색은 앱 톤(따뜻한 골드 햇살 + 흰 구름 + 옅은 하늘색 비/눈)으로 통일 — 새 비주얼 언어 없음.
 *   - 64×64 viewBox, 부품(Sun/Cloud/Drop…)을 조합해 중복 없이 구성.
 *   - 장식 요소이므로 aria-hidden. 의미(라벨)는 호출부에서 텍스트로 별도 노출.
 *
 * 프로토타입 HTML 비의존 — 본 컴포넌트가 일러스트의 단일 출처(SSOT).
 */

import type { WeatherIllust } from "./weather-logic";

/* ── 팔레트 (카드 파란 배경에서도, 흰 상세 배경에서도 또렷한 톤) ── */
const C = {
  sun: "#FFD66B", // 햇살 코어
  sunEdge: "#FFC23C", // 햇살 외곽(살짝 진한 골드)
  cloud: "#FFFFFF",
  cloudDim: "#EAF4FB", // 그늘진 구름(맑음→구름 대비용)
  cloudDark: "#CBDCE8", // 폭우/천둥 먹구름
  rain: "#BFE6FF",
  rainDeep: "#8FCDF4",
  snow: "#FFFFFF",
  bolt: "#FFD66B",
  fog: "#FFFFFF",
} as const;

/* ── 재사용 부품 ───────────────────────────────────────── */

/** 햇살: 8방향 광선 + 코어 원. */
function Sun({ cx, cy, r, core = C.sun, ray = C.sunEdge }: { cx: number; cy: number; r: number; core?: string; ray?: string }) {
  const lines = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    lines.push(
      <line
        key={i}
        x1={cx + cos * (r + 3.5)}
        y1={cy + sin * (r + 3.5)}
        x2={cx + cos * (r + 8.5)}
        y2={cy + sin * (r + 8.5)}
        stroke={ray}
        strokeWidth={2.4}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <g>
      {lines}
      <circle cx={cx} cy={cy} r={r} fill={core} />
    </g>
  );
}

/** 구름: 겹친 원 3개 + 둥근 베이스. cx/cy 는 구름 중심. */
function Cloud({ cx, cy, s = 1, fill = C.cloud, opacity = 1 }: { cx: number; cy: number; s?: number; fill?: string; opacity?: number }) {
  return (
    <g fill={fill} opacity={opacity} transform={`translate(${cx} ${cy}) scale(${s})`}>
      <circle cx={-9} cy={2} r={8} />
      <circle cx={1.5} cy={-4.5} r={11} />
      <circle cx={12} cy={2} r={8} />
      <rect x={-17} y={1.5} width={30} height={12} rx={6} />
    </g>
  );
}

/** 빗방울 한 줄. */
function Drop({ x, y, len = 7, color = C.rain }: { x: number; y: number; len?: number; color?: string }) {
  return <line x1={x} y1={y} x2={x} y2={y + len} stroke={color} strokeWidth={2.6} strokeLinecap="round" />;
}

/** 눈송이(단순 점). */
function Flake({ x, y, r = 2.3, color = C.snow }: { x: number; y: number; r?: number; color?: string }) {
  return <circle cx={x} cy={y} r={r} fill={color} />;
}

/* ── 장면별 일러스트 ───────────────────────────────────── */

function Clear() {
  return <Sun cx={32} cy={30} r={13} />;
}

function Cloudy() {
  return (
    <g>
      <Sun cx={22} cy={22} r={9} />
      <Cloud cx={36} cy={38} s={1.05} />
    </g>
  );
}

function Rain() {
  return (
    <g>
      <Cloud cx={32} cy={26} s={1.05} />
      <Drop x={22} y={42} />
      <Drop x={32} y={45} />
      <Drop x={42} y={42} />
    </g>
  );
}

function Shower() {
  return (
    <g>
      <Sun cx={20} cy={20} r={8} />
      <Cloud cx={36} cy={28} s={1} />
      <Drop x={28} y={44} color={C.rain} />
      <Drop x={38} y={46} color={C.rain} />
      <Drop x={47} y={44} color={C.rain} />
    </g>
  );
}

function HeavyRain() {
  return (
    <g>
      <Cloud cx={32} cy={24} s={1.12} fill={C.cloudDark} />
      <Drop x={20} y={40} len={9} color={C.rainDeep} />
      <Drop x={28} y={43} len={9} color={C.rainDeep} />
      <Drop x={36} y={40} len={9} color={C.rainDeep} />
      <Drop x={44} y={43} len={9} color={C.rainDeep} />
    </g>
  );
}

function Snow() {
  return (
    <g>
      <Cloud cx={32} cy={26} s={1.05} />
      <Flake x={22} y={44} />
      <Flake x={32} y={48} />
      <Flake x={42} y={44} />
    </g>
  );
}

function Thunder() {
  return (
    <g>
      <Cloud cx={32} cy={24} s={1.12} fill={C.cloudDark} />
      <path d="M33 37 L25 50 H31 L28 60 L40 45 H33 L37 37 Z" fill={C.bolt} stroke="#F4A93C" strokeWidth={0.6} strokeLinejoin="round" />
    </g>
  );
}

function Fog() {
  return (
    <g>
      <Sun cx={32} cy={22} r={9} />
      <g stroke={C.fog} strokeWidth={3.4} strokeLinecap="round" opacity={0.95}>
        <line x1={16} y1={38} x2={48} y2={38} />
        <line x1={13} y1={45} x2={45} y2={45} />
        <line x1={19} y1={52} x2={51} y2={52} />
      </g>
    </g>
  );
}

function Heat() {
  // 강한 햇살 + 아래로 피어오르는 열기(물결선).
  return (
    <g>
      <Sun cx={32} cy={26} r={13} ray="#FF9E3D" />
      <g stroke="#FF9E3D" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.9}>
        <path d="M22 48 q3 -4 0 -8" />
        <path d="M32 50 q3 -4 0 -8" />
        <path d="M42 48 q3 -4 0 -8" />
      </g>
    </g>
  );
}

function Cold() {
  // 차가운 청색 톤 6각 눈결정.
  const arms = [];
  const cx = 32;
  const cy = 32;
  const len = 15;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const x2 = cx + Math.cos(a) * len;
    const y2 = cy + Math.sin(a) * len;
    arms.push(<line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="#CDE9FB" strokeWidth={2.6} strokeLinecap="round" />);
    // 잔가지
    const bx = cx + Math.cos(a) * (len * 0.6);
    const by = cy + Math.sin(a) * (len * 0.6);
    arms.push(
      <line key={`b${i}a`} x1={bx} y1={by} x2={bx + Math.cos(a + 0.6) * 5} y2={by + Math.sin(a + 0.6) * 5} stroke="#CDE9FB" strokeWidth={2} strokeLinecap="round" />,
      <line key={`b${i}b`} x1={bx} y1={by} x2={bx + Math.cos(a - 0.6) * 5} y2={by + Math.sin(a - 0.6) * 5} stroke="#CDE9FB" strokeWidth={2} strokeLinecap="round" />,
    );
  }
  return (
    <g>
      {arms}
      <circle cx={cx} cy={cy} r={3} fill="#EAF6FF" />
    </g>
  );
}

const SCENE: Record<WeatherIllust, () => React.ReactElement> = {
  맑음: Clear,
  구름: Cloudy,
  비: Rain,
  소나기: Shower,
  폭우: HeavyRain,
  눈: Snow,
  천둥: Thunder,
  안개: Fog,
  폭염: Heat,
  한파: Cold,
};

export default function WeatherIllustration({
  illust,
  size = 64,
  className,
}: {
  illust: WeatherIllust;
  size?: number;
  className?: string;
}) {
  const Scene = SCENE[illust] ?? Cloudy;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden role="img" focusable="false">
      <Scene />
    </svg>
  );
}
