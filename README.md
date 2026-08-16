# chatgpt-rerun-extension

GitHub에 보존된 작업 상태를 기준으로 중단된 ChatGPT 장기 작업을 제한적으로 자동 재실행하는 Manifest V3 Chrome 확장프로그램이다.

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
   continue ─┼─ 새 sequence → 재개 프롬프트 전송
            │  같은 sequence가 오래 유지됨 → 제한적 재시도
   complete ─┼─ 중지
 needs_user ─┼─ 중지
    blocked ─┴─ 중지
```

응답이 구현/검증 도중 끊기거나 20분 실행 시간 예산 때문에 체크포인트 종료되면 같은 `continue` sequence가 남는다. retry 시간이 지난 뒤 ChatGPT 탭이 유휴 상태면 같은 sequence를 다시 실행하고, ChatGPT는 `STATE.md` 체크포인트에서 재개한다.

## 20-minute execution policy

**한 번의 ChatGPT 실행은 반드시 20분을 넘기지 않는다.** 이 제한은 전체 sequence가 아니라 개별 실행(turn) 기준이다.

- 실행 시작 시 20분 hard stop을 계산한다.
- 약 18분부터는 새 장기 작업을 시작하지 않고 STATE 체크포인트 정리를 우선한다.
- 20분 전에 반드시 응답을 종료한다.
- task가 아직 검증 완료가 아니라면 `continue` + 같은 sequence를 유지한다.
- `STATE.md`에 완료 내용, 검증 결과, 미완료 항목, `Next Exact Action`을 남긴다.
- 다음 same-sequence retry는 새로운 20분 예산으로 이어서 수행한다.
- 시간 제한 때문에 검증을 생략하고 task를 `verified`/`complete`로 처리하지 않는다.

상세 규칙은 `.chatgpt-rerun/README.md`와 `docs/PROJECT_PROTOCOL.md`에 있다.

## Per-tab persistent Side Panel

설정 UI는 작은 toolbar popup이 아니라 Chrome **Side Panel**에서 열린다. v0.2부터 설정과 runtime은 Chrome tab ID별로 분리되어 각 ChatGPT 탭이 독립적인 Rerun 세션을 가질 수 있다.

- 확장 아이콘을 클릭하면 현재 ChatGPT 탭 전용 Side Panel이 열린다.
- ChatGPT 페이지를 클릭하거나 복사/붙여넣기를 해도 Side Panel은 유지된다.
- Owner, Repository, Branch, token 등 입력값은 입력 즉시 해당 tab의 draft로 `chrome.storage.local`에 저장된다.
- Side Panel을 닫았다 다시 열어도 해당 tab의 입력 중이던 값이 복원된다.
- 서로 다른 GitHub stream은 여러 ChatGPT 탭에서 독립적으로 실행할 수 있다.
- 동일 owner/repo/branch/control path를 두 탭에서 동시에 실행하려 하면 두 번째 Start를 거부한다.

## One Start/Stop control

v0.2.1부터 Start와 Stop은 별도 버튼이 아니라 **하나의 session control**이다.

```text
Stopped  → [ Start ]
               │ click
               ▼
Running  → [ Stop  ]
               │ click
               ▼
Stopped  → [ Start ]
```

표시 상태와 실제 동작은 현재 탭의 `runtime.enabled`를 기준으로 한다.

- Stopped이면 버튼은 `Start`다.
- `Start`를 누르면 현재 탭만 활성화하고 같은 버튼이 `Stop`으로 바뀐다.
- Running이면 버튼은 `Stop`이다.
- `Stop`을 누르면 현재 탭만 `manual` stop 상태로 바꾸고 같은 버튼이 다시 `Start`로 바뀐다.
- 다른 ChatGPT 탭의 Start/Stop 상태에는 영향을 주지 않는다.

## Start bootstrap

Start는 ChatGPT 탭이 확장프로그램보다 먼저 열려 있었어도 동작하도록 설계되어 있다.

1. 현재 ChatGPT 탭에 content script가 있는지 확인한다.
2. content script가 없으면 `chrome.scripting.executeScript()`로 `content.js`를 주입한다.
3. 해당 tab ID의 runtime을 활성화한다.
4. `RERUN_WAKE`를 보내 첫 GitHub poll을 즉시 시작한다.

따라서 unpacked extension을 Reload한 뒤 기존 ChatGPT 탭을 반드시 새로고침할 필요는 없다.

## Continue in new chat

현재 대화가 너무 길어졌거나 새 컨텍스트에서 이어가고 싶으면 Side Panel의 **Continue in new chat**을 사용한다.

- 새 ChatGPT 탭을 연다.
- 기존 탭은 handoff 중 polling을 멈춘다.
- 같은 GitHub config/runtime ownership을 새 tab ID로 이관한다.
- 새 채팅에는 owner/repo, branch, control path, run_id, sequence가 포함된 handoff prompt를 자동 전송한다.
- 새 채팅은 이전 대화 본문을 복사하지 않고 `.chatgpt-rerun` 문서와 `STATE.md`에서 재개한다.
- 채팅이 바뀌었다는 이유만으로 GitHub sequence를 증가시키지 않는다.

확장프로그램은 ChatGPT의 GitHub 앱 승인/OAuth/관리자 승인 UI를 자동 클릭하지 않는다. 반복되는 이미 연결된 앱의 사용 승인은 ChatGPT 앱 권한 설정으로 관리하고, 실제 GitHub OAuth/저장소 접근 범위는 GitHub/워크스페이스 정책을 따른다.

## 대상 저장소 표준

자동화할 프로젝트에는 다음 디렉터리를 둔다.

```text
.chatgpt-rerun/
├── README.md
├── PLAN.md
├── STATE.md
└── control.json
```

템플릿은 `templates/repository/.chatgpt-rerun/`에 있고 상세 규칙은 `docs/PROJECT_PROTOCOL.md`를 따른다.

- `README.md`: 매 실행 가장 먼저 읽는 운영 계약.
- `PLAN.md`: 전체 계획, 의존성, acceptance criteria.
- `STATE.md`: 중단 복구 체크포인트, 실행 시간 예산, 실제 검증 결과.
- `control.json`: 확장프로그램이 읽는 최소 실행 신호.

## Control 상태

v1은 네 상태만 허용한다.

- `continue`: 현재 sequence를 실행/재개.
- `complete`: 전체 계획과 검증 완료, 중지.
- `needs_user`: 사람의 결정 필요, 중지.
- `blocked`: 자동 해결 불가능, 중지.

`working` 상태는 사용하지 않는다. 작업 중에는 현재 `continue` sequence를 유지해야 중간 종료 또는 시간 예산 종료 후 같은 sequence를 재실행할 수 있다.

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

정식 스키마는 `schemas/control.schema.json`에 있다.

## 중요한 쓰기 순서

상태 전환은 반드시 다음 순서다.

1. `PLAN.md`
2. `STATE.md`
3. **`control.json` 마지막**

STATE가 control보다 정확히 1 sequence 앞선 채 중단된 경우 다음 실행은 이전 task를 반복하지 않고 누락된 control handoff만 게시한다. 자세한 reconciliation 규칙은 `docs/PROJECT_PROTOCOL.md`에 있다.

## 설치

1. 이 저장소의 최신 브랜치를 clone 또는 update한다.
2. Chrome에서 `chrome://extensions`를 연다.
3. **Developer mode**를 켠다.
4. 처음이면 **Load unpacked**, 이미 로드했다면 **Reload**를 누른다.
5. 확장 아이콘을 클릭해 현재 ChatGPT 탭의 Rerun Side Panel을 연다.
6. 자동화할 프로젝트에 `.chatgpt-rerun/` 문서를 준비한다.
7. Side Panel에 Owner, Repository, Branch, Control file을 입력한다.
8. 중지 상태의 단일 session control에서 **Start**를 누른다.
9. 실행 중에는 같은 control이 **Stop**으로 표시되며, 누르면 해당 탭 Rerun만 중지한다.

## GitHub 접근

공개 저장소는 token 없이 읽을 수 있다. token이 없으면 polling을 최소 60초로 제한한다.

빠른 polling 또는 private repository가 필요하면 대상 저장소 contents read 권한으로 제한된 GitHub token을 사용한다. token과 설정 draft는 현재 Chrome profile의 `chrome.storage.local`에 저장되므로 공유 PC에서는 사용하지 않는다.

## 안전 장치

확장프로그램/프로토콜은 다음 경우 추측하지 않고 중지 또는 체크포인트한다.

- `complete`, `needs_user`, `blocked`
- sequence 회귀
- retries/sequence 한도
- max sends 한도
- ChatGPT 입력창에 사용자 draft가 존재
- content script 주입/재개 프롬프트 전송 실패
- 개별 ChatGPT 실행 20분 hard stop 임박 → STATE 체크포인트 후 같은 sequence에서 종료/재개

ChatGPT 또는 GitHub의 rate/service limit을 우회하도록 재시도하지 않는다.

## E2E dogfood

현재 v0.2/v0.2.1 실제 Chrome 검증은 `docs/V02_E2E_TEST_PLAN.md`를 따른다. 결과는 `docs/V02_E2E_RESULT.md`에 누적한다.

검증 범위에는 per-tab isolation, 동일 stream collision guard, new-sequence/same-sequence retry, fresh-chat handoff, handoff race protection, terminal isolation, 그리고 v0.2.1 단일 Start/Stop session toggle이 포함된다.

## 개발

최근 Node.js가 필요하다.

```bash
npm run check
npm test
```

`npm test`는 control parser/schema helper, polling/retry clamp, sequence retry/회귀 처리와 Side Panel의 단일 Start/Stop toggle 회귀를 검증한다.
