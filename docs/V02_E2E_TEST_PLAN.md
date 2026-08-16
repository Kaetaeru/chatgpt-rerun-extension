# ChatGPT Rerun v0.2.x E2E Test Plan

## Scope

v0.2는 v0.1 dogfood 중간에 구조가 바뀌었으므로 이전 run의 남은 E2E-003/004를 그대로 이어서 PASS 처리하지 않는다. v0.1에서 관찰된 evidence는 보존하되, 현재 head는 새 run으로 다시 검증한다. v0.2.1은 Side Panel Start/Stop UX를 단일 상태 기반 토글로 단순화했고, v0.2.2는 표준 control이 없는 저장소의 안전한 Start fallback bootstrap을 추가했다. v0.2.3은 명시적 **Rerun 연결 프롬프트**를 기본 온보딩으로 추가했다. v0.2.4는 Chrome tab watcher의 Start/Stop과 GitHub work status를 분리했다. v0.2.5는 신규 ChatGPT 탭을 진짜 `Unconnected` 상태로 시작하고, 연결 프롬프트가 Side Panel 좌표가 아니라 현재 채팅에서 GitHub 앱으로 실제 사용한 repository를 식별·보고하도록 온보딩 계약을 정리한다.

검증 대상:

1. Side Panel과 설정/runtime이 Chrome tab ID별로 분리되는가.
2. 한 탭의 watcher Start/Stop이 다른 탭 세션에 영향을 주지 않는가.
3. 같은 GitHub control stream의 동시 watcher ownership이 차단되는가.
4. 기존 new-sequence dispatch와 same-sequence retry가 per-tab runtime에서도 유지되는가.
5. `Continue in new chat`이 기존 탭 watcher를 멈추고 새 ChatGPT 탭으로 같은 GitHub run/sequence watcher ownership을 이관하는가.
6. 새 채팅이 이전 대화 본문 없이 GitHub STATE에서 재개하는가.
7. GitHub terminal 상태가 watcher를 끄지 않고 polling을 계속하며, 이후 `continue`가 되면 자동 재개하는가.
8. 하나의 tab-watcher control이 `Start`와 `Stop` 사이에서 정확히 전환되는가.
9. 신규 연결 탭은 repo를 상속하지 않고 Unconnected로 시작하며, 연결 프롬프트가 실제 채팅 GitHub 사용 상태를 `UNCONNECTED / AMBIGUOUS / CONNECTED`로 정확히 보고하고 CONNECTED일 때만 표준 5파일을 설치하는가.

## Run gate

코드 변경 후 로컬 unpacked extension이 최신 `agent/mvp-autoresume` head로 Reload되기 전에는 변경된 동작을 E2E PASS로 판정하지 않는다.

코드 변경 중 구버전이 새 control sequence를 소비할 위험이 있으면 GitHub work state를 `needs_user`로 두어 dispatch를 안전하게 멈추고, 사용자가 Reload 완료를 확인한 뒤 `continue`로 복귀한다. v0.2.4 이후 이 GitHub `needs_user` 자체는 watcher Stop을 의미하지 않는다.

## V02-001 — tab-scoped panel and storage

1. ChatGPT tab A와 B를 연다.
2. 각 탭에서 확장 아이콘을 눌러 Side Panel을 연다.
3. 두 패널의 `Chrome tab` ID가 서로 다른지 확인한다.
4. A의 Owner/Repo에 값을 입력하고 B에서 다른 값을 입력한다.
5. 탭을 오가며 draft가 섞이지 않는지 확인한다.
6. A에서 Start 후 B watcher가 Stopped인지 확인한다.

PASS: 각 탭이 별도 panel/storage/runtime을 유지한다.

## V02-002 — same-stream collision guard

1. A watcher를 특정 owner/repo/branch/control path로 실행한다.
2. B를 같은 네 좌표로 설정한다.
3. B에서 Start를 누른다.

PASS: B watcher가 시작되지 않고 `같은 GitHub control stream이 이미 tab ...에서 실행 중` 오류가 표시된다. A watcher는 계속 실행된다.

별도 stream을 가진 실제 프로젝트가 준비되면 B에 다른 좌표를 넣고 A/B 동시 watcher도 확인한다.

## V02-003 — core rerun regression

A에서 기존 v0.1 흐름을 최소한 다시 확인한다.

1. 새 sequence `continue`가 자동 전송된다.
2. control을 그대로 둔 same-sequence retry가 자동 전송된다.
3. retry 한도와 max sends가 tab A에만 적용된다.

PASS: v0.1 dispatch/retry 동작이 per-tab storage refactor 뒤에도 유지된다.

## V02-004 — Continue in new chat

1. watcher가 켜져 있고 GitHub status가 `continue`인 tab A에서 **Continue in new chat**을 누른다.
2. 새 `chatgpt.com` 탭 C가 열리는지 확인한다.
3. A runtime이 `handed_off_to_tab_<C>`로 중지되는지 확인한다.
4. C의 config/runtime이 A에서 복사되었는지 확인한다.
5. C에 handoff prompt가 자동으로 전송되는지 확인한다.
6. prompt에 owner/repo, branch, control path, run_id, sequence가 포함되는지 확인한다.
7. C가 `.chatgpt-rerun` 문서를 읽고 GitHub의 최신 실제 상태를 우선하는지 확인한다.
8. 이전 대화 본문을 요구하지 않고 STATE의 미완료 지점부터 재개하는지 확인한다.

PASS: 동일 GitHub workflow의 watcher ownership이 A에서 C로 한 번만 이동하며 중복 prompt가 없다.

## V02-005 — handoff race/failure behavior

- handoff 중 기존 tab은 `handoffPending`이라 normal polling을 하지 않아야 한다.
- 새 탭 준비 전에 오류가 나면 기존 tab의 `handoffPending`이 해제되어야 한다.
- ownership 이전 후 새 탭 prompt 전송이 실패하면 새 tab은 `handoff_send_failed`로 멈춰야 한다.
- GitHub status가 terminal이면 handoff 요청은 거부되지만 기존 watcher는 꺼지지 않아야 한다.

## V02-006 — persistent watcher across GitHub work states

1. tab A watcher를 Start해서 `Tab watcher = Watching` 상태로 둔다.
2. A의 GitHub control을 `complete`, `needs_user`, 또는 `blocked` 중 하나로 게시한다.
3. Side Panel에서 watcher가 계속 `Watching`이고 버튼이 계속 `Stop`인지 확인한다.
4. 설정된 polling 주기가 지난 뒤 GitHub 상태 갱신을 통해 실제 polling이 계속되는지 확인한다.
5. terminal 상태에서는 resume prompt가 새로 전송되지 않는지 확인한다.
6. 같은 run/sequence를 다시 `continue`로 바꾸거나, 새 sequence `continue`를 게시한다.
7. watcher를 다시 Start하지 않아도 owning tab에서 resume prompt가 자동 전송되는지 확인한다.
8. 같은 sequence terminal -> `continue` 전환이라면 retry delay를 기다리지 않고 새 work authorization으로 즉시 dispatch되는지 확인한다.

PASS: GitHub work state와 Chrome watcher state가 독립적이다.

## V02-007 — unified Start/Stop tab-watcher toggle

1. 최신 unpacked extension을 Reload한다.
2. 현재 ChatGPT 탭 watcher가 Stopped인 상태에서 Side Panel footer를 확인한다.
3. watcher control이 정확히 하나이고 텍스트가 `Start`인지 확인한다.
4. `Start`를 누른다.
5. `Tab watcher = Watching`이 되고 같은 버튼이 `Stop`으로 바뀌는지 확인한다.
6. `Stop`을 누른다.
7. watcher가 Stopped가 되고 같은 버튼이 다시 `Start`로 바뀌는지 확인한다.

PASS: `runtime.enabled`는 현재 tab watcher on/off만 나타낸다.

## V02-008 — unconnected-first explicit Rerun onboarding

준비: 기존 프로젝트와 무관한 별도 안전한 GitHub test repository를 준비한다. `.chatgpt-rerun`은 아직 없어야 한다. 최신 **v0.2.5** 확장을 Reload한 뒤 **새 ChatGPT 탭**에서 시작한다.

### A. True unconnected state

1. 새 ChatGPT 탭에서 Side Panel을 연다.
2. `Repository connection = Unconnected`인지 확인한다.
3. Owner / Repository / Branch가 이전 탭에서 자동 상속되지 않았는지 확인한다.
4. 이 채팅에서 아직 GitHub repository를 실제로 읽거나 작업하지 않은 상태로 **Rerun 연결 프롬프트**를 누른다.
5. 프롬프트가 Side Panel 좌표를 repo 식별 근거로 사용하지 않도록 지시하는지 확인한다.
6. ChatGPT가 `RERUN_CONNECTION: UNCONNECTED`라고 보고하고 test repo 포함 어떤 저장소에도 Rerun 파일을 쓰지 않는지 확인한다.

PASS-A: 신규 탭은 진짜 Unconnected이며 repo를 실제 사용하기 전 연결 프롬프트가 임의의 연결을 만들지 않는다.

### B. Connect from actual conversation GitHub usage

1. 같은 ChatGPT 대화에서 대상 test repository를 GitHub 앱으로 실제로 읽게 한다. 예: README를 읽고 프로젝트 목표를 확인하게 한다.
2. 필요한 경우 작업 대상 branch/ref도 실제 GitHub 맥락에서 확정한다.
3. watcher가 Stopped인 상태에서 **Rerun 연결 프롬프트**를 다시 누른다.
4. 대상이 하나로 명확하면 README / PLAN / STATE / STATUS / control 다섯 문서를 생성/보완하는지 확인한다.
5. 새 프로젝트에서는 실제 목표 기반 PLAN, 새 run_id / sequence 0 STATE, human-readable STATUS를 만들고 control을 마지막 authoritative write로 `continue` 게시하는지 확인한다.
6. 연결 프롬프트 turn 자체는 실제 구현 task를 시작하지 않고 종료하는지 확인한다.
7. 종료 답변에 `RERUN_CONNECTION: CONNECTED`가 있고 다음 정보가 명확히 출력되는지 확인한다: owner/repo, canonical repo URL, 정확한 branch/ref, control path, 새 생성/reconcile 여부, run_id, sequence, status, task_id, 프로젝트 목표.
8. Side Panel에 CONNECTED 결과의 Owner / Repository / Branch를 입력하고 Save한다.
9. `Repository connection`이 `owner/repo @ branch`로 표시되는지 확인한다.
10. `Start`를 누르면 watcher가 Watching이 되고 seq 0 / `continue`를 감지해 표준 resume prompt가 첫 implementation task를 시작하는지 확인한다.
11. watcher가 켜져 있을 때 연결 프롬프트 버튼이 비활성화되는지 확인한다.

PASS-B: 실제 채팅 GitHub 사용을 근거로만 연결되고, 연결 결과가 사용자에게 완전하게 보고되며, 그 결과로 Side Panel 연결을 확정한 뒤 Start가 첫 task를 시작한다.

### C. Ambiguity safety when practical

하나의 대화에서 둘 이상의 repo/branch 후보가 실제로 사용된 상황을 안전하게 만들 수 있다면 연결 프롬프트가 `RERUN_CONNECTION: AMBIGUOUS`를 보고하고 사용자 확인 전 파일을 쓰지 않는지 확인한다. 이 destructive하지 않은 probe를 만들기 어렵다면 prompt contract/source evidence로 보완할 수 있다.

### Start fallback regression

v0.2.2의 안전한 자동 bootstrap은 보조 경로로 유지한다. 사용자가 연결 프롬프트를 건너뛰고 Owner/Repository/Branch를 직접 입력한 뒤 기본 `.chatgpt-rerun/control.json`이 없는 접근 가능한 repo에서 Start한 경우에만 기존 bootstrap이 동작한다. custom missing control path와 접근 불가능한 repo/branch는 자동 생성하지 않는다.

## Pass criteria

- V02-001~008의 실행 가능한 항목에 실제 evidence가 기록된다.
- multi-tab 설정/runtime이 섞이지 않는다.
- 동일 stream 중복 watcher ownership이 차단된다.
- new-chat handoff가 GitHub state만으로 작업을 복원한다.
- 기존 dispatch/retry 동작에 regression이 없다.
- terminal GitHub status가 watcher를 끄지 않고 polling을 지속한다.
- terminal -> `continue`가 watcher 재-Start 없이 자동 dispatch된다.
- 단일 Start/Stop control의 표시 상태와 실제 tab watcher 상태가 일치한다.
- 신규 ChatGPT 탭은 repository connection을 상속하지 않고 `Unconnected`로 시작한다.
- 실제 GitHub repo 사용 전 연결 프롬프트는 `UNCONNECTED`를 보고하고 아무 파일도 쓰지 않는다.
- 연결 프롬프트는 Side Panel 좌표나 단순 텍스트 언급을 repo 식별 근거로 사용하지 않는다.
- 실제 GitHub 사용 repo가 하나로 확정된 경우에만 README / PLAN / STATE / STATUS / control을 만들고 control을 마지막 authoritative write로 게시한다.
- CONNECTED 결과는 사용자에게 owner/repo, URL, branch/ref, control path, run/status/task, 프로젝트 목표를 명확히 보고한다.
- Start fallback bootstrap은 표준 path + 접근 가능한 repo/branch에서만 실행된다.
- 각 ChatGPT 실행은 20분 hard stop 정책을 따른다.
