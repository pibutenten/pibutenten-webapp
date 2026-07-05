/**
 * not-found-response — 미들웨어(proxy)에서 "실제 HTTP 404" 를 돌려주기 위한 공용 헬퍼.
 *
 * 배경(소프트 404 근본 원인):
 *   /reports/[procedure] · /[handle] 등 동적 라우트는 route-level loading.tsx(또는 force-dynamic
 *   부모 layout 의 await)가 만드는 <Suspense> 경계 아래에서 렌더된다. Next.js 는 Suspense 폴백이
 *   뜨는 순간 HTML 스트리밍을 시작하며 그 즉시 응답 상태코드를 200 으로 확정한다. 그래서 페이지
 *   본문에서 뒤늦게 notFound() 를 불러도 상태코드는 이미 200(소프트 404: 200 + noindex meta)이라
 *   검색엔진 관점의 진짜 404 가 나가지 않는다.
 *
 * 표준 해법(Next.js 공식 권고):
 *   존재 여부 검사를 "응답 본문이 스트리밍되기 전"(=렌더 이전) 단계인 미들웨어에서 수행하고,
 *   없으면 미들웨어가 Response 를 직접 반환한다(렌더 파이프라인을 우회 → 상태코드 확정 가능).
 *   렌더로 rewrite 하는 방식은 루트 app/loading.tsx 가 다시 Suspense 로 감싸 200 이 재발하므로
 *   신뢰할 수 없다 → 미들웨어에서 self-contained HTML 본문을 status:404 로 직접 반환한다.
 *
 * SNS 표준(인스타·트위터) 동작:
 *   사람에게는 친절한 "찾을 수 없음" 안내(홈/피드·전문의 링크)를 그대로 보여주되,
 *   검색엔진에는 실제 404 상태코드 + noindex 를 반환한다. 자동 리다이렉트(홈 튕기기)는 하지 않는다.
 */

/**
 * 친절 안내 + 실제 404 상태코드 HTML 응답.
 *
 * app/not-found.tsx 의 카피·링크(홈/피드·전문의)를 그대로 옮기되, 미들웨어(Edge/Node)에서는
 * React·globals.css 토큰을 못 쓰므로 인라인 스타일로 브랜드 톤(--primary #4CBFF2 등)을 복제한다.
 * app/not-found.tsx 와 이 함수는 문구/링크가 dual source — 카피 변경 시 양쪽을 함께 갱신한다.
 */
export function notFoundHtmlResponse(): Response {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>페이지를 찾을 수 없어요 | 피부텐텐</title>
<style>
  :root {
    --primary: #4CBFF2;
    --primary-dark: #5FA8D3;
    --text: #1B4965;
    --text-secondary: #5C7080;
    --border: #E5E3DD;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: linear-gradient(168deg, #e8f5fd 0%, #ecf7f2 52%, #faf5e2 100%);
    color: var(--text);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 16px;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 100%;
    max-width: 480px;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(27, 73, 101, 0.06);
    padding: 32px;
    text-align: center;
  }
  .emoji { font-size: 44px; line-height: 1; margin-bottom: 16px; }
  h1 { font-size: 18px; font-weight: 700; margin: 0 0 8px; color: var(--text); }
  p { font-size: 14px; line-height: 1.6; color: var(--text-secondary); margin: 0 0 24px; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  @media (min-width: 640px) { .actions { flex-direction: row; justify-content: center; } }
  a { text-decoration: none; border-radius: 8px; padding: 12px 18px; font-size: 14px; display: inline-block; }
  .btn-primary {
    background: var(--primary);
    color: #fff;
    font-weight: 700;
    box-shadow: 0 2px 8px rgba(76, 191, 242, 0.35);
  }
  .btn-primary:hover { background: var(--primary-dark); }
  .btn-secondary {
    border: 1px solid var(--border);
    color: var(--text-secondary);
    background: #fff;
  }
  .btn-secondary:hover { border-color: var(--primary); color: var(--primary); }
</style>
</head>
<body>
  <main class="card">
    <div class="emoji" aria-hidden="true">🔎</div>
    <h1>페이지를 찾을 수 없어요</h1>
    <p>주소가 잘못되었거나 페이지가 삭제된 것 같아요.<br>피부텐텐 피드에서 다른 좋은 글을 둘러보세요.</p>
    <nav class="actions">
      <a class="btn-primary" href="/">피드로 가기</a>
      <a class="btn-secondary" href="/doctors">전문의 둘러보기</a>
    </nav>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 스트리밍 소프트 404 때 Next 가 넣던 noindex 를 여기서도 명시(HTTP 헤더 레벨).
      "X-Robots-Tag": "noindex, follow",
      // 404 는 캐시하지 않음(존재하게 되면 즉시 정상 페이지로 전환되도록).
      "Cache-Control": "no-store",
    },
  });
}
