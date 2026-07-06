"use client";

/**
 * OpsCards — 운영 화면 공용 Stat/Tool 카드 (SSOT, C10).
 *
 * AdminView.tsx 하단의 로컬 `Stat`·`Tool` 을 그대로 옮긴 공용 모듈입니다.
 * 관리자 대시보드(/admin)와 병원 운영 프로그램(/clinic)이 같은 카드를 import 해
 * 디자인 드리프트를 0 으로 유지합니다(계획 SSOT §1.5 · C10).
 *
 * 원칙:
 *  - **순수 이동**: 렌더 결과·인라인 스타일(borderRadius 14·`--ink-*`/`--tt-blue-*`/`--line`)·
 *    props 시그니처를 100% 보존합니다. admin 렌더는 불변입니다.
 *  - GRID8/TOOL_GRID 등 그리드 상수는 각 소비처가 자체 관리합니다(카드만 공용).
 */

import Link from "next/link";

/** 숫자 통계 카드. 클릭 가능(href) 하거나 비링크. */
export function Stat({
  label,
  value,
  highlight,
  href,
  title,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  href?: string;
  title?: string;
}) {
  const inner = (
    <>
      <div
        style={{
          whiteSpace: "nowrap",
          fontSize: 11,
          lineHeight: 1.2,
          color: "var(--ink-500)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          whiteSpace: "nowrap",
          fontSize: 20,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          color: highlight ? "var(--tt-blue-deep)" : "var(--ink-900)",
        }}
      >
        {value.toLocaleString()}
      </div>
    </>
  );
  const boxStyle: React.CSSProperties = {
    display: "block",
    overflow: "hidden",
    borderRadius: 14,
    border: `1px solid ${highlight ? "var(--tt-blue-soft)" : "var(--line)"}`,
    background: highlight ? "var(--tt-blue-tint)" : "#fff",
    padding: 12,
  };
  if (href) {
    return (
      <Link href={href} style={boxStyle} title={title}>
        {inner}
      </Link>
    );
  }
  return (
    <div style={boxStyle} title={title}>
      {inner}
    </div>
  );
}

/** 운영 프로그램 진입 카드(emoji + 제목 + 설명 + →). */
export function Tool({
  href,
  emoji,
  title,
  desc,
  highlight,
  prefetch,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  highlight?: boolean;
  /** API endpoint나 사이드 이펙트 있는 라우트는 prefetch={false} 권장 */
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 14,
        border: `1px solid ${highlight ? "var(--tt-blue-soft)" : "var(--line)"}`,
        background: highlight ? "var(--tt-blue-tint)" : "#fff",
        padding: 16,
      }}
    >
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink-900)" }}>
          {title}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: "var(--ink-500)" }}>
          {desc}
        </div>
      </div>
      <span style={{ color: "var(--ink-300)" }}>→</span>
    </Link>
  );
}
