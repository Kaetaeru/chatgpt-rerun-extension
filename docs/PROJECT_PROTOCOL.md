# ChatGPT Rerun Project Protocol v1

이 문서는 ChatGPT Rerun 확장프로그램을 여러 GitHub 저장소에서 동일하게 사용하기 위한 표준 프로토콜이다.

## 1. 표준 디렉터리

대상 저장소마다 아래 네 파일을 둔다.

```text
.chatgpt-rerun/
├── README.md      # 에이전트가 매 실행마다 먼저 읽는 운영 규칙
├── PLAN.md        # 전체 목표, 작업 순서, 완료 조건
├── STATE.md       # 현재 sequence의 복구 체크포인트
└── control.json   # 확장프로그램이 읽는 최소 실행 신호
```

템플릿은 이 저장소의 `templates/repository/.chatgpt-rerun/`에 있다.

## 2. 각 파일의 역할

### `README.md`

프로토콜 계약이다. 읽기 순서, 쓰기 순서, 검증 규칙, 중단 복구 규칙을 정의한다. 작업 도중 임의로 의미를 바꾸지 않는다.

### `PLAN.md`

무엇을 완료해야 하는지를 기록한다. Task ID, 의존성, acceptance criteria, 검증 방법을 포함한다. 장기 계획의 source of truth다.

### `STATE.md`

현재 어디까지 했는지를 기록한다. 중간에 응답이 끊긴 다음 실행은 이 파일을 기준으로 재개한다. 구현 상태, 마지막 체크포인트, 검증 결과, 다음 정확한 행동을 기록한다.

### `control.json`

확장프로그램을 위한 실행 신호다. 작업 세부사항이나 긴 로그를 넣지 않는다. 자세한 상태는 `STATE.md`에 기록한다.

## 3. 매 실행의 필수 읽기 순서

ChatGPT는 자동 재실행을 포함한 모든 실행에서 아래 순서를 따른다.

1. `.chatgpt-rerun/README.md`
2. `.chatgpt-rerun/control.json`
3. `.chatgpt-rerun/STATE.md`
4. `.chatgpt-rerun/PLAN.md`
5. 저장소 고유 지침 (`AGENTS.md`, `CONTRIBUTING.md` 등)
6. 현재 task와 관련된 코드, 테스트, 최근 변경사항

이미 `verified`로 기록된 작업은 근거 없이 다시 수행하지 않는다.

## 4. `control.json` 스키마

```json
{
  "version": 1,
  "run_id": "project-alpha-20260816-01",
  "sequence": 12,
  "status": "continue",
  "reason": "TASK-011 verified; TASK-012 is ready.",
  "updated_at": "2026-08-16T12:30:00Z",
  "task_id": "TASK-012"
}
```

필수 필드:

- `version`: 현재 `1`만 허용한다.
- `run_id`: 하나의 자동 실행 흐름 동안 변하지 않는 식별자다.
- `sequence`: 0 이상의 정수이며 새로운 의사결정/작업으로 넘어갈 때 증가한다.
- `status`: `continue`, `complete`, `needs_user`, `blocked` 중 하나다.
- `updated_at`: 해당 control 상태를 게시한 ISO-8601 시각이다.

선택 필드:

- `reason`: 왜 이 상태가 되었는지 짧게 설명한다.
- `task_id`: 현재 실행해야 할 PLAN task ID다.

정식 JSON Schema는 `schemas/control.schema.json`에 있다.

## 5. 상태 의미

| status | 의미 | 확장프로그램 동작 |
|---|---|---|
| `continue` | 현재 sequence를 실행하거나 재개할 수 있음 | 재개 프롬프트 전송 |
| `complete` | 계획과 검증이 모두 완료됨 | 즉시 중지 |
| `needs_user` | 사람의 선택/승인이 필요함 | 즉시 중지 |
| `blocked` | 자동으로 안전하게 해결할 수 없는 장애 | 즉시 중지 |

`working` 상태는 사용하지 않는다. 작업 시작 시 `control.json`을 `working`으로 바꾸면 응답이 중간에 끊겼을 때 확장프로그램이 재실행할 수 없기 때문이다.

## 6. sequence 규칙

- 같은 작업을 수행 중인 동안 `sequence`를 바꾸지 않는다.
- 새 task 또는 최종 상태로 전환할 때만 `sequence`를 증가시킨다.
- 정상적인 흐름에서는 1씩 증가시키는 것을 권장한다.
- `sequence`를 감소시키지 않는다. 확장프로그램은 감소를 감지하면 안전을 위해 중지한다.
- 새 자동화 흐름을 의도적으로 시작할 때만 새로운 `run_id`를 만든다.

## 7. 작업 트랜잭션

하나의 sequence는 다음 순서로 처리한다.

1. 필수 문서를 읽고 현재 task와 체크포인트를 확정한다.
2. 필요한 구현을 수행한다.
3. 긴 작업이면 의미 있는 체크포인트마다 `STATE.md`를 갱신한다.
4. PLAN에 정의된 검증을 실제로 실행하고 결과를 확인한다.
5. 검증이 통과하면 `PLAN.md`의 task 상태를 갱신한다.
6. `STATE.md`를 다음 실행이 바로 이어받을 수 있는 상태로 갱신한다.
7. **마지막으로** `control.json`을 갱신한다.

`control.json`을 마지막에 쓰는 것이 중요하다. 먼저 `continue`를 게시하면 확장프로그램이 다음 실행을 시작했는데 PLAN/STATE가 아직 이전 상태인 race가 생길 수 있다.

## 8. 중단 복구

`continue` sequence를 확장프로그램이 전송한 후 ChatGPT가 작업 도중 종료되었다고 가정한다.

- `control.json`은 같은 `run_id` + `sequence` + `continue`로 남아 있다.
- 확장프로그램은 설정한 Retry after 시간이 지나고 ChatGPT 탭이 유휴 상태이면 같은 sequence를 다시 전송한다.
- 재실행된 ChatGPT는 `STATE.md`를 읽고 마지막 체크포인트부터 재개한다.
- 이미 검증된 작업을 처음부터 다시 하지 않는다.
- 같은 sequence 재시도 횟수가 한도를 넘으면 확장프로그램이 `retry_limit`으로 중지한다.

따라서 `STATE.md`는 “다음 실행이 이전 대화를 전혀 추론하지 않아도 이어갈 수 있는 수준”으로 유지해야 한다.

## 9. 성공/중지 전환

### 다음 task가 있는 경우

1. 현재 task 검증 PASS
2. PLAN에서 현재 task를 `verified`로 변경
3. STATE에 완료 결과와 다음 task를 기록
4. control의 `sequence`를 +1
5. `status: "continue"`, 다음 `task_id` 기록
6. `updated_at` 갱신

### 전체 작업이 완료된 경우

PLAN/STATE를 먼저 완료 상태로 만든 뒤 control을 +1 하여 `status: "complete"`로 게시한다.

### 사용자 결정이 필요한 경우

STATE에 선택해야 할 내용과 가능한 선택지를 기록한 뒤 control을 +1 하여 `status: "needs_user"`로 게시한다.

### 자동 해결이 불가능한 경우

STATE에 실패 원인, 시도한 내용, 남은 blocker를 기록한 뒤 control을 +1 하여 `status: "blocked"`로 게시한다.

## 10. 검증 규칙

- “구현 완료”와 “검증 완료”를 구분한다.
- 가능한 경우 테스트, lint, build, typecheck 등 실제 명령의 결과를 기록한다.
- 실행하지 않은 검증을 PASS라고 기록하지 않는다.
- 실패한 검증은 STATE에 명령과 핵심 오류를 남긴다.
- 완료 조건이 충족되지 않았다면 `complete`를 게시하지 않는다.

## 11. 초기화 절차

1. `templates/repository/.chatgpt-rerun/`을 대상 저장소 루트에 복사한다.
2. `PLAN.md`의 목표와 task를 작성한다.
3. `STATE.md`를 첫 task 기준으로 작성한다.
4. `control.json`에 고유 `run_id`, 첫 `sequence`, `task_id`, 현재 `updated_at`을 넣는다.
5. PLAN/STATE를 먼저 커밋한 뒤 control을 `continue`로 게시한다.
6. 확장프로그램에서 Owner/Repository/Branch를 설정하고 Start를 누른다.

초기 템플릿의 `control.json`은 실수로 자동 실행되지 않도록 `needs_user` 상태다. 초기화가 끝난 뒤에만 `continue`로 바꾼다.

## 12. 기본 재개 프롬프트

확장프로그램 기본 프롬프트는 다음 의미를 가진다.

> 진행. 연결된 GitHub 저장소의 `.chatgpt-rerun` 문서를 규정된 순서로 다시 읽고 저장소 상태를 확인한 뒤 현재 sequence의 미완료 지점부터 재개한다. 검증된 작업은 반복하지 않고 프로토콜에 따라 상태를 갱신한다.

프롬프트는 짧아도 된다. 실제 상태와 규칙은 GitHub가 보존한다.
