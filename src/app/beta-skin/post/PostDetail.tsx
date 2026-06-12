"use client";

/**
 * PostDetail — /beta-skin/post "글 상세" 본문 (클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 active="피드" 로 사용(글 상세는 피드에서 진입).
 * - 글 본문: 서버에서 받은 실제 카드 1건. body 전체를 line-clamp 없이 렌더.
 * - 작성자 헤더(인증 배지)·태그·QA 박스·하단 액션.
 * - 댓글: 샘플 2개 + 입력창(디자인만, 동작 X).
 * - 사이드: 작성자 프로필 카드 + 함께 보면 좋은 Q&A(샘플).
 */

import CardAvatar from "@/components/card/CardAvatar";
import { pickHighlight } from "@/lib/card-highlight";
import { stripLegacyReferencesTail } from "@/components/card/utils/card-render";
import type { CardData } from "@/lib/types/card";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import {
  IconVerified,
  IconHeart,
  IconComment,
  IconBookmark,
  IconShare,
  categoryLabel,
  timeAgo,
  renderBetaBody,
  videoInfo,
  PubmedRefs,
  cardHref,
  authorHref,
  shareBetaCard,
  BetaComments,
  useBetaSearchRouting,
} from "../beta-ui";

const SAMPLE_TITLE = "쥬브젠 시술 후 일상생활과 다운타임은 어떤가요?";
// 형광펜·볼드 데모를 위해 **강조** 마크업 포함 (실제 카드는 DB 본문의 ** 를 그대로 사용).
const SAMPLE_BODY =
  "쥬브젠 효과는 일반적으로 **3년에서 5년 정도** 유지된다고 설명합니다. 피부 속을 단순히 채워두는 시술이 아니라, 내 살이 차오르도록 유도하는 방식이기 때문에 일반 필러나 스킨부스터보다 훨씬 오래 가는 편입니다.\n\n주사 부위에 붉은기와 미세한 부기가 하루 이틀 정도 있을 수 있습니다. 대부분 **다음 날부터 일상생활과 출근이 가능**하며, 메이크업은 시술 다음 날부터 권장합니다. 멍은 개인차가 있지만 보통 **3~5일 안에 옅어지고**, 재생테이프와 진정 관리를 병행하면 회복 속도가 더 빨라집니다.";

export default function PostDetail({ card }: { card: CardData | null }) {
  const search = useBetaSearchRouting();
  const authorName =
    card?.doctor?.name ?? card?.author?.display_name ?? "정한미";
  const isDoctor = card ? !!card.doctor && !card.hide_doctor_credential : true;
  const avatarUrl = card?.author?.avatar_url ?? null;
  const title = card?.title ?? SAMPLE_TITLE;
  // 피드백 1) 본문 끝 평문 참고문헌 꼬리 제거(운영 Critical-6) → PubmedRefs 와 이중 출력 방지.
  const rawBody = card?.body && card.body.length > 0 ? card.body : SAMPLE_BODY;
  const body = stripLegacyReferencesTail(rawBody);
  const tags = (card?.keywords ?? ["쥬브젠", "다운타임", "재생테이프"]).slice(
    0,
    7,
  );
  const subParts = [
    card ? categoryLabel(card) : "Q&A",
    card?.created_at ? timeAgo(card.created_at) : "2주 전",
    card?.doctor?.branch ?? "힐하우스피부과의원",
  ].filter(Boolean);

  // 형광펜 색 — 실제 카드면 id 기반, 샘플이면 고정 seed.
  const hlColor = pickHighlight(String(card?.id ?? "sample-post"));
  // 영상 pill — 실제 카드면 external_url/video 에서 타임스탬프 추출.
  const vid = card ? videoInfo(card) : null;
  // 항목 4) 작성자 프로필 URL · 항목 1) 글 canonical URL (실제 카드일 때만).
  const profileHref = card ? authorHref(card) : null;
  const postHref = card ? cardHref(card) : "/";
  // 항목 5) 공유 — 실제 카드면 그 글 URL, 샘플이면 현재 페이지.
  const onShare = () => void shareBetaCard(postHref, title);
  // 작성자 행 내용(링크/일반 div 공용).
  const authorRow = (
    <>
      <CardAvatar
        doctorSlug={card?.doctor?.slug}
        memberAvatarUrl={avatarUrl}
        name={authorName}
        size={46}
      />
      <div>
        <div className={styles.authorName}>
          {authorName}
          {isDoctor && (
            <span className={styles.verified}>
              <IconVerified />
              피부과 전문의
            </span>
          )}
        </div>
        <div className={styles.authorSub}>{subParts.join(" · ")}</div>
      </div>
    </>
  );

  const sidebar = (
    <>
      <section className={`${styles.card} ${styles.authorSide}`}>
        <div className={styles.authorSideAvatarWrap}>
          <CardAvatar
            doctorSlug={card?.doctor?.slug}
            memberAvatarUrl={avatarUrl}
            name={authorName}
            size={68}
          />
        </div>
        <div className={`${styles.authorName} ${styles.authorSideName}`}>
          {authorName}
          {isDoctor && (
            <span className={styles.verified}>
              <IconVerified />
            </span>
          )}
        </div>
        <div className={styles.authorSub} style={{ marginBottom: 16 }}>
          {isDoctor ? "피부과 전문의" : "회원"} ·{" "}
          {card?.doctor?.branch ?? "힐하우스피부과의원"}
        </div>
        <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} href="#">
          팔로우
        </a>
      </section>

      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>함께 보면 좋은 Q&A</h3>
        <div className={styles.sideList}>
          <a href="/beta-skin/post">
            <span className={styles.n}>Q</span>
            <span>쥬브젠과 리쥬란, 어떤 차이가 있나요?</span>
          </a>
          <a href="/beta-skin/post">
            <span className={styles.n}>Q</span>
            <span>스킨부스터 시술 주기는 얼마가 적당한가요?</span>
          </a>
          <a href="/beta-skin/post">
            <span className={styles.n}>Q</span>
            <span>멍 빨리 빼는 관리법이 있을까요?</span>
          </a>
        </div>
      </section>
    </>
  );

  return (
    <BetaSkinShell active="피드" sidebar={sidebar} {...search}>
      <article className={`${styles.card} ${styles.postCard}`}>
        {/* 항목 4) 작성자 — 실제 프로필 URL 로 새 탭(정보 부족이면 일반 div). */}
        {profileHref ? (
          <a
            className={styles.author}
            href={profileHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {authorRow}
          </a>
        ) : (
          <div className={styles.author}>{authorRow}</div>
        )}

        <h1 className={styles.articleTitle}>{title}</h1>

        {(card?.category ?? card?.type ?? "qa") === "qa" && (
          <div className={styles.qaQ}>
            Q. 다음 주에 예약했는데, 시술 직후 일상생활이 가능할지, 멍이나 붓기는
            보통 며칠 가는지 궁금해요.
          </div>
        )}

        {/* 본문 — 전체 펼침(clamp 없음) + 볼드·형광펜 (운영 방식 재현) */}
        <div className={styles.articleBody}>
          {renderBetaBody(body, hlColor, false)}
        </div>

        {/* 참고문헌 — 실제 카드의 pubmed_refs 가 있으면 표시(운영 CardBody 정합) */}
        {card && <PubmedRefs card={card} />}

        {vid && (
          <a
            className={styles.ytPill}
            href={vid.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={styles.ytMark} aria-hidden="true" />
            영상 보러가기{vid.ts ? ` ${vid.ts}~` : ""}
          </a>
        )}

        {tags.length > 0 && (
          <div className={styles.postTags}>
            {tags.map((t) => (
              <span className={styles.t} key={t}>
                {t}
              </span>
            ))}
          </div>
        )}

        <div className={styles.postFoot}>
          <span className={styles.pf}>
            <IconHeart /> {card?.like_count ?? 24}
          </span>
          <span className={styles.pf}>
            <IconComment /> {card?.comment_count ?? 6}
          </span>
          <span className={styles.pf}>
            <IconBookmark /> {card?.save_count ?? 4}
          </span>
          <span className={styles.grow} />
          {/* 항목 5) 공유 — 실제 글 URL 을 navigator.share / clipboard 로. */}
          <button type="button" className={styles.pfBtn} onClick={onShare}>
            <IconShare /> 공유
          </button>
        </div>

        <div className={styles.divider} />

        {/* 피드백 2) 댓글 — 입력 가능(타이핑 + 로컬 추가). 운영 CommentsBlock 톤. */}
        <BetaComments count={card?.comment_count ?? 6} />
      </article>
    </BetaSkinShell>
  );
}
