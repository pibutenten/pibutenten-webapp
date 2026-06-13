"use client";

/**
 * PostDetail — /beta-skin/post "글 상세" 본문 (클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 active="피드" 로 사용(글 상세는 피드에서 진입).
 * - 글 본문: 서버에서 받은 실제 카드 1건. body 전체를 line-clamp 없이 렌더.
 * - 작성자 헤더(인증 배지)·태그·QA 박스·하단 액션.
 * - 댓글: 실제 운영 CommentsBlock(실제 카드일 때만 렌더).
 * - 사이드: 작성자 프로필 카드(있으면 프로필 보기 링크) + 함께 보면 좋은 Q&A(related 실데이터).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CardAvatar from "@/components/card/CardAvatar";
import { showToast } from "@/lib/toast";
import { pickHighlight } from "@/lib/card-highlight";
import { stripLegacyReferencesTail } from "@/components/card/utils/card-render";
import CommentsBlock from "@/components/comments/CommentsBlock";
import RecentLikers from "@/components/RecentLikers";
import { useCardViewer } from "@/components/card/hooks/useCardViewer";
import type { CardData } from "@/lib/types/card";
import BetaSkinShell from "../BetaSkinShell";

/* 글 상세 진입 = 명백한 조회·노출 신호 → 운영 useCardViewer 로 impression(mount) + view 기록.
   card 가 null(샘플)일 땐 렌더 안 함 → 조건부 훅 회피(트래커를 분리 컴포넌트로). */
function PostViewTracker({ card }: { card: CardData }) {
  const ref = useRef<HTMLElement>(null);
  const { recordView } = useCardViewer(card, { forceExpanded: true, cardRef: ref });
  useEffect(() => {
    recordView();
  }, [recordView]);
  return null;
}
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
  useBetaSearchRouting,
  useBetaCardActions,
  PostCardMenu,
  type BetaViewerState,
} from "../beta-ui";

const SAMPLE_TITLE = "쥬브젠 시술 후 일상생활과 다운타임은 어떤가요?";
// 형광펜·볼드 데모를 위해 **강조** 마크업 포함 (실제 카드는 DB 본문의 ** 를 그대로 사용).
const SAMPLE_BODY =
  "쥬브젠 효과는 일반적으로 **3년에서 5년 정도** 유지된다고 설명합니다. 피부 속을 단순히 채워두는 시술이 아니라, 내 살이 차오르도록 유도하는 방식이기 때문에 일반 필러나 스킨부스터보다 훨씬 오래 가는 편입니다.\n\n주사 부위에 붉은기와 미세한 부기가 하루 이틀 정도 있을 수 있습니다. 대부분 **다음 날부터 일상생활과 출근이 가능**하며, 메이크업은 시술 다음 날부터 권장합니다. 멍은 개인차가 있지만 보통 **3~5일 안에 옅어지고**, 재생테이프와 진정 관리를 병행하면 회복 속도가 더 빨라집니다.";

export default function PostDetail({
  card,
  related = [],
  viewer,
}: {
  card: CardData | null;
  related?: CardData[];
  viewer?: BetaViewerState;
}) {
  const search = useBetaSearchRouting();
  const router = useRouter();
  // 댓글 수 — CommentsBlock 이 실제 fetch 후 onCountChange 로 갱신(0 고정 방지).
  const [commentCount, setCommentCount] = useState(card?.comment_count ?? 0);
  const authorName =
    card?.doctor?.name ?? card?.author?.display_name ?? "예시 전문의";
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
    card?.doctor?.branch ?? "OO피부과의원",
  ].filter(Boolean);

  // 형광펜 색 — 실제 카드면 id 기반, 샘플이면 고정 seed.
  const hlColor = pickHighlight(String(card?.id ?? "sample-post"));
  // 영상 pill — 실제 카드면 external_url/video 에서 타임스탬프 추출.
  const vid = card ? videoInfo(card) : null;
  // 항목 4) 작성자 프로필 URL · 항목 1) 글 canonical URL (실제 카드일 때만).
  const profileHref = card ? authorHref(card) : null;
  const postHref = card ? cardHref(card) : "/";
  // 항목 5) 공유 — 샘플(card=null) 폴백 전용(실제 카드의 공유는 ArticleFooter 의 운영 shareCard 담당).
  //   샘플은 카드 객체가 없어 현재 페이지 URL 을 클립보드 복사 + 운영 토스트.
  const onShare = () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast("링크가 복사되었어요");
      } catch {
        /* 권한 거부 등 — 무시 */
      }
    })();
  };
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
          {card?.doctor?.branch ?? "OO피부과의원"}
        </div>
        {/* 운영에 팔로우 기능 없음 → 작성자 프로필이 있으면 "프로필 보기"로 연결, 없으면 버튼 생략. */}
        {profileHref && (
          <a
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
            href={profileHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            프로필 보기
          </a>
        )}
      </section>

      {related.length > 0 && (
        <section className={`${styles.card} ${styles.sideCard}`}>
          <h3>함께 보면 좋은 Q&A</h3>
          <div className={styles.sideList}>
            {related.map((c) => (
              <a href={`/beta-skin/post?id=${c.id}`} key={c.id}>
                <span className={styles.n}>Q</span>
                <span>{c.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );

  return (
    <BetaSkinShell active="피드" sidebar={sidebar} {...search}>
      {card && <PostViewTracker card={card} />}
      <article className={`${styles.card} ${styles.postCard}`}>
        {/* ⋮ 더보기 — 글상세에도 피드와 동일하게 본인/관리자 수정·삭제·숨김(운영 CardHeader 이식).
            .postCard(position:relative) 우상단에 .kebabWrap 으로 절대배치(피드 PostCard 와 동일 CSS).
            권한 없으면(비로그인/타인 글) 내부에서 null 반환 → 미노출. 실제 카드일 때만 렌더.
            삭제 성공 시 글상세에 머물 수 없으므로 피드(/beta-skin)로 이동(운영도 단일글 삭제 후 목록 복귀). */}
        {card && (
          <PostCardMenu
            card={card}
            onDeleted={() => router.push("/beta-skin")}
          />
        )}

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

        {/* QA 박스 — 실제 카드면 카테고리가 qa 일 때만, 샘플(card=null)이면 Q&A 데모로 노출. */}
        {(card ? (card.category ?? card.type) === "qa" : true) && (
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

        {/* 하단 액션 — 실제 카드면 좋아요·저장 toggle 동작(피드 PostCard 동일).
            샘플(card=null)이면 정적 숫자 폴백 유지. 훅 규칙상 동작 footer는
            card 보장 하위 컴포넌트(ArticleFooter)로 분리해 조건부 호출을 피한다. */}
        {card ? (
          <ArticleFooter
            card={card}
            viewer={viewer}
            commentCount={commentCount}
          />
        ) : (
          <div className={styles.postFoot}>
            <span className={styles.pf}>
              <IconHeart /> 24
            </span>
            <span className={styles.pf}>
              <IconComment /> {commentCount}
            </span>
            <span className={styles.pf}>
              <IconBookmark /> 4
            </span>
            <span className={styles.grow} />
            {/* 샘플 공유 — 현재 페이지 URL 을 navigator.share / clipboard 로. */}
            <button type="button" className={styles.pfBtn} onClick={onShare}>
              <IconShare /> 공유
            </button>
          </div>
        )}

        <div className={styles.divider} />

        {/* 피드백 2) 댓글 — 실제 운영 CommentsBlock. 실제 카드일 때만 렌더(샘플 폴백은 생략).
            항목5) betaComments 스코프: 하트 회색·파란 포커스선 완화·답글↔하트 간격(운영 무수정 override). */}
        {card && (
          <div className={styles.betaComments}>
            <CommentsBlock
              cardId={card.id}
              doctorSlug={card.doctor?.slug ?? null}
              cardDoctorId={card.doctor?.id ?? null}
              isPublishedQa
              showInput
              disableAutoFocus
              onCountChange={setCommentCount}
            />
          </div>
        )}
      </article>
    </BetaSkinShell>
  );
}

/**
 * ArticleFooter — 글 상세 하단 액션(좋아요·댓글·저장·공유).
 *
 * useBetaCardActions 는 훅이라 조건부 호출이 금지된다. PostDetail 의 card 는
 * CardData | null 이므로, 동작 footer 를 card(CardData 필수) 보장 하위 컴포넌트로
 * 분리해 card 존재 시에만 렌더한다 → 훅을 항상 무조건 호출(규칙 준수).
 * 좋아요/저장/공유 패턴은 피드 PostCard 와 동일(toggle RPC, pfOn/pfSaved, aria-pressed).
 */
function ArticleFooter({
  card,
  viewer,
  commentCount,
}: {
  card: CardData;
  viewer?: BetaViewerState;
  commentCount: number;
}) {
  const act = useBetaCardActions(card, viewer);
  return (
    <>
      <div className={styles.postFoot}>
        {/* 좋아요 — 실제 toggle_card_like RPC. active 시 pfOn. */}
        <button
          type="button"
          className={`${styles.pf} ${styles.pfBtn} ${act.like.active ? styles.pfOn : ""}`}
          aria-pressed={act.like.active}
          aria-label="좋아요"
          onClick={() => act.like.toggle()}
        >
          <IconHeart /> {act.like.count}
        </button>
        <span className={styles.pf}>
          <IconComment /> {commentCount}
        </span>
        {/* 저장 — 실제 toggle_card_save RPC. active 시 pfSaved. */}
        <button
          type="button"
          className={`${styles.pf} ${styles.pfBtn} ${act.save.active ? styles.pfSaved : ""}`}
          aria-pressed={act.save.active}
          aria-label="저장"
          onClick={() => act.save.toggle()}
        >
          <IconBookmark /> {act.save.count}
        </button>
        <span className={styles.grow} />
        {/* 공유 — 실제 글 URL navigator.share / clipboard + card_shares INSERT. */}
        <button
          type="button"
          className={styles.pfBtn}
          aria-label="공유"
          onClick={() => void act.share.share()}
        >
          <IconShare /> 공유
        </button>
      </div>

      {/* 인스타식 좋아요 표시 — 글상세에도 운영 RecentLikers 그대로 재사용(자체 재구현 X).
          피드 PostCard 와 동일하게 footer 아래에 마운트. likeCount 는 act.like.count(toggle 시 갱신)
          → 좋아요 변동 시 자동 refetch. 데이터 fetch 경로는 운영과 동일(RLS 우회 없음). */}
      <RecentLikers cardId={card.id} likeCount={act.like.count} />
    </>
  );
}
