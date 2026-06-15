"use client";

/**
 * WeatherDetailView — /record/weather 상세 페이지 본문(클라이언트).
 *   공용 셸(BetaSkinShell, active="내 노트") + '< 오늘의 피부 날씨' 헤더(backTitle).
 *   우측 사이드바: 종합 안내 + 4지표 클릭 시 각 지표 설명(기술문서 기반). 선택 상태(emph)를
 *   여기서 보유해 사이드바 설명과 그래프/카드 강조를 함께 구동.
 *   데이터는 useWeather(preferLast) — 카드가 받아둔 스냅샷 즉시 재사용(없으면 직접 측위·fetch).
 */

import { useState } from "react";
import BetaSkinShell from "../../BetaSkinShell";
import styles from "./skin-weather.module.css";
import { useWeather } from "./useWeather";
import WeatherDetail from "./WeatherDetail";

/** 지표별 설명 — 피부 관점, 행동 권고 중심(의료법 §56 톤: 진단·치료·효과보장 표현 배제). */
const KPI_INFO: Record<string, { label: string; color: string; text: string }> = {
  tanning: {
    label: "UVB 홍반",
    color: "#E0382E",
    text: "짧은 노출에도 피부를 붉게(홍반) 하고 화상·기미를 유발하는 자외선이에요(파장 280~315nm). 국제표준 UV Index(0~11+, 적도·고산은 그 이상)로 표시하며, 정오 전후 2~3시간에 가장 강해요. 높은 날은 그늘·모자와 SPF 차단제로 직접 노출을 줄여 주세요.",
  },
  aging: {
    label: "UVA 노화",
    color: "#B45CB0",
    text: "진피까지 깊이 닿아 색소침착·주름·탄력 저하 같은 광노화에 관여하는 ‘노화 자외선’이에요(파장 315~400nm). UVB와 달리 구름·유리창을 잘 통과하고 계절·날씨에 덜 줄어, 흐린 날·겨울·실내 창가에서도 작용해요. 그래서 매일 PA 등급 차단제를 권합니다. (전천일사량에서 환산)",
  },
  pm: {
    label: "미세먼지",
    color: "#C9A21E",
    text: "PM2.5(초미세)·PM10(미세) 중 더 나쁜 등급으로 표시해요. 미세먼지는 모공을 막고 산화 스트레스를 높여 피부 장벽을 약하게 할 수 있어요. 나쁜 날엔 외출 후 미온수로 꼼꼼히 세안하고 보습으로 장벽을 회복시켜 주세요.",
  },
  block: {
    label: "구름투과율",
    color: "#3C8CC8",
    text: "구름을 통과해 피부에 닿는 자외선의 비율이에요. 흔한 오해와 달리 완전히 흐린 날에도 자외선의 절반 이상(서울 실측 약 54%)이 통과해요 — 흐려도 차단은 필요합니다. (서울 다년 분광 관측 기반)",
  },
};

export default function WeatherDetailView() {
  const { snap, err } = useWeather(true);
  // 선택된 지표(카드·그래프·사이드바 설명 공통). null = 종합 안내.
  const [emph, setEmph] = useState<string | null>(null);
  const onEmph = (k: string) => setEmph((v) => (v === k ? null : k));

  const sel = emph ? KPI_INFO[emph] : null;
  const sidebar = (
    <section className={styles.infoCard}>
      {sel ? (
        <>
          <span className={styles.infoLabel} style={{ color: sel.color }}>
            {sel.label}
          </span>
          <p className={styles.infoText}>{sel.text}</p>
          <button type="button" className={styles.infoBack} onClick={() => setEmph(null)}>
            ← 전체 안내 보기
          </button>
        </>
      ) : (
        <>
          <h3 className={styles.infoTitle}>오늘의 피부 날씨란?</h3>
          <p className={styles.infoText}>
            내 위치의 실시간 기상·대기 데이터를 피부 관점 4개 지표로 보여드려요. 위 지표 카드를 누르면 각 설명이 여기에 나옵니다.
          </p>
          <p className={styles.infoSrc}>출처: CAMS · Open-Meteo.com</p>
        </>
      )}
    </section>
  );

  return (
    <BetaSkinShell
      active="내 노트"
      back="/record"
      backTitle={<h1>오늘의 피부 날씨</h1>}
      sidebar={snap ? sidebar : undefined}
      sidebarMobileBelow
    >
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
        <WeatherDetail snap={snap} emph={emph} onEmph={onEmph} />
      )}
    </BetaSkinShell>
  );
}
