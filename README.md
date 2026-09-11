# TOEIC 30DAY

휴대폰에서 바로 쓰는 Vue 3 토익 단어 학습 사이트입니다. 로그인/비밀번호 없이 사용합니다.

## 데이터
- DAY 1~30 전체
- 총 **2,078개 단어/표현**
- `Day 1~30(1).pdf`의 각 DAY 학습표 기준
- TEST 페이지는 동일 DAY 단어의 시험용 반복이므로 중복 추가하지 않음
- 데이터는 `data/words-*.json` 10개 파일로 분할 저장
- 데이터 검증 상세: `DATA_VALIDATION.md`

## 기능
- 영어 TTS 발음 듣기 / 자동 발음
- 발음 속도 조절
- 뜻 가리기 / 보기
- 외움 / 모름 체크
- 4지선다 퀴즈
- 오답 및 모름 단어 복습
- 영단어/뜻 검색
- 좌우 스와이프
- localStorage 진도 자동 저장
- 홈 화면 추가용 PWA manifest
- 방문 후 핵심 리소스 오프라인 캐시

## 실행
별도 빌드가 필요 없습니다. 정적 웹서버에서 이 폴더를 열면 됩니다.

예:
```bash
python -m http.server 8080
```

## Vercel
이 저장소를 그대로 Vercel에 연결하면 됩니다. Framework Preset은 `Other` 또는 자동 감지 기본값으로 두고 별도 Build Command는 필요 없습니다.

<!-- production redeploy trigger: 2026-09-11T10:52+09:00 -->
