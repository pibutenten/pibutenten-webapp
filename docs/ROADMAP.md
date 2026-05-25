# 로드맵 (ROADMAP)

향후 작업 계획. **Now / Next / Later** 3단계. 완료 항목은 여기서 제거하고 `CHANGELOG.md` 에 기록 (CLAUDE.md §5).

---

## Now (현재 진행 중)

### 베타 → 공개 전환 준비 (~2026-06-01)
- [ ] `robots.ts` 베타 차단 환원
- [ ] Google Search Console / Naver Search Advisor / Bing Webmaster 등록 (사용자 직접)
- [ ] Vercel Spend Management 설정 (사용자 직접)
- [ ] Supabase Daily Backups 활성화 (사용자 직접)

### 콘텐츠 검수기 v1 운영 정착
- [ ] 1주 운영 후 거짓양성 비율 점검 → 임계점·키워드 사전 조정
- [ ] WriteClient 의 자살 모달 통합 (현재 CardEditor 만 적용)

---

## Next (다음 우선순위)

### 에디터 통합 마무리
**상태**: Phase 4a 완료, Phase 4b/4c 미진행. ADR 검토 후 결정.
- [ ] **Phase 4b**: WriteClient → CardEditor wrapper 화
  - 작성 전용 분기 많음 (doctor picker / 첫댓글 / 자동태그 / 환영카피 / 4액션)
  - 회귀 위험 → 새벽/오프피크 배포 권장
- [ ] **Phase 4c**: admin EditClient → CardEditor + AdminCardExtras
  - admin 전용 video/oembed/meta JSON/multi-pubmed 객체 분리 필요
- **공통 단점**: 사용자 체감 효과 0 (UI 동일, 순수 코드 정리)

### audit_logs 확장 (Phase 2)
- [ ] profile 수정, 카드 hard delete, admin draft publish 추가

### A10 잔여 라우트 error.message 일반화
- 인증 사용자 전용 (notifications / push / admin/*) — 보안 영향 낮음, 점진 패치

### push_subscriptions endpoint hostname 화이트리스트
- 현재 임의 hostname endpoint 수락 중 (이론적 위험)
- 실행: production 통계 조회 → fcm/mozilla/windows/apple 화이트리스트 적용
- 상세: `RUNBOOK.md` §1

---

## Later (장기 / 트래픽 증가 후 재검토)

### 보안 강화 (베타 기간 보류 항목)
- **R7** 본인인증 — 현재 클라 + DB CHECK constraint 로 충분 판단
- **L7** 자동결정 이의제기 UI — 적용 대상 기능 없음
- **L8** 처리방침 법무 자문 — DAU 1만 도달 후
- **L10** Sentry — 베타 규모 과함 (PII 마스킹 헬퍼만 적용)
- **L12** CSP enforce 전환 — SEO 우선 정책으로 Report-Only 유지 (`RUNBOOK.md` §6)
- **L13** HSTS preload — 도메인 정책 발목, 효과 작음
- **L14** Pino 구조화 로깅 — 베타 규모 과함

### HMAC 쿠키 서명 (`pibutenten_onboarded`)
- 현재 fast-path 캐시 마커. 위변조 시 미들웨어 통과해도 RSC 단 supabase getUser() 가 재검증 → 진짜 보호 레이어 있음
- 트래픽 작은 사이트에서 ROI 낮음
- 적용 시점: 트래픽 증가 또는 security audit 권고 시

### Card.tsx 분해
- 현재 한 파일에 너무 많은 책임 (view 카운트, 좋아요/저장/공유, 댓글 토글, 펼침 등)
- 우선순위: CardActions 추출부터 시작 추천

### 19금 차단 기능
- 콘텐츠 없음 → 약관 1줄 명시만 유지

---

## 분기 정기 점검

- [ ] `pg_proc` SECURITY DEFINER + authenticated EXECUTE sweep (보안 1차 사례)
- [ ] secret 로테이션 (VAPID/NAVER/ANTHROPIC/SERVICE_ROLE/PUSH_WEBHOOK)
- [ ] Dependabot / npm audit 알림 처리
- [ ] audit_logs 1년 이전 row 정리

---

## 결정 기준 메모

- "사용자 체감 효과 0" 인 작업은 우선순위 낮음 (예: 에디터 통합 Phase 4b/4c)
- 보안 항목은 **운영 부담 vs 실제 위험** 으로 판단 (베타 규모에 과한 도구 금지)
- 새 결정은 `decisions/NNNN-title.md` ADR 로 기록

---

**이 문서 변경 시**: 로드맵 완료 항목은 `CHANGELOG.md` 의 `### Added` 또는 `### Changed` 로 이동 (CLAUDE.md §5).
