/**
 * LLM 응답 텍스트에서 JSON 추출 헬퍼.
 *
 * Step1 / Step2 / extract-keywords 등에서 공통으로 사용.
 * 코드펜스(```json … ```) 또는 잡문이 섞인 경우에도 첫 JSON object/array 를 찾아 파싱.
 *
 * 우선순위:
 *  1. 원본 trim() 전체 JSON.parse
 *  2. ```json ... ``` 또는 ``` ... ``` 코드펜스 안쪽
 *  3. 첫 '{' 와 마지막 '}' 사이의 substring
 *  4. 첫 '[' 와 마지막 ']' 사이의 substring (배열 응답 대응)
 *
 * 모두 실패하면 throw.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      /* continue */
    }
  }
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
    } catch {
      /* continue */
    }
  }
  throw new Error("Failed to parse JSON from LLM output");
}
