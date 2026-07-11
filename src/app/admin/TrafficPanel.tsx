"use client";

/**
 * TrafficPanel — 유입 분석(Acquisition) 위젯 (admin 대시보드, 구 리서치 패널 대체 2026-07-11).
 *
 * traffic_landings 를 get_traffic_overview 로 집계한 값(기간별 prefetch)을 받아
 * 채널 분포·상위 유입처·상위 랜딩·기기/OS·캠페인을 보여준다. 기간 토글은 클라 state.
 *
 * ⚠ "무슨 검색어로 찾았는지"(오가닉 검색어)는 여기 없음 — 검색엔진이 안 넘겨줌(Google Search
 *    Console / 네이버 서치어드바이저 전용). 하단에 그 안내를 링크로 노출.
 */

import { useState } from "react";
import { EMPTY_TRAFFIC, type TrafficOverview } from "@/lib/traffic-types";

const PERIODS: { d: number; label: string }[] = [
  { d: 1, label: "24시간" },
  { d: 7, label: "7일" },
  { d: 30, label: "30일" },
  { d: 90, label: "90일" },
  { d: 365, label: "1년" },
  { d: 0, label: "전체" },
];

// 채널 코드 → 한글 라벨 + 색(검색=초록 / SNS=보라 / 메신저=노랑 / 직접·기타=회색).
const CHANNEL: Record<string, { label: string; color: string }> = {
  search_google: { label: "구글 검색", color: "#1a9e6a" },
  search_naver: { label: "네이버 검색", color: "#12b886" },
  search_daum: { label: "다음/카카오 검색", color: "#20c997" },
  search_bing: { label: "빙 검색", color: "#37b24d" },
  social_instagram: { label: "인스타그램", color: "#7048e8" },
  social_youtube: { label: "유튜브", color: "#e8590c" },
  social_facebook: { label: "페이스북", color: "#4263eb" },
  social_x: { label: "X(트위터)", color: "#495057" },
  social_threads: { label: "스레드", color: "#343a40" },
  messenger_kakao: { label: "카카오톡", color: "#f2b705" },
  messenger_line: { label: "라인", color: "#40c057" },
  referral: { label: "기타 사이트", color: "#868e96" },
  direct: { label: "직접 방문", color: "#adb5bd" },
  app: { label: "앱", color: "#1c7ed6" },
  internal: { label: "사이트 내부", color: "#ced4da" },
};

const DEVICE_LABEL: Record<string, string> = { mobile: "모바일", tablet: "태블릿", desktop: "데스크탑", unknown: "미상" };
const OS_LABEL: Record<string, string> = { ios: "iOS", android: "Android", windows: "Windows", macos: "macOS", other: "기타" };
const INAPP_LABEL: Record<string, string> = { kakaotalk: "카카오톡 인앱", instagram: "인스타 인앱", facebook: "페북 인앱", naver: "네이버 인앱", line: "라인 인앱" };

/** URL 인코딩된 경로를 한글 등 원문으로 디코딩해 표시(예: /topics/%EC%A0%9C%EB%AA%A8 → /topics/제모). */
function decodePath(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "#fff", padding: 14 }}>
      {children}
    </div>
  );
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-500)", marginBottom: 10 }}>{children}</div>;
}

export default function TrafficPanel({ dataByDays }: { dataByDays: Record<number, TrafficOverview> }) {
  const [days, setDays] = useState(30);
  const t = dataByDays[days] ?? EMPTY_TRAFFIC;
  const total = t?.total ?? 0;
  const maxChannel = Math.max(1, ...(t?.by_channel ?? []).map((c) => c.count));

  const chip = (active: boolean): React.CSSProperties => ({
    borderRadius: 999,
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid " + (active ? "transparent" : "var(--line)"),
    background: active ? "var(--tt-blue)" : "#fff",
    color: active ? "#fff" : "var(--ink-500)",
  });

  return (
    <div>
      {/* 기간 토글 + 총 진입 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PERIODS.map((p) => (
            <button key={p.d} type="button" onClick={() => setDays(p.d)} style={chip(days === p.d)}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--ink-500)" }}>
          총 진입 <b style={{ color: "var(--ink-900)", fontVariantNumeric: "tabular-nums" }}>{total.toLocaleString()}</b>
        </div>
      </div>

      {total === 0 ? (
        <Card>
          <div style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6 }}>
            아직 유입 데이터가 쌓이는 중입니다. 배포 직후부터 방문 세션의 첫 진입이 채널별로 집계됩니다
            (재방문·SPA 내부 이동은 제외). 잠시 뒤 다시 확인해 주세요.
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {/* 채널 분포 — 막대 */}
          <Card>
            <SubHead>채널 (어떻게 들어왔나)</SubHead>
            <div style={{ display: "grid", gap: 8 }}>
              {(t.by_channel ?? []).map((c) => {
                const meta = CHANNEL[c.channel] ?? { label: c.channel, color: "#868e96" };
                return (
                  <div key={c.channel} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 108, flexShrink: 0, fontSize: 12.5, color: "var(--ink-700)" }}>{meta.label}</div>
                    <div style={{ flex: 1, height: 10, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
                      <div style={{ width: `${(c.count / maxChannel) * 100}%`, height: "100%", background: meta.color, borderRadius: 6 }} />
                    </div>
                    <div style={{ width: 78, flexShrink: 0, textAlign: "right", fontSize: 12.5, color: "var(--ink-900)", fontVariantNumeric: "tabular-nums" }}>
                      {c.count.toLocaleString()} <span style={{ color: "var(--ink-300)" }}>{c.pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 상위 유입처 + 상위 랜딩 (데스크탑 2단, 모바일 1단 — auto-fit 반응형) */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Card>
              <SubHead>상위 유입처 (도메인)</SubHead>
              <List rows={(t.top_referrers ?? []).map((r) => ({ k: r.host, v: r.count }))} empty="직접 방문만 있어요" />
            </Card>
            <Card>
              <SubHead>상위 랜딩 페이지</SubHead>
              <List rows={(t.top_landings ?? []).map((r) => ({ k: decodePath(r.path), v: r.count }))} empty="—" />
            </Card>
          </div>

          {/* 기기 / OS / 인앱 (데스크탑 3단, 모바일 1~2단 — auto-fit 반응형) */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <Card>
              <SubHead>기기</SubHead>
              <List rows={(t.by_device ?? []).map((r) => ({ k: DEVICE_LABEL[r.device] ?? r.device, v: r.count }))} empty="—" />
            </Card>
            <Card>
              <SubHead>OS</SubHead>
              <List rows={(t.by_os ?? []).map((r) => ({ k: OS_LABEL[r.os] ?? r.os, v: r.count }))} empty="—" />
            </Card>
            <Card>
              <SubHead>인앱 브라우저</SubHead>
              <List rows={(t.by_in_app ?? []).map((r) => ({ k: INAPP_LABEL[r.in_app] ?? r.in_app, v: r.count }))} empty="인앱 유입 없음" />
            </Card>
          </div>

          {/* 캠페인(UTM) — 있을 때만 */}
          {(t.by_campaign ?? []).length > 0 && (
            <Card>
              <SubHead>캠페인 (UTM)</SubHead>
              <List
                rows={(t.by_campaign ?? []).map((r) => ({ k: r.campaign + (r.source ? ` · ${r.source}` : ""), v: r.count }))}
                empty="—"
              />
            </Card>
          )}
        </div>
      )}

      {/* 검색어 안내 — 자체 수집 불가 */}
      <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-500)", lineHeight: 1.6 }}>
        “무슨 검색어로 찾아왔는지”는 검색엔진이 넘겨주지 않아 여기서 볼 수 없습니다 —{" "}
        <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" style={{ color: "var(--tt-blue)" }}>
          구글 서치콘솔
        </a>{" "}
        ·{" "}
        <a href="https://searchadvisor.naver.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--tt-blue)" }}>
          네이버 서치어드바이저
        </a>{" "}
        에서 확인하세요.
      </div>
    </div>
  );
}

function List({ rows, empty }: { rows: { k: string; v: number }[]; empty: string }) {
  if (rows.length === 0) return <div style={{ fontSize: 12.5, color: "var(--ink-300)" }}>{empty}</div>;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-700)" }}>{r.k}</div>
          <div style={{ flexShrink: 0, color: "var(--ink-900)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.v.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
