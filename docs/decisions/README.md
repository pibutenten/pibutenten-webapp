# Architecture Decision Records (ADR)

큰 의사결정 1건 = 파일 1개. 각 결정의 **Context (배경) / Decision (결정) / Consequences (결과) / Status (상태)** 4 섹션 표준.

## 형식

```markdown
# NNNN. 결정 제목

- **Status**: Accepted / Superseded by NNNN / Deprecated
- **Date**: YYYY-MM-DD
- **Related**: 마이그레이션 / 커밋 / 다른 ADR 참조

## Context
무엇이 문제였는지, 어떤 옵션을 검토했는지.

## Decision
어떤 결정을 내렸는지.

## Consequences
긍정·부정 결과. 부작용·미래 부담.
```

## 목록

| 번호 | 제목 | 상태 |
|---|---|---|
| 0001 | Multi-profile identity (Phase 9) | Accepted |
| 0002 | Soft-delete in-place 익명화 | Accepted |
| 0003 | Email 기반 dedup | Accepted (Supersedes 0098 legal_name) |
| 0004 | cards 테이블 리네임 (구 qas) | Accepted |
| 0005 | Active identity 쿠키 httpOnly 분리 | Accepted |
| 0006 | RLS 정책 전략 | Accepted |
| 0007 | 콘텐츠 자동 검수기 v1 | Accepted |
| 0008 | 흥미 점수 임계점 (v3=15) | Accepted (Supersedes v1=10, v2=6) |
| 0009 | PWA 아이콘 2그룹 구조 | Accepted |
| 0010 | Visitor 1일 1방문 KST dedup | Accepted |

## 새 ADR 작성

1. 마지막 번호 + 1
2. 파일명: `NNNN-kebab-case-title.md`
3. 위 형식 따라 작성
4. 이 README 의 목록 표에 추가
5. `ARCHITECTURE.md` 의 "관련 ADR" 섹션에도 항목 추가
