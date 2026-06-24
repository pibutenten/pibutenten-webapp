const SUPABASE_ERROR_MAP: Record<string, string> = {
  "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않아요.",
  "Email not confirmed": "이메일 인증이 필요합니다. 메일함을 확인해 주세요.",
  "User already registered": "이미 가입된 이메일입니다.",
  "Password should be at least 6 characters": "비밀번호는 6자 이상이어야 합니다.",
  "Email rate limit exceeded": "너무 많은 요청이 발생했어요. 잠시 후 다시 시도해 주세요.",
  "For security purposes, you can only request this after": "보안 정책으로 잠시 후 다시 시도해 주세요.",
  "Signup requires a valid password": "유효한 비밀번호를 입력해 주세요.",
  "Unable to validate email address: invalid format": "올바른 이메일 형식이 아닙니다.",
  "New password should be different from the old password": "새 비밀번호는 기존과 달라야 합니다.",
  "Auth session missing": "로그인 세션이 만료되었어요. 다시 로그인해 주세요.",
};

export function toKoreanError(msg: string): string {
  if (SUPABASE_ERROR_MAP[msg]) return SUPABASE_ERROR_MAP[msg];
  for (const [key, val] of Object.entries(SUPABASE_ERROR_MAP)) {
    if (msg.includes(key)) return val;
  }
  return msg;
}
