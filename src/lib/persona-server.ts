import { cookies } from "next/headers";
import { PERSONA_COOKIE, normalizePersona, type Persona } from "./persona";

/** 서버 컴포넌트/route에서 현재 페르소나 읽기 */
export async function readPersonaServer(): Promise<Persona> {
  const c = await cookies();
  return normalizePersona(c.get(PERSONA_COOKIE)?.value ?? null);
}
