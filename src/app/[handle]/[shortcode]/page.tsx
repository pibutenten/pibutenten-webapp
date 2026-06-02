import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkHiddenByShortcode } from "@/lib/hidden-card";
import Card, { type CardData } from "@/components/Card";
import BackButton from "@/components/BackButton";
import { SITE_URL } from "@/lib/site";
import { stripMarkdown } from "@/lib/strip-markdown";
import { CARD_DETAIL_SELECT } from "@/lib/card-select";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ handle: string; shortcode: string }>;
};

type QaWithFields = CardData & {
  updated_at?: string | null;
};

/**
 * 회원 글 라우트.
 * URL: /{handle}/{shortcode}  (year 세그먼트 제거 — 더 짧고 깔끔)
 *
 * - handle은 profiles.handle 매칭
 * - shortcode는 cards.shortcode (UNIQUE)
 *
 * 주의: /{handle}만 있을 때(/[handle]/page.tsx)와 라우트 충돌 방지를 위해
 *       shortcode 세그먼트는 base58 6~12자 패턴으로만 매칭 (regex로 검증).
 *       그 외 segment는 next.js가 [handle]/page.tsx로 fallthrough하지 않으므로
 *       notFound() 반환.
 */
async function fetchQa(
  handle: string,
  shortcode: string,
): Promise<QaWithFields | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(shortcode)) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("cards")
      .select(CARD_DETAIL_SELECT)
      .eq("shortcode", shortcode)
      .eq("status", "published")
      .maybeSingle()
      .returns<QaWithFields>();
    if (!data) return null;
    // handle 매칭 — 잘못된 handle prefix로 다른 사람 글 접근 방지
    const a = data.author;
    const matched = a && a.handle === handle;
    if (!matched) return null;
    return data;
  } catch {
    return null;
  }
}

// P2-5 (2026-05-29): hidden placeholder 로직 DRY → @/lib/hidden-card 로 추출.
//   doctor 라우트와 회원 라우트가 같은 SSOT 사용.
async function checkHiddenPlaceholder(
  handle: string,
  shortcode: string,
): Promise<{ shortcode: string } | null> {
  const hit = await checkHiddenByShortcode(handle, shortcode);
  return hit ? { shortcode } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, shortcode } = await params;
  const card = await fetchQa(handle, shortcode);
  if (!card) {
    // Hidden placeholder 면 noindex 로 표기 (interstitial 만, 본문 미노출).
    const hidden = await checkHiddenPlaceholder(handle, shortcode);
    if (hidden) {
      return {
        title: "비공개 처리된 게시물",
        robots: { index: false, follow: false },
      };
    }
    return { title: "찾을 수 없는 글" };
  }
  const url = `${SITE_URL}/${handle}/${shortcode}`;
  const description = stripMarkdown(card.body).slice(0, 160);
  // 2026-05-28: openGraph/twitter boilerplate 는 lib/og-meta.ts 헬퍼로 통합.
  //   doctor 매핑 카드면 그 doctor 의 OG (`/og/{slug}.png`), 회원 글이면 기본 (`/og.png`).
  const doc = Array.isArray(card.doctor) ? card.doctor[0] : card.doctor;
  // M11 (2026-05-28): 의사 카드 단독 페이지는 회원 라우트에서 noindex.
  //   - 의사 qa: 아래 page component 가 doctor canonical 로 308 redirect → 어차피 인덱싱 안 됨.
  //   - 의사 비-qa (doodle): 회원 라우트에서 noindex 강제 (회원 글과 동일 취급).
  // 회원 글 정책 (2026-06-01): tip 폐지 + doodle = noindex → 회원 라우트 단일 글은 전부 noindex.
  const indexable = false;
  return {
    title: card.title,
    description,
    alternates: { canonical: url },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    ...buildSocialMeta({
      title: card.title,
      description,
      canonical: url,
      ogImage: buildOgImage(doc?.slug ?? null),
      ogType: "article",
    }),
  };
}

export default async function MemberPostPage({ params }: Props) {
  const { handle, shortcode } = await params;
  const card = await fetchQa(handle, shortcode);
  if (!card) {
    // Hidden 카드면 본문 대신 placeholder. 진짜 없는 글이면 404.
    const hidden = await checkHiddenPlaceholder(handle, shortcode);
    if (hidden) {
      return (
        <section className="w-full py-6">
          <div className="mb-1 -ml-1">
            <BackButton fallbackHref={`/${handle}`} />
          </div>
          <div className="mx-auto max-w-xl rounded-md border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
            <p className="text-[14px] font-semibold text-[var(--text)]">
              운영정책에 따라 비공개된 게시물입니다.
            </p>
            <p className="mt-2 text-[12px] text-[var(--text-muted)]">
              이의가 있으시면{" "}
              <a
                href="mailto:pibutenten@gmail.com"
                className="text-[var(--primary)] hover:underline"
              >
                pibutenten@gmail.com
              </a>
              으로 문의해 주세요.
            </p>
          </div>
        </section>
      );
    }
    notFound();
  }

  // 정책 (2026-05-15): 의사 Q&A 는 doctor canonical 한 곳에서만 노출.
  // 회원 라우트로 접근 시도 시 → /doctors/{slug}/{year}/{post_slug} 로 영구 redirect (308).
  // Supabase 가 1:1 doctor join 을 array 로 반환하는 케이스 처리.
  // doctor 메타가 누락된 경우 (post_year/post_slug 없음) author_handle 로 doctor.slug 추정.
  const doc = Array.isArray(card.doctor) ? card.doctor[0] : card.doctor;
  if (card.category === "qa") {
    const dslug = doc?.slug ?? handle; // author_handle 이 doctor.slug 와 같음 (의사 글)
    const year = card.post_year ?? new Date(card.created_at ?? Date.now()).getUTCFullYear();
    const pslug = card.post_slug ?? card.shortcode; // post_slug 누락 시 shortcode fallback
    if (dslug && year && pslug) {
      permanentRedirect(`/doctors/${dslug}/${year}/${pslug}`);
    }
  }

  return (
    // 단독 글 폭은 원장 Q&A 단독 페이지(max-w-[680px])와 동일하게 맞춤 —
    // 회원 글(후기 포함)이 컨테이너 끝(1080px)까지 퍼져 더 넓게 보이던 문제 교정.
    <section className="mx-auto w-full max-w-[680px] py-6">
      {/* 좌상단 ← 뒤로 — 다른 페이지와 동일하게 mb-1 -ml-1 통일. */}
      <div className="mb-1 -ml-1">
        <BackButton fallbackHref={`/${handle}`} />
      </div>
      {/* 단독 카드 상세 — 본문 펼침 + 댓글 자동 펼침 (의사 글 페이지와 동일 정책) */}
      <Card card={card} forceExpanded autoExpandComments asH1 />
    </section>
  );
}

// 정식 URL 패턴은 `/{handle}/{shortcode}` (회원 글) 와 `/doctors/{slug}/{year}/{post_slug}` (의사 Q&A) 두 가지.
// 옛 `/{handle}/{year}/{shortcode}` 패턴은 공개 전 폐기됨 (H2, 2026-05-28). redirect 불필요.
