"use client";

/**
 * MyPageView — /my "마이페이지" 허브 본문 (클라이언트, 회원 전용).
 *
 * 2026-07-08 UI 개편 Phase 3 신디자인 (시안 `전달용/260708 UI개편/1d-마이페이지*.png`,
 * 명세 PDF 7~9p — 색·간격·라운드는 명세 값 그대로):
 *   ① 타이틀 바: "마이페이지"(볼드) + 알림 벨(→/notifications) + 설정(→/my/settings)
 *   ② 프로필 카드(흰 카드 · 라운드 16 · 패딩 24): 아바타(원형)+이름(볼드)+우측 >(전체 → /{handle})
 *      / 이름 아래 태그 3종(연령대·얼굴형·피부타입 — #DAF1FB 배경·#43A6D2 글자)
 *      / [접힘] 구분선 + 가운데 "내 피부 정보 ˅" ↔ [펼침] 나의 피부 고민·관심 시술(회색 칩)
 *        + **내가 받은 시술**(D11 원장 확정: 카테고리 팔레트 — categoryTheme(cat).soft 배경 +
 *        color 글자, 카테고리 미매핑은 회색 칩) + 구분선 + "정보 수정"(좌)·"접기 ˄"(우).
 *      접힘↔펼침은 grid-template-rows 0fr↔1fr 전환(부드러운 높이 확장), 기본 접힘.
 *   ③ 요약 통계 카드(3등분 세로 divider): 좋아요(#FF6B8A)·북마크(#FFC93C)·최근 본 글(연두 시계)
 *      — 아이콘 위 / 라벨 가운데 / 숫자 아래(#A0A8B0). 링크 현행 유지(0건 최근 본 글만 비활성).
 *   ④ 나의 활동: 내 노트 / 내가 쓴 글 / 내 후기 / 내 댓글 (시안 순서 4행)
 *   ⑤ 나의 관심: 좋아요 / 북마크
 *   ⑥ 설정: 앱 설정   ⑦ 고객지원: 공지사항·고객센터·의견 남기기·탈퇴하기
 *   ⑧ 계정: 로그아웃 — 시안에 없으나 기능 유지(LogoutRow).
 *
 * 데이터·링크는 모두 운영 라우트 재사용(신규 백엔드 없음):
 *   - 프로필/태그/칩/카운트는 server(/my/page.tsx)가 active 명함 기준으로 조립해 props 주입.
 *   - 활동/관심 목록은 공개 프로필(/{handle})의 탭(?tab=posts|reviews|comments|likes|saves).
 *   - "정보 수정"·"앱 설정"·"탈퇴하기"는 /my/settings (프로필·설정 전용 화면 — Phase 4-5 전환 완료.
 *     구 목적지였던 /{handle} 아코디언은 D9 로 제거, 탈퇴 footer 는 ProfileEditClient 내장).
 *
 * AppShell(active="마이", canvas="my" — 페이지 배경 #DAF1FB)이 브랜드 헤더 + 하단 탭바를
 * 제공하므로, 디자인의 타이틀 바는 본문 최상단 in-content 로 재현한다(현행 패턴 유지).
 * 아이콘은 Phase 0 공용 모듈(@/components/icons). 셰브론(˅ ˄ ›)만 코드로 그림(계획서 §1.1-3).
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";
import CardAvatar from "@/components/card/CardAvatar";
import {
  IconBell,
  IconSettings,
  IconBookOpen,
  IconEdit,
  IconCheckCircle,
  IconMessageSquare,
  IconHeart,
  IconBookmark,
  IconClock,
  IconMegaphone,
  IconHelp,
  IconMail,
  IconLogOut,
  IconProfile,
} from "@/components/icons";
import { categoryTheme } from "@/lib/procedure-theme";
import type { ProcedureCategory } from "@/lib/procedure-report";
import { useSearchRouting } from "../ui";
import AppShell from "../AppShell";
import PolicyFooter from "../PolicyFooter";

/** 내가 받은 시술 1건 — category 는 테마 slug(tag_dictionary→categoryKoToSlug, 서버 매핑).
 *  null = 사전 미등록·비시술 카테고리 → 회색 칩 (D11: source 기반 구분 폐기). */
export type ReceivedProcedure = {
  name: string;
  category: ProcedureCategory | null;
};

export type MyPageProps = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** 디자인 태그칩 — 연령대(예: "30대") / 얼굴형(예: "각진형") / 피부타입(예: "건성"). null 은 미입력 → 칩 생략. */
  ageGroupLabel: string | null;
  faceShapeLabel: string | null;
  skinTypeLabel: string | null;
  /** 내 피부 정보 펼침 — 나의 피부 고민 / 관심 시술 (서버에서 CONCERN/PROCEDURE_LABEL 매핑 완료). */
  skinConcernLabels: string[];
  interestedProcedureLabels: string[];
  /** 내가 받은 시술 — diaries→diary_procedures distinct (최근 방문 우선). */
  receivedProcedures: ReceivedProcedure[];
  likesCount: number;
  savesCount: number;
  /** 서버 카운트 5종 유지(로직 불변) — 신디자인 활동 행에는 숫자 미표시(시안)라 현재 미렌더. */
  postCount: number;
  commentCount: number;
  /** 최근 본 글 개수(get_my_recent_view_count RPC). 0 이면 "최근 본 글" 스탯 비활성(링크 없음). */
  recentCount: number;
};

/* ---------- 명세 색 (PDF 8p — 마이페이지 1depth 전용 팔레트) ---------- */
const C = {
  /** 타이틀·섹션 제목·행 라벨·소제목 */
  title: "#3A3C41",
  /** 통계 숫자 */
  statNum: "#A0A8B0",
  /** 프로필 태그 칩 배경(연한 파랑 — 페이지 배경과 동일 톤) */
  tagBg: "#DAF1FB",
  /** 프로필 태그 칩 글자 */
  tagText: "#43A6D2",
  /** "내 피부 정보"·"정보 수정"·"접기" 텍스트+셰브론 */
  subtle: "#5A646C",
  /** 회색 칩(피부 고민·관심 시술·미매핑 받은 시술) 배경/글자 */
  grayChipBg: "#EDF2F4",
  grayChipText: "#676B76",
  /** 행 우측 > 셰브론 */
  chevron: "#C2CAD1",
  /** 구분선 */
  divider: "#EDF0F3",
  /** 통계 아이콘 — 좋아요 하트 / 북마크 */
  heart: "#FF6B8A",
  bookmark: "#FFC93C",
} as const;

/* 흰 카드 공통 — 명세: 라운드 16px, 배경 #FFFFFF (그림자 명세 없음 — 캔버스 #DAF1FB 위 플랫). */
const CARD_STYLE: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  width: "100%",
  minWidth: 0,
};

/* ---------- 셰브론 3종 — 공용 아이콘 모듈에 없어 코드로 그림(계획서 §1.1-3) ---------- */
function ChevronRight({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function ChevronDown({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function ChevronUp({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

/* ---------- 칩 (pill · 간격 8px wrap — 명세) ---------- */
function Chip({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: bg,
        color,
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

/** 펼침 상세의 소제목 + 칩 묶음 (소제목-칩 12px — 명세). */
function ChipGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: C.title, margin: "0 0 12px" }}>
        {title}
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}

function Divider({ style }: { style?: React.CSSProperties }) {
  return <div style={{ height: 1, background: C.divider, ...style }} aria-hidden />;
}

/* ---------- 메뉴 행 / 섹션 ---------- */

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "16px 0",
  color: C.title,
  textDecoration: "none",
  fontSize: 15,
  fontWeight: 600,
};

function NavRow({ icon, label, href }: { icon: ReactNode; label: string; href: string }) {
  return (
    <Link href={href} style={ROW_STYLE}>
      <span style={{ display: "inline-flex", color: C.title, flexShrink: 0 }} aria-hidden>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ display: "inline-flex", color: C.chevron, flexShrink: 0 }} aria-hidden>
        <ChevronRight />
      </span>
    </Link>
  );
}

/**
 * 로그아웃 행 — NavRow 와 동일한 행 레이아웃이되 링크가 아닌 LogoutButton(버튼) 재사용.
 *   버튼은 색·폰트를 행과 맞추도록 무톤 className 으로 오버라이드.
 */
function LogoutRow() {
  return (
    <div style={{ ...ROW_STYLE, cursor: "default" }}>
      <span style={{ display: "inline-flex", color: C.title, flexShrink: 0 }} aria-hidden>
        <IconLogOut size={22} />
      </span>
      <LogoutButton
        label="로그아웃"
        className="flex-1 text-left bg-transparent border-0 p-0 m-0 cursor-pointer text-[15px] font-semibold text-[#3A3C41] disabled:opacity-50"
      />
    </div>
  );
}

/** 섹션 = 제목 + 흰 카드. 섹션 간 32px · 제목-카드 12px (명세). 행 사이 divider 없음(시안). */
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.title, margin: "0 4px 12px" }}>
        {title}
      </h2>
      <div style={{ ...CARD_STYLE, padding: "4px 24px" }}>{children}</div>
    </section>
  );
}

/* ---------- 요약 통계 열 ---------- */
function StatCol({
  href,
  iconColor,
  icon,
  label,
  value,
  withDivider = false,
}: {
  /** null 이면 링크 대신 비활성 span 으로 렌더(이동 없음). "최근 본 글" 0개 케이스. */
  href: string | null;
  /** 아이콘 색(currentColor 아이콘용). 고정색 아이콘(IconClock)은 미지정. */
  iconColor?: string;
  icon: ReactNode;
  label: string;
  value: number;
  withDivider?: boolean;
}) {
  const inner = (
    <>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 26,
          ...(iconColor ? { color: iconColor } : null),
        }}
        aria-hidden
      >
        {icon}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.title }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: C.statNum, lineHeight: 1 }}>
        {value}
      </span>
    </>
  );
  const colStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 7,
    padding: "4px 4px",
    textDecoration: "none",
    color: C.title,
    // 3등분 세로 divider (시안) — 2·3열 좌측 경계선.
    borderLeft: withDivider ? `1px solid ${C.divider}` : "none",
  };
  // href 가 null 이면 클릭 비활성(링크 아님) — 이동·토스트 없음(현행 규칙 유지).
  if (href === null) {
    return <span style={colStyle}>{inner}</span>;
  }
  return (
    <Link href={href} style={colStyle}>
      {inner}
    </Link>
  );
}

export default function MyPageView({
  handle,
  displayName,
  avatarUrl,
  ageGroupLabel,
  faceShapeLabel,
  skinTypeLabel,
  skinConcernLabels,
  interestedProcedureLabels,
  receivedProcedures,
  likesCount,
  savesCount,
  recentCount,
}: MyPageProps) {
  // 헤더 검색 → 피드로 라우팅(운영 공용 헬퍼) — 다른 스킨 페이지와 동일하게 AppShell 에 주입.
  const search = useSearchRouting();

  // 내 피부 정보 접힘/펼침 — 기본 접힘(시안 1d-마이페이지).
  const [skinOpen, setSkinOpen] = useState(false);

  const profileHref = `/${handle}`;
  const tags = [ageGroupLabel, faceShapeLabel, skinTypeLabel].filter(
    (t): t is string => !!t,
  );
  const hasSkinDetail =
    skinConcernLabels.length > 0 ||
    interestedProcedureLabels.length > 0 ||
    receivedProcedures.length > 0;

  // 접힘↔펼침 부드러운 높이 확장 — grid-template-rows 0fr↔1fr 패턴(계획서 Phase 3-2).
  //   상세(펼침)와 접힘 푸터("내 피부 정보 ˅")를 서로 반대 방향으로 전환해 카드 높이가
  //   한 번의 트랜지션으로 자연스럽게 늘고 준다. 숨은 쪽은 aria-hidden + tabIndex=-1.
  const collapser = (open: boolean): React.CSSProperties => ({
    display: "grid",
    gridTemplateRows: open ? "1fr" : "0fr",
    transition: "grid-template-rows 0.3s ease",
  });
  const collapserInner: React.CSSProperties = { overflow: "hidden", minHeight: 0 };

  return (
    <AppShell active="마이" canvas="my" {...search}>
      {/* 셸 .page 좌우 18px + 2px = 명세 좌우 여백 20px (app.module.css 는 수정 금지 대상). */}
      <div style={{ padding: "0 2px" }}>
        {/* ① 타이틀 바 — "마이페이지" + 벨 + 설정. in-content 헤더(셸 브랜드 헤더는 위에 유지). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "2px 2px 16px",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.title, margin: 0 }}>
            마이페이지
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link
              href="/notifications"
              aria-label="알림"
              style={{ display: "inline-flex", padding: 6, color: C.title }}
            >
              <IconBell size={24} />
            </Link>
            {/* 설정 — /my/settings (Phase 4-5: 구 /settings redirect 경유지 대신 직행). */}
            <Link
              href="/my/settings"
              aria-label="설정"
              style={{ display: "inline-flex", padding: 6, color: C.title }}
            >
              <IconSettings size={24} />
            </Link>
          </div>
        </div>

        {/* ② 프로필 카드 — 상단 행 전체가 공개 프로필 링크 + 내 피부 정보 접힘/펼침. */}
        <section style={{ ...CARD_STYLE, padding: 24 }}>
          <Link
            href={profileHref}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <CardAvatar memberAvatarUrl={avatarUrl} name={displayName} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: C.title,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayName}
              </div>
            </div>
            <span style={{ display: "inline-flex", color: C.chevron, flexShrink: 0 }} aria-hidden>
              <ChevronRight size={20} />
            </span>
          </Link>

          {/* 태그 3종 — 연령대·얼굴형·피부타입 (미입력은 생략). */}
          {tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {tags.map((t) => (
                <Chip key={t} label={t} bg={C.tagBg} color={C.tagText} />
              ))}
            </div>
          )}

          {/* [펼침] 내 피부 정보 상세 — 그룹 간 24px · 소제목-칩 12px (명세). */}
          <div style={collapser(skinOpen)} aria-hidden={!skinOpen}>
            <div style={collapserInner}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                  paddingTop: 20,
                }}
              >
                {skinConcernLabels.length > 0 && (
                  <ChipGroup title="나의 피부 고민">
                    {skinConcernLabels.map((c) => (
                      <Chip key={c} label={c} bg={C.grayChipBg} color={C.grayChipText} />
                    ))}
                  </ChipGroup>
                )}
                {interestedProcedureLabels.length > 0 && (
                  <ChipGroup title="관심 시술">
                    {interestedProcedureLabels.map((p) => (
                      <Chip key={p} label={p} bg={C.grayChipBg} color={C.grayChipText} />
                    ))}
                  </ChipGroup>
                )}
                {receivedProcedures.length > 0 && (
                  <ChipGroup title="내가 받은 시술">
                    {receivedProcedures.map((p) => {
                      // D11 원장 확정: 칩 색 = 시술 카테고리 팔레트(categoryTheme 의
                      //   soft 배경 + color 글자). 미매핑(null)은 회색 칩 — categoryTheme(null)
                      //   의 브랜드 블루 폴백을 쓰지 않는다(명세: 회색).
                      if (!p.category) {
                        return (
                          <Chip key={p.name} label={p.name} bg={C.grayChipBg} color={C.grayChipText} />
                        );
                      }
                      const theme = categoryTheme(p.category);
                      return <Chip key={p.name} label={p.name} bg={theme.soft} color={theme.color} />;
                    })}
                  </ChipGroup>
                )}
                {!hasSkinDetail && (
                  <p style={{ margin: 0, fontSize: 13.5, color: C.grayChipText }}>
                    아직 입력한 피부 정보가 없어요. &lsquo;정보 수정&rsquo;에서 채워 보세요.
                  </p>
                )}
              </div>
              <Divider style={{ marginTop: 20 }} />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 14,
                }}
              >
                {/* 정보 수정 — /my/settings (Phase 4-5 전환 완료. 구 /{handle} 아코디언은 D9 제거). */}
                <Link
                  href="/my/settings"
                  tabIndex={skinOpen ? 0 : -1}
                  style={{
                    color: C.subtle,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    padding: "2px 4px",
                  }}
                >
                  정보 수정
                </Link>
                <button
                  type="button"
                  onClick={() => setSkinOpen(false)}
                  aria-expanded={skinOpen}
                  tabIndex={skinOpen ? 0 : -1}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background: "none",
                    border: "none",
                    padding: "2px 4px",
                    cursor: "pointer",
                    color: C.subtle,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  접기
                  <ChevronUp />
                </button>
              </div>
            </div>
          </div>

          {/* [접힘] 하단 가운데 "내 피부 정보 ˅" — 펼침과 반대 방향으로 접힘. */}
          <div style={collapser(!skinOpen)} aria-hidden={skinOpen}>
            <div style={collapserInner}>
              <Divider style={{ marginTop: 16 }} />
              <button
                type="button"
                onClick={() => setSkinOpen(true)}
                aria-expanded={skinOpen}
                tabIndex={skinOpen ? -1 : 0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: "14px 0 0",
                  cursor: "pointer",
                  color: C.subtle,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                내 피부 정보
                <ChevronDown />
              </button>
            </div>
          </div>
        </section>

        {/* ③ 요약 통계 — 좋아요 / 북마크 / 최근 본 글 (아이콘 위·라벨 가운데·숫자 아래). */}
        <section style={{ ...CARD_STYLE, marginTop: 24, padding: "18px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            <StatCol
              href={`${profileHref}?tab=likes`}
              iconColor={C.heart}
              icon={<IconHeart size={24} />}
              label="좋아요"
              value={likesCount}
            />
            <StatCol
              href={`${profileHref}?tab=saves`}
              iconColor={C.bookmark}
              icon={<IconBookmark size={22} />}
              label="북마크"
              value={savesCount}
              withDivider
            />
            {/* 최근 본 글 — 개수>0 이면 /my/recent 로, 0 이면 비활성(현행 규칙 유지).
                IconClock 은 고정색(연두 원형 — 공용 모듈 예외 3종) → iconColor 미지정. */}
            <StatCol
              href={recentCount > 0 ? "/my/recent" : null}
              icon={<IconClock size={26} />}
              label="최근 본 글"
              value={recentCount}
              withDivider
            />
          </div>
        </section>

        {/* ④ 나의 활동 — 시안 순서: 내 노트 / 내가 쓴 글 / 내 후기 / 내 댓글. */}
        <SectionCard title="나의 활동">
          <NavRow icon={<IconBookOpen size={22} />} label="내 노트" href="/notes" />
          <NavRow icon={<IconEdit size={22} />} label="내가 쓴 글" href={`${profileHref}?tab=posts`} />
          <NavRow icon={<IconCheckCircle size={22} />} label="내 후기" href={`${profileHref}?tab=reviews`} />
          <NavRow icon={<IconMessageSquare size={22} />} label="내 댓글" href={`${profileHref}?tab=comments`} />
        </SectionCard>

        {/* ⑤ 나의 관심 */}
        <SectionCard title="나의 관심">
          <NavRow icon={<IconHeart size={22} />} label="좋아요" href={`${profileHref}?tab=likes`} />
          <NavRow icon={<IconBookmark size={20} />} label="북마크" href={`${profileHref}?tab=saves`} />
        </SectionCard>

        {/* ⑥ 설정 — 앱 설정(알림 등)도 /my/settings 통합 화면이 담당(Phase 4-5). */}
        <SectionCard title="설정">
          <NavRow icon={<IconSettings size={22} />} label="앱 설정" href="/my/settings" />
        </SectionCard>

        {/* ⑦ 고객지원 */}
        <SectionCard title="고객지원">
          {/* 공지사항 — 전용 라우트 없음 → 사이트 안내(/about)로. (D12 placeholder 유지) */}
          <NavRow icon={<IconMegaphone size={22} />} label="공지사항" href="/about" />
          <NavRow icon={<IconHelp size={22} />} label="고객센터" href="/contact" />
          {/* 의견 남기기 — 전용 피드백 폼 없음 → 문의 채널(/contact)로. (D12 placeholder 유지) */}
          <NavRow icon={<IconMail size={22} />} label="의견 남기기" href="/contact" />
          {/* 탈퇴하기 — /my/settings (Phase 4-5 전환 완료. 탈퇴 typed-confirmation footer 는
              ProfileEditClient 내장). 아이콘: IconLogOut 은 로그아웃 행이 사용 →
              계정(사람) 아이콘으로 구분. */}
          <NavRow icon={<IconProfile size={22} />} label="탈퇴하기" href="/my/settings" />
        </SectionCard>

        {/* ⑧ 계정 — 로그아웃 행. 시안에 없으나 기능 유지(링크가 아닌 버튼, LogoutButton 재사용). */}
        <SectionCard title="계정">
          <LogoutRow />
        </SectionCard>

        <PolicyFooter />
      </div>
    </AppShell>
  );
}
