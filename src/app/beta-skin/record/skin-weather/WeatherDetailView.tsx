"use client";

/**
 * WeatherDetailView — /record/weather 상세 페이지 본문(클라이언트).
 *   공용 셸(BetaSkinShell, active="내 노트") 안에 뒤로가기 + WeatherDetail 을 렌더.
 *   데이터는 useWeather(preferLast) — 카드가 받아둔 스냅샷을 즉시 재사용(없으면 직접 측위·fetch).
 */

import Link from "next/link";
import BetaSkinShell from "../../BetaSkinShell";
import styles from "./skin-weather.module.css";
import { useWeather } from "./useWeather";
import WeatherDetail from "./WeatherDetail";

export default function WeatherDetailView() {
  const { snap, err } = useWeather(true);

  return (
    <BetaSkinShell active="내 노트">
      <div className={styles.pageHead}>
        <Link href="/record" className={styles.back} aria-label="내 노트로 돌아가기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className={styles.pageTitle}>오늘의 피부 날씨</h1>
      </div>

      {err && !snap ? (
        <div className={styles.errCard} role="status">
          오늘의 피부 날씨를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </div>
      ) : !snap ? (
        <div className={styles.skelCard} aria-hidden>
          <div className={styles.skelTop} />
          <div className={styles.skelTemp} />
          <div className={styles.skelMsg} />
          <div className={styles.skelChips}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} />
            ))}
          </div>
        </div>
      ) : (
        <WeatherDetail snap={snap} />
      )}
    </BetaSkinShell>
  );
}
