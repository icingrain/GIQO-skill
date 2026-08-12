# Visual Review 상세 문서

이 문서는 README의 Visual Review 섹션에서 생략한 상세 동작 방식을 설명합니다.

## 화면 구조

Visual Review에는 두 가지 브라우저 표면이 있습니다.

1. 생성된 리뷰 아티팩트: `wireframe.html` 또는 `mockup.html`이 `review.js`, `review.css`를 직접 포함합니다.
2. 실제 화면 live review: `--actual`을 사용하면 `live-shell.html`이 열리고, 실제 페이지는 런처의 `/__gqo/actual/` 프록시를 통해 iframe 안에 로드됩니다.

live review에서는 GIQO 툴바, 패널, 저장된 요청 목록, 오버레이 CSS가 실제 앱 iframe 바깥에 있습니다. 실제 앱 DOM에는 review toolbar markup, pin, layout helper를 주입하지 않습니다.

live review의 click mode는 두 가지입니다.

| Mode | 의미 |
|---|---|
| `Review clicks` | iframe 안 target 클릭을 가로채서 Visual Review 선택으로 사용합니다. |
| `Interact with app` | 클릭을 실제 앱에 통과시켜 팝업, dropdown, tab 전환 같은 인터랙션을 확인합니다. |

인터랙션으로 숨겨진 UI를 연 뒤 `Refresh`를 누르면 현재 보이는 target 목록을 다시 수집합니다.

## 로컬 런처 명령

아래 명령은 agent 또는 고급 사용자를 위한 구현 상세입니다. 메인 README에서는 프롬프트 기반 사용 흐름만 보여줍니다.

기본 생성 리뷰 서버 실행:

```bash
node scripts/open-visual-review.mjs templates/visual-review/mockup.html
```

명령은 기본적으로 URL만 출력합니다. agent가 같은 URL을 브라우저에서 열 수 있도록 자동 브라우저 실행은 기본값이 아닙니다.

wireframe 리뷰 화면 열기:

```bash
node scripts/open-visual-review.mjs templates/visual-review/wireframe.html
```

실제 실행 중인 앱 화면 연결:

```bash
node scripts/open-visual-review.mjs ./ui-review/mockup.html --actual http://localhost:3000
```

터미널에서 직접 브라우저까지 열고 싶을 때:

```bash
node scripts/open-visual-review.mjs ./ui-review/mockup.html --open
```

## Target

Target은 수정 요청이 붙는 안정적인 UI 식별자입니다. 화면 좌표가 아닙니다.

```html
data-gqo-id="home.hero.primary-cta"
```

`targets.json`의 권장 target record는 다음 정보를 포함합니다.

- `id`: 안정적인 target ID
- `label`: 화면 표시용 label
- `scope`: `global`, `screen`, `section`, `element` 등 범위
- `editable`: `copy style` 같은 편집 가능성 힌트
- `text`: 짧은 visible text snapshot
- `bounds`: 리뷰 당시 브라우저 bounds

`bounds`는 참고 증거일 뿐 identity가 아닙니다. live overlay 위치는 현재 DOM의 `getBoundingClientRect()`로 다시 계산합니다.

## 저장 상태

로컬 런처를 사용하면 상태는 아래 경로에 저장됩니다.

```text
.giqo/ui-review/<screen>/
├── state.json
├── targets.json
├── comments.json
├── change-requests.json
└── review.md
```

브라우저에서는 저장된 요청을 생성, 수정, 삭제할 수 있습니다. `Status`와 `Target`은 모두 접힌 버튼으로 보이고, 버튼을 누르면 선택 목록이 열립니다. 여러 target checkbox를 켜도 하나의 요청과 하나의 코멘트로 저장됩니다. 저장된 요청 카드에 target이 2개 이상이면 `Target N` 버튼으로 접혀 보이고, 클릭하면 연결된 target 목록이 열립니다. 변경이 발생하면 JSON과 Markdown 상태가 함께 다시 쓰입니다.

화면에서 target을 직접 클릭해서도 다중 선택할 수 있습니다. 패널이 닫힌 상태에서 첫 target을 클릭하면 요청 패널이 열리고, 패널이 열린 뒤 다른 target을 클릭하면 기존 선택에 추가됩니다.

저장 record는 이전 호환을 위해 대표 target인 `targetId`를 유지하고, 다중 선택 정보는 `targetIds`에 저장합니다.

```json
{
  "targetId": "home.hero",
  "targetIds": ["home.hero", "home.hero.primary-cta"],
  "scope": "multi-target",
  "comment": "Hero와 CTA의 간격을 더 좁혀주세요."
}
```

## Status lifecycle

Status는 agent가 관리합니다. 리뷰어는 브라우저에서 status로 필터링할 수 있지만 직접 상태를 바꾸지는 않습니다.

| Status | 의미 |
|---|---|
| `saved` | 저장됨, 아직 처리 전 |
| `running` | agent 작업 시작됨 |
| `applied` | 문서, 리뷰 아티팩트, 또는 소스에 반영됨 |
| `failed` | 적용 불가, 거절, 차단, 실패 |

요청을 적용할 때 agent는 먼저 `running`으로 표시하고, 작업 결과에 따라 `applied` 또는 `failed`로 갱신해야 합니다.

Toolbar에는 status별 요청 수가 표시됩니다. 화면 위 pin 숫자도 현재 `Status` 필터를 반영합니다. 예를 들어 `failed`로 필터링하면 failed 요청이 걸린 target pin만 남습니다.

## Target label inference

Visual Review는 `data-gqo-id`만 보여주지 않고, 가능한 경우 아래 정보를 읽어 사람이 알아보기 쉬운 label을 만듭니다.

1. `aria-label`
2. `title`
3. 내부 `h1`, `h2`, `h3`, `legend`
4. 짧은 visible text
5. DOM tag 또는 `role`

이 추론은 현재 보이는 DOM에서 짧은 문자열만 읽으므로 별도 model 호출이나 큰 비용이 없습니다. 실제 source file 추적은 하지 않습니다.

## Chrome DevTools element picker

Chrome DevTools의 element picker 자체를 웹페이지 JavaScript에서 직접 재사용하는 공식 API는 없습니다. DevTools는 브라우저 내부 권한으로 동작하고, 일반 페이지 script나 iframe shell에서는 선택 결과를 안정적으로 받을 수 없습니다.

대신 GIQO가 현실적으로 활용할 수 있는 방식은 다음 두 가지입니다.

1. 현재 방식처럼 `data-gqo-id`와 overlay click으로 target을 선택합니다.
2. 장기적으로 Chrome DevTools Protocol 또는 extension을 별도 연결해 `$0`/selected node 정보를 받아오는 고급 모드를 둡니다.

2번은 브라우저 권한, session 연결, 사용자 승인 흐름이 필요하므로 기본 Visual Review에는 넣지 않습니다.

## Annotation to prompt

`review.md`는 단순 댓글 덤프가 아니라 agent에게 전달하기 쉬운 Markdown prompt 형식으로 저장됩니다.

```markdown
# Visual Review Annotation Prompt

## Hero area · section + Generate design package · button

- Request ID: comment-...
- Targets: home.hero, home.hero.primary-cta
- Severity: medium
- Scope: multi-target
- Status: saved

### Requested change

Hero와 CTA의 간격을 더 좁혀주세요.

### Apply prompt

Apply this UI change to all listed targets. Keep visual behavior outside the selected targets unchanged.
```

즉 `annotation_to_prompt` 패턴은 저장된 annotation을 Markdown으로 정리해서 다음 `/giqo-skill apply` 또는 구현 agent가 그대로 입력 자료로 쓸 수 있게 만드는 방식입니다.

## Live shell overlay

live shell은 현재 hover 중이거나 선택된 target에만 보더를 표시합니다. 모든 target을 기본으로 그리지 않습니다.

오버레이 좌표는 active target에 대해서만 iframe DOM에서 다시 계산합니다. redraw는 `requestAnimationFrame`으로 throttle하며 다음 변화에 반응합니다.

- iframe scroll
- shell resize
- iframe resize
- `visualViewport` resize/scroll
- `ResizeObserver` 변화

이 방식은 모든 target을 반복 측정하지 않으면서 scroll, zoom, responsive layout 변화에도 정렬을 유지합니다.

## Fallback

다음 경우에는 생성된 artifact review를 사용합니다.

- 실제 앱이 iframe/proxy 로딩을 막는 경우
- 실제 앱에 안정적인 `data-gqo-id`가 없는 경우
- 앱이 로컬 프록시에서 동작하기 어려운 브라우저 기능에 의존하는 경우

fallback에서는 실제 화면을 비교 기준으로 두고, 생성된 artifact의 target에 요청을 저장합니다.
