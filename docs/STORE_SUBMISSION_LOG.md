# 앱스토어 제출 진행 기록 (iOS · Android) — 단일 출처(SSOT)

> 이 문서는 **App Store · Google Play 제출 진행 상황을 시간순으로 기록**하는 단일 기록부입니다.
> 원장님이 "지금 어디까지 됐어?" 라고 물으면, AI 는 **이 문서를 먼저 읽고** 현재 상태를 답한 뒤,
> 변동이 있으면 이 문서를 갱신합니다. (계획·전략은 `plans/mobile-app-store-launch-plan.md`, 카피·자산은 `plans/store-listing.md`.)

최종 갱신: **2026-06-29**

> 🟡 **다음 빌드 대기(2026-06-29)**: 피부날씨 위치 동(洞) 단위 표시 = 기기 측위(COARSE) 필요 → **새 빌드 + 스토어 재심사 필수**(웹 배포로는 불가). 소스·권한·플러그인은 준비 완료(빌드 워크플로가 `cap sync` 자동 수행). **버전 증가 적용: Android `versionCode 2`/`versionName 1.0.1`, iOS `MARKETING_VERSION 1.0.1`**(현 출시본 1.0/v1 과 충돌 방지). 남은 절차: ① `android-release.yml`·`ios-testflight.yml` 워크플로 실행(수동 dispatch) → ② AAB 를 Play Console 업로드 / TestFlight 빌드를 App Store Connect 새 버전(1.0.1)에 첨부·제출(원장). 정밀도는 동 단위로 충분 판단 → FINE 미사용(COARSE 유지, ADR 0022). 웹 IP 폴백 견고화(서울 고착·느림 수정)는 이미 배포됨(CHANGELOG 2026-06-29, commit ba08df6).

> ⚠️ **재심사 대기 항목(2026-06-25)**: 피부날씨 네이티브 측위 수정(`@capacitor/geolocation` + iOS `NSLocationWhenInUseUsageDescription` + Android `ACCESS_COARSE_LOCATION`)은 **네이티브 바이너리 변경**이라 **새 앱 빌드 + 스토어 재심사가 있어야** 현재 출시본에 반영됩니다(웹 배포만으로는 적용 안 됨). 코드·권한 선언은 적용 완료, 빌드·제출은 원장 검수 후 별도 진행. 상세는 ADR 0022.
> - **플러그인 등록은 자동**: GitHub Actions 빌드 워크플로(android-build/android-release/ios-build/ios-testflight)가 빌드 직전 `npx cap sync` 를 수행하므로, `@capacitor/geolocation` 은 빌드 시 iOS/Android 네이티브 프로젝트에 자동 등록됩니다(수동 작업 불필요).
> - **iOS 심사 주의**: 위치 권한 사용 목적 문자열(`NSLocationWhenInUseUsageDescription`)이 심사 항목 — "내 주변 날씨" 용도가 그대로 평가됩니다. 거부 시 IP 대략위치/대치동 폴백이라 기능은 차단되지 않습니다.
> - **구글 심사 주의**: `ACCESS_*_LOCATION` 추가로 Play **데이터 안전 신고** 갱신 필요(정밀/대략 위치 사용 목적).
> - **제출 일정(원장 결정 2026-06-25)**: 정밀 GPS 재심사는 모아서 **2026-06-26 일괄 제출** 예정([[app-ux-5issues]] 그룹 B 와 함께). 그 전까지는 아래 IP 대략위치가 임시로 동작.
> - **임시 대체(재심사 불필요, 웹 배포로 적용 완료)**: 기기 측위 실패 시 `/api/iploc`(Vercel IP 헤더만 읽음, 외부호출 0건) 기반 **시(도시) 단위 대략위치** 표시(commit a2b3cf2·7206c8e). 정밀 GPS 빌드 전까지 웹·PWA·앱 모두 대치동 대신 대략위치를 보여줌. → ADR 0021(적용 범위 밖)·0022.

---

## 1. 현재 상태 한눈에

| 스토어 | 버전 | 상태 | 제출일 | 승인 후 |
|---|---|---|---|---|
| **iOS (App Store)** | 1.0 (빌드 7, iPhone 전용) | **출시 완료 (대한민국 게시)** — 가용성 ON, 대한민국 "처리 중에서 사용 가능" | 2026-06-19 | 게시 완료 (가용성 ON 2026-06-23, 최대 24시간 내 스토어 반영) |
| **Android (Google Play)** | 1 (1.0) | **출시 완료 (게시됨)** — 게시 개요 비어 있음(대기 변경 0) | 2026-06-19 | 게시 완료 (최근 게시일 2026-06-21) |

**→ iOS: Apple 심사 통과 후 6/23 가격 및 사용 가능 여부에서 대한민국 1개국 가용성 ON 저장 완료. 대한민국 상태 "처리 중에서 사용 가능" → 최대 24시간 내 App Store 반영. 양쪽 스토어 정식 출시. (조치 불필요)**
**→ Android: 6/21 검토 통과·자동 게시 완료. Play 스토어 정식 출시 상태. (조치 불필요)**

### 예상 대기 시간
- **iOS**: 보통 24~48시간 (Apple 심사). 가변적이며 더 길 수도 있음. 반려 시 사유 이메일 도착.
- **Android**: 보통 7일 이내 (Google 검토). 더 길어질 수 있음. 신규 앱 첫 검토라 다소 길 수 있음.
- 승인되면 양쪽 다 **자동으로 스토어에 게시**됩니다 (수동 출시 버튼 없음).

### 승인 후 할 일 (그때 안내)
- 양쪽 승인되면 실기기에서 설치 → 로그인 → 핵심 동선(피부날씨·일기·Q&A·푸시) 스모크 테스트.

---

## 2. 시간순 진행 로그

### 2026-06-17 — 셸 도입 · 네이티브 기능 · 클라우드 빌드
- **Capacitor 래핑** 도입(원격 URL 로드 `https://pibutenten.kr`). App ID `kr.pibutenten.app` 확정. Android/iOS 플랫폼 셸 추가.
- **네이티브 푸시 전환**: Firebase 프로젝트 `pibutenten-294d6`, APNs 인증키(.p8, Key `9X5UW4FJ43` / Team `ZR2BS383L3`) 발급·업로드. 서버 발송 Web Push ↔ FCM 분기.
- **로그인 딥링크 전환**: OAuth 를 시스템 브라우저로, 콜백 `kr.pibutenten.app://auth/callback`. Supabase redirect allow-list 등록.
- **GitHub Actions 클라우드 빌드** 구축(물리 Mac 불필요): ubuntu=Android, macos 러너=iOS, 서명은 GitHub Secrets.
  - iOS 시행착오: 자동 서명이 개발 프로파일로 fallback → **수동 서명 전환**. iOS 26 SDK 요구 → 러너 최신 Xcode(26) 선택으로 해결.
  - iPhone 전용 전환: `TARGETED_DEVICE_FAMILY` `"1,2"`→`"1"` (커밋 6106a7f). 신규 아이콘 `big-tt` (커밋 2211c03).

### 2026-06-18 — 스토어 자산 확정 · Android 등록정보 입력 · 공개 테스트 제출
- **문구 확정**(원장 최종본): 부제·간단한 설명(52/80자)·자세한 설명(섹션형, 의료법 §56 안전 표현)·키워드. → `store-listing.md §2`.
- **그래픽 자산 확정**:
  - 앱 아이콘 512: 사각 `public/icons/Playstore-icon-512.png` (원형은 흰 테두리 문제로 제외).
  - 피처 그래픽 1024×500: `Graphic Image-2.png`.
  - 폰 스크린샷: `playstore 1·2·4` (1080×1920). #3 시술 타임라인·#5 후기 리포트는 **의료법 §56 리스크로 제외**.
  - iOS 자산: `Appstore 1·2·4` (1290×2796), 아이콘 `Appstore-icon-1024.png`.
- **Play Console 앱 콘텐츠 선언 완료**: 개인정보처리방침 URL, 광고 없음, 콘텐츠등급 전체이용가(IARC), 앱 액세스(데모계정 `appreview@pibutenten.kr`), 타겟층, 건강/금융/정부앱 해당없음, 광고 ID 미사용.
- **데이터 보안(Data Safety) 5단계 완료·저장**: 수집 데이터 7종, 공유(제3자)=없음, 위치·사진=선택 그 외 필수, 부분 데이터 삭제 가능=예.
- **앱 카테고리=라이프스타일**, 연락처 `pibutenten@gmail.com` + `https://pibutenten.kr`.
- **스토어 등록정보 입력·저장 완료**(문구+아이콘+피처+스크린샷 3장).
- **Android 공개 테스트 트랙(대한민국) 검토 제출** → Google 검토 중. (open-testing 트랙 `4699745920944044706`)
- **iOS TestFlight 업로드 성공**(클라우드 빌드, 빌드 7).

### 2026-06-25 — 피부날씨 네이티브 측위 수정 (재심사 대기)
- **증상**: 피부날씨 위치가 앱(네이티브)에서만 항상 대치동(웹/PWA 는 정상). 원격 URL WebView 구조에서 ① `@capacitor/geolocation` 미설치 + ② iOS/Android 위치 권한 미선언 → 측위 즉시 실패.
- **적용(코드·권한 선언)**: `@capacitor/geolocation@8.2.0` 설치, `useWeather.ts` 플랫폼 분기(네이티브=플러그인/웹=navigator), iOS `Info.plist` `NSLocationWhenInUseUsageDescription`, Android `AndroidManifest` `ACCESS_COARSE/FINE_LOCATION`. 빌드·tsc 통과. → ADR 0022.
- **재심사 필요**: 네이티브 바이너리 변경이라 **새 빌드 + 스토어 재심사** 후에야 출시본 반영. 빌드·제출은 원장 검수 후 진행. iOS 는 위치 사용 목적 문자열이 심사 평가 대상.
- **on-device 확인 항목(재심사 전)**: ① 앱 첫 진입 시 OS 위치 권한 팝업 노출 ② 허용 시 실제 동 표시 ③ 거부 시 대치동 폴백(기능 차단 없음) ④ iOS·Android 양쪽.

### 2026-06-23 — iOS 심사 승인 확인 + 가용성 ON(대한민국 게시 완료) · Android 출시 완료 확인
- **iOS 심사 통과 확인**: App Store Connect 버전 상태가 **"1.0 배포 준비됨(Ready for Distribution)"** + 녹색 체크 → Apple 심사 **승인**.
- 단, 버전 화면 상단 배너 **"App Store에서 이 앱의 판매가 중단되었습니다..."** → **판매 가용성 OFF** 상태라 스토어 노출 안 됨이었음.
- **iOS 가용성 ON 완료(게시)**: App Store Connect → 가격 및 사용 가능 여부 → **사용 가능 여부 설정** → "특정 국가 또는 지역" 선택 → **대한민국 1개국** 체크 → 최종 확인창 "앱이 출시되면 대한민국에서 앱을 사용할 수 있도록 설정하시겠습니까?" **확인** 클릭(원장님 직접 클릭, 최종 게시 승인).
  - 결과: 가용성 페이지 **"사용 가능 여부(1개의 국가 또는 지역)"**, **대한민국 상태 "처리 중에서 사용 가능"**, 그 외 모든 국가 "사용 불가". 변경 사항은 **최대 24시간 이내 App Store 반영**(안내문 명시). → iOS 정식 출시.
  - ※ 작업은 "Claude in Chrome" MCP 통제 탭(로그인 세션)에서 진행, 최종 게시 클릭은 원장님이 직접 수행.
- **Android 출시 완료 확인**: Play Console **게시 개요** 화면이 **비어 있음**(검토 중인 변경사항 0개) + **최근 게시일 2026-06-21**. → 6/19 제출분(프로덕션 100% 출시 + 대한민국 지역)이 6/21 Google 검토 통과·**자동 게시 완료**. Play 스토어 정식 출시 상태. (관리형 게시 OFF → 추가 조치 불필요)

### 2026-06-19 — iOS 정식 심사 제출 · Android 프로덕션 제출
- **iOS 정식 심사 제출 완료** → App Store Connect 버전 상태 **"심사 대기 중(Waiting for Review)"**.
  - 등록정보 전체 입력: 이름·부제·설명·키워드, 스크린샷 1290×2796, 아이콘 1024×1024, 카테고리 라이프스타일, 가격 무료, App Privacy 라벨 게시, 연령 등급, 데모 계정, 수출 규정 응답.
  - 빌드 7(iPhone 전용 `1.0 (7)`) 첨부, **자동 버전 출시** 설정.
  - 잠금 메시지: "새 빌드를 제출하려면 심사에서 이 버전을 삭제해야 합니다".
- **Android 프로덕션 트랙 제출 완료** (이번 세션 핵심 작업):
  - 회사 계정(주식회사 진솔컴퍼니)은 신규 계정 폐쇄 테스트 요건 **면제** 확인.
  - 같은 AAB(버전 1 / 1.0, 3.94MB, target SDK 36, min API 24)로 프로덕션 릴리스 생성, ko-KR 출시 노트 입력.
  - 차단 오류 "이 트랙에 선택된 국가 또는 지역이 없습니다" → **대한민국 추가·저장**으로 해결(0개→1개).
  - 릴리스 review 저장(오류 0개, 비차단 경고 2개) → 게시 개요에서 **"검토를 위해 변경사항 2개 제출"** → 확인 대화상자 "검토를 위해 변경사항 전송" 클릭.
  - 결과: 게시 개요 **"검토 중인 변경사항"**, 변경 항목 = ① 프로덕션 1(1.0) 전체 출시 시작 ② 국가/지역 1개 추가(대한민국). 사전 점검(quick checks) 통과. 관리형 게시 OFF → 승인 시 자동 게시.
  - ※ Play Console 은 Chrome 확장 자동화가 차단됨 → **Playwright 브라우저**로만 작업(원장님이 직접 로그인).

---

## 3. 주요 ID · 자산 · 계정 메모

| 항목 | 값 |
|---|---|
| iOS Bundle ID / Android applicationId | `kr.pibutenten.app` |
| 웹 OAuth Services ID (별개) | `kr.pibutenten.web` |
| Play developer ID | `5519962909977220903` |
| Play app ID | `4975379335091010610` |
| Play 프로덕션 트랙 ID | `4697512964541393922` |
| Play 공개 테스트 트랙 ID | `4699745920944044706` |
| 게시 개요 URL | `.../app/4975379335091010610/publishing` |
| 운영사 | 주식회사 진솔컴퍼니 |
| 공개 연락처 | `pibutenten@gmail.com` · `https://pibutenten.kr` |
| 심사 데모 계정 | `appreview@pibutenten.kr` (상세는 `secrets/README.md`, git 제외) |
| Firebase 프로젝트 | `pibutenten-294d6` (APNs Key `9X5UW4FJ43` / Team `ZR2BS383L3`) |
| 서명 자산 | `secrets/` (git 제외). GitHub Secrets: ANDROID_KEYSTORE_*(4), IOS_DIST_CERT_*(2), IOS_PROVISIONING_PROFILE_BASE64 |
| 빌드 워크플로 | `.github/workflows/android-release.yml`, `ios-testflight.yml` |

> ⚠️ Play Console URL 의 트랙은 **숫자 ID** 로 접근해야 함. 텍스트 슬러그(`tracks/production/...`)는 오류(571F39C6) 발생.

---

## 4. 대기 중 / 남은 항목

### 조치 필요 (현재)
- iOS: **출시 완료(대한민국 게시)**. 가용성 ON 저장 완료 → 최대 24시간 내 스토어 반영. 잔여 조치 없음.
- Android: **출시 완료**. 잔여 조치 없음.
- **→ 양쪽 스토어 정식 출시 완료. 차단 조치 없음.**

### 승인 후 / 향후 (비차단)
- 양쪽 승인 후 실기기 스모크 테스트.
- Android 공개 테스트 트랙 "일시중지됨" 시 "트랙 다시 시작"(테스터 배포 필요 시).
- iOS TestFlight 외부 테스터 그룹/공개 링크(필요 시).
- Phase 4/6 잔여(다음 빌드에 묶음): 위치 권한 실기기 검증 + iOS Info.plist 설명문구 / Android ProGuard `minifyEnabled` / iOS ATS 명시.
- 스토어 등록정보 자산은 출시 후에도 교체 가능 → 통과 후 제외했던 #3·#5 스크린샷 추가 검토.

---

## 5. 이 문서 갱신 규칙
- 상태가 바뀔 때마다 **§1 표 + §2 시간순 로그**에 항목 추가(날짜 헤더 `### YYYY-MM-DD`).
- 큰 변경(승인/반려/재제출)은 `CHANGELOG.md` 에도 기록.
- 계획·전략 변경은 `plans/mobile-app-store-launch-plan.md`, 카피·자산 변경은 `plans/store-listing.md` 갱신 후 이 문서 §3 에 반영.
