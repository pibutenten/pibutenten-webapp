# 세션 핸드오프 — 앱스토어 출시 (2026-06-19)

> 세션이 끊겨도 이어가기 위한 인수인계 문서. 새 세션 첫 응답 전에 이 파일 + `mobile-app-store-launch-plan.md` + `store-listing.md` 를 읽는다.
> 진행 SSOT 는 `mobile-app-store-launch-plan.md`, 스토어 카피·자산은 `store-listing.md`.

---

## 1. 지금까지 끝난 것

### Android (Google Play) — 검토 중
- 공개 테스트 트랙(대한민국) 설정 → 버전(AAB) 미리보기·확인 → **검토 제출 완료**.
- 게시 개요 페이지 상태: **"검토 중"**, 제출 변경사항 10개, 제출 버튼이 "변경사항 삭제"로 바뀜.
- 관리형 게시 **OFF** = Google 승인 시 자동 게시 (첫 출시에 정상·권장).
- 적용된 자산: 아이콘 `Playstore-icon-512.png`(정사각), 피처그래픽 `Graphic Image-2.png`, 스크린샷 3장(playstore 1/2/4 — 시술 관련 3·5번 제외), 카테고리=라이프스타일, 연락처 pibutenten@gmail.com + https://pibutenten.kr, 콘텐츠등급 전체이용가, Data Safety 5단계 완료, 데모계정 appreview@pibutenten.kr.

### iOS (Apple App Store) — 심사 제출 완료, 심사 대기 중
- **1.0 심사 제출 완료** → ASC 인플라이트 버전 페이지 상태 **"심사 대기 중"(Waiting for Review)** 라이브 확인(2026-06-19).
  - 빌드 **7**(iPhone 전용, `1.0 (7)`) 첨부, **자동으로 버전 출시** = Apple 승인 시 자동 게시.
  - 잠금 확인 메시지: "새 빌드를 제출하려면 심사에서 이 버전을 삭제해야 합니다".
- 등록정보 입력 완료: 이름·부제·설명·키워드(Android 카피 재사용), 스크린샷 1290×2796(iPhone 6.5"), 아이콘 1024×1024(`Appstore-icon-1024.png`), 카테고리 라이프스타일, 가격 무료, 콘텐츠 권리 "아니요", App Privacy 라벨 게시, 연령 등급, 데모 계정(appreview@pibutenten.kr), 수출 규정 준수 응답.
- **GitHub Actions 클라우드 빌드로 TestFlight 업로드 성공** (물리 Mac 불필요). 워크플로: `.github/workflows/ios-testflight.yml` (macos 러너, 수동 서명).
- iPhone 전용 전환: `TARGETED_DEVICE_FAMILY` `"1,2"`→`"1"` (커밋 6106a7f). 신규 아이콘 `big-tt` (커밋 2211c03).
- Apple Developer Program 유료 가입 완료(진솔컴퍼니). App Store Connect 앱 레코드 생성(`kr.pibutenten.app`). App ID capability: Push Notifications + Sign in with Apple.

---

## 2. 다음 세션에서 할 일 (= 시작점)

**iOS·Android 양쪽 모두 심사 제출 완료 상태.** 남은 일은 승인 대기 + 승인 후 확인.

진행 순서:
1. **iOS**: Apple 심사 결과 이메일 대기(최대 48h 안팎). 승인 시 자동 출시(별도 클릭 불필요). 반려 시 사유 확인 후 대응.
2. **Android**: Play Console 게시 개요에서 검토 통과 여부 확인. 검토 통과 후 공개 테스트 트랙 "일시중지됨" 이면 "트랙 다시 시작". 정식 배포(프로덕션) 필요 시 별도 트랙 출시 신청.
3. 양쪽 승인되면 실기기 설치·로그인·핵심 동선 스모크 테스트.

> 참고: Play Console(play.google.com)는 브라우저 자동화가 막혀 있어(권한 거부) AI 가 라이브로 상태를 못 읽는다. Android 상태는 원장이 화면을 보고 알려주거나 스크린샷으로 확인.

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
