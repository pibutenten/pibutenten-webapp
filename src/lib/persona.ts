/**
 * 페르소나 컨텍스트 헬퍼
 * - 'official' (default): 공식 활동 (본명·verified·원장 페이지 연결)
 * - 'personal': 개인 alt 페르소나 (alt 닉네임/아바타로 활동)
 *
 * 쿠키 기반: pibutenten_persona = 'official' | 'personal'
 *  - 서버 컴포넌트는 next/headers 의 cookies() 로 읽음
 *  - 클라이언트는 document.cookie 로 읽음
 */

export type Persona = "official" | "personal";

export const PERSONA_COOKIE = "pibutenten_persona";

export function isPersona(v: unknown): v is Persona {
  return v === "official" || v === "personal";
}

export function normalizePersona(v: string | undefined | null): Persona {
  return isPersona(v) ? v : "official";
}

/** 클라이언트에서 현재 페르소나 읽기 */
export function readPersonaClient(): Persona {
  if (typeof document === "undefined") return "official";
  const m = document.cookie.match(
    new RegExp("(?:^|; )" + PERSONA_COOKIE + "=([^;]*)"),
  );
  return normalizePersona(m ? decodeURIComponent(m[1]) : null);
}

/** 클라이언트에서 페르소나 쿠키 set */
export function writePersonaClient(p: Persona) {
  if (typeof document === "undefined") return;
  // 1년 유지, path=/, samesite=lax
  document.cookie =
    PERSONA_COOKIE +
    "=" +
    encodeURIComponent(p) +
    "; path=/; max-age=31536000; samesite=lax";
}
