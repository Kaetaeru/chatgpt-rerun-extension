# ChatGPT Rerun Project Protocol v1.1

이 문서는 ChatGPT Rerun 확장프로그램을 여러 GitHub 저장소에서 동일하게 사용하기 위한 표준 프로토콜이다.

## 1. 표준 디렉터리

대상 저장소마다 아래 다섯 파일을 둔다.

```text
.chatgpt-rerun/
├── README.md      # 에이전트가 매 실행마다 먼저 읽는 운영 규칙
├── PLAN.md        # 전체 목표, 작업 순서, 완료 조건
├── STATE.md       # 현재 sequence의 복구 체크포인트 + intended control handoff
├── STATUS.md      # 사용자가 GitHub에서 읽는 human-readable live dashboard
└── control.json   # 확장프로그램이 읽는 최소 실행 신호
```

템플릿은 이 저장소의 `templates/repository/.chatgpt-rerun/`에 있다.

## 2. 각 파일의 역할

### `README.md`

프로토콜 계약이다. 읽기 순서, reconciliation, 쓰기 순서, 검증 규칙, 중단 복구 규칙, 실행 시간 예산, STATUS freshness 정책을 정의한다. 작업 도중 임의로 의미를 바꾸지 않는다.

### `PLAN.md`

무엇을 완료해야 하는지를 기록한다. Task ID, 의존성, acceptance criteria, 검증 방법을 포함한다. 장기 계획의 source of truth다.

### `STATE.md`

현재 어디까지 했는지와 다음 control에 최종적으로 게시되어야 할 상태를 기록한다. 중간에 응답이 끊긴 다음 실행은 이 파일을 기준으로 재개한다. 최소한 Run ID, Sequence, Desired control status, Current task, Control reason, phase, 마지막 체크포인트, 현재 실행 시작/마감 시각, 검증 결과, 다음 정확한 행동을 유지한다.

### `STATUS.md`

사용자를 위한 presentation-only 현황판이다. 사용자가 GitHub만 열어도 다음을 바로 이해할 수 있게 한다.

- 지금 어떤 작업을 하고 있는가
- 전체 계획 중 어디까지 완료됐는가
- 최근 무엇이 검증됐는가
- 사용자가 해야 할 일이 있는가
- 다음 자동 작업은 무엇인가
- blocker/risk가 있는가

STATUS는 **절대 source of truth가 아니다.** PLAN/STATE/control과 충돌하면 PLAN/STATE/control을 우선하고 STATUS를 다시 생성한다. STATUS를 근거로 sequence/status/task를 추측하거나 preflight reconciliation하지 않는다.

### `control.json`

확장프로그램을 위한 실행 신호다. 작업 세부사항이나 긴 로그를 넣지 않는다. 자세한 상태는 `STATE.md`에 기록한다.

## 3. 매 실행의 필수 읽기 순서

ChatGPT는 자동 재실행을 포함한 모든 실행에서 아래 순서를 따른다.

1. `.chatgpt-rerun/README.md`
2. `.chatgpt-rerun/control.json`
3. `.chatgpt-rerun/STATE.md`
4. `.chatgpt-rerun/PLAN.md`
5. `.chatgpt-rerun/STATUS.md` — 표시 내용과 마지막 refresh 확인용일 뿐 reconciliation input은 아님
6. 저장소 고유 지침 (`AGENTS.md`, `CONTRIBUTING.md` 등)
7. 현재 task와 관련된 코드, 테스트, 최근 변경사항

읽은 직후 코드 작업보다 먼저 control/STATE reconciliation을 수행한다. 이미 `verified`로 기록된 작업은 근거 없이 다시 수행하지 않는다.

## 4. Human-readable STATUS freshness

STATUS의 목적은 사용자가 GitHub에서 작업 현황을 거의 실시간으로 이해할 수 있게 하는 것이다. 단, 빈 heartbeat commit을 만들지는 않는다.

### STATUS 최소 형식

최소한 다음 항목을 유지한다.

- Last updated
- Run ID
- Sequence
- Control status
- Current task
- 현재 activity를 사람이 이해할 수 있는 요약
- task/milestone progress 표
- 최근 검증된 사실
- 지금 사용자가 해야 할 것
- 다음 자동 작업
- Blockers / risks
- Freshness policy

### 갱신 시점

1. task, sequence, control status, blocker, 검증 결과, 현재 행동이 의미 있게 바뀌면 즉시 갱신한다.
2. 하나의 실행이 길게 이어지고 마지막 STATUS 갱신 후 약 5분 이상 지났다면, 다음 안전한 체크포인트에서 현재 사실로 갱신한다.
3. 약 18분 time-budget checkpoint에 들어갈 때 STATUS 내용이 달라졌다면 갱신한다.
4. 실행 종료 전 STATUS 내용이 달라졌다면 갱신한다.
5. 내용이 같다면 시각만 바꾸기 위한 빈 커밋을 만들지 않는다.
6. ChatGPT가 idle/stopped인 동안에는 실제 작업이 없으므로 주기적인 빈 heartbeat commit을 만들지 않는다.

### STATUS 안전 규칙

- GitHub token, API key, 비밀, 민감한 사용자 입력 원문을 기록하지 않는다.
- 검증되지 않은 결과를 PASS라고 요약하지 않는다.
- STATE보다 강한 완료 주장을 만들지 않는다.
- STATUS 생성 실패는 run의 실패가 아니다. source-of-truth 파일만 정상이면 자동화는 계속 복구 가능해야 한다.

## 5. `control.json` 스키마

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

## 6. 상태 의미

| status | 의미 | 확장프로그램 동작 |
|---|---|---|
| `continue` | 현재 sequence를 실행하거나 재개할 수 있음 | 재개 프롬프트 전송 |
| `complete` | 계획과 검증이 모두 완료됨 | 즉시 중지 |
| `needs_user` | 사람의 선택/승인이 필요함 | 즉시 중지 |
| `blocked` | 자동으로 안전하게 해결할 수 없는 장애 | 즉시 중지 |

`working` 상태는 사용하지 않는다. 작업 시작 시 `control.json`을 `working`으로 바꾸면 응답이 중간에 끊겼을 때 재실행할 수 없기 때문이다.

## 7. sequence 규칙

- 같은 작업을 수행 중인 동안 `sequence`를 바꾸지 않는다.
- 새 task 또는 최종 상태로 전환할 때만 `sequence`를 증가시킨다.
- 정상적인 흐름에서는 1씩 증가시킨다.
- `sequence`를 감소시키지 않는다. 확장프로그램은 감소를 감지하면 안전을 위해 중지한다.
- 새 자동화 흐름을 의도적으로 시작할 때만 새로운 `run_id`를 만든다.
- 20분 실행 제한으로 체크포인트 후 종료할 때 task가 아직 verified가 아니면 sequence를 증가시키지 않는다.

## 8. Hard execution time budget

### 정의

**한 번의 ChatGPT 실행(turn)은 시작부터 종료까지 반드시 20분을 넘기지 않는다.**

이 제한은 sequence 전체에 적용되는 것이 아니다. 하나의 sequence가 20분 안에 끝나지 않으면 같은 sequence를 여러 실행으로 나눠 이어간다.

### 실행 시작

각 실행 시작 시:

1. 현재 실행 시작 시각을 기록한다.
2. 시작 시각 + 20분을 hard stop deadline으로 계산한다.
3. `STATE.md`의 `Current execution started (UTC)`와 `Current execution hard stop (UTC)`를 이번 실행 기준으로 갱신한다.
4. 이전 실행이 `time_budget_checkpoint`에서 끝났다면 `Next Exact Action`부터 재개한다.
5. STATUS가 없거나 현재 사실과 명백히 다르면 첫 안전한 체크포인트에서 갱신한다.

### 18분 checkpoint threshold

실행 경과 시간이 약 18분에 도달하면:

1. 새 장기 구현, 대규모 탐색, 오래 걸릴 수 있는 검증을 시작하지 않는다.
2. 현재 명령/도구 호출이 끝나는 즉시 체크포인트 기록을 우선한다.
3. `STATE.md`에 완료한 일, 실제 검증 결과, 미완료 항목, 변경 파일, `Next Exact Action`을 구체적으로 기록한다.
4. 현재 task가 아직 검증 완료가 아니면 Phase를 `time_budget_checkpoint`로 기록할 수 있다.
5. STATUS 내용이 달라졌다면 사람용 현황판을 갱신한다.

### 20분 hard stop

**20분 deadline 전에 반드시 이번 응답을 종료한다.**

현재 task가 미완료라면:

- PLAN task를 `verified`로 올리지 않는다.
- `control.json`을 다음 sequence로 넘기지 않는다.
- 현재 `continue` + 같은 sequence를 유지한다.
- STATE 체크포인트를 갱신한다.
- STATUS 내용이 달라졌다면 사람용 현황판을 갱신한다.
- 확장프로그램의 same-sequence retry가 다음 실행을 만든다.

현재 task와 검증이 20분 전에 완료됐다면 정상적인 PLAN → STATE → control 전환을 수행한다. 그 뒤 STATUS를 최신 상태로 표시할 수 있다.

### 긴 명령/도구 호출

- deadline을 넘길 가능성이 있는 작업은 deadline 직전에 시작하지 않는다.
- 예상 시간이 불명확하면 더 작은 명령, 파일 단위, 테스트 범위로 분할한다.
- 단일 외부 작업이 장시간 블록될 위험이 있으면 더 짧은 대안을 우선한다.

시간 예산에 따른 체크포인트 종료는 실패가 아니다. 이것이 이 프로토콜의 정상적인 resumability 경로다.

## 9. Preflight reconciliation

`control.json`과 `STATE.md`는 정상 상태에서는 동일한 run/sequence/status/task를 가리킨다. 하지만 write order가 `PLAN → STATE → control`이므로, STATE 저장 뒤 control 쓰기 전에 프로세스가 끊기면 STATE가 control보다 정확히 1 sequence 앞설 수 있다.

**STATUS는 preflight reconciliation에 사용하지 않는다.** stale하거나 누락돼도 source-of-truth 파일만으로 판단한다.

### Normal

다음이 모두 일치하면 현재 sequence를 정상 실행/재개한다.

- Run ID
- Sequence
- STATE의 Desired control status == control.status
- STATE의 Current task == control.task_id (terminal 상태에서 task가 비어 있는 경우는 문서화된 값 기준)

### Recoverable pending handoff

다음이 모두 참이면 자동 복구 가능한 미완료 handoff다.

- Run ID가 동일함
- `STATE.Sequence == control.sequence + 1`
- PLAN/STATE가 이전 task의 검증 완료를 명시함
- STATE에 새 Desired control status / Current task / Control reason이 명확함

이 경우:

1. 이전 task를 다시 구현하거나 검증하지 않는다.
2. STATE에 적힌 intended control 상태를 `control.json`에 게시한다.
3. `updated_at`만 현재 ISO-8601 시각으로 쓴다.
4. 이번 실행에서는 새 task를 시작하지 않는다.
5. control 게시 후 STATUS를 새 표시 상태로 갱신할 수 있다.
6. 실행을 종료하고 확장프로그램이 새 sequence를 보고 다음 실행을 시작하게 한다.

### Unsafe mismatch

다음은 자동으로 정상 작업을 계속하지 않는다.

- run_id 불일치
- control sequence가 STATE보다 앞섬
- STATE가 control보다 2 이상 앞섬
- 같은 sequence인데 status/task가 모순됨

이 경우 불일치 내용을 STATE에 기록하고, 안전하게 기록 가능한 범위에서 `max(control.sequence, STATE.Sequence) + 1`을 사용해 STATE의 Desired control status를 `needs_user`로 만든 뒤 control을 마지막 authoritative write로 일치시켜 자동화를 멈춘다. 이후 STATUS를 사용자에게 이해 가능한 경고 상태로 갱신할 수 있다. 불명확하면 코드 작업을 추측으로 계속하지 않는다.

## 10. 작업 트랜잭션

하나의 실행은 다음 순서로 처리한다.

1. 필수 문서를 읽고 preflight reconciliation을 완료한다.
2. 현재 task와 체크포인트를 확정한다.
3. 실행 시작 시각과 20분 hard stop을 STATE에 기록한다.
4. 필요한 구현을 수행한다.
5. 긴 작업이면 의미 있는 체크포인트마다 `STATE.md`를 갱신한다. 이때 현재 sequence는 유지한다.
6. STATUS의 마지막 refresh 후 약 5분이 지났고 표시할 사실이 달라졌다면 다음 안전한 체크포인트에서 STATUS를 갱신한다.
7. PLAN에 정의된 검증을 실제로 실행하고 결과를 확인한다.
8. 검증이 통과하면 `PLAN.md`의 task 상태를 갱신한다.
9. 다음 task/terminal 상태로 전환한다면 `STATE.md`의 Sequence를 +1 하고 Desired control status / Current task / Control reason / checkpoint를 다음 상태로 갱신한다.
10. **마지막 authoritative write로** `control.json`을 STATE와 일치시키고 `updated_at`을 현재 시각으로 쓴다.
11. control 게시 후 STATUS가 달라졌다면 presentation-only STATUS를 새 상태로 갱신한다.
12. 18분 threshold와 20분 hard stop을 항상 지킨다.

`control.json`이 마지막 **authoritative** write인 것이 중요하다. STATUS는 extension이 읽지 않는 표시용 파일이라 control 뒤에 갱신해도 race를 만들지 않는다. STATUS 갱신 실패 때문에 control을 되돌리거나 source-of-truth 상태를 변경하지 않는다.

## 11. 중단 복구

### 작업 도중 중단

`continue` sequence를 확장프로그램이 전송한 후 ChatGPT가 구현/검증 도중 종료되거나 20분 시간 예산으로 체크포인트 종료되면:

- `control.json`은 같은 `run_id` + `sequence` + `continue`로 남아 있다.
- STATE는 현재 sequence의 마지막 체크포인트를 유지한다.
- STATUS는 마지막으로 성공한 사람용 표시일 수 있으며 source of truth가 아니다.
- 확장프로그램은 설정한 Retry after 시간이 지나고 ChatGPT 탭이 유휴 상태이면 같은 sequence를 다시 전송한다.
- 재실행된 ChatGPT는 STATE의 `Next Exact Action`부터 재개한다.
- 이미 검증된 작업을 처음부터 다시 하지 않는다.
- 새 실행은 다시 독립적인 20분 시간 예산을 갖는다.
- 재개 후 STATUS가 stale하면 다음 안전한 체크포인트에서 현재 사실로 갱신한다.

### STATE 저장 후 control 게시 전 중단

PLAN과 STATE는 새 sequence로 전환됐지만 control만 이전 sequence라면 preflight의 Recoverable pending handoff 규칙을 적용한다. 이전 task를 반복하지 않고 control handoff만 마무리한다. STATUS가 어느 쪽을 표시하고 있는지는 복구 판단에 사용하지 않는다.

같은 sequence 재시도 횟수가 한도를 넘으면 확장프로그램은 ChatGPT가 유휴 상태가 된 뒤 `retry_limit`으로 중지한다.

## 12. 성공/중지 전환

### 다음 task가 있는 경우

1. 현재 task 검증 PASS
2. PLAN에서 현재 task를 `verified`로 변경
3. STATE Sequence를 +1
4. STATE Desired control status = `continue`
5. STATE Current task = 다음 task
6. STATE Control reason / checkpoint / Next Exact Action 갱신
7. 마지막 authoritative write로 control을 STATE와 일치시키고 `updated_at` 갱신
8. STATUS를 새 task/진척도로 갱신

### 전체 작업이 완료된 경우

PLAN을 완료 상태로 만든 뒤 STATE Sequence를 +1 하고 Desired control status를 `complete`로 기록한다. Current task와 reason도 완료 상태에 맞게 정리한 뒤 control을 마지막 authoritative write로 일치시킨다. 이후 STATUS를 완료 상태와 최종 검증 요약으로 갱신한다.

### 사용자 결정이 필요한 경우

STATE에 질문/선택지를 기록하고 Sequence를 +1, Desired control status를 `needs_user`로 만든 뒤 control을 마지막 authoritative write로 일치시킨다. 이후 STATUS의 `지금 사용자가 해야 할 것`을 모호하지 않게 갱신한다.

### 자동 해결이 불가능한 경우

STATE에 실패 원인, 시도한 내용, 남은 blocker를 기록하고 Sequence를 +1, Desired control status를 `blocked`로 만든 뒤 control을 마지막 authoritative write로 일치시킨다. 이후 STATUS에 blocker와 해결에 필요한 조건을 사용자 관점에서 요약한다.

## 13. 검증 규칙

- “구현 완료”와 “검증 완료”를 구분한다.
- 가능한 경우 테스트, lint, build, typecheck 등 실제 명령의 결과를 기록한다.
- 실행하지 않은 검증을 PASS라고 기록하지 않는다.
- 실패한 검증은 STATE에 명령과 핵심 오류를 남긴다.
- 완료 조건이 충족되지 않았다면 `complete`를 게시하지 않는다.
- 20분 제한이 임박했다면 검증을 생략하고 PASS라고 쓰는 대신, 검증 미실행 상태를 STATE에 남기고 같은 sequence에서 다음 실행으로 넘긴다.
- STATUS는 실제 검증 결과를 사람이 이해하기 쉽게 요약할 수 있지만 STATE보다 강한 주장을 만들 수 없다.

## 14. 초기화 절차

1. `templates/repository/.chatgpt-rerun/`을 대상 저장소 루트에 복사한다.
2. `PLAN.md`의 목표와 task를 작성한다.
3. `STATE.md`의 Run ID, Sequence, Desired control status, Current task, Control reason, checkpoint를 첫 task 기준으로 작성한다.
4. `STATUS.md`를 첫 task와 현재 `needs_user` 초기 상태가 보이도록 작성한다.
5. 초기화가 끝날 때 STATE의 Desired control status를 `continue`로 바꾼다.
6. `control.json`에 같은 run_id / sequence / status / task_id / reason과 현재 `updated_at`을 넣는다.
7. PLAN/STATE를 먼저 저장/커밋한 뒤 control을 마지막 authoritative write로 게시한다.
8. STATUS를 새 `continue` 상태로 갱신한다.
9. 확장프로그램에서 Owner/Repository/Branch를 설정하고 Start를 누른다.

초기 템플릿의 `control.json`과 STATE는 실수로 자동 실행되지 않도록 `needs_user` 상태다. 초기화가 끝난 뒤에만 둘을 `continue`로 맞춘다.

## 15. 기본 재개 프롬프트

확장프로그램 기본 프롬프트는 다음 의미를 가진다.

> 진행. 연결된 GitHub 저장소의 `.chatgpt-rerun` 문서를 규정된 순서로 다시 읽고, control/STATE를 먼저 reconcile한 뒤 현재 sequence의 미완료 지점부터 재개한다. 검증된 작업은 반복하지 않고 프로토콜에 따라 상태를 갱신한다. 사람이 GitHub에서 현황을 이해할 수 있도록 STATUS.md도 freshness 규칙에 따라 유지한다. 이번 실행은 20분 hard stop을 넘기지 않는다.

프롬프트는 짧아도 된다. 실제 상태와 규칙은 GitHub가 보존한다.
