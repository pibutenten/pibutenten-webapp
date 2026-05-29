# ADR 0011 — SEO/AEO/GEO 권고 중 폐기 항목 (재추천 금지 목록)

- **상태**: Accepted
- **결정일**: 2026-05-29
- **결정자**: 정민 (운영자)
- **맥락**: `docs/reports/2026-05-28-SEO-AEO-GEO-종합보고서.md` 및 부록의 권고 중 일부를 운영 정책상 폐기. 향후 작업 추천·로드맵에서 제외.

---

## 결정

다음 11개 항목은 **본 사이트 운영 정책상 채택하지 않음**. 향후 AI 협업·감사·로드맵 작성 시 재추천 금지.

### 1. C-1 — 시술별 부작용 마스터 DB + 카드별 자동 삽입 시스템

- **권고 내용**: `procedures` 테이블 + `possible_complications[]` / `serious_adverse_outcomes[]` 컬럼 + 카드 작성 UI 강제 입력 + 본문 검수 룰.
- **폐기 사유**: 작성 규범 (`docs/AUTHOR_GUIDE.md §7`) 으로 대체. 의료법 §56②7 부작용 표시 의무는 작성자 자율 + 작성 가이드 + 컴플라이언스 사전 키워드 검수(`src/lib/content-screening.ts`)로 충족 가능.

### 2. C-2 — 의학 검수자 분리 (`medical_reviewer_id` 컬럼 + CHECK 제약 + 검수자 UI 패널)

- **권고 내용**: `cards.medical_reviewer_id uuid` 컬럼 + `CHECK (medical_reviewer_id <> author_doctor_id)` + `reviewedBy` schema 별도 Physician @id + 가시 패널.
- **폐기 사유**: 작성자가 보건복지부 인정 피부과 전문의인 구조에서 `reviewedBy = 작성자 본인` 표기가 정상. Mayo/Cleveland Clinic 의 별도 검수자 모델은 비-의사 작성자가 다수인 매체용. 본 사이트는 의사 본인이 작성·검수 동일인.

### 3. C-3 — 의사 글 자동 차단 검수

- **권고 내용**: `authorRole === 'doctor'` 도 임계점 상향 후 검수 + admin 사후 검토 큐.
- **폐기 사유**: 의사 자율 작성 자유 보장. 강제 차단 안 함. 사후 모니터링은 별도 admin 대시보드 (보류 결정) 로 처리할 수 있으나, 자동 차단은 미적용.

### 4. C-4 — 별도 Quick Answer 박스 UI

- **권고 내용**: 의사 글 본문 최상단 `<div class="card-answer-speakable">` Quick Answer 박스 (80–150자) 분리 UI.
- **폐기 사유**: 두괄식 작성 규범 (`docs/AUTHOR_GUIDE.md §1`) 으로 대체. 본문 첫 단락이 그 자체로 Speakable 안전 픽업 대상이 되도록 작성 가이드 운영. 별도 UI 박스 신설 안 함.

### 5. 별도 검수일 가시 줄 (`본 답변 YYYY-MM-DD 기준`)

- **권고 내용**: 의사 글 푸터에 `<time datetime="...">YYYY-MM-DD 기준 최신 검수</time>` 가시 표시.
- **폐기 사유**: SNS 표준 상대시간 (예: "3일 전") 그대로 유지. 검색엔진용 절대 시간은 schema (`datePublished`/`dateModified`/`lastReviewed`) + `<time dateTime>` 속성으로 이미 확보. 화면 추가 텍스트 불필요.

### 6. 4-date 모델 (Healthline 패턴)

- **권고 내용**: `datePublished` / `dateModified` / `medical_reviewed_at` / `fact_checked_at` 4개 컬럼 분리.
- **폐기 사유**: 단일 날짜(`updated_at` + `created_at`) 로 운영. 작성자=검수자 모델에서 4개 분리의 운영 가치 낮음.

### 7. URL 패턴 변경 (`/procedures/{slug}/q/{question-slug}`)

- **권고 내용**: 시술 중심 URL 구조로 재편.
- **폐기 사유**: 현재 `/doctors/{slug}/{year}/{post-slug}` 의 author-centric 패턴 유지. 의사 권위 + 연도 트래킹 + 색인 안정성 측면 유리. URL 전환 비용 + 색인 손실 위험 회피.

### 8. H-1 — sitemap index 분리 (static / doctors / topics / cards 4개 sub-sitemap)

- **권고 내용**: 50,000 URL 한계 + Naver 단일 sitemap 정책 동시 해소.
- **폐기 사유**: 베타 트래픽 + 현재 1,408 URL 규모에서 단일 sitemap 으로 충분. URL 50K 임계 도달 시점에 재검토.

### 9. H-4 — `/topics/{tag}` procedure pillar 격상

- **권고 내용**: 시술 정의·메커니즘·부작용·회복기간 SSR 섹션 + `MedicalWebPage` schema 풀세트.
- **폐기 사유**: 콘텐츠 누적 부족 단계 보류. 의사 글 누적 후 토픽 hub 의 자연 검색 유입 데이터 확인 후 재결정.

### 10. H-8 — 사전심의 번호 표기 시스템 (`cards.ad_review_number` + footer 자동 출력)

- **권고 내용**: 광고 분류 카드용 자율심의 번호 필드.
- **폐기 사유**: 광고 분류 카드 0건 유지 방침. 본 사이트는 의료 정보 플랫폼 입장 견지 (의료법 §56② "광고" 미해당). 광고 분류 발생 시 별도 재결정.

### 11. ISR 전면 적용 (피드 페이지 포함)

- **권고 내용**: 의사 글·프로필·홈·검색·topics 모두 ISR 전환.
- **폐기 사유**: 홈 피드·검색 피드는 **랜덤성 (jitter) 의도 기능**. ISR 전환 시 모든 사용자가 같은 순서를 받게 되어 의도 손상. ISR 은 의사 글·의사 프로필·topics 등 **개별 페이지 한정** 적용. 피드는 `force-dynamic` 유지.

---

## 향후 작업 추천 규칙

위 11항목은 다음 조건이 충족될 때만 재제안 가능:
- 폐기 사유와 다른 새 근거 발생 (예: 단속 사례, 색인 데이터, 트래픽 측정 결과)
- 그 근거를 추천 시 명시

근거 없이 권고만 반복하는 경우 본 ADR 을 인용해 자동 제외.

## 관련 ADR / 문서

- `docs/AUTHOR_GUIDE.md` — 작성 규범 (C-1, C-4 의 대체)
- `docs/reports/2026-05-28-SEO-AEO-GEO-종합보고서.md` — 원본 권고
- `docs/CHANGELOG.md` 2026-05-29 항목 — 채택된 SEO/AEO/GEO 작업
