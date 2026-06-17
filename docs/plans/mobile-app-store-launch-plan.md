# 모바일 앱스토어 출시 계획 (iOS · Android)

> 피부텐텐 웹앱을 **Capacitor** 로 래핑해 Apple App Store · Google Play 에 등록하는 작업의 SSOT.
> 진행상태는 이 문서의 체크박스로 추적한다. 큰 결정은 `decisions/` ADR 로 분리한다.

최종 갱신: 2026-06-17

---

## 0. 전략 요약

- **래핑 도구**: Capacitor (Ionic). React Native 재작성 없음.
- **로드 방식**: 원격 URL 로드 (`server.url = https://pibutenten.kr`).
  - 이유: 본 앱은 SSR(Next.js) 이라 정적 번들 불가. 원격 로드 시 **앱 origin 이 웹과 동일** → CSP·쿠키·OAuth 콜백이 웹과 똑같이 동작.
  - 트레이드오프: ① Apple 4.2 "최소 기능" 거부 리스크 → 네이티브 기능(푸시·딥링크·권한·공유)으로 보완. ② 오프라인 시 빈 화면 → 네이티브 오프라인 안내 화면 필요.
- **출시 범위**: iOS · Android 동시.
- **빌드 환경**: 코드·설정은 Windows(개발)에서 git 으로 진행. iOS 최종 빌드·서명·업로드만 직원 Mac(Mac Pro)에서 수행. Android 는 Windows 에서 빌드 가능.

---

## 1. 준비물 현황

| 항목 | 상태 | 비고 |
|---|---|---|
| Apple Developer Program | 완료 | 진솔컴퍼니 명의 |
| Google Play 개발자 계정 | 완료 | |
| Mac 빌드 환경 | 확보 | 직원 Mac Pro. 빌드 시점에만 사용 |
| Firebase 프로젝트 (FCM) | 미발급 | Phase 2 블로커 |
| APNs 인증키 (.p8) | 미발급 | Phase 2 블로커. Firebase 에 업로드 |

---

## 2. 핵심 걸림돌과 대응 (한 번에 통과 목표)

| # | 걸림돌 | 원인 | 대응 | Phase |
|---|---|---|---|---|
| 1 | Apple 4.2 "최소 기능" 거부 | 사이트를 웹뷰로 감싸기만 한 앱은 자동 거부 | 네이티브 푸시·딥링크·권한·공유·스플래시·오프라인 화면 추가로 "앱다움" 증명 | 2~5 |
| 2 | iOS 웹뷰에서 Web Push 미작동 | WKWebView 는 Web Push(VAPID) 미지원 | iOS=APNs, Android=FCM 네이티브 푸시로 전환. 서버 발송 로직 Web↔네이티브 분기 | 2 |
| 3 | 웹뷰 내 소셜 로그인 차단 | Google 등이 임베디드 웹뷰 OAuth 차단(`disallowed_useragent`) | 로그인을 시스템 브라우저(SFSafariViewController/Custom Tabs)로 띄우고 딥링크 복귀 | 3 |
| 4 | 계정 삭제 인앱 동선 (Apple 5.1.1(v)) | 앱 안에서 탈퇴 도달 불가 시 거부 | 인앱 탈퇴 동선 확인·보강 | 4 |
| 5 | 위치 권한 정당성 | 부가기능(피부날씨)만으로 위치 요구 시 추궁 | 로그인 게이트 뒤 선택 기능으로 한정, 권한 설명문구 명확화 | 4 |

### 빌드 설정상 확인된 사항 (next.config.ts)
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`: iframe 임베드 차단. Capacitor 는 iframe 이 아닌 WebView 직접 로드라 무관. **단 OAuth 를 시스템 브라우저로 빼면 영향 없음.**
- `Cross-Origin-Opener-Policy: same-origin`: OAuth 팝업 흐름에 영향 가능 → 딥링크 방식(리다이렉트)으로 우회.
- `Permissions-Policy: geolocation=(self)`: 1st-party 위치 허용됨. 원격 로드(origin=pibutenten.kr)라 그대로 적용.
- CSP `connect-src 'self'`: origin 이 pibutenten.kr 이므로 충족. (정적 번들이었다면 깨졌을 부분)

---

## 3. Phase 별 작업

### Phase 1 — 셸 도입 + 문서화 〔담당: 개발〕 ✅ 완료 (2026-06-17)
- [x] 출시 계획 SSOT 문서 작성 (이 문서)
- [x] App ID(bundle identifier) 확정 → `kr.pibutenten.app`
- [x] Capacitor 도입 (`@capacitor/core@8.4`, `@capacitor/cli`, `capacitor.config.ts`)
- [x] Android 플랫폼 셸 추가 (`android/`)
- [x] iOS 플랫폼 셸 추가 (`ios/`, SPM 방식 — CocoaPods 불필요)
- [x] 오프라인 fallback 화면 (`native/www/index.html`)
- [x] 보안 설정: `allowNavigation` 화이트리스트 / `allowBackup=false` / dev·prod URL 분기(`CAP_SERVER_URL`)
- [x] `npm run build` + `npx tsc --noEmit` 통과 확인

#### 릴리스 전 보완 항목 (코드검수관 검토 결과, Phase 6 또는 Mac 작업 시 처리)
- [ ] Android `minifyEnabled true` + Capacitor 권장 ProGuard 룰 (Phase 6 빌드)
- [ ] iOS `Info.plist` `NSAppTransportSecurity` 의도 명시(`NSAllowsArbitraryLoads=false`) (Mac/Phase 6)
- [ ] iOS `Info.plist` `CFBundleDevelopmentRegion` → `ko` (Phase 5)
- [ ] 딥링크 스킴(`kr.pibutenten.app://`) / Universal Link · App Link (Phase 3)

### Phase 2 — 네이티브 푸시 전환 〔담당: 개발 + 원장(키 발급)〕
- [ ] 〔원장〕 Firebase 프로젝트 생성, Android 앱 등록 → `google-services.json`
- [ ] 〔원장〕 APNs 인증키(.p8) 발급 → Firebase 에 업로드
- [ ] `@capacitor/push-notifications` 통합, 앱에서 토큰 등록 흐름
- [ ] 서버 푸시 발송 로직 Web Push ↔ 네이티브(FCM) 분기
- [ ] 토큰 저장 테이블 확장 (네이티브 토큰 / 플랫폼 구분)

### Phase 3 — 로그인 딥링크 전환 〔담당: 개발〕
- [ ] OAuth 진입을 시스템 브라우저로 (`@capacitor/browser`)
- [ ] Universal Link(iOS) / App Links(Android) 또는 커스텀 스킴 콜백
- [ ] Supabase redirect URL 에 앱 콜백 등록

### Phase 4 — 심사 필수 항목 〔담당: 개발〕
- [ ] 계정 삭제 인앱 동선 확인·보강 (Apple 5.1.1(v))
- [ ] 네이티브 권한 설명문구 (Info.plist `NSLocationWhenInUseUsageDescription` 등, AndroidManifest)
- [ ] 위치 권한 사용 정당성 정리 (선택 기능 한정)
- [ ] 오프라인 안내 화면, 네이티브 스플래시, 안전영역(safe-area) 처리

### Phase 5 — 스토어 자산 〔담당: 개발 초안 + 원장 확정〕
- [ ] 앱 아이콘 1024px (iOS), 적응형 아이콘 (Android)
- [ ] 기기별 스크린샷 (iPhone 6.7"/6.5", Android)
- [ ] 앱 이름·부제·설명·키워드
- [ ] 연령 등급 설문 (의료정보 취급 반영)
- [ ] App Privacy 라벨(Apple) / Data Safety(Google) — 위치·이메일·이용기록 신고
- [ ] 개인정보 처리방침에 "앱" 항목 추가 (권한·푸시토큰·기기정보)

### Phase 6 — 빌드 · 업로드 〔담당: 개발(Android) + 직원 Mac(iOS)〕
- [ ] Android: 서명 키스토어 생성, AAB 빌드, Play Console 업로드
- [ ] iOS: 직원 Mac 에서 `cap sync` → Xcode 빌드·서명 → App Store Connect 업로드 (매뉴얼 제공)

### Phase 7 — 심사 제출 · 대응 〔담당: 개발 + 원장〕
- [ ] 심사용 데모 계정 제공 (의사/일반 각 1) — OAuth 외 심사관 접근 경로
- [ ] 제출, 리젝 사유 대응

---

## 4. App ID (확정)

- iOS Bundle ID: `kr.pibutenten.app`
- Android applicationId: `kr.pibutenten.app`
- 참고: Apple Services ID 는 `kr.pibutenten.web` (웹 OAuth용, 별개).

---

## 5. 관련 문서
- 기술 구조: `../ARCHITECTURE.md`
- 배포: `../DEPLOYMENT.md`
- 변경 이력: `../CHANGELOG.md`
