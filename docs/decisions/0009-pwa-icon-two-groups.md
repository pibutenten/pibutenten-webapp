# 0009. PWA 아이콘 2그룹 구조

- **Status**: Accepted
- **Date**: 2026-05-21 (저녁) (`a23ba1e`, 본 세션 23커밋 끝)
- **Related**: `public/icons/symbol.svg`, `public/icons/symbol-pwa.svg`, `scripts/regen-icons.mjs`, `src/components/InstallPrompt.tsx`

## Context

PWA 아이콘은 여러 자리에 동시 사용:
- 브라우저 탭 favicon (16/32/48/192)
- iOS apple-touch-icon (180)
- Android PWA icon (192/512)
- Android maskable icon (512, OS 가 마스크 자유롭게 자름)
- PWA 설치 모달 (InstallPrompt)
- splash screen

각 자리마다 디자인 의도가 다름:
- 브라우저 탭·설치 모달: **사이트 자체 노출** → 원형 브랜드 심볼이 자연
- PWA OS 홈 아이콘: **OS 가 마스크** → 사각형 + 글자만이 보편적 (iOS 둥근사각, Android 적응형)

### 초기 시도 (실패 누적)
- 단일 SVG 로 모든 자리 통일
- JS 측에서 SCALE 조정 (1.5 → 2.0 → 1.7 → 1.6 → 1.4 → 1.15 → 1.05 → 1.0) 끝에 깨달음
- 원인: SVG 자체에서 글자가 원 중심에서 위로 2.34px / 좌로 0.39px 어긋남 + 원 직경 58% 차지 → JS SCALE 키워도 fix 불가
- PWA OS 아이콘에서 원이 박혀있는 것이 시각적 어색함의 근본 원인

## Decision

**아이콘 2그룹 구조** — 자리별 다른 source SVG 사용.

### 그룹 A: 사이트 자체 노출 (원형 + 투명)
- **자리**: favicon (16/32/48/192) + splash-circle-512 (InstallPrompt 모달)
- **source**: `public/icons/symbol.svg`
  - 옛 vivid blue/심볼.svg path
  - 색 `#4CBFF2`
  - 원형 + 투명 배경

### 그룹 B: PWA OS 홈 아이콘 (청색 사각 + 흰 글자만, 원 없음)
- **자리**: apple-touch-icon / icon-192 / icon-512 / icon-maskable-512
- **source**: `public/icons/symbol-pwa.svg`
  - `rect #4CBFF2` 가득
  - 흰 글자 path
  - 위치 보정 `translate(0.39, 2.34)`
  - `scale 1.0`
  - OS 가 디바이스 마스크 자유롭게 자름

### 빌드
- `scripts/regen-icons.mjs` 한 번에 10개 아이콘 일괄 재생성
- sharp 기반, svg 렌더 density 600

### 운영
- 이미 설치된 PWA 는 OS 아이콘 캐시 → 홈에서 앱 삭제 후 재추가 시 새 아이콘 적용
- 브라우저 탭 / InstallPrompt 즉시 반영

## Consequences

### 긍정
- 자리별 디자인 의도 정확히 반영
- iOS·Android 둘 다 자연스러운 OS 아이콘
- 브랜드 일관성 유지 (둘 다 #4CBFF2 톤)
- 빌드 스크립트 자동화로 일관성 보장

### 부정
- SVG 2종 유지 부담 (둘 다 디자인 수정 시 양쪽 갱신 필요)
- 사용자가 디자인 변경 요청 시 둘 다 작업 필요

### 학습
- PWA 아이콘은 "한 가지로 모든 자리 다 커버" 가 안 됨
- iOS PWA 흰 빈 화면 해소를 위해 `apple-touch-startup-image` 별도 메타 필요
- 안드로이드는 메타 무시 → manifest.background_color (#4CBFF2) 가 native splash 결정
- viewport.themeColor (#FFFFFF) 는 PWA 상태바 색

### 관련 manifest 설정
- `manifest.background_color: #4CBFF2` (안드로이드 OS native splash 로고색 배경)
- `viewport.themeColor: #FFFFFF` (PWA 상태바 흰색)
- `<link rel="apple-touch-startup-image">` (iOS 흰 빈 화면 해소)
