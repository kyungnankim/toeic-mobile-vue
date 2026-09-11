# Frontend architecture

이 프로젝트는 빌드 단계 없이 배포되는 Vue 3 정적 앱이므로, 기능을 다음 레이어로 분리한다.

## 1. Page / Entry layer

페이지 진입점은 URL, 저장 상태, 데이터 로딩, 페이지 전환만 담당한다.

- `app.js` — 단어 학습 앱 진입점
- `ebook-prep.js` — 읽기 전 학습 페이지 controller
- `ebook-reader.js` — 책 읽기 페이지 controller

DOM 문자열 조립은 이 레이어에서 하지 않는다.

## 2. Feature component layer

사용자가 직접 보는 기능 단위를 Vue component로 분리한다.

- `components/home/home-feature-stack.js`
- `components/ebook/prep-view.js`
- `components/ebook/reader-view.js`

읽기 전 학습과 책 읽기는 서로 다른 component를 사용하며 서로의 UI를 렌더링하지 않는다.

## 3. Shared UI component layer

여러 feature가 재사용하는 표현 컴포넌트만 둔다.

- `components/ui/feature-card.js`
- `components/ebook/chapter-selector.js`

Shared UI는 API 호출, localStorage 변경, 페이지 이동 같은 비즈니스 동작을 직접 수행하지 않고 props/emits로만 통신한다.

## 4. Service / data layer

데이터 가져오기, 상태 직렬화, 공통 ebook 유틸리티는 view와 분리한다.

- `ebook-common.js`
- `data/*.json`
- `api/*.js`

## Rendering rule

홈의 LC 400문장/EBOOK 링크는 service worker가 HTML을 변조해서 주입하지 않는다. 첫 진입부터 `lc-player.js`가 Vue feature component를 로드하고 렌더링한다. 따라서 service worker 최초 설치 여부와 관계없이 같은 UI가 보여야 한다.
