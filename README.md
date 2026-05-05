# 피부텐텐 (Pibutenten)

피부과 전문의가 함께하는 피부 미용 SNS 웹앱.

- **Stack**: Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase
- **Form factor**: 모바일 우선 PWA (모바일 1단 / 데스크탑 ≥900px 2단, 최대 너비 1080px)
- **YouTube**: https://www.youtube.com/@pibutenten

## 개발

```bash
npm install
cp .env.local.example .env.local   # Supabase URL/anon key 채우기
npm run dev                         # http://localhost:3000
```

## 라우트

| 경로 | 설명 |
|---|---|
| `/` | 홈 피드 (인스타 스타일, 예정) |
| `/search` | 검색 |
| `/doctors` | 원장님 소개 |
| 외부 | 유튜브 채널 (`@pibutenten`) |

## 디렉터리

```
src/
├── app/                  # App Router
│   ├── layout.tsx        # max-w 1080 컨테이너 + Sticky TopNav
│   ├── page.tsx
│   ├── search/page.tsx
│   └── doctors/page.tsx
├── components/
│   └── TopNav.tsx        # Sticky 상단 네비 (아이콘 onlly)
└── lib/supabase/
    ├── client.ts         # 브라우저용
    └── server.ts         # 서버 컴포넌트/액션용
```

## 배포

- **Repo**: `pibutenten/pibutenten-webapp` (Private)
- **Hosting**: Vercel Team `pibutenten`
- **Region**: Northeast Asia (Seoul)

## 관련

- 정적 검색 사이트(legacy): https://github.com/jminbae/pbtt-search
