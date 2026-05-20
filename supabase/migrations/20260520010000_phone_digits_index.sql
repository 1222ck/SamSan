-- =====================================================================
-- phone_numbers 정규화 digits-only GIN trigram functional 인덱스
-- =====================================================================
-- 작성: 2026-05-20
--
-- 배경
--   search_by_phone / search_combined 는 입력/저장 양쪽을
--   regexp_replace(phone, '\D', '', 'g') 로 정규화한 뒤 LIKE 비교한다.
--   기존 idx_phone_numbers_phone_trgm 은 raw phone('010-8331-7617') 컬럼에 걸려있어
--   정규화된 식과 매칭되지 않아 Seq Scan으로 떨어졌다 (~20ms / 11.6k rows).
--
-- 처치
--   regexp_replace(...) 식 자체에 GIN trigram 인덱스를 걸어
--   해당 식의 LIKE '%digits%' 패턴에 Bitmap Index Scan이 적용되도록 한다.
--   regexp_replace(text,text,text,text) 는 IMMUTABLE 이므로 expression index 가능.
--
-- 비파괴
--   기존 인덱스 유지. 함수 본문 변경 없음.
-- =====================================================================

create index if not exists idx_phone_numbers_phone_digits_trgm
  on public.phone_numbers
  using gin ( (regexp_replace(phone, '\D', '', 'g')) gin_trgm_ops );

comment on index public.idx_phone_numbers_phone_digits_trgm is
  'digits-only 정규화된 phone 식에 대한 trigram GIN. search_by_phone/search_combined 의 정규화 LIKE 가속용.';
