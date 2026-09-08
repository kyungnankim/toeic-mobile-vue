# 단어 데이터 검증 결과

업로드 자료를 비교해 사이트 단어 데이터를 검증한 기록입니다.

## 결과

- `노랭이 전면개정판(1).xlsx` Sheet1: **1,222개**
- 기존 사이트 데이터: **1,222개**
- 두 데이터는 행 단위로 **100% 일치**
- `Day 1~30(1).pdf`의 DAY 1~30 학습표 전체: **2,078개**
- 따라서 기존 사이트에는 PDF 학습표 기준 **856개가 순수하게 부족**했습니다.
- 사이트 데이터는 PDF 학습표 전체 **2,078개**로 교체했습니다.
- 새 사이트 데이터(`data/words-*.json`)는 PDF의 DAY/번호/단어/뜻과 **2,078 / 2,078 일치**하도록 생성했습니다.

## DAY별 단어 수

- DAY 1: 68개
- DAY 2: 68개
- DAY 3: 68개
- DAY 4: 72개
- DAY 5: 68개
- DAY 6: 70개
- DAY 7: 67개
- DAY 8: 68개
- DAY 9: 68개
- DAY 10: 68개
- DAY 11: 73개
- DAY 12: 69개
- DAY 13: 68개
- DAY 14: 72개
- DAY 15: 69개
- DAY 16: 69개
- DAY 17: 70개
- DAY 18: 69개
- DAY 19: 69개
- DAY 20: 70개
- DAY 21: 70개
- DAY 22: 74개
- DAY 23: 67개
- DAY 24: 69개
- DAY 25: 68개
- DAY 26: 71개
- DAY 27: 68개
- DAY 28: 68개
- DAY 29: 71개
- DAY 30: 69개

## 엑셀에서 확인된 철자 차이

엑셀의 단어/뜻과 PDF 학습표를 비교했을 때 아래 11개는 뜻을 기준으로 같은 항목이지만 영단어 철자가 달랐습니다.
사이트에는 책 PDF 학습표의 철자를 사용했습니다.

- DAY 2: `lagislation` → `legislation`
- DAY 3: `corporatiion` → `corporation`
- DAY 6: `information` → `informative`
- DAY 11: `complicate` → `complicated`
- DAY 12: `epuipment` → `equipment`
- DAY 13: `curteous` → `courteous`
- DAY 14: `tighly` → `tightly`
- DAY 18: `conviniently` → `conveniently`
- DAY 27: `incrative` → `lucrative`
- DAY 27: `distributuion` → `distribution`
- DAY 30: `symtom` → `symptom`

## 데이터 기준

단어 순서, DAY, 주제, 뜻은 `Day 1~30(1).pdf`의 각 DAY 학습표를 기준으로 합니다.
TEST 페이지는 별도 단어를 추가하는 페이지가 아니라 해당 DAY 단어를 시험용으로 다시 제시한 페이지이므로 중복 추가하지 않았습니다.
