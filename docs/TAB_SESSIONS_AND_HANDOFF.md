# Tab Sessions and New-Chat Handoff

## Goal

ChatGPT Rerun v0.2는 브라우저 전체에 하나의 전역 Rerun을 두지 않는다. **각 ChatGPT 탭은 자기 설정과 자기 런타임을 가진 독립 세션**이다.

또한 대화가 너무 길어져 현재 채팅에서 계속 작업하기 어려울 때, 이전 대화 본문을 복사하지 않고 **GitHub를 source of truth로 사용해 새 ChatGPT 채팅으로 같은 run/sequence watcher ownership을 이관**할 수 있다.

## Per-tab storage

각 Chrome tab ID마다 세 키를 사용한다.

```text
tabConfig:<tabId>   # owner/repo/branch/path/token/poll/retry/prompt/approval-aware mode
tabRuntime:<tabId>  # enabled/run/sequence/retry/stop/handoff runtime
tabDraft:<tabId>    # Side Panel에 입력 중인 값
```

따라서:

- tab A의 Start/Stop은 tab B에 영향을 주지 않는다.
- tab A와 tab B는 서로 다른 GitHub 저장소, branch, control path를 동시에 실행할 수 있다.
- Side Panel을 닫았다 다시 열어도 해당 tab ID의 draft를 복원한다.
- 탭을 닫으면 그 tab ID의 로컬 세션 키는 제거된다.

## Tab-specific Side Panel

manifest에는 Side Panel 리소스를 패키징하지만, background service worker는 global panel을 비활성화한다.

사용자가 ChatGPT 탭에서 확장 아이콘을 클릭하면:

1. 해당 tab ID에 `popup.html`을 `chrome.sidePanel.setOptions({ tabId, ... })`로 설정한다.
2. `chrome.sidePanel.open({ tabId })`로 그 탭 전용 Side Panel을 연다.
3. 같은 `popup.html` 경로라도 tab ID가 다르면 Chrome에서 별도 panel instance로 취급된다.

## Same-stream collision guard

독립 탭을 지원하더라도 **같은 GitHub control stream**을 두 탭이 동시에 실행하면 같은 sequence를 중복 전송할 수 있다.

stream identity는 다음 네 값으로 계산한다.

```text
owner / repo / branch / control path
```

Start 또는 new-chat handoff 시 다른 enabled tab이 같은 stream을 이미 점유하고 있으면 시작을 거부한다.

## Continue in new chat

Side Panel의 **Continue in new chat** 버튼은 현재 대화가 너무 길어졌거나 새 컨텍스트에서 이어가고 싶을 때 사용한다.

v0.2.7부터 이 동작은 **GitHub work status와 독립적인 watcher ownership transfer**다. 따라서 `continue`뿐 아니라 `complete`, `needs_user`, `blocked`에서도 새 채팅으로 watcher를 이관할 수 있다.

동작 순서:

1. 현재 tab의 config/runtime을 읽는다.
2. GitHub control을 다시 읽어 최신 run/sequence/status/task를 확보한다.
3. 기존 tab을 `handoffPending`으로 만들어 polling/추가 전송을 일시 정지한다.
4. 새 `https://chatgpt.com/` 탭을 연다.
5. 새 탭 로딩과 content script 준비를 확인한다.
6. config/runtime을 새 tab ID의 storage key로 복사한다.
7. 기존 tab의 watcher를 중지하고 새 tab으로 ownership을 넘긴다.
8. 새 탭에 owner/repo, branch, control path, run_id, sequence, status, task_id가 포함된 handoff prompt를 자동 전송한다.
9. 최신 status가 `continue`면 새 채팅은 GitHub STATE에서 실제 작업을 재개한다.
10. 최신 status가 `complete`, `needs_user`, `blocked`면 새 채팅은 GitHub context만 복구하고 구현을 시작하지 않은 채 종료한다. 새 탭 watcher는 계속 polling한다.
11. 이후 GitHub가 유효한 `continue`가 되면 Start를 다시 누르지 않아도 새 탭에서 표준 resume prompt가 자동 전송된다.

새 채팅으로 옮기는 것 자체는 GitHub sequence를 증가시키지 않는다.

## GitHub app approval in fresh chats

새 ChatGPT 대화나 기존 대화의 write action에서 GitHub 앱 작업 승인 카드가 나타날 수 있다.

Rerun은 이 승인 카드의 `허용하기`/`Allow` 버튼이나 드롭다운을 자동 클릭하지 않는다. GitHub OAuth, repository-access, 조직 관리자 승인 UI도 자동화하지 않는다.

v0.2.13의 Side Panel에는 **GitHub 승인 후 자동 계속** 옵션이 있다.

- 옵션 OFF: 기존 동작을 유지한다.
- 옵션 ON: content script가 GitHub action-confirmation 카드가 현재 DOM에 보이는 동안 Rerun의 `POLL`/retry를 잠시 보내지 않는다.
- 사용자가 직접 승인하면 ChatGPT가 action을 계속 수행하고 승인 카드가 사라진다.
- 카드가 사라지면 다음 content tick(기본 약 2초)부터 Rerun polling이 자동 재개된다.
- 따라서 승인 대기 시간이 retry delay를 넘어가도 동일 control을 별도 resume prompt로 중복 전송하지 않는다.
- 이 기능은 assistant 답변 내용을 읽어 승인 여부를 추측하지 않고, 실제 상호작용 가능한 GitHub 승인 UI의 존재만 감지한다.

책임 분리는 다음과 같다.

```text
Rerun extension: 새 탭 생성 + watcher ownership 이관 + GitHub-backed handoff prompt 전달 + 승인 대기 중 retry 억제/수동 승인 후 자동 재개
ChatGPT app permission: GitHub action confirmation 표시와 사용자의 승인 선택
GitHub OAuth/admin: 실제 저장소 접근 범위와 조직 승인
```

## Handoff prompt

handoff prompt에는 최소한 다음 정보가 직접 포함된다.

- `owner/repo`
- branch
- control path
- handoff 시점의 `run_id`
- handoff 시점의 `sequence`
- handoff 시점의 `status`
- handoff 시점의 `task_id`

새 채팅은 이전 대화 내용을 전제로 하지 않는다. 먼저 GitHub의 `.chatgpt-rerun` 문서를 읽고 실제 최신 상태를 reconcile한다.

- 최신 `continue`: STATE의 미완료 지점과 Next Exact Action부터 재개한다.
- 최신 terminal: 구현을 시작하지 않고 context만 복구한 뒤 watcher를 유지한다.

## Handoff race protection

새 탭이 열리는 동안 기존 탭이 같은 sequence를 한 번 더 전송하면 안 된다.

따라서 handoff 시작 직후 기존 runtime에 `handoffPending=true`를 기록한다. background의 normal poll은 이 상태에서 아무 프롬프트도 보내지 않는다.

- 새 탭 준비 전에 handoff가 실패하면 기존 tab의 `handoffPending`을 해제한다.
- 새 tab으로 ownership이 이전된 뒤 handoff prompt 전송이 실패하면 새 tab은 `handoff_send_failed`로 정지한다.
- 성공하면 새 tab의 `handoffPending`을 해제하고 정상 polling을 시작한다.
- terminal GitHub status는 더 이상 handoff 거부 사유가 아니다.

## What this does not do

현재 구현은 ChatGPT 답변 본문을 읽어 "토큰 제한" 문구를 탐지하지 않는다.

그 대신 사용자가 대화가 길어졌다고 판단할 때 **Continue in new chat**을 명시적으로 누르는 방식이다. 또한 Rerun 확장프로그램은 ChatGPT의 앱 승인 카드나 OAuth/관리자 승인 UI를 자동 클릭하지 않는다. `GitHub 승인 후 자동 계속`도 승인 자체를 자동화하는 기능이 아니라 승인 대기 중 Rerun retry를 억제하고 수동 승인 뒤 자동 재개하는 기능이다.

## Manual verification

### Tab isolation

1. ChatGPT tab A와 B를 연다.
2. 각각 확장 아이콘을 눌러 Side Panel을 연다.
3. A에서 Owner/Repo 값을 입력한다.
4. B에서 다른 값을 입력한다.
5. 탭을 오가며 값이 섞이지 않는지 확인한다.
6. A를 Start하고 B의 상태가 Stopped로 남는지 확인한다.
7. B에서 다른 control stream을 Start해 두 세션이 독립적으로 polling하는지 확인한다.
8. B를 A와 같은 stream으로 바꾸면 충돌 오류가 나는지 확인한다.

### New-chat handoff — continue

1. 실행 중인 탭에서 GitHub status가 `continue`일 때 **Continue in new chat**을 누른다.
2. 새 ChatGPT 탭이 열리는지 확인한다.
3. 기존 탭은 `handed_off_to_tab_<id>`로 중지하는지 확인한다.
4. 새 탭에 status까지 포함된 handoff prompt가 **자동 제출**되는지 확인한다.
5. 새 채팅이 GitHub 문서를 읽고 현재 미완료 checkpoint부터 재개하는지 확인한다.

### New-chat handoff — terminal

1. watcher가 Watching이고 GitHub status가 `needs_user`, `complete`, 또는 `blocked`인 상태에서 **Continue in new chat**을 누른다.
2. handoff가 거부되지 않고 새 탭이 열리는지 확인한다.
3. 새 탭의 handoff prompt가 자동 제출되고 repo/run context를 복구하는지 확인한다.
4. 실제 구현 task는 시작하지 않는지 확인한다.
5. 새 탭 watcher가 계속 Watching인지 확인한다.
6. 이후 같은 sequence 또는 새 sequence를 `continue`로 바꿨을 때 새 탭에서 자동 재개되는지 확인한다.

### GitHub approval-aware resume

1. Side Panel에서 **GitHub 승인 후 자동 계속**을 체크하고 Save connection을 누른다.
2. GitHub write action이 `ChatGPT가 GitHub을(를) 사용하도록 허용할까요?` 카드를 띄우게 한다.
3. 승인 카드를 누르지 않은 채 retry delay보다 오래 기다려도 Rerun resume prompt가 중복 전송되지 않는지 확인한다.
4. 승인 버튼이 Rerun에 의해 자동 클릭되지 않는지 확인한다.
5. 사용자가 직접 `허용하기` 또는 `대화에서 허용하기`를 선택한다.
6. ChatGPT action이 계속되고 카드가 사라진 뒤 Rerun watcher가 Start 재클릭 없이 자동으로 polling/continuation을 이어가는지 확인한다.

## Chrome version

Tab-specific Side Panel을 명시적으로 열기 위해 `chrome.sidePanel.open({ tabId })`를 사용하므로 minimum Chrome version은 116으로 설정한다.
