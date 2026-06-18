# 세션 핸드오프 — 앱스토어 출시 (2026-06-18)

> 세션이 끊겨도 이어가기 위한 인수인계 문서. 새 세션 첫 응답 전에 이 파일 + `mobile-app-store-launch-plan.md` + `store-listing.md` 를 읽는다.
> 진행 SSOT 는 `mobile-app-store-launch-plan.md`, 스토어 카피·자산은 `store-listing.md`.

---

## 1. 지금까지 끝난 것

### Android (Google Play) — 검토 중
- 공개 테스트 트랙(대한민국) 설정 → 버전(AAB) 미리보기·확인 → **검토 제출 완료**.
- 게시 개요 페이지 상태: **"검토 중"**, 제출 변경사항 10개, 제출 버튼이 "변경사항 삭제"로 바뀜.
- 관리형 게시 **OFF** = Google 승인 시 자동 게시 (첫 출시에 정상·권장).
- 적용된 자산: 아이콘 `Playstore-icon-512.png`(정사각), 피처그래픽 `Graphic Image-2.png`, 스크린샷 3장(playstore 1/2/4 — 시술 관련 3·5번 제외), 카테고리=라이프스타일, 연락처 pibutenten@gmail.com + https://pibutenten.kr, 콘텐츠등급 전체이용가, Data Safety 5단계 완료, 데모계정 appreview@pibutenten.kr.

### iOS (Apple App Store) — 빌드 완료, 등록정보 입력 남음
- **GitHub Actions 클라우드 빌드로 TestFlight 업로드 성공** (물리 Mac 불필요).
  - 워크플로: `.github/workflows/ios-testflight.yml` (macos 러너, 수동 서명).
- Apple Developer Program **유료 가입 완료** (진솔컴퍼니 명의).
- App Store Connect 앱 레코드 **생성됨** (`kr.pibutenten.app`).
- App ID capability: Push Notifications + Sign in with Apple 확인됨.

---

## 2. 다음 세션에서 할 일 (= 시작점)

**목표: iOS App Store Connect 등록정보 입력 + 심사 제출.**

원칙: **입력 전 원장 검수(review-first)** — Console 에 넣기 전에 여기서 항목별 입력안을 표로 먼저 제안하고 승인받는다. 심사 제출 등 비가역 클릭은 원장 명시 확인 후 실행.

진행 순서:
1. 원장이 App Store Connect 로그인 → 앱 레코드(`kr.pibutenten.app`) 열기.
2. AI 가 현재 채워진 항목을 화면에서 읽고, 빈 칸별 입력안 제안 (Android 카피 재사용).
3. 검수 후 입력:
   - 이름·부제·설명·키워드 (Android 동일 카피)
   - 스크린샷 1290×2796: `전달용/04 앱스토어, 플레이스토어/앱스토어/Appstore 1,2,4.png`
   - 아이콘 1024×1024: `Appstore-icon-1024.png`
   - App Privacy 라벨(위치·이메일·이용기록), 연령 등급, 카테고리=라이프스타일
   - 빌드 선택: TestFlight 에 올라간 빌드 지정
   - 심사용 데모 계정 제공 (appreview@pibutenten.kr)
4. 심사 제출 (원장 명시 확인 후).

---

## 3. 남은/열린 항목 (잊지 말 것)

- **Android 공개 테스트 트랙 "일시중지됨"**: open-testing 트랙에 "트랙 다시 시작" 버튼이 보였음. 테스터가 빌드를 받으려면 재시작 필요할 수 있음 — 검토 통과 후 확인.
- **Android 프로덕션(정식 배포)**: 공개 테스트와 별개 트랙. 같은 빌드를 프로덕션에 올려 출시 신청 가능하나, Google 신규 계정 폐쇄테스트 요구 정책이 표시될 수 있음 → 공개 테스트 통과 후 Play Console 화면 보며 판단.
- **iOS TestFlight 외부 테스터 그룹/공개 링크**: 정식 심사와 별개로 필요 시 설정.
- Phase 4/6 잔여(비차단): 위치 권한 실기기 검증·Info.plist 설명문구, Android ProGuard, iOS ATS 명시 — 정식 심사 전 묶어서 처리.

---

## 4. 주요 ID·경로 메모

- developer: 5519962909977220903 / app: 4975379335091010610 / open-testing 트랙: 4699745920944044706
- package/bundle: `kr.pibutenten.app` (웹 OAuth Services ID 는 `kr.pibutenten.web`, 별개)
- iOS 자산: `전달용/04 앱스토어, 플레이스토어/앱스토어/Appstore 1-5.png`(1290×2796), `public/icons/Appstore-icon-1024.png`
- 서명 자산: `secrets/` (git 제외). GitHub Secrets: ANDROID_KEYSTORE_*(4), IOS_DIST_CERT_*(2), IOS_PROVISIONING_PROFILE_BASE64
- 데모 계정 상세: `secrets/README.md`
