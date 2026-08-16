# chatgpt-rerun-extension

GitHub에 보존된 작업 상태를 기준으로, 중단된 ChatGPT 장기 작업을 제한적으로 자동 재실행하는 Manifest V3 Chrome 확장프로그램이다.

핵심 원칙은 **ChatGPT 답변을 파싱하지 않고 GitHub를 source of truth로 사용**하는 것이다.

## 동작 개요

```text
ChatGPT 작업
   │
   ├─ PLAN.md / STATE.md 갱신
   └─ control.json을 마지막에 게시
            │
            ▼
Chrome Extension
            │
   continue ─┼─ 새 sequence → "진행" 전송
            │  같은 sequence가 오래 유지됨 → 제한적 재시도
   complete ─┼─ 중지
 needs_user ─┼─ 중지
    blocked ─┴─ 중지
```

응답이 구현/검증 도중 끊기면 control의 같은 sequence가 남는다. 설정한 retry 시간이 지나고 ChatGPT 탭이 유휴 상태면 확장프로그램이 같은 sequence를 다시 실행한다. ChatGPT는 GitHub의 `STATE.md` 체크포인트에서 재개한다.

## 대상 저장소 표준

자동화할 모든 프로젝트에는 다음 디렉터리를 둔다.

```text
.chatgpt-rerun/
├── README.md
├── PLAN.md
├── STATE.md
└── control.json
```

완성된 템플릿은 [`templates/repository/.chatgpt-rerun/`](templates/repository/.chatgpt-rerun/)에 있다. 상세 규칙은 [`docs/PROJECT_PROTOCOL.md`](docs/PROJECT_PROTOCOL.md)를 따른다.

### 파일 역할

- `README.md`: ChatGPT가 매 실행 가장 먼저 읽는 고정 운영 계약.
- `PLAN.md`: 전체 작업 계획, 의존성, acceptance criteria.
- `STATE.md`: 중단 복구용 현재 체크포인트와 실제 검증 결과.
- `control.json`: 확장프로그램이 읽는 최소 실행 신호.

`control.json`은 진행 로그가 아니다. 자세한 정보는 STATE/PLAN에 둔다.

## Control 상태

v1은 네 상태만 허용한다.

- `continue`: 현재 sequence를 실행/재개한다.
- `complete`: 전체 계획과 검증이 완료되어 중지한다.
- `needs_user`: 사람의 결정이 필요하여 중지한다.
- `blocked`: 자동으로 안전하게 해결할 수 없어 중지한다.

`working`은 사용하지 않는다. 작업 시작 시 control을 `working`으로 바꾸면 작업 도중 응답이 끊겼을 때 재실행 신호가 사라지기 때문이다.

예시:

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

정식 스키마는 [`schemas/control.schema.json`](schemas/control.schema.json)에 있다.

## 중요한 쓰기 순서

ChatGPT는 작업/검증을 마친 뒤 반드시 다음 순서로 GitHub를 갱신한다.

1. `PLAN.md`
2. `STATE.md`
3. **`control.json` 마지막**

control을 먼저 갱신하면 확장프로그램이 새 실행을 시작했는데 STATE/PLAN은 아직 이전 상태인 race가 생길 수 있다.

## Same-sequence recovery

확장프로그램이 sequence 12를 한 번 전송한 뒤 ChatGPT가 중간에 종료되면:

1. GitHub에는 여전히 sequence 12 + `continue`가 남는다.
2. ChatGPT가 유휴 상태이고 Retry after 시간이 지나면 sequence 12를 다시 전송한다.
3. ChatGPT는 `.chatgpt-rerun/README.md → control.json → STATE.md → PLAN.md` 순서로 읽는다.
4. STATE의 `Next Exact Action`부터 재개한다.
5. 설정한 retries/sequence를 모두 사용하면 `retry_limit`으로 중지한다.

이 기능 때문에 단순한 “다음 작업 자동 실행”뿐 아니라 **응답이 랜덤하게 끝난 경우의 복구**도 가능하다.

## 설치

1. 이 저장소를 clone 또는 download한다.
2. Chrome에서 `chrome://extensions`를 연다.
3. **Developer mode**를 켠다.
4. **Load unpacked**에서 이 저장소 디렉터리를 선택한다.
5. 자동화할 프로젝트에 `templates/repository/.chatgpt-rerun/`을 복사하고 초기화한다.
6. ChatGPT에서 해당 GitHub 저장소를 사용할 수 있는 상태로 둔다.
7. 자동화할 ChatGPT 대화를 연다.
8. 확장프로그램 popup에서 Owner, Repository, Branch를 설정한다.
9. **Start on this tab**을 누른다.

Start를 누른 ChatGPT 탭 하나에만 세션을 묶어 여러 탭에서 같은 sequence가 중복 전송되는 것을 막는다.

## 기본 재개 프롬프트

기본값은 ChatGPT에게 다음을 지시한다.

```text
진행. 먼저 이 대화에서 연결된 GitHub 저장소의 .chatgpt-rerun/README.md,
control.json, STATE.md, PLAN.md를 안내된 순서대로 읽고 저장소 상태를 확인한 뒤,
현재 sequence의 미완료 지점부터 재개해. 검증된 작업은 반복하지 말고
프로토콜에 따라 GitHub 상태를 갱신해.
```

실제 계획과 복구 정보는 GitHub에 있으므로 프롬프트에 매번 긴 작업 설명을 넣을 필요가 없다.

## GitHub 접근

공개 저장소는 token 없이 읽을 수 있다. token이 없으면 GitHub API rate limit을 고려해 polling을 최소 60초로 제한한다.

빠른 polling 또는 private repository가 필요하면 대상 저장소 contents를 읽을 수 있는 GitHub token을 설정한다. token은 현재 Chrome profile의 `chrome.storage.local`에 저장된다. 가능한 최소 권한만 사용한다.

## 안전 장치

확장프로그램은 다음 경우 추측하지 않고 중지한다.

- GitHub가 `complete`, `needs_user`, `blocked`를 게시함.
- sequence가 과거 값으로 감소함.
- 같은 sequence 재시도 횟수 한도에 도달함.
- 전체 continuation 전송 횟수 한도에 도달함.
- ChatGPT 입력창에 사용자 작성 내용이 이미 있음.
- 재개 프롬프트를 안정적으로 전송하지 못함.

ChatGPT 또는 GitHub의 rate/service limit을 우회하도록 재시도하지 않는다.

## 개발

최근 Node.js가 필요하다.

```bash
npm run check
npm test
```

현재 테스트는 control schema/parser, polling/retry clamp, sequence 재시도/회귀 처리 등 프로토콜 핵심 불변식을 검증한다.
