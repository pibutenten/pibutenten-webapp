"use client";

/**
 * ShopView — /shop "쇼핑" 탭 본문(클라이언트, 준비중 플레이스홀더).
 *   GNB 5탭 중 "쇼핑" 탭이 가리키는 화면. 아직 준비중이라 공용 셸(AppShell,
 *   active="쇼핑") 안에 안내 카드만 둔다. 데이터 fetch 가 없어 server page 는 메타·robots
 *   noindex 만 보유하고 본문을 이 View 로 위임(선례 InfoShell / RecordNotesView).
 *   상세가 아닌 최상위 탭이라 detailHead/back 없음. 검색 제출은 운영 홈(/?q=)으로 라우팅.
 */

import AppShell from "../AppShell";
import { useSearchRouting } from "../ui";
import styles from "../app.module.css";

export default function ShopView() {
  const search = useSearchRouting();
  return (
    <AppShell active="쇼핑" {...search}>
      <section className={`${styles.card} ${styles.sideCard}`} style={{ textAlign: "center" }}>
        <p style={{ fontWeight: 700, fontSize: 16 }}>쇼핑 준비중</p>
        <p className={styles.muted} style={{ marginTop: 6 }}>
          곧 만나보실 수 있어요.
        </p>
      </section>
    </AppShell>
  );
}
