import LogoutButton from "@/components/LogoutButton";

/**
 * ReturningUserNotice — /signup·/onboarding 상단 재발방지 안내(작업 B, 2026-06-04).
 *
 * OAuth provider 차이(구글↔카카오↔이메일)로 같은 사람이 새 계정을 또 만드는 중복 가입을
 * 막기 위한 안내 + 탈출 버튼. (b) 이메일 충돌 감지로는 provider별 이메일이 다른 경우를
 * 못 막으므로(예: gmail vs naver), 가입 화면에서 명시 안내로 사전 차단한다.
 *
 *   - 안내문: 이미 가입했다면 새로 만들지 말고 쓰던 로그인 방법으로 다시 로그인하라.
 *   - 버튼: 로그아웃 → /login (LogoutButton 이 세션·클라이언트 쿠키 정리 후 이동, 루프 방지).
 */
export default function ReturningUserNotice() {
  return (
    <div className="mb-6 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/[0.06] px-4 py-3.5">
      <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
        이미 가입하신 적이 있다면{" "}
        <b className="font-semibold text-[var(--text)]">새 계정을 만들지 마시고</b>,
        전에 사용하시던 로그인 방법(구글·카카오·이메일)으로 다시 로그인해 주세요.
      </p>
      <LogoutButton
        redirectTo="/login"
        label="다른 방법으로 다시 로그인"
        className="mt-2.5 inline-flex items-center rounded-lg border border-[var(--primary)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-white disabled:opacity-50"
      />
    </div>
  );
}
