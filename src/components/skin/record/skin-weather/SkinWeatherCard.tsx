"use client";

/**
 * SkinWeatherCard — "오늘의 피부 날씨" 접힌 카드 (내 피부노트 상단).
 *
 * UI개선안 §2 2단 구조: 1단(주연) UVB 홍반·UVA 노화·미세먼지를 크게/심각도색으로/위에,
 *   그 아래 구름 통과 한 줄, 2단(배경) 기온 범위·습도·강수를 작게/회색으로 아래.
 *   탭하면 **새 페이지**(/record/weather)로 이동해 상세를 본다. 데이터는 useWeather(공용 훅)가
 *   받아둔 스냅샷(sessionStorage 공유, 재요청 없음). 등급어는 지금 값 기준(밤엔 자외선 0 → 낮음).
 */

import Link from "next/link";
import styles from "./skin-weather.module.css";
import { useWeather } from "./useWeather";
import WeatherIllustration from "./WeatherIllustration";
import { cloudCaption, pmView, uvaView, uvbView, uvText, type SkinMetricView, type WeatherKpi } from "./weather-logic";

/** kpis 배열에서 key 로 '오늘 최고(peak)' 값을 안전하게 꺼낸다(없으면 null). */
function peakOf(kpis: WeatherKpi[], key: WeatherKpi["key"]): string | null {
  const k = kpis.find((x) => x.key === key);
  return k?.peak ?? null;
}

export default function SkinWeatherCard() {
  const { snap, err } = useWeather();

  if (err && !snap) {
    return (
      <div className={styles.errCard} role="status">
        오늘의 피부 날씨를 불러오지 못했어요. 잠시 후 다시 열어주세요.
      </div>
    );
  }

  if (!snap) {
    return (
      <div className={styles.skelCard} aria-hidden>
        <div className={styles.skelTop} />
        <div className={styles.skelTemp} />
        <div className={styles.skelMsg} />
        <div className={styles.skelChips}>
          {[0, 1, 2].map((i) => (
            <span key={i} />
          ))}
        </div>
      </div>
    );
  }

  // 1단 3지표 — 지금 값 기준 등급어 + 심각도 단계색(개선안 §A 헬퍼).
  const uvb = uvbView(snap.uvNow);
  const uva = uvaView(snap.uvaNow);
  const pm = pmView(snap.pmGrade);
  const uvbPeak = peakOf(snap.kpis, "tanning");
  const uvaPeak = peakOf(snap.kpis, "aging");
  // 미세먼지 보조 숫자(현재 PM2.5 / PM10) — kpis.pm 의 value·sub 재사용(추가 계산 없음).
  const pmKpi = snap.kpis.find((x) => x.key === "pm");
  const cloud = cloudCaption(snap.blockNow, snap.sunUp);

  // 1단 셀 1개 — 등급어(큰 색) + 지금 값 + 오늘 최고/보조 숫자.
  const tier1 = (label: string, v: SkinMetricView, nowText: string, peakText: string) => (
    <div className={styles.t1} style={{ background: v.tint }}>
      <span className={styles.t1Lab} style={{ color: v.color }}>
        {label}
      </span>
      <span className={styles.t1Grade} style={{ color: v.color }}>
        {v.grade}
      </span>
      <span className={styles.t1Peak} style={{ color: v.color }}>
        {peakText}
      </span>
      <span className={styles.t1Now}>{nowText}</span>
    </div>
  );

  return (
    <section className={styles.wrap}>
      <Link href="/record/weather" className={styles.card} aria-label="오늘의 피부 날씨 상세 보기">
        <div className={styles.cTop}>
          <span className={styles.cLoc}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            {snap.name}
          </span>
          <span className={styles.cGo}>
            자세히
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </span>
        </div>
        <div className={styles.cMid}>
          <span className={styles.cTemp}>{snap.temp}°</span>
          <span className={styles.cCond}>{snap.cond} · 오늘의 피부 날씨</span>
          <WeatherIllustration illust={snap.illust} size={54} className={styles.cHero} />
        </div>
        {snap.badges.length > 0 && (
          <div className={styles.cBadges}>
            {snap.badges.map((b) => (
              <span className={styles.cBadge} key={b.kind}>
                {b.label}
              </span>
            ))}
          </div>
        )}
        <p className={styles.cMsg}>{snap.headline}</p>

        {/* 1단(주연) — UVB·UVA·미세먼지 3지표 크게·색으로·위에. */}
        <div className={styles.t1grid}>
          {tier1("UVB 홍반", uvb, `지금 ${uvText(snap.uvNow, snap.sunUp)}`, uvbPeak ? `오늘 최고 ${uvbPeak}` : "")}
          {tier1("UVA 노화", uva, `지금 ${snap.sunUp ? snap.uvaNow : 0}`, uvaPeak ? `오늘 최고 ${uvaPeak}` : "")}
          {tier1("미세먼지", pm, pmKpi ? pmKpi.sub : "", pmKpi ? `초미세 ${pmKpi.value}㎍` : "")}
        </div>

        {/* 구름 한 줄 — 자외선 통과 맥락(정보값, 빨강 금지). 밤이면 생략. */}
        {cloud && (
          <div className={styles.cCloud}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6.5 19Z" />
            </svg>
            <span>{cloud}</span>
          </div>
        )}

        {/* 2단(배경) — 기온 범위·습도·강수 한 줄, 작게·회색. */}
        <div className={styles.t2}>
          <span className={styles.t2Item}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0Z" />
            </svg>
            {snap.todayMin}°~{snap.todayMax}°
          </span>
          <span className={styles.t2Item}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 2.7S6 9.3 6 13.5a6 6 0 0 0 12 0C18 9.3 12 2.7 12 2.7Z" />
            </svg>
            습도 {snap.humidity}%
          </span>
          <span className={styles.t2Item}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 13a8 8 0 0 1 16 0" />
              <path d="M12 13v8" />
              <path d="M8 13v6" />
              <path d="M16 13v6" />
            </svg>
            강수 {snap.rainProb}%
          </span>
        </div>
      </Link>
    </section>
  );
}
