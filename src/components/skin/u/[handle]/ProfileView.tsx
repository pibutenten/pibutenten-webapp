"use client";

/**
 * ProfileView — app skin u/[handle] "공개 프로필" 본문 (클라이언트).
 *
 * 운영 ProfileTabs 의 탭 구성·lazy fetch·피부정보 로직을 재현하되, 카드는 PostCard 로 렌더(톤 일치).
 * - 헤더: 아바타 + 이름 + @handle + 소개. 본인(isOwner)이면 [설정] + 최하단 [로그아웃].
 * - 탭: 작성 글 / 내 후기 / 댓글 / 좋아요(owner) / 저장(owner) / 피부. (운영과 동일 순서·노출 규칙)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import AccountSwitcherCard from "@/components/AccountSwitcherCard";
import CardAvatar from "@/components/card/CardAvatar";
import ProfileEditClient, {
  type ProfileEditProps,
} from "@/app/settings/profile/ProfileEditClient";
import {
  FACE_LABEL,
  SKIN_LABEL,
  CONCERN_LABEL,
  PROCEDURE_LABEL,
} from "@/lib/profile-options";
import type { CardData } from "@/lib/types/card";
import AppShell from "../../AppShell";
import PolicyFooter from "../../PolicyFooter";
import styles from "../../app.module.css";
import {
  PostCard,
  useSearchRouting,
  type ViewerState,
} from "../../ui";

export type ProfileSkinInfo = {
  faceShape: string | null;
  skinType: string | null;
  skinConcerns: string[];
  interestedProcedures: string[];
  receivedProcedures: string[];
  visibility: Record<string, boolean>;
};

/** '프로필·설정' 아코디언 폼(ProfileEditClient)의 props — 서버(page.tsx)에서 채워 넘김. */
export type ProfileSettings = ProfileEditProps;

type Tab = "posts" | "reviews" | "comments" | "likes" | "saves" | "skin";

const TAB_LABEL: Record<Tab, string> = {
  posts: "작성 글",
  reviews: "내 후기",
  comments: "댓글",
  likes: "좋아요",
  saves: "저장",
  skin: "내 피부",
};

type CommentRow = {
  id: number;
  body: string;
  created_at: string;
  card_id: number;
  card: {
    id: number;
    title: string;
    type: string | null;
    post_year: number | null;
    post_slug: string | null;
    shortcode: string | null;
    doctor: { slug: string } | null;
    author: { handle: string | null } | null;
  } | null;
};

function commentLink(c: CommentRow): string {
  const card = c.card;
  if (!card) return "/";
  if (card.doctor?.slug && card.post_year && card.post_slug)
    return `/doctors/${card.doctor.slug}/${card.post_year}/${card.post_slug}`;
  if (card.shortcode && card.author?.handle)
    return `/${card.author.handle}/${card.shortcode}`;
  return "/";
}

export default function ProfileView({
  handle,
  displayName,
  avatarUrl,
  bio,
  isOwner,
  profileId,
  posts,
  reviews,
  postsCount,
  reviewsCount,
  commentsCount,
  likesCount,
  savesCount,
  viewerStates,
  viewerIsAnon,
  skinInfo,
  settings,
}: {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isOwner: boolean;
  profileId: string;
  posts: CardData[];
  reviews: CardData[];
  postsCount: number;
  reviewsCount: number;
  commentsCount: number;
  likesCount: number;
  savesCount: number;
  viewerStates?: Record<number, ViewerState>;
  viewerIsAnon: boolean;
  skinInfo?: ProfileSkinInfo;
  /** 본인일 때만 채워짐 — '프로필·설정' 아코디언 폼 props. */
  settings?: ProfileSettings | null;
}) {
  const search = useSearchRouting();
  // '프로필·설정' 아코디언 펼침 상태. 닫혀 있으면 ProfileEditClient 를 마운트하지 않음(가벼움).
  const [settingsOpen, setSettingsOpen] = useState(false);

  const v = skinInfo?.visibility ?? {};
  const showTab = (key: string) => isOwner || v[key] !== false;
  const hasSkinContent = !!(
    skinInfo &&
    (skinInfo.faceShape ||
      skinInfo.skinType ||
      skinInfo.skinConcerns.length ||
      skinInfo.interestedProcedures.length ||
      skinInfo.receivedProcedures.length)
  );
  const showSkinTabForAnon = viewerIsAnon && !isOwner;

  // 탭 순서·노출 규칙은 운영 ProfileTabs 와 동일.
  const tabs: Tab[] = (() => {
    const base: Tab[] = [];
    if (showTab("tab_posts")) base.push("posts");
    if (showTab("tab_reviews")) base.push("reviews");
    if (showTab("tab_comments")) base.push("comments");
    if (showTab("tab_likes") && isOwner) base.push("likes");
    if (showTab("tab_saves") && isOwner) base.push("saves");
    if (hasSkinContent && showTab("tab_skin")) base.push("skin");
    else if (showSkinTabForAnon) base.push("skin");
    return base;
  })();

  const tabHasContent = (t: Tab): boolean => {
    switch (t) {
      case "posts":
        return postsCount > 0;
      case "reviews":
        return reviewsCount > 0;
      case "comments":
        return commentsCount > 0;
      case "likes":
        return likesCount > 0;
      case "saves":
        return savesCount > 0;
      case "skin":
        return hasSkinContent || showSkinTabForAnon;
      default:
        return false;
    }
  };
  const defaultTab: Tab = tabs.find(tabHasContent) ?? tabs[0] ?? "posts";

  const sp = useSearchParams();
  const urlTab = sp.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(
    urlTab && tabs.includes(urlTab) ? urlTab : defaultTab,
  );

  // 댓글 / 좋아요 / 저장 lazy fetch (운영 ProfileTabs 와 동일 쿼리).
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [likedPosts, setLikedPosts] = useState<CardData[] | null>(null);
  const [savedPosts, setSavedPosts] = useState<CardData[] | null>(null);

  useEffect(() => {
    if (tab !== "comments" || comments !== null) return;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .from("comments")
        .select(
          `id, body, created_at, card_id,
           card:cards(id, title, type, post_year, post_slug, shortcode,
                  doctor:doctors(slug),
                  author:profiles!cards_author_id_profiles_fkey(handle))`,
        )
        .eq("author_id", profileId)
        .eq("status", "visible")
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<CommentRow[]>();
      setComments(data ?? []);
    })();
  }, [tab, comments, profileId]);

  useEffect(() => {
    if ((tab !== "likes" && tab !== "saves") || !isOwner) return;
    if (tab === "likes" && likedPosts !== null) return;
    if (tab === "saves" && savedPosts !== null) return;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const table = tab === "saves" ? "card_saves" : "card_likes";
      const { data: rows } = await sb
        .from(table)
        .select("card_id, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(50);
      const ids = (rows ?? []).map((r) => (r as { card_id: number }).card_id);
      if (ids.length === 0) {
        if (tab === "saves") setSavedPosts([]);
        else setLikedPosts([]);
        return;
      }
      const { data: cardRows } = await sb
        .from("cards")
        .select(
          `id, title, body, meta, keywords, like_count, view_count, save_count,
           type, post_year, post_slug, shortcode, category, hide_doctor_credential, created_at,
           external_url, external_title, external_description, external_image, external_site_name,
           doctor:doctors(slug, name, branch),
           video:videos(youtube_id, youtube_url, topic, upload_date),
           author:profiles!cards_author_id_profiles_fkey(id, display_name, avatar_url, handle, updated_at)`,
        )
        .in("id", ids)
        .returns<CardData[]>();
      const map = new Map<number, CardData>();
      for (const q of cardRows ?? []) map.set(q.id, q);
      const ordered = ids
        .map((id) => map.get(id))
        .filter((x): x is CardData => !!x);
      if (tab === "saves") setSavedPosts(ordered);
      else setLikedPosts(ordered);
    })();
  }, [tab, isOwner, profileId, likedPosts, savedPosts]);

  const cardList = (cards: CardData[]) => (
    <div className={styles.feedList}>
      {cards.map((c) => (
        <PostCard
          key={c.id}
          card={c}
          viewer={viewerStates?.[c.id]}
          onTagClick={(t) => search.onSearchSubmit?.(t)}
        />
      ))}
    </div>
  );

  return (
    <AppShell active="마이" back="/" {...search}>
      {/* 프로필 헤더 — 아바타 + 이름 + @handle + 소개. 본인이면 [설정]. */}
      <section
        className={`${styles.card} ${styles.mb20}`}
        style={{ textAlign: "center" }}
      >
        <div className={styles.authorSideAvatarWrap}>
          {/* avatarUrl 은 서버에서 의사매핑이면 누끼 사진(docMeta.photoUrl), 회원이면 profile.avatar_url 로
              이미 정확히 계산됨 → 그대로 사용. doctorSlug 를 주면 getDoctorPhoto(handle) 가 회원 핸들로
              /doctors/{핸들}.png 잘못된 경로를 만들어 깨지므로 주지 않는다. */}
          <CardAvatar
            memberAvatarUrl={avatarUrl}
            name={displayName}
            size={84}
          />
        </div>
        <div className={styles.profileName} style={{ marginTop: 10 }}>
          {displayName}
        </div>
        <div className={styles.profileSub}>@{handle}</div>
        {bio && (
          <p
            className={styles.muted}
            style={{ marginTop: 8, maxWidth: 420, marginInline: "auto" }}
          >
            {bio}
          </p>
        )}
        {isOwner && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              aria-expanded={settingsOpen}
              className={`${styles.btn} ${styles.btnGhost}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              프로필·설정
              <span aria-hidden>{settingsOpen ? "▴" : "▾"}</span>
            </button>
          </div>
        )}
      </section>

      {/* 계정(명함) 스위처 — 본인일 때만. 멀티아이디 유저의 계정 전환 진입점.
          운영 공용 카드를 그대로 재사용(useSession 기반, props 불필요).
          AccountSwitcherCard 자체 mb-4(16px) 대신 앱 카드 간격(mb20)에 맞추려 래퍼로 감싼다. */}
      {isOwner && (
        <div className={styles.mb20}>
          <AccountSwitcherCard />
        </div>
      )}

      {/* 프로필·설정 아코디언 — 펼치면 그 자리서 운영 설정 폼(ProfileEditClient embedded)을
          바로 편집(별도 페이지 이동 X). 닫혀 있으면 미마운트. settings 는 서버(page.tsx)에서 채워 넘김. */}
      {isOwner && settingsOpen && (
        <section className={`${styles.card} ${styles.mb20}`}>
          {settings ? (
            <ProfileEditClient {...settings} embedded />
          ) : (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <p className={styles.muted}>
                설정을 불러올 수 없어요. 페이지를 새로고침해 주세요.
              </p>
            </div>
          )}
        </section>
      )}

      {/* 탭 */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <div className={styles.myTabs} style={{ overflowX: "auto" }}>
          {tabs.map((t) => {
            const count =
              t === "posts"
                ? postsCount
                : t === "reviews"
                  ? reviewsCount
                  : t === "comments"
                    ? comments?.length ?? commentsCount
                    : t === "likes"
                      ? likesCount
                      : t === "saves"
                        ? savesCount
                        : null;
            return (
              <button
                key={t}
                type="button"
                className={`${styles.myTab} ${tab === t ? styles.myTabOn : ""}`}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
              >
                {TAB_LABEL[t]}
                {count !== null && count > 0 ? ` ${count}` : ""}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 14 }}>
          {tab === "posts" &&
            (posts.length === 0 ? (
              <Empty msg="아직 작성한 글이 없어요" />
            ) : (
              cardList(posts)
            ))}
          {tab === "reviews" &&
            (reviews.length === 0 ? (
              <Empty msg="아직 작성한 후기가 없어요" />
            ) : (
              cardList(reviews)
            ))}
          {tab === "comments" &&
            (comments === null ? (
              <Empty msg="불러오는 중…" />
            ) : comments.length === 0 ? (
              <Empty msg="작성한 댓글이 없어요" />
            ) : (
              <div className={styles.commentGrid}>
                {comments.map((c) => (
                  <Link
                    key={c.id}
                    href={c.card ? commentLink(c) : "/"}
                    className={styles.commentLink}
                  >
                    {c.card && <p className={styles.commentTitle}>{c.card.title}</p>}
                    <p className={styles.commentBody}>↳ {c.body}</p>
                  </Link>
                ))}
              </div>
            ))}
          {tab === "likes" &&
            (likedPosts === null ? (
              <Empty msg="불러오는 중…" />
            ) : likedPosts.length === 0 ? (
              <Empty msg="좋아요한 글이 없어요" />
            ) : (
              cardList(likedPosts)
            ))}
          {tab === "saves" &&
            (savedPosts === null ? (
              <Empty msg="불러오는 중…" />
            ) : savedPosts.length === 0 ? (
              <Empty msg="저장한 글이 없어요" />
            ) : (
              cardList(savedPosts)
            ))}
          {tab === "skin" &&
            (showSkinTabForAnon ? (
              <LoginPromptForPII />
            ) : skinInfo ? (
              <SkinInfoBlock info={skinInfo} />
            ) : null)}
        </div>
      </section>

      {/* 로그아웃은 마이 메인(/my)으로 이동(2026-06-25). 공개 프로필 하단에서는 제거. */}

      {/* 신뢰·법적 길목(about·약관·문의 등) — 모든 방문자에게 노출(SNS 표준 in-page 푸터). */}
      <PolicyFooter />
    </AppShell>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className={styles.profileEmpty}>{msg}</p>;
}

function LoginPromptForPII() {
  return (
    <div className={styles.profilePii}>
      <p className={styles.profilePiiTitle}>
        피부 고민·관심 시술 정보는 회원에게만 공개돼요
      </p>
      <p className={styles.muted} style={{ marginBottom: 14 }}>
        같은 피부 고민을 가진 회원들과 정보를 나눠 보세요.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/signup">
          1초 만에 가입하기
        </Link>
        <Link className={`${styles.btn} ${styles.btnGhost}`} href="/login">
          로그인
        </Link>
      </div>
    </div>
  );
}

function SkinInfoBlock({ info }: { info: ProfileSkinInfo }) {
  const v = info.visibility ?? {};
  const sections: { title: string; chips: string[] }[] = [];

  const myChips: string[] = [];
  if (v.face_shape !== false && info.faceShape)
    myChips.push(FACE_LABEL[info.faceShape] ?? info.faceShape);
  if (v.skin_type !== false && info.skinType)
    myChips.push(SKIN_LABEL[info.skinType] ?? info.skinType);
  if (myChips.length) sections.push({ title: "내 피부는요..", chips: myChips });

  if (v.skin_concerns !== false && info.skinConcerns.length)
    sections.push({
      title: "내 피부고민은요..",
      chips: info.skinConcerns.map((c) => CONCERN_LABEL[c] ?? c),
    });
  if (v.interested_procedures !== false && info.interestedProcedures.length)
    sections.push({
      title: "저는 이런 시술에 관심 있어요~",
      chips: info.interestedProcedures.map((p) => PROCEDURE_LABEL[p] ?? p),
    });
  if (info.receivedProcedures.length)
    sections.push({
      title: "제가 받은 시술은요~",
      chips: info.receivedProcedures,
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {sections.map((s, i) => (
        <div key={i} className={styles.skinSection}>
          <h3 className={styles.skinTitle}>{s.title}</h3>
          <div className={styles.skinChips}>
            {s.chips.map((c, ci) => (
              <Link
                key={ci}
                href={`/?q=${encodeURIComponent(c)}`}
                className={styles.t}
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
