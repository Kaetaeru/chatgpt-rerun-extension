# Tab Sessions and New-Chat Handoff

## Goal

ChatGPT Rerun v0.2는 브라우저 전체에 하나의 전역 Rerun을 두지 않는다. **각 ChatGPT 탭은 자기 설정과 자기 런타임을 가진 독립 세션**이다.

또한 대화가 너무 길어져 현재 채팅에서 계속 작업하기 어려울 때, 이전 대화 본문을 복사하지 않고 **GitHub를 source of truth로 사용해 새 ChatGPT 채팅으로 같은 run/sequence를 이관**할 수 있다.

## Per-tab storage

각 Chrome tab ID마다 세 키를 사용한다.

```text
tabConfig:<tabId>   # owner/repo/branch/path/token/poll/retry/prompt
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

이 제한은 같은 프로젝트를 실수로 두 탭에서 중복 실행하는 것을 방지하기 위한 것이다.

## Continue in new chat

Side Panel의 **Continue in new chat** 버튼은 현재 대화가 너무 길어졌거나 새 컨텍스트에서 이어가고 싶을 때 사용한다.

동작 순서:

1. 현재 tab의 config/runtime을 읽는다.
2. GitHub control을 다시 읽고 `status=continue`인지 확인한다.
3. 기존 tab을 `handoffPending`으로 만들어 polling/추가 전송을 일시 정지한다.
4. 새 `https://chatgpt.com/` 탭을 연다.
5. 새 탭 로딩과 content script 준비를 확인한다.
6. config/runtime을 새 tab ID의 storage key로 복사한다.
7. 기존 tab의 Rerun을 중지하고 새 tab으로 소유권을 넘긴다.
8. 새 탭에 handoff prompt를 자동 전송한다.
9. 성공하면 새 tab이 이후 GitHub polling을 계속 담당한다.

새 채팅으로 옮기는 것 자체는 GitHub sequence를 증가시키지 않는다. handoff 당시의 최신 control run/sequence를 그대로 사용한다.

## Handoff prompt

handoff prompt에는 최소한 다음 정보가 직접 포함된다.

- `owner/repo`
- branch
- control path
- handoff 시점의 `run_id`
- handoff 시점의 `sequence`

새 채팅은 이전 대화 내용을 전제로 하지 않는다. 먼저 GitHub의 `.chatgpt-rerun` 문서를 읽고 실제 최신 상태를 reconcile한 뒤 `STATE.md`의 `Next Exact Action`부터 재개한다.

즉 대화 컨텍스트가 사라져도 GitHub 체크포인트가 충분하면 작업을 계속할 수 있다.

## Handoff race protection

새 탭이 열리는 동안 기존 탭이 같은 sequence를 한 번 더 전송하면 안 된다.

따라서 handoff 시작 직후 기존 runtime에 `handoffPending=true`를 기록한다. background의 normal poll은 이 상태에서 아무 프롬프트도 보내지 않는다.

- 새 탭 준비 전에 handoff가 실패하면 기존 tab의 `handoffPending`을 해제한다.
- 새 tab으로 ownership이 이전된 뒤 handoff prompt 전송이 실패하면 새 tab을 `handoff_send_failed`로 정지한다.
- 성공하면 새 tab의 `handoffPending`을 해제하고 정상 polling을 시작한다.

## What this does not do

현재 구현은 ChatGPT 답변 본문을 읽어 "토큰 제한" 문구를 탐지하지 않는다.

그 대신 사용자가 대화가 길어졌다고 판단할 때 **Continue in new chat**을 명시적으로 누르는 방식이다. 이는 assistant output scraping에 의존하지 않고, 토큰 제한 문구/UI가 바뀌어도 GitHub 기반 handoff 자체가 유지되도록 하기 위함이다.

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

### New-chat handoff

1. 실행 중인 탭에서 `Continue in new chat`을 누른다.
2. 새 ChatGPT 탭이 열리는지 확인한다.
3. 기존 탭은 `handed_off_to_tab_<id>`로 정지하는지 확인한다.
4. 새 탭에 GitHub 좌표/run/sequence가 들어간 handoff prompt가 자동 전송되는지 확인한다.
5. 새 채팅이 GitHub 문서를 읽고 현재 미완료 checkpoint부터 재개하는지 확인한다.
6. 이후 GitHub sequence가 증가하면 새 탭에서 자동 진행되는지 확인한다.

## Chrome version

Tab-specific Side Panel을 명시적으로 열기 위해 `chrome.sidePanel.open({ tabId })`를 사용하므로 minimum Chrome version은 116으로 설정한다.
