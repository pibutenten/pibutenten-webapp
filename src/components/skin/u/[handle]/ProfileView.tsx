"use client";

/**
 * ProfileView — /{handle} "프로필 2뎁스" 본문 (클라이언트).
 *
 * 2026-07-08 UI 개편 Phase 4-2 신디자인 (시안 `전달용/260708 UI개편/1d-마이페이지 _ 프로필(내 계정).png`
 * ·`1d-마이페이지-프로필(타인 계정).png`, 명세 PDF 9~11p — 색·간격·라운드는 명세 값 그대로):
 *   ① 헤더: < 뒤로(BackButton 재사용) + 본인="내 정보"(볼드)·우측 "수정"(회색 → /my/settings)
 *      / 타인=제목 없음·우측 ⋯(신고하기 메뉴 → /report).
 *   ② 프로필 카드(흰·라운드 16·패딩 24): 사진(원형 크게)+이름(볼드)+@handle(회색)
 *      + 태그 3(연령대·얼굴형·피부타입 — #DCEBF7 배경·#2E8BD0 글자, field_visibility 존중:
 *        타인은 get_profile_pii RPC 가 공개분만 반환·anon 은 미표시)
 *      / 통계 3등분(N 작성글·N 후기·N 댓글 — 숫자 볼드 #3A3C41 + 라벨 회색, divider #EDF0F3)
 *      / 본인만 "프로필 수정" 버튼(#ECEFF2·#5A646C·라운드 12·가로 꽉) → /my/settings
 *      / 타인은 FollowButton 유지(D8 — 시안 미표기는 생략이지 제거 아님).
 *   ③ 필터 칩(가로 스크롤, 선택 #1A9DE8+흰 / 비선택 #DCEBF7+#5A88A8):
 *      본인 5종(내가 쓴 글/내 후기/내 댓글/좋아요/북마크) · 타인 3종(작성한 글/후기/댓글).
 *      기존 `?tab=` 딥링크 파싱 유지 + 무효 탭값(구 skin 포함)·비허용 탭(타인 likes/saves)은
 *      기본 탭(posts) fallback (D7 — skin 탭 제거로 구 딥링크 명시 처리).
 *   ④ 게시글 목록: 기존 PostCard 재사용 — 좋아요·댓글·북마크·공유 배선(RPC)·글상세 링크(getQaUrl)
 *      ·수치 표기가 시안 카드 구조(작성자 줄‖⋯ / 제목 / 본문 / 구분선 / 수치+공유)와 일치.
 *      댓글/좋아요/북마크 lazy fetch(기존 탭별 fetch 쿼리 그대로) 보존.
 *
 * 구조 이동 (Phase 4, D7·D9·D10):
 *   - skin 탭 제거 — 피부정보 상세(피부고민·관심시술·받은시술)는 /my "내 피부 정보"로 이동 완료.
 *   - '프로필·설정' 아코디언(ProfileEditClient embedded)·ClinicLinksSection → /my/settings 로 이관.
 *   - AccountSwitcherCard(명함 전환, full reload)는 본인 화면에 유지 (D10).
 *
 * 보존 규칙: likes/saves 는 owner 전용(RLS 도 본인만) / 타인 칩은 field_visibility(tab_*) 존중
 * (anon 뷰어는 구 동작 그대로 visibility 미적용 — 서버가 빈 객체 전달, 동작 불변).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import AccountSwitcherCard from "@/components/AccountSwitcherCard";
import FollowButton from "@/components/FollowButton";
import CardAvatar from "@/components/card/CardAvatar";
import BackButton from "@/components/BackButton";
import type { CardData } from "@/lib/types/card";
import AppShell from "../../AppShell";
import PolicyFooter from "../../PolicyFooter";
import styles from "../../app.module.css";
import {
  PostCard,
  useSearchRouting,
  type ViewerState,
} from "../../ui";

/* ---------- 명세 색 (PDF 10p — 프로필 2depth 전용 팔레트) ---------- */
const C = {
  /** 진한 텍스트 — 이름·헤더 제목·통계 숫자·뒤로/더보기 아이콘 */
  title: "#3A3C41",
  /** 회색 텍스트 — @handle·통계 라벨·헤더 "수정" */
  gray: "#A0A8B0",
  /** 연한 파랑 태그(연령대·얼굴형·피부타입) 배경/글자 */
  tagBg: "#DCEBF7",
  tagText: "#2E8BD0",
  /** 필터 칩 — 선택/비선택 */
  chipOnBg: "#1A9DE8",
  chipOnText: "#FFFFFF",
  chipOffBg: "#DCEBF7",
  chipOffText: "#5A88A8",
  /** "프로필 수정" 버튼 */
  editBtnBg: "#ECEFF2",
  editBtnText: "#5A646C",
  /** 통계 세로 divider */
  divider: "#EDF0F3",
} as const;

type Tab = "posts" | "reviews" | "comments" | "likes" | "saves";

/** 필터 칩 라벨 — 본인/타인 문구가 다름(시안: "내가 쓴 글" vs "작성한 글"). */
const OWNER_TAB_LABEL: Record<Tab, string> = {
  posts: "내가 쓴 글",
  reviews: "내 후기",
  comments: "내 댓글",
  likes: "좋아요",
  saves: "북마크",
};
const OTHER_TAB_LABEL: Record<Tab, string> = {
  posts: "작성한 글",
  reviews: "후기",
  comments: "댓글",
  likes: "좋아요", // 타인 칩엔 미노출(owner 게이트) — 타입 완결용
  saves: "북마크",
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

/* ---------- 태그 칩 (pill · 간격 8px wrap — 명세) ---------- */
function TagChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: C.tagBg,
        color: C.tagText,
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1.4,
        padding: "5px 12px",
        borderRadius: 999,
      }}
    >
      {label}
    </span>
  );
}

/* ---------- 통계 열 — "5 작성글" (숫자 볼드 진한색 + 라벨 회색, 가로 배열 · 시안) ---------- */
function StatCol({
  value,
  label,
  withDivider = false,
}: {
  value: number;
  label: string;
  withDivider?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        gap: 6,
        padding: "2px 4px",
        borderLeft: withDivider ? `1px solid ${C.divider}` : "none",
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 800, color: C.title, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: C.gray }}>{label}</span>
    </div>
  );
}

/* ---------- 타인 헤더 ⋯ 메뉴 — 신고하기 1항목 (프로필 단위 메뉴 부재 → 신설, 계획서 Phase 4-2) ---------- */
function OtherProfileMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기 (PostCardMenu 관례).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="더보기"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: C.title,
          padding: "6px 8px",
          fontSize: 20,
          lineHeight: 1,
          letterSpacing: 1,
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            zIndex: 30,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 6px 24px rgba(20,40,60,.14)",
            padding: 6,
            minWidth: 132,
          }}
        >
          {/* 콘텐츠 신고 페이지(/report, 정보통신망법 §44-2 폼) — 프로필·게시물 공용 접수 창구. */}
          <Link
            role="menuitem"
            href="/report"
            style={{
              display: "block",
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              color: C.title,
              textDecoration: "none",
            }}
            onClick={() => setOpen(false)}
          >
            신고하기
          </Link>
        </div>
      )}
    </div>
  );
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
  viewerStates,
  ageGroupLabel,
  faceShapeLabel,
  skinTypeLabel,
  visibility,
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
  /** 좋아요·북마크 카운트 — 신디자인 칩은 수치 미표시라 현재 미렌더.
   *  서버 prefetch 계약(owner 한정 집계, 계획서 Phase 4-3 "타 탭 prefetch 불변")은 유지. */
  likesCount: number;
  savesCount: number;
  viewerStates?: Record<number, ViewerState>;
  /** anon 뷰어 여부 — 태그·visibility 는 서버가 이미 반영해 전달하므로 현재 미사용(계약 유지). */
  viewerIsAnon: boolean;
  /** 프로필 태그 3종 — 서버 계산(get_profile_pii RPC 가 타인 field_visibility 필터를 적용한
   *  반환값 기반). null = 미입력·비공개·anon 뷰어 → 칩 생략. */
  ageGroupLabel: string | null;
  faceShapeLabel: string | null;
  skinTypeLabel: string | null;
  /** field_visibility — 타인 뷰 필터 칩(tab_posts/tab_reviews/tab_comments) 노출 게이트.
   *  anon 뷰어는 구 동작 보존을 위해 서버가 빈 객체 전달(전 칩 노출 — 기존 동작 불변). */
  visibility: Record<string, boolean>;
}) {
  const search = useSearchRouting();

  const v = visibility ?? {};
  const showTab = (key: string) => isOwner || v[key] !== false;

  // 칩 구성 — 본인 5종 / 타인 3종(+field_visibility 게이트). likes/saves 는 owner 전용(RLS 정합).
  const tabs: Tab[] = (() => {
    const base: Tab[] = [];
    if (showTab("tab_posts")) base.push("posts");
    if (showTab("tab_reviews")) base.push("reviews");
    if (showTab("tab_comments")) base.push("comments");
    if (isOwner && showTab("tab_likes")) base.push("likes");
    if (isOwner && showTab("tab_saves")) base.push("saves");
    return base;
  })();
  const tabLabel = isOwner ? OWNER_TAB_LABEL : OTHER_TAB_LABEL;

  // 기본 탭 = posts (시안: 첫 칩 선택 상태). visibility 로 posts 자체가 숨으면 첫 허용 칩.
  const defaultTab: Tab = tabs.includes("posts") ? "posts" : tabs[0] ?? "posts";

  // `?tab=` 딥링크 파싱 유지 — 허용 목록(tabs)에 있는 값만 채택. 무효 값(구 "skin" 포함)·
  // 비허용 탭(타인 likes/saves 등)은 기본 탭 fallback (D7·계획서 Phase 4-2).
  const sp = useSearchParams();
  const urlTabRaw = sp.get("tab");
  const urlTab =
    urlTabRaw && (tabs as string[]).includes(urlTabRaw)
      ? (urlTabRaw as Tab)
      : null;
  const [tab, setTab] = useState<Tab>(urlTab ?? defaultTab);

  // 댓글 / 좋아요 / 저장 lazy fetch (기존 탭별 fetch 쿼리 그대로 보존).
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

  const tags = [ageGroupLabel, faceShapeLabel, skinTypeLabel].filter(
    (t): t is string => !!t,
  );

  return (
    <AppShell active="마이" canvas="profile" {...search}>
      {/* ① 헤더 — < 뒤로 + (본인) "내 정보"·우측 "수정" / (타인) 제목 없음·우측 ⋯. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          margin: "2px 0 16px",
        }}
      >
        {/* 히스토리 없을 때 fallback: 본인=마이페이지(주 진입 동선), 타인=피드 (최종 검수 A). */}
        <BackButton fallbackHref={isOwner ? "/my" : "/"} hideLabel />
        {isOwner && (
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.title, margin: 0 }}>
            내 정보
          </h1>
        )}
        <span style={{ flex: 1 }} />
        {isOwner ? (
          <Link
            href="/my/settings"
            style={{
              color: C.gray,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              padding: "4px 6px",
            }}
          >
            수정
          </Link>
        ) : (
          <OtherProfileMenu />
        )}
      </div>

      {/* ② 프로필 카드 — 사진 + 이름 + @handle + 태그 3 / 통계 3등분 / 수정 버튼(본인)·팔로우(타인). */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* avatarUrl 은 서버에서 의사매핑이면 누끼 사진(docMeta.photoUrl), 회원이면 profile.avatar_url 로
              이미 정확히 계산됨 → 그대로 사용. doctorSlug 를 주면 getDoctorPhoto(handle) 가 회원 핸들로
              /doctors/{핸들}.png 잘못된 경로를 만들어 깨지므로 주지 않는다. */}
          <CardAvatar memberAvatarUrl={avatarUrl} name={displayName} size={92} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: C.title,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </div>
            <div style={{ fontSize: 14, color: C.gray, marginTop: 3 }}>@{handle}</div>
            {tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {tags.map((t) => (
                  <TagChip key={t} label={t} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 자기소개 — 명세 카드 구조엔 없으나 기존 표시 필드 유지(빈 값이면 생략). */}
        {bio && (
          <p
            style={{
              margin: "14px 0 0",
              fontSize: 13.5,
              lineHeight: 1.6,
              color: C.gray,
              overflowWrap: "break-word",
            }}
          >
            {bio}
          </p>
        )}

        {/* 통계 3등분 — N 작성글 / N 후기 / N 댓글. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            marginTop: 22,
          }}
        >
          <StatCol value={postsCount} label="작성글" />
          <StatCol value={reviewsCount} label="후기" withDivider />
          <StatCol value={commentsCount} label="댓글" withDivider />
        </div>

        {isOwner ? (
          <Link
            href="/my/settings"
            style={{
              display: "block",
              marginTop: 22,
              background: C.editBtnBg,
              color: C.editBtnText,
              borderRadius: 12,
              textAlign: "center",
              padding: "13px 0",
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            프로필 수정
          </Link>
        ) : (
          /* 타인 — FollowButton 유지(D8). 관심사 다이제스트·새 글 알림과 연결된 기존 기능. */
          <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
            <FollowButton followeeId={profileId} />
          </div>
        )}
      </section>

      {/* 계정(명함) 스위처 — 본인일 때만 유지(D10). 멀티아이디 유저의 계정 전환 진입점.
          full-reload 전제 공용 카드 그대로 재사용(useSession 기반, props 불필요). */}
      {isOwner && (
        <div style={{ marginTop: 16 }}>
          <AccountSwitcherCard />
        </div>
      )}

      {/* ③ 필터 칩 — 가로 스크롤 한 줄(.chipRow: flex·gap 8·스크롤바 숨김 기존 클래스 재사용).
          프로필 카드와 20px 간격(명세) — chipRow 자체 상단 패딩 10px + marginTop 10. */}
      <div className={styles.chipRow} role="tablist" style={{ marginTop: 10 }}>
        {tabs.map((t) => {
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t)}
              style={{
                flexShrink: 0,
                border: "none",
                cursor: "pointer",
                borderRadius: 999,
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 600,
                background: on ? C.chipOnBg : C.chipOffBg,
                color: on ? C.chipOnText : C.chipOffText,
              }}
            >
              {tabLabel[t]}
            </button>
          );
        })}
      </div>

      {/* ④ 목록 — 칩과 20px 간격(명세): chipRow 하단 패딩 14px + 6px. */}
      <div style={{ marginTop: 6 }}>
        {tab === "posts" &&
          (posts.length === 0 ? (
            <EmptyCard msg="아직 작성한 글이 없어요" />
          ) : (
            cardList(posts)
          ))}
        {tab === "reviews" &&
          (reviews.length === 0 ? (
            <EmptyCard msg="아직 작성한 후기가 없어요" />
          ) : (
            cardList(reviews)
          ))}
        {tab === "comments" &&
          (comments === null ? (
            <EmptyCard msg="불러오는 중…" />
          ) : comments.length === 0 ? (
            <EmptyCard msg="작성한 댓글이 없어요" />
          ) : (
            <section style={{ background: "#ffffff", borderRadius: 16, padding: 20 }}>
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
            </section>
          ))}
        {tab === "likes" &&
          (likedPosts === null ? (
            <EmptyCard msg="불러오는 중…" />
          ) : likedPosts.length === 0 ? (
            <EmptyCard msg="좋아요한 글이 없어요" />
          ) : (
            cardList(likedPosts)
          ))}
        {tab === "saves" &&
          (savedPosts === null ? (
            <EmptyCard msg="불러오는 중…" />
          ) : savedPosts.length === 0 ? (
            <EmptyCard msg="저장한 글이 없어요" />
          ) : (
            cardList(savedPosts)
          ))}
      </div>

      {/* 신뢰·법적 길목(about·약관·문의 등) — 모든 방문자에게 노출(SNS 표준 in-page 푸터). */}
      <PolicyFooter />
    </AppShell>
  );
}

/** 빈 상태 — 캔버스(#EAF2F8) 위라 흰 카드로 감싸 목록 자리임을 유지. */
function EmptyCard({ msg }: { msg: string }) {
  return (
    <section style={{ background: "#ffffff", borderRadius: 16, padding: 20 }}>
      <p className={styles.profileEmpty}>{msg}</p>
    </section>
  );
}
