/**
 * 카드 공유 — Web Share API (모바일) 또는 클립보드 (데스크탑).
 *
 * 반환값: 사용된 채널 ('native' | 'link-copy') 또는 사용자 취소/실패 시 null.
 * 호출자는 이 채널을 그대로 `card_shares.channel` 컬럼에 저장 (트리거가 share_count 갱신).
 */
import { getQaUrl } from "@/lib/card-url";
import type { CardData } from "@/components/Card";
import { showToast } from "@/lib/toast";

export async function shareCard(
  card: CardData,
): Promise<"native" | "link-copy" | null> {
  if (typeof window === "undefined") return null;
  // v4 canonical URL — getQaUrl이 의사(slug)·회원(handle+shortcode)·fallback 결정
  const path = getQaUrl(card);
  const url = `${window.location.origin}${path}`;
  const title = card.question;
  // 공유 문구: "OOO 원장님 | OOO OOO" — 파이프 구분 (이전 em-dash 어색해서 변경)
  const text = `${card.doctor?.name ?? ""} 원장님 | ${card.question ?? ""}`;

  // 모바일에서만 native share 사용 (데스크탑 Chrome share UI는 부실해서 클립보드가 더 자연)
  const ua = window.navigator.userAgent;
  const isMobile =
    /android|iphone|ipad|ipod/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua)); // iPad on iPadOS

  const nav = window.navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
  };

  if (isMobile && nav.share) {
    try {
      await nav.share({ url, title, text });
      return "native";
    } catch (err) {
      // 사용자 취소(AbortError)면 fallback 안 함 — "복사" 토스트가 의도 안 한 동작
      const e = err as { name?: string };
      if (e?.name === "AbortError") return null;
      // 그 외 실제 실패만 클립보드 fallback
    }
  }

  // 데스크탑(또는 share 미지원): 클립보드 복사
  try {
    await navigator.clipboard.writeText(url);
    showToast("링크가 복사되었어요");
    return "link-copy";
  } catch {
    // 클립보드 실패는 보통 권한 거부 — 노이즈 토스트 띄우지 않음
    return null;
  }
}
