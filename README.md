# chatgpt-rerun-extension

GitHub에 보존된 작업 상태를 기준으로 중단된 ChatGPT 장기 작업을 제한적으로 자동 재실행하는 Manifest V3 Chrome 확장프로그램이다.

핵심 원칙은 **ChatGPT 답변을 파싱하지 않고 GitHub를 source of truth로 사용**하는 것이다.

## 동작 개요

```text
ChatGPT 작업
   │
   ├─ PLAN.md / STATE.md 갱신
   ├─ control.json을 마지막 authoritative write로 게시
   └─ STATUS.md를 사람용 현황판으로 갱신
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

## GitHub Live Status

사용자가 자동화 상태를 이해하기 위해 PLAN/STATE/control을 직접 해석할 필요가 없도록 `.chatgpt-rerun/STATUS.md`를 사람용 현황판으로 유지한다.

STATUS에는 현재 run/sequence/status/task, 지금 하는 일, 전체 진행표, 최근 검증, 사용자가 해야 할 일, 다음 자동 작업, blocker/risk를 짧고 명확하게 표시한다.

- task/sequence/status/blocker/검증 결과가 바뀌면 즉시 갱신한다.
- 긴 ChatGPT 실행에서는 마지막 STATUS 갱신 후 약 5분이 지나고 표시할 내용이 달라졌다면 다음 안전한 체크포인트에서 갱신한다.
- 18분 time-budget checkpoint와 실행 종료 전 내용이 달라졌다면 갱신한다.
- 내용이 같으면 시각만 바꾸기 위한 빈 heartbeat commit은 만들지 않는다.
- ChatGPT가 idle/stopped인 동안에는 실제 진행이 없으므로 빈 주기 커밋을 만들지 않는다.
- GitHub token, 비밀, 민감한 사용자 입력은 STATUS에 넣지 않는다.

**STATUS는 presentation-only다.** 자동 재개와 crash recovery는 여전히 `control.json` / `STATE.md` / `PLAN.md`만 사용한다. STATUS가 stale하거나 누락돼도 Rerun은 정상 복구할 수 있어야 한다.

확장프로그램 자체는 이 현황판을 쓰기 위해 GitHub write 권한을 추가로 요구하지 않는다. STATUS 작성은 GitHub를 사용할 수 있는 ChatGPT 실행 프로토콜이 담당한다.

## 20-minute execution policy

**한 번의 ChatGPT 실행은 반드시 20분을 넘기지 않는다.** 이 제한은 전체 sequence가 아니라 개별 실행(turn) 기준이다.

- 실행 시작 시 20분 hard stop을 계산한다.
- 약 18분부터는 새 장기 작업을 시작하지 않고 STATE 체크포인트 정리를 우선한다.
- 20분 전에 반드시 응답을 종료한다.
- task가 아직 검증 완료가 아니라면 `continue` + 같은 sequence를 유지한다.
- `STATE.md`에 완료 내용, 검증 결과, 미완료 항목, `Next Exact Action`을 남긴다.
- STATUS 내용이 달라졌다면 사용자 현황판도 갱신한다.
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

## Start and automatic repository bootstrap

v0.2.2부터 Start는 대상 저장소에 Rerun 프로토콜이 아직 없어도 자동으로 초기화할 수 있다.

Start 시 다음 순서로 동작한다.

1. 현재 ChatGPT 탭의 content script를 준비한다.
2. 설정한 owner/repo/branch의 기본 `.chatgpt-rerun/control.json`을 읽어본다.
3. control이 있으면 기존 Rerun을 그대로 시작한다.
4. control이 없으면 저장소/branch 자체가 실제로 읽히는지 같은 GitHub 인증으로 확인한다.
5. 접근 가능한 저장소이고 control path가 기본 `.chatgpt-rerun/control.json`이면 runtime을 `Initializing repository`로 두고 bootstrap 프롬프트를 현재 ChatGPT 대화에 한 번 보낸다.
6. ChatGPT가 저장소와 현재 대화의 목표를 읽은 뒤 `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, `control.json`을 생성/보완한다.
7. `control.json`은 항상 마지막 authoritative write로 게시한다.
8. bootstrap turn은 첫 구현 task를 실행하지 않고 종료한다.
9. 확장프로그램이 새 control을 감지하면 일반 resume prompt를 자동 전송해 첫 task를 시작한다.

안전 경계:

- custom control path가 없을 때는 자동 생성으로 추측하지 않고 오류를 낸다.
- 저장소/branch 자체를 읽을 수 없는 404/권한 오류를 “새 프로젝트”로 오인하지 않는다.
- 일부 `.chatgpt-rerun` 파일이 이미 있으면 bootstrap prompt는 기존 내용을 무조건 덮어쓰지 않고 호환 가능한 누락 부분만 보완하도록 지시한다.
- bootstrap 동안 같은 stream은 다른 탭이 점유할 수 없고 normal sequence claim도 중지된다.
- bootstrap GitHub 쓰기는 확장프로그램 token이 아니라 ChatGPT의 연결된 GitHub 앱을 통해 수행한다. 따라서 확장프로그램에 contents write 권한을 추가하지 않는다.
- 공개 저장소를 token 없이 polling하는 경우 control 생성 감지는 기존 비인증 polling 제한 때문에 최대 약 60초 늦을 수 있다. token이 있으면 설정된 인증 polling 간격을 따른다.

확장프로그램 Reload 후 기존 ChatGPT 탭을 새로고침할 필요는 없다. content script가 없으면 Start가 동적으로 주입한다.

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
├── STATUS.md
└── control.json
```

v0.2.2부터 기본 control path로 Start하면 이 디렉터리가 없을 때 ChatGPT가 자동 bootstrap할 수 있다. 템플릿은 `templates/repository/.chatgpt-rerun/`에 있고 상세 규칙은 `docs/PROJECT_PROTOCOL.md`를 따른다.

- `README.md`: 매 실행 가장 먼저 읽는 운영 계약.
- `PLAN.md`: 전체 계획, 의존성, acceptance criteria.
- `STATE.md`: 중단 복구 체크포인트, 실행 시간 예산, 실제 검증 결과.
- `STATUS.md`: 사용자가 GitHub에서 바로 읽는 human-readable live dashboard. 자동화 판단에는 사용하지 않음.
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

권위 있는 상태 전환은 반드시 다음 순서다.

1. `PLAN.md`
2. `STATE.md`
3. **`control.json` 마지막 authoritative write**

그 뒤 사용자가 볼 STATUS 내용이 달라졌다면 `STATUS.md`를 presentation-only로 갱신할 수 있다. STATUS 쓰기 실패나 지연은 control/STATE의 유효성을 바꾸지 않는다.

STATE가 control보다 정확히 1 sequence 앞선 채 중단된 경우 다음 실행은 이전 task를 반복하지 않고 누락된 control handoff만 게시한다. 자세한 reconciliation 규칙은 `docs/PROJECT_PROTOCOL.md`에 있다.

## 설치

1. 이 저장소의 최신 브랜치를 clone 또는 update한다.
2. Chrome에서 `chrome://extensions`를 연다.
3. **Developer mode**를 켠다.
4. 처음이면 **Load unpacked**, 이미 로드했다면 **Reload**를 누른다.
5. 확장 아이콘을 클릭해 현재 ChatGPT 탭의 Rerun Side Panel을 연다.
6. Side Panel에 Owner, Repository, Branch, Control file을 입력한다.
7. 중지 상태의 단일 session control에서 **Start**를 누른다.
8. 대상 저장소에 `.chatgpt-rerun`이 없으면 기본 control path에서 자동 초기화가 먼저 실행된다.
9. 실행 중에는 같은 control이 **Stop**으로 표시되며, 누르면 해당 탭 Rerun만 중지한다.
10. 작업 진행 상황은 대상 저장소의 `.chatgpt-rerun/STATUS.md`를 열어 확인한다.

## GitHub 접근

공개 저장소는 token 없이 읽을 수 있다. token이 없으면 polling을 최소 60초로 제한한다.

빠른 polling 또는 private repository가 필요하면 대상 저장소 contents read 권한으로 제한된 GitHub token을 사용한다. token과 설정 draft는 현재 Chrome profile의 `chrome.storage.local`에 저장되므로 공유 PC에서는 사용하지 않는다.

확장프로그램의 token은 control polling과 bootstrap 대상 저장소/branch 존재 확인용이다. 실제 bootstrap 파일 쓰기와 STATUS 갱신은 ChatGPT의 연결된 GitHub 앱이 담당하므로 확장프로그램 token에 contents write 권한을 요구하지 않는다.

## 안전 장치

확장프로그램/프로토콜은 다음 경우 추측하지 않고 중지 또는 체크포인트한다.

- `complete`, `needs_user`, `blocked`
- sequence 회귀
- retries/sequence 한도
- max sends 한도
- ChatGPT 입력창에 사용자 draft가 존재
- content script 주입/재개/bootstrap 프롬프트 전송 실패
- custom missing control path
- 접근 불가능한 repository/branch를 bootstrap 대상으로 오인할 위험
- 개별 ChatGPT 실행 20분 hard stop 임박 → STATE 체크포인트 후 같은 sequence에서 종료/재개

ChatGPT 또는 GitHub의 rate/service limit을 우회하도록 재시도하지 않는다.

## E2E dogfood

현재 v0.2.x 실제 Chrome 검증은 `docs/V02_E2E_TEST_PLAN.md`를 따른다. 결과는 `docs/V02_E2E_RESULT.md`에 누적한다.

검증 범위에는 per-tab isolation, 동일 stream collision guard, new-sequence/same-sequence retry, fresh-chat handoff, handoff race protection, terminal isolation, 단일 Start/Stop session toggle, 그리고 새 저장소 자동 bootstrap이 포함된다.

## 개발

최근 Node.js가 필요하다.

```bash
npm run check
npm test
```

`npm test`는 control parser/schema helper, polling/retry clamp, sequence retry/회귀 처리, Side Panel 단일 Start/Stop toggle, repository bootstrap prompt와 bootstrap flow 회귀를 검증한다.
