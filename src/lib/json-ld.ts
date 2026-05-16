/**
 * JSON-LD 안전 직렬화 헬퍼.
 *
 * `<script type="application/ld+json">{...}</script>` 블록에 임의 데이터를
 * 주입할 때, 본문 문자열에 `</script>` 가 포함되면 브라우저가 script 태그를
 * 조기 종료하면서 stored XSS 가 발생할 수 있다.
 *
 * 표준 방어 패턴은 `<` 문자를 `\u003c` 로 치환하는 것 — 이렇게 하면
 * JSON 파서는 동일하게 해석하지만 HTML 파서는 태그로 인식하지 않는다.
 *
 * 추가로 `>` 와 `&` 도 같이 escape 하여 미래의 파싱 변경에도 안전하게 유지.
 *
 * 사용:
 *   <script
 *     type="application/ld+json"
 *     dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
 *   />
 */
export function jsonLdString(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
