/**
 * 공용 아이콘 모듈 (2026-07-08 UI 개편 Phase 0-5) — 디자인팀 수신 SVG 21종.
 *
 * 원본: `전달용/02 Icon/리포트/`(8종) + `전달용/02 Icon/마이페이지/`(13종).
 * 파일명 ↔ 컴포넌트 매핑:
 *   [리포트]     Frame1→IconSpeechBubble · icon-bell→IconBell · icon-pain→IconPain ·
 *                icon-profile→IconProfile · icon-search→IconSearch · icon-star→IconStar ·
 *                사람→IconPerson · 다운타임→IconDowntimeCross
 *   [마이페이지] book-open→IconBookOpen · bookmark→IconBookmark · check-circle→IconCheckCircle ·
 *                clock→IconClock · edit→IconEdit · heart→IconHeart · help→IconHelp ·
 *                log-out→IconLogOut · mail→IconMail · megaphone→IconMegaphone ·
 *                message-square→IconMessageSquare · setting→IconSettings · share→IconShare
 *
 * 규약:
 *   - 단색 stroke/fill 아이콘은 `currentColor` 화 — 소비처가 CSS color 로 색 지정.
 *   - `size` prop: width=height 정사각 박스(px). viewBox 비율은 preserveAspectRatio 기본값
 *     (xMidYMid meet)으로 유지되어 비정사각 아이콘도 왜곡 없이 중앙 정렬된다.
 *     (예외: IconSpeechBubble 은 60×50 일러스트라 width=size, height 비율 환산.)
 *   - 고정색 예외 3종(계획서 §1.1-2): IconClock(연두 2색 고정) ·
 *     IconPerson(그라데이션 fill — `fill` prop 으로 스톱 색 덮어쓰기 가능) ·
 *     IconShare(회색 고정 — 히어로 초록 위 흰색용으로 `stroke` prop 노출).
 *     IconSpeechBubble(브랜드 블루 그라데이션 일러스트)도 성질상 원색 유지.
 *   - 전부 훅 없는 순수 함수 — 서버/클라 컴포넌트 어디서나 사용 가능.
 *   - 장식용 전제(aria-hidden) — 의미 전달이 필요하면 소비처 버튼/링크에 aria-label 을 단다.
 *   - 기존 파일 로컬 인라인 아이콘(AppShell 등)은 이 모듈로 강제 이관하지 않는다(점진 전환).
 */

type IconProps = {
  /** 렌더 크기(px) — width=height. 기본값은 원본 SVG 치수. */
  size?: number;
  className?: string;
};

/* ============================== 리포트 8종 ============================== */

/** Frame1.svg — 말풍선 2개 일러스트(후기 유도 카드). 브랜드 블루 그라데이션 원색 유지.
 *  SVG defs id 는 문서 전역 유일이어야 하므로(HTML 규격), 같은 페이지에 2개 이상
 *  렌더할 때는 인스턴스마다 다른 gradId 를 넘긴다 (단일 사용 시 기본값 그대로). */
export function IconSpeechBubble({
  size = 60,
  className,
  gradId = "pbttSpeechBubbleGrad",
}: IconProps & { gradId?: string }) {
  return (
    <svg
      width={size}
      height={(size * 50) / 60}
      viewBox="0 0 60 50"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M22.2637 0C34.5596 0 44.5273 7.44391 44.5273 16.626C44.5273 25.808 34.5595 33.252 22.2637 33.252C20.487 33.252 18.759 33.0954 17.1025 32.8018L7.93262 37.2695C7.05199 37.6985 6.14353 36.7365 6.62207 35.8818L9.71387 30.3594C3.84927 27.3652 5.48995e-05 22.3316 0 16.626C0 7.44391 9.96779 0 22.2637 0Z"
        fill={`url(#${gradId})`}
      />
      <circle cx="13.2432" cy="16.7344" r="2.1651" fill="white" />
      <circle cx="22.2667" cy="16.7344" r="2.1651" fill="white" />
      <circle cx="31.2881" cy="16.7344" r="2.1651" fill="white" />
      <path
        d="M40.8076 18.6875C30.5666 18.6876 22.2646 24.8875 22.2646 32.5352C22.2647 40.1827 30.5666 46.3827 40.8076 46.3828C42.2874 46.3828 43.7268 46.2524 45.1064 46.0078L52.2646 49.4951C53.1453 49.9241 54.0537 48.9621 53.5752 48.1074L51.2607 43.9736C56.1453 41.4798 59.3515 37.2873 59.3516 32.5352C59.3516 24.8875 51.0488 18.6875 40.8076 18.6875Z"
        fill="#4CBFF2"
      />
      <circle cx="1.8033" cy="1.8033" r="1.8033" transform="matrix(-1 0 0 1 50.1289 30.8223)" fill="white" />
      <circle cx="1.8033" cy="1.8033" r="1.8033" transform="matrix(-1 0 0 1 42.6152 30.8223)" fill="white" />
      <circle cx="1.8033" cy="1.8033" r="1.8033" transform="matrix(-1 0 0 1 35.0996 30.8223)" fill="white" />
      <defs>
        <linearGradient
          id={gradId}
          x1="22.2637"
          y1="0"
          x2="22.2637"
          y2="37.375"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.259615" stopColor="#4CBFF2" />
          <stop offset="1" stopColor="#187AF2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** icon-bell.svg — 알림 벨 (stroke → currentColor). */
export function IconBell({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.297 13.9911V8.26426C17.297 4.76655 14.4608 1.93939 10.9721 1.93939C7.47444 1.93939 4.64728 4.77561 4.64728 8.26426V13.9911L2.11914 17.4254H19.8342L17.3061 13.9911H17.297Z" />
      <path d="M13.8313 17.4252C13.8313 19.0019 12.5536 20.2796 10.9769 20.2796C9.40022 20.2796 8.12256 19.0019 8.12256 17.4252" />
    </svg>
  );
}

/** icon-pain.svg — 통증 번개 (fill → currentColor). */
export function IconPain({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 17 22" fill="none" className={className} aria-hidden="true">
      <path
        d="M9.8 8.79999H15.3C15.7 8.79999 16 9.25832 15.7 9.62499L6.2 20.5333C5.9 20.9 5.3 20.625 5.3 20.1667L6.5 13.0167H1.1C0.699998 13.0167 0.399998 12.5583 0.699998 12.1917L10.2 1.37499C10.5 1.00832 11.1 1.28332 11.1 1.74166L9.9 8.89166L9.8 8.79999Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** icon-profile.svg — 사람 실루엣 라인 (stroke → currentColor). */
export function IconProfile({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M19 20.1093V18.1093C19 17.0484 18.5786 16.031 17.8284 15.2809C17.0783 14.5307 16.0609 14.1093 15 14.1093H7C5.93913 14.1093 4.92172 14.5307 4.17157 15.2809C3.42143 16.031 3 17.0484 3 18.1093V20.1093" />
      <path d="M11 10.1093C13.2091 10.1093 15 8.31845 15 6.10931C15 3.90017 13.2091 2.10931 11 2.10931C8.79086 2.10931 7 3.90017 7 6.10931C7 8.31845 8.79086 10.1093 11 10.1093Z" />
    </svg>
  );
}

/** icon-search.svg — 돋보기 (stroke → currentColor). 원본대로 손잡이 획만 linecap round. */
export function IconSearch({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden="true"
    >
      <path d="M16.5 16.5C19.5376 13.4624 19.5376 8.53756 16.5 5.5C13.4624 2.46243 8.53757 2.46243 5.5 5.5C2.46243 8.53757 2.46243 13.4624 5.5 16.5C8.53756 19.5376 13.4624 19.5376 16.5 16.5Z" />
      <path d="M20.6479 20.4087L16.7672 16.5277" strokeLinecap="round" />
    </svg>
  );
}

/** icon-star.svg — 별점 별 (fill → currentColor). */
export function IconStar({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" className={className} aria-hidden="true">
      <path
        d="M10.4382 1.71572C10.6637 1.24318 11.3363 1.24318 11.5618 1.71572L14.1857 7.21454C14.2765 7.40471 14.4572 7.53607 14.6662 7.56361L20.7067 8.35986C21.2258 8.42829 21.4336 9.06799 21.0539 9.42847L16.635 13.6232C16.4822 13.7683 16.4131 13.9808 16.4515 14.188L17.5609 20.1789C17.6562 20.6937 17.112 21.0891 16.6518 20.8394L11.2969 17.933C11.1117 17.8325 10.8883 17.8325 10.7031 17.933L5.34815 20.8394C4.88798 21.0891 4.34381 20.6937 4.43914 20.1789L5.54849 14.188C5.58685 13.9808 5.5178 13.7683 5.36497 13.6232L0.946111 9.42847C0.566378 9.06799 0.774232 8.42829 1.29332 8.35986L7.33385 7.56361C7.54275 7.53607 7.72355 7.40471 7.81429 7.21454L10.4382 1.71572Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** 사람.svg — 사람 그리드(히어로 재시술 비율)용. radial 그라데이션(위→아래 페이드) 유지.
 *  `fill` prop 으로 그라데이션 스톱 색을 덮어쓴다(미지정 시 원본 #168275).
 *  그라데이션 id 는 색 문자열에서 결정론 파생 — 서버/클라 렌더 결과가 동일하고(훅 불필요),
 *  같은 색 인스턴스끼리는 동일 def 를 공유해 충돌이 없다. */
export function IconPerson({
  size = 19,
  fill = "#168275",
  className,
}: IconProps & { fill?: string }) {
  const gradId = `pbttIconPersonGrad-${fill.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 19 19" fill="none" className={className} aria-hidden="true">
      <path
        d="M11.4499 9.35366C12.6921 8.60349 13.5198 7.15906 13.4745 5.51165C13.4141 3.2994 11.7512 1.48504 9.68808 1.38281C7.40673 1.27029 5.52414 3.21924 5.52414 5.63888C5.52414 7.23114 6.3395 8.61967 7.54674 9.35071C7.7547 9.47648 7.70597 9.80743 7.47262 9.86038C4.39513 10.5532 1.68895 12.7831 1.68964 15.8337C1.68964 16.8214 2.43842 17.6216 3.35947 17.6216H9.50003H15.6406C16.5623 17.6216 17.3104 16.8214 17.3104 15.8337C17.3111 12.7823 14.6049 10.5532 11.5274 9.86038C11.2961 9.80817 11.2433 9.47795 11.4492 9.35292L11.4499 9.35366Z"
        fill={`url(#${gradId})`}
      />
      <defs>
        <radialGradient
          id={gradId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(9.50003 1.37817) rotate(90) scale(16.2434 15.6208)"
        >
          <stop offset="0.216346" stopColor={fill} />
          <stop offset="0.7" stopColor={fill} stopOpacity="0.612599" />
          <stop offset="0.92" stopColor={fill} stopOpacity="0.1" />
          <stop offset="1" stopColor={fill} stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** 다운타임.svg — 십자(+) 마커 (stroke → currentColor). 통증 마커와 동일한 원형 마커
 *  안에 넣어 쓰는 것이 디자인 의도(원장 확인 2026-07-08 — 계획서 §1.1-1). */
export function IconDowntimeCross({ size = 9, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 9 9"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.40234 0V8.80469" />
      <path d="M0 4.40234H8.80469" />
    </svg>
  );
}

/* ============================= 마이페이지 13종 ============================= */

/** book-open.svg — 펼친 책(내 노트) (stroke → currentColor). */
export function IconBookOpen({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M1.83301 2.75H7.33301C8.30547 2.75 9.2381 3.13631 9.92573 3.82394C10.6134 4.51158 10.9997 5.44421 10.9997 6.41667V19.25C10.9997 18.5207 10.7099 17.8212 10.1942 17.3055C9.67849 16.7897 8.97902 16.5 8.24967 16.5H1.83301V2.75Z" />
      <path d="M20.1667 2.75H14.6667C13.6942 2.75 12.7616 3.13631 12.0739 3.82394C11.3863 4.51158 11 5.44421 11 6.41667V19.25C11 18.5207 11.2897 17.8212 11.8055 17.3055C12.3212 16.7897 13.0207 16.5 13.75 16.5H20.1667V2.75Z" />
    </svg>
  );
}

/** bookmark.svg — 북마크 (fill+stroke → currentColor. 원본은 노랑 단색). */
export function IconBookmark({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M15 19L8 14L1 19V3C1 2.46957 1.21071 1.96086 1.58579 1.58579C1.96086 1.21071 2.46957 1 3 1H13C13.5304 1 14.0391 1.21071 14.4142 1.58579C14.7893 1.96086 15 2.46957 15 3V19Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** check-circle.svg — 체크 원(내 후기) (stroke → currentColor). */
export function IconCheckCircle({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.1663 10.1567V11C20.1652 12.9767 19.5251 14.9001 18.3416 16.4833C17.158 18.0666 15.4944 19.2248 13.5988 19.7852C11.7032 20.3457 9.67716 20.2784 7.82294 19.5934C5.96872 18.9083 4.38561 17.6423 3.30972 15.984C2.23384 14.3257 1.72282 12.3641 1.85288 10.3916C1.98294 8.41918 2.74711 6.54162 4.03143 5.03898C5.31575 3.53633 7.05139 2.48909 8.97951 2.05346C10.9076 1.61783 12.9249 1.81713 14.7305 2.62166" />
      <path d="M20.1667 3.66667L11 12.8425L8.25 10.0925" />
    </svg>
  );
}

/** clock.svg — 최근 본 글 시계. 고정색 예외(연두 2색 — 계획서 §1.1-2): currentColor 미적용. */
export function IconClock({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
        fill="#D2F8D4"
        stroke="#D2F8D4"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6V12L16 14"
        stroke="#67C06A"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** edit.svg — 연필(내가 쓴 글) (stroke → currentColor). 원본의 풀사이즈 clipPath 는
 *  viewBox 와 동일한 무의미 클립이라 제거(다중 인스턴스 id 충돌 예방). */
export function IconEdit({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10.083 3.66667H3.66634C3.18011 3.66667 2.7138 3.85983 2.36998 4.20364C2.02616 4.54746 1.83301 5.01377 1.83301 5.50001V18.3333C1.83301 18.8196 2.02616 19.2859 2.36998 19.6297C2.7138 19.9735 3.18011 20.1667 3.66634 20.1667H16.4997C16.9859 20.1667 17.4522 19.9735 17.796 19.6297C18.1399 19.2859 18.333 18.8196 18.333 18.3333V11.9167" />
      <path d="M16.958 2.29165C17.3227 1.92698 17.8173 1.72211 18.333 1.72211C18.8487 1.72211 19.3433 1.92698 19.708 2.29165C20.0727 2.65632 20.2776 3.15093 20.2776 3.66665C20.2776 4.18238 20.0727 4.67698 19.708 5.04165L10.9997 13.75L7.33301 14.6667L8.24967 11L16.958 2.29165Z" />
    </svg>
  );
}

/** heart.svg — 하트(좋아요) (fill+stroke → currentColor. 원본은 핑크 단색). */
export function IconHeart({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 23 21"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M20.2913 2.61183C19.7805 2.10083 19.1741 1.69547 18.5066 1.41891C17.8392 1.14235 17.1238 1 16.4013 1C15.6788 1 14.9634 1.14235 14.2959 1.41891C13.6285 1.69547 13.022 2.10083 12.5113 2.61183L11.4513 3.67183L10.3913 2.61183C9.3596 1.58013 7.96032 1.00053 6.50129 1.00053C5.04226 1.00053 3.64298 1.58013 2.61129 2.61183C1.5796 3.64352 1 5.04279 1 6.50183C1 7.96086 1.5796 9.36013 2.61129 10.3918L3.67129 11.4518L11.4513 19.2318L19.2313 11.4518L20.2913 10.3918C20.8023 9.88107 21.2076 9.27464 21.4842 8.60718C21.7608 7.93972 21.9031 7.22431 21.9031 6.50183C21.9031 5.77934 21.7608 5.06393 21.4842 4.39647C21.2076 3.72901 20.8023 3.12258 20.2913 2.61183Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** help.svg — 헤드셋(고객센터) (stroke → currentColor). */
export function IconHelp({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M1.15137 11.7607C1.15137 9.86239 2.69028 8.32348 4.58863 8.32348H4.6884V15.198H4.58863C2.69028 15.198 1.15137 13.6591 1.15137 11.7607V11.7607Z" />
      <path d="M20.8486 11.7607C20.8486 9.86239 19.3097 8.32348 17.4114 8.32348H17.3116V15.198H17.4114C19.3097 15.198 20.8486 13.6591 20.8486 11.7607V11.7607Z" />
      <path d="M12.3826 18.2606C15.1049 18.2606 17.3117 16.0537 17.3117 13.3315V8.60676C17.3117 5.12096 14.4859 2.29516 11.0001 2.29516C7.51428 2.29516 4.68848 5.12096 4.68848 8.60676V14.6728" />
      <circle cx="11.0003" cy="18.2603" r="1.44459" />
    </svg>
  );
}

/** log-out.svg — 로그아웃 (stroke → currentColor). */
export function IconLogOut({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8.25 19.25H4.58333C4.0971 19.25 3.63079 19.0568 3.28697 18.713C2.94315 18.3692 2.75 17.9029 2.75 17.4167V4.58333C2.75 4.0971 2.94315 3.63079 3.28697 3.28697C3.63079 2.94315 4.0971 2.75 4.58333 2.75H8.25" />
      <path d="M14.667 15.5833L19.2503 11L14.667 6.41667" />
      <path d="M19.25 11H8.25" />
    </svg>
  );
}

/** mail.svg — 편지(의견 남기기) (stroke → currentColor). */
export function IconMail({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.83333}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.66634 3.66666H18.333C19.3413 3.66666 20.1663 4.49166 20.1663 5.5V16.5C20.1663 17.5083 19.3413 18.3333 18.333 18.3333H3.66634C2.65801 18.3333 1.83301 17.5083 1.83301 16.5V5.5C1.83301 4.49166 2.65801 3.66666 3.66634 3.66666Z" />
      <path d="M20.1663 5.5L10.9997 11.9167L1.83301 5.5" />
    </svg>
  );
}

/** megaphone.svg — 확성기(공지사항) (stroke → currentColor). 원본의 풀사이즈 clipPath 는
 *  viewBox 와 동일한 무의미 클립이라 제거(다중 인스턴스 id 충돌 예방). */
export function IconMegaphone({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9.1084 4.46506L20.1157 1.29309V17.4809L9.1084 14.3089V4.46506Z" />
      <rect x="6.09961" y="14.3463" width="3.00877" height="6.36059" />
      <path d="M1.88379 9.40238C1.88379 6.67168 4.09746 4.45801 6.82817 4.45801H9.1084V14.3468H6.82817C4.09746 14.3468 1.88379 12.1331 1.88379 9.40238V9.40238Z" />
    </svg>
  );
}

/** message-square.svg — 말풍선(내 댓글) (stroke → currentColor). */
export function IconMessageSquare({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M19.25 13.75C19.25 14.2362 19.0568 14.7025 18.713 15.0464C18.3692 15.3902 17.9029 15.5833 17.4167 15.5833H6.41667L2.75 19.25V4.58333C2.75 4.0971 2.94315 3.63079 3.28697 3.28697C3.63079 2.94315 4.0971 2.75 4.58333 2.75H17.4167C17.9029 2.75 18.3692 2.94315 18.713 3.28697C19.0568 3.63079 19.25 4.0971 19.25 4.58333V13.75Z" />
    </svg>
  );
}

/** setting.svg — 톱니(앱 설정) (stroke → currentColor). */
export function IconSettings({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.79291}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10.9995 13.5153C12.3886 13.5153 13.5147 12.3892 13.5147 11.0002C13.5147 9.61107 12.3886 8.48499 10.9995 8.48499C9.61046 8.48499 8.48438 9.61107 8.48438 11.0002C8.48438 12.3892 9.61046 13.5153 10.9995 13.5153Z" />
      <path d="M17.2037 13.5152C17.0921 13.768 17.0588 14.0485 17.1081 14.3205C17.1575 14.5925 17.2871 14.8434 17.4804 15.041L17.5307 15.0913C17.6866 15.2471 17.8103 15.432 17.8947 15.6356C17.979 15.8391 18.0225 16.0573 18.0225 16.2777C18.0225 16.498 17.979 16.7162 17.8947 16.9198C17.8103 17.1233 17.6866 17.3083 17.5307 17.464C17.375 17.6199 17.19 17.7436 16.9865 17.8279C16.7829 17.9123 16.5647 17.9558 16.3444 17.9558C16.124 17.9558 15.9058 17.9123 15.7023 17.8279C15.4987 17.7436 15.3138 17.6199 15.158 17.464L15.1077 17.4137C14.9102 17.2204 14.6592 17.0907 14.3872 17.0414C14.1153 16.9921 13.8347 17.0254 13.5819 17.137C13.3339 17.2433 13.1224 17.4198 12.9735 17.6447C12.8245 17.8696 12.7446 18.1332 12.7435 18.403V18.5455C12.7435 18.9902 12.5668 19.4167 12.2524 19.7312C11.9379 20.0456 11.5114 20.2223 11.0667 20.2223C10.622 20.2223 10.1955 20.0456 9.88104 19.7312C9.56659 19.4167 9.38992 18.9902 9.38992 18.5455V18.4701C9.38343 18.1926 9.29361 17.9234 9.13213 17.6976C8.97065 17.4719 8.74498 17.2999 8.48446 17.2041C8.23159 17.0925 7.95109 17.0592 7.67912 17.1085C7.40715 17.1578 7.15618 17.2875 6.95859 17.4808L6.90829 17.5311C6.75256 17.687 6.56763 17.8106 6.36408 17.895C6.16052 17.9794 5.94232 18.0228 5.72197 18.0228C5.50161 18.0228 5.28342 17.9794 5.07986 17.895C4.8763 17.8106 4.69137 17.687 4.53565 17.5311C4.37975 17.3753 4.25607 17.1904 4.17169 16.9868C4.0873 16.7833 4.04387 16.5651 4.04387 16.3447C4.04387 16.1244 4.0873 15.9062 4.17169 15.7026C4.25607 15.4991 4.37975 15.3141 4.53565 15.1584L4.58595 15.1081C4.77923 14.9105 4.90889 14.6596 4.9582 14.3876C5.00751 14.1156 4.97422 13.8351 4.86262 13.5822C4.75634 13.3343 4.57988 13.1228 4.35494 12.9738C4.13001 12.8249 3.86643 12.7449 3.59665 12.7439H3.45412C3.00941 12.7439 2.58292 12.5672 2.26846 12.2527C1.954 11.9383 1.77734 11.5118 1.77734 11.0671C1.77734 10.6224 1.954 10.1959 2.26846 9.88141C2.58292 9.56695 3.00941 9.39029 3.45412 9.39029H3.52958C3.80708 9.3838 4.07621 9.29398 4.30199 9.13249C4.52776 8.97101 4.69973 8.74535 4.79555 8.48483C4.90715 8.23196 4.94044 7.95145 4.89113 7.67948C4.84181 7.40751 4.71216 7.15655 4.51888 6.95896L4.46858 6.90866C4.31267 6.75293 4.189 6.568 4.10461 6.36444C4.02023 6.16088 3.9768 5.94269 3.9768 5.72233C3.9768 5.50198 4.02023 5.28379 4.10461 5.08023C4.189 4.87667 4.31267 4.69174 4.46858 4.53601C4.6243 4.38011 4.80923 4.25643 5.01279 4.17205C5.21635 4.08767 5.43454 4.04424 5.6549 4.04424C5.87525 4.04424 6.09345 4.08767 6.297 4.17205C6.50056 4.25643 6.68549 4.38011 6.84122 4.53601L6.89152 4.58632C7.08911 4.7796 7.34007 4.90925 7.61204 4.95857C7.88401 5.00788 8.16452 4.97459 8.41739 4.86298H8.48446C8.73243 4.75671 8.94392 4.58024 9.09288 4.35531C9.24184 4.13038 9.32178 3.8668 9.32285 3.59702V3.45449C9.32285 3.00978 9.49951 2.58328 9.81397 2.26883C10.1284 1.95437 10.5549 1.77771 10.9996 1.77771C11.4443 1.77771 11.8708 1.95437 12.1853 2.26883C12.4998 2.58328 12.6764 3.00978 12.6764 3.45449V3.52994C12.6775 3.79973 12.7574 4.06331 12.9064 4.28824C13.0554 4.51317 13.2668 4.68964 13.5148 4.79591C13.7677 4.90752 14.0482 4.94081 14.3202 4.89149C14.5921 4.84218 14.8431 4.71252 15.0407 4.51925L15.091 4.46894C15.2467 4.31304 15.4316 4.18936 15.6352 4.10498C15.8387 4.0206 16.0569 3.97716 16.2773 3.97716C16.4977 3.97716 16.7158 4.0206 16.9194 4.10498C17.123 4.18936 17.3079 4.31304 17.4636 4.46894C17.6195 4.62467 17.7432 4.8096 17.8276 5.01316C17.912 5.21671 17.9554 5.43491 17.9554 5.65526C17.9554 5.87562 17.912 6.09381 17.8276 6.29737C17.7432 6.50093 17.6195 6.68586 17.4636 6.84159L17.4133 6.89189C17.22 7.08948 17.0904 7.34044 17.0411 7.61241C16.9918 7.88438 17.025 8.16489 17.1366 8.41776V8.48483C17.2429 8.7328 17.4194 8.94428 17.6443 9.09324C17.8693 9.2422 18.1328 9.32214 18.4026 9.32322H18.5451C18.9899 9.32322 19.4163 9.49988 19.7308 9.81434C20.0453 10.1288 20.2219 10.5553 20.2219 11C20.2219 11.4447 20.0453 11.8712 19.7308 12.1857C19.4163 12.5001 18.9899 12.6768 18.5451 12.6768H18.4697C18.1999 12.6779 17.9363 12.7578 17.7114 12.9068C17.4865 13.0557 17.31 13.2672 17.2037 13.5152Z" />
    </svg>
  );
}

/** share.svg — 공유. 고정색 예외(계획서 §1.1-2): 기본 회색(#7F838D) 유지하되,
 *  히어로(초록 배경 위 흰색) 등에서 덮어쓸 수 있게 stroke 색을 prop 으로 노출. */
export function IconShare({
  size = 20,
  stroke = "#7F838D",
  className,
}: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.85168 10.0967V16.1739C3.85168 16.5768 4.01366 16.9633 4.30198 17.2482C4.59029 17.5331 4.98133 17.6932 5.38908 17.6932H14.6134C15.0212 17.6932 15.4122 17.5331 15.7005 17.2482C15.9888 16.9633 16.1508 16.5768 16.1508 16.1739V10.0967" />
      <path d="M13.076 5.53885L10.0012 2.50024L6.92639 5.53885" />
      <path d="M10.0011 2.50024V12.3757" />
    </svg>
  );
}
