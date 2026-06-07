# 세션 핸드오프 (SESSION_HANDOFF)

> 세션 간 인수인계용. 현재 상태·주의사항·다음 작업·불변 원칙을 한 장으로. 변경 이력 상세는 `CHANGELOG.md`.

**최종 갱신**: 2026-06-07

---

## 1. 현재 상태 (스냅샷)

- **git**: `HEAD == origin/main`. 최근 커밋(2026-06-07): L-Phase2 → 태그 관리 UI(O·P·Q) → 칩 통일 → 발주 A·B(`99dbcde`) → C(`c1306e7`) → D(라벨·주석). 알림 설정은 정보수정 페이지로 일원화·즉시저장.
- **DB 마이그**: **0268** 까지 production 적용 완료.
- **빌드**: `tsc --noEmit` 0 + `npm run build` Compiled successfully.

### 태그 사전 DB SSOT 통합 (L-Phase2) — ✅ 완료
`procedure-mappings.json`·`procedure_taxonomy` 청산 → **DB `tag_dictionary` 단일 SSOT + 빌드 스냅샷**. 일반인·원장·관리자 글 저장이 단일 흡수 트리거로 정규화. (상세 ARCHITECTURE §10, TECH_SPEC §6.9, RUNBOOK §7.)

| 마이그 | 내용 |
|---|---|
| 0252 | service_role 테이블 GRANT (태그 저장 버그 해결) |
| 0253~0255 | rename_tag RPC · 온보딩 얼굴형 5종 · 등록 트리거 enum 수정 |
| 0256 | 온보딩 skin_type 7종 |
| 0257~0259 | procedure_taxonomy 청산(FK 재지정 + RPC 재작성 + DROP) |
| 0260~0261 | merge_tag RPC · 병합후보 무시목록 |
| 0262 | profiles 영문코드 → 한글 통일(관심 digest 매칭 부활) |
| 0263 | 자동등록 영문 태그 흡수 트리거 + slugify_en + tag_absorb_log |
| 0264 | JSON 사전 → DB 이관(aliases·pubmed_keywords 컬럼 + tag_blacklist·tag_normalization) |
| 0265 | 동의어 14건 병합 + 흡수 트리거 통일(헤르페스·단순포진 분리 유지) |
| 0266 | JSON orphan 2건(K-뷰티·1회적정량) DB 보강 |
| 0267 | auto-tag 추천 큐레이션 `is_recommendable`(804 시드) |
| 0268 | get_tag_admin_overview + is_recommendable 컬럼 |

- **JSON 완전 제거**: `procedure-mappings.json` 삭제. auto-tag·slug-mapping·schema/procedure·gen 전부 스냅샷 기반. (slug-mapping.ts 모듈은 유지, 데이터만 DB.)
- **태그 관리 UI**: '태그 매니저'→'태그 관리', 1000행 상한 해소(range 청크), 병합후보 섹션 제거. 'O' 작업으로 '자동추천' 열·부제 제거(데이터·큐레이션은 유지). 'P' 작업으로 요약 KPI 를 '전체 카드 목록' 탭형(하늘색·5항목: 전체·분류완료·영문 공란·시술 후기·부모 태그)으로 통일 + 대시보드 활동 통계 박스 높이 균일.

### 4-2 알림 — ✅ 완료 (마이그 0239~0245, kind 8종). 관심 digest cron 21:00 UTC=06:00 KST.
- **알림 설정 UI 일원화(발주 B·C)**: 별도 `/settings/notifications` 페이지·`NotificationPreferences` 컴포넌트 제거 → 정보수정(`/settings/profile`)으로 통합. 관심 알림 3개=섹션 '공개' 옆 '알림' 체크박스, 활동 알림=관심시술 밑 '🔔 활동 알림' 접이식 카드. 저장 키·API 불변. 프로필 페이지 전체 즉시저장(저장하기 버튼 제거).

---

## 2. 잔여 / 보류 항목

- **✅ Vercel `CRON_SECRET` 확인 완료(2026-06-07)**: production env 에 존재(encrypted). 관심 digest cron(`/api/cron/keyword-digest`, `0 21 * * *`=06:00 KST) Bearer 인증 정상.
- **미지정 태그 거버넌스**: `tag_dictionary` 미지정(category='미지정') 1281여 행 정리 방식 미정(일괄 분류·삭제 기준 등) — 별도 안건.
- **신규 추천 편입 방식**: `is_recommendable` 신규 태그 기본 false. 추천 편입은 현재 SQL UPDATE(관리 토글 제거). 운영 거버넌스(편입 기준·주기·UI) 미정.
- **4-3 OG 정비 — ⏸ HOLD**: 디렉터 OG 예시(레이아웃·문구) 대기. 확정 전 착수 금지.
- **FINAL 점검**: 배포 후 회원 글쓰기 자동태깅·토픽 URL·관심 digest 실데이터 동작 육안 확인(특히 로그인 필요한 admin 화면).

---

## 3. 불변 원칙 (재명시)

- **콘텐츠 본문 보존**: 태그·메타 정정이 본문(`body`)을 바꾸지 않는다. soft-delete(`deleted_at`)만, hard-delete·스크럽 금지.
- **사람 ID 컬럼 명명(ADR 0014)**: `author_id`(콘텐츠)/`profile_id`(그 외)/`auth_user_id`(묶음). `user_id` 신규 사용 금지(pre-commit hook 차단).
- **권한은 active 명함 단위(ADR 0011/0012)** — 묶음 합산 금지.
- **파괴적 DB 변경 자동 실행 금지**: DROP TABLE/TRUNCATE/대량 DELETE·secret 로테이션은 사용자 확인 후.
- **읽기전용 진단은 진단으로만** — SELECT/grep/함수정의 조회만, 트랜잭션·쓰기 0.
- **문서 동기화(CLAUDE.md §5)**: 마이그 추가 시 DATABASE↔CHANGELOG, 라우트 변경 시 PRD↔ARCHITECTURE 동시 갱신.

---

**이 문서 변경 시**: 세션 종료마다 "최종 갱신" 일자 + §1 스냅샷(커밋 해시·마이그 번호) 갱신.
