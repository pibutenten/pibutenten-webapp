# 세션 핸드오프 — 앱스토어 출시 (2026-06-23) — 🎉 양쪽 스토어 정식 출시 완료

> 세션이 끊겨도 이어가기 위한 인수인계 문서. 새 세션 첫 응답 전에 이 파일 + `mobile-app-store-launch-plan.md` + `store-listing.md` 를 읽는다.
> 진행 SSOT 는 `mobile-app-store-launch-plan.md`, 스토어 카피·자산은 `store-listing.md`.
> **제출 진행 시간순 단일 기록부는 `../STORE_SUBMISSION_LOG.md` 참조** (원장 상태 질문 시 그 문서를 먼저 읽고 답한다).

---

## 1. 지금까지 끝난 것

### Android (Google Play) — ✅ 정식 출시 완료 (2026-06-21)
- **프로덕션 트랙(대한민국) Google 검토 통과 → 자동 게시·전체 출시 100% 완료** (2026-06-21). 같은 AAB(버전 1 / 1.0).
- 관리형 게시 OFF 였으므로 승인과 동시에 자동 게시됨.
- 회사 계정(주식회사 진솔컴퍼니)은 신규 계정 폐쇄 테스트 요건 **면제** 확인됨.
- 적용된 자산: 아이콘 `Playstore-icon-512.png`(정사각), 피처그래픽 `Graphic Image-2.png`, 스크린샷 3장(playstore 1/2/4 — 시술 관련 3·5번 제외), 카테고리=라이프스타일, 연락처 pibutenten@gmail.com + https://pibutenten.kr, 콘텐츠등급 전체이용가, Data Safety 5단계 완료, 데모계정 appreview@pibutenten.kr.

### iOS (Apple App Store) — ✅ 정식 출시 완료 (2026-06-23)
- **1.0 심사 통과 → 승인 → 대한민국 가용성 ON(정식 출시)** (2026-06-23). App ID **6781289580**.
  - 게시 후 ASC 가용성: "사용 가능 여부(1개 국가·지역)" = 대한민국 **"처리 중에서 사용 가능"**, 나머지 "사용 불가". App Store 반영 최대 24h.
  - 빌드 **7**(iPhone 전용, `1.0 (7)`) 게시. 자동 출시 옵션으로 승인 즉시 게시됨.
- 등록정보 입력 완료: 이름·부제·설명·키워드(Android 카피 재사용), 스크린샷 1290×2796(iPhone 6.5"), 아이콘 1024×1024(`Appstore-icon-1024.png`), 카테고리 라이프스타일, 가격 무료, 콘텐츠 권리 "아니요", App Privacy 라벨 게시, 연령 등급, 데모 계정(appreview@pibutenten.kr), 수출 규정 준수 응답.
- **GitHub Actions 클라우드 빌드로 TestFlight 업로드 성공** (물리 Mac 불필요). 워크플로: `.github/workflows/ios-testflight.yml` (macos 러너, 수동 서명).
- iPhone 전용 전환: `TARGETED_DEVICE_FAMILY` `"1,2"`→`"1"` (커밋 6106a7f). 신규 아이콘 `big-tt` (커밋 2211c03).
- Apple Developer Program 유료 가입 완료(진솔컴퍼니). App Store Connect 앱 레코드 생성(`kr.pibutenten.app`). App ID capability: Push Notifications + Sign in with Apple.

---

## 2. 다음 세션에서 할 일 (= 시작점)

**iOS·Android 양쪽 모두 정식 출시 완료.** 남은 일은 출시 후 확인(비차단)뿐.

진행 순서:
1. **iOS App Store 반영 확인**: 게시 후 최대 24h. App Store 에서 "피부텐텐" 검색·설치 가능 여부 확인.
2. **실기기 스모크 테스트**(양 플랫폼): 설치 → 로그인 → 피부날씨·일기·Q&A·푸시 핵심 동선.
3. **스크린샷 #3·#5 재검토**(시술 관련으로 제외했던 것) — 필요 시 교체본 준비해 스토어 자산만 갱신(빌드 무관).

> 참고: Play Console(play.google.com)는 브라우저 자동화가 막혀 있어(권한 거부) AI 가 라이브로 상태를 못 읽는다. Android 상태는 원장이 화면을 보고 알려주거나 스크린샷으로 확인.

---

## 3. 남은/열린 항목 (잊지 말 것 — 모두 비차단)

- **iOS App Store 반영(최대 24h) 후 검색·설치 확인.**
- **실기기 스모크 테스트**(양 플랫폼): 설치 → 로그인 → 핵심 동선.
- **스크린샷 #3·#5 재검토**(시술 관련 제외분) — 필요 시 스토어 자산만 갱신.
- **다운로드 유도용 QR·배포 링크**: 스토어 페이지 URL 로 QR 생성(아래 §5). 한 장으로 양 OS 분기하려면 분기 랜딩 필요.
- Phase 4/6 잔여(비차단): 위치 권한 실기기 검증·Info.plist 설명문구, Android ProGuard, iOS ATS 명시.

---

## 4. 주요 ID·경로 메모

- developer: 5519962909977220903 / app: 4975379335091010610 / open-testing 트랙: 4699745920944044706
- package/bundle: `kr.pibutenten.app` (웹 OAuth Services ID 는 `kr.pibutenten.web`, 별개)
- iOS App ID(숫자): **6781289580**
- iOS 자산: `전달용/04 앱스토어, 플레이스토어/앱스토어/Appstore 1-5.png`(1290×2796), `public/icons/Appstore-icon-1024.png`
- 서명 자산: `secrets/` (git 제외). GitHub Secrets: ANDROID_KEYSTORE_*(4), IOS_DIST_CERT_*(2), IOS_PROVISIONING_PROFILE_BASE64
- 데모 계정 상세: `secrets/README.md`

---

## 5. 다운로드 링크·QR (출시 후 배포용)

스토어 정식 페이지 URL:
- **iOS App Store**: `https://apps.apple.com/kr/app/id6781289580`
- **Android Google Play**: `https://play.google.com/store/apps/details?id=kr.pibutenten.app`

QR 만드는 법(3가지):
1. **OS별 QR 2개** (가장 단순·권장 초기): 위 두 URL 을 각각 QR 생성기(예: qr-code-generator.com, 네이버 QR 등)에 넣어 "App Store 다운로드" / "Google Play 다운로드" 두 장으로 안내. iPhone·Android 사용자가 각자 맞는 QR 스캔.
2. **OS 자동 분기 QR 1장**: 한 개 QR 로 iPhone→App Store, Android→Play 로 자동 이동. ⓐ 외부 서비스(QR Code Generator·Linktree·Branch·Firebase Dynamic Links 후속 등)의 "스토어 리다이렉트" 기능 사용, 또는 ⓑ 자체 분기 페이지(`https://pibutenten.kr/app` 같은 라우트에서 user-agent 로 분기 redirect) 만들어 그 URL 로 QR 생성. 자체 페이지가 도메인 신뢰·추적 면에서 유리.
3. **웹사이트 배너/버튼**: pibutenten.kr 에 "앱 다운로드" 버튼(App Store·Play 뱃지) 추가 — QR 과 병행.

> 자체 분기 페이지(`/app`)는 아직 미구현. 필요 시 별도 안건으로 Next.js 라우트 추가(서버에서 user-agent 판별 → 302 redirect).
