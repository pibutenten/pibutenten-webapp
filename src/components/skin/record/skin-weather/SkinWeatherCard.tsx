"use client";

/**
 * SkinWeatherCard — "오늘의 피부 날씨" 접힌 카드 (내 피부노트 상단).
 *
 * 위치·기온·헤드라인·4칩(게이지)만 보여주는 요약 카드. 탭하면 **새 페이지**(/record/weather)로
 *   이동해 상세(KPI 게이지·시간별 그래프·주간)를 본다. 데이터는 useWeather(공용 훅) — 카드가 받아둔
 *   스냅샷을 sessionStorage 로 상세 페이지와 공유(재요청 없음).
 */

import Link from "next/link";
import styles from "./skin-weather.module.css";
import { useWeather } from "./useWeather";
import WeatherIllustration from "./WeatherIllustration";

const clampFrac = (v: number) => Math.max(0, Math.min(1, v));

// 주연(핵심 4) — UVB·UVA·미세먼지·구름투과율. 조연(배경) — 기온·강수.
const CORE_KEYS = ["uvb", "uva", "pm", "block"];
const BG_KEYS = ["temp", "precip"];

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
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} />
          ))}
        </div>
      </div>
    );
  }

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
        {/* 핵심 4지표(주연) — UVB·UVA·미세먼지·구름투과율 크게. 기온·강수는 아래 배경 줄(조연)로. */}
        <div className={styles.chips}>
          {snap.chips
            .filter((c) => CORE_KEYS.includes(c.key))
            .map((c) => (
              <span className={styles.chip} key={c.key}>
                <span className={styles.chipK}>{c.label}</span>
                <span className={styles.chipV}>
                  <i className={styles.dot} style={{ background: c.color }} />
                  {c.value}
                </span>
                <span className={styles.chipBar}>
                  <i style={{ width: `${Math.round(clampFrac(c.frac) * 100)}%`, background: c.color }} />
                </span>
              </span>
            ))}
        </div>
        {/* 배경(조연) — 기온·강수확률 한 줄, 작게·은은하게. */}
        <div className={styles.chipsBg}>
          {snap.chips
            .filter((c) => BG_KEYS.includes(c.key))
            .map((c) => (
              <span className={styles.chipBgItem} key={c.key}>
                <span className={styles.chipBgK}>{c.label}</span>
                <span className={styles.chipBgV}>{c.value}</span>
              </span>
            ))}
        </div>
      </Link>
    </section>
  );
}
