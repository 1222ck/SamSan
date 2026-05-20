-- =====================================================================
-- 검색 함수 검증 쿼리
-- =====================================================================
-- 실행: Supabase Studio SQL Editor (또는 psql -f ...)
-- 각 케이스 출력 형태 확인. 사람이 보는 sanity check.
--
-- 기대값은 주석에 적어둠. 실제 데이터에 따라 양은 변동될 수 있으나
-- "큰들횟집" 가구는 시드 데이터로 고정되어 있어야 함.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 사전 점검: 인덱스 / 확장 존재 여부
-- ---------------------------------------------------------------------
select extname, extversion from pg_extension where extname = 'pg_trgm';

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_customers_name_trgm',
    'idx_phone_numbers_phone_trgm',
    'idx_phone_numbers_phone_digits_trgm',  -- 20260520010000 마이그레이션 이후
    'idx_phone_numbers_label_trgm',
    'idx_addresses_address_trgm',
    'idx_phone_numbers_customer_id',
    'idx_addresses_customer_id'
  )
order by indexname;

select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'search_by_phone',
    'search_by_name',
    'search_by_address',
    'search_combined',
    '_search_results_json'
  )
order by p.proname;


-- ---------------------------------------------------------------------
-- T1. 전화번호 풀텍스트 (하이픈 포함) → 큰들횟집 가구
--     기대: phones 3개 (055-672-3004 / 010-4234-3610 / 010-8331-7617),
--           addresses 1개 (포교,버드네, 두포1길 166-25)
-- ---------------------------------------------------------------------
select 'T1' as case_id, jsonb_array_length(search_by_phone('010-8331-7617')) as result_count;
select jsonb_pretty(search_by_phone('010-8331-7617')) as t1_result;


-- ---------------------------------------------------------------------
-- T2. 전화번호 부분(숫자만) → T1 과 동일 결과
-- ---------------------------------------------------------------------
select 'T2' as case_id, jsonb_array_length(search_by_phone('83317617')) as result_count;
select (search_by_phone('010-8331-7617') = search_by_phone('83317617')) as t1_equals_t2;


-- ---------------------------------------------------------------------
-- T3. 가구 대표명 fuzzy 검색 → 큰들횟집 포함
-- ---------------------------------------------------------------------
select 'T3' as case_id, jsonb_array_length(search_by_name('큰들')) as result_count;
select jsonb_pretty(search_by_name('큰들')) as t3_result;


-- ---------------------------------------------------------------------
-- T4. 가구원 이름 검색 (phone_numbers.label 매칭) → 큰들횟집 가구
-- ---------------------------------------------------------------------
select 'T4' as case_id, jsonb_array_length(search_by_name('김식백')) as result_count;
select jsonb_pretty(search_by_name('김식백')) as t4_result;


-- ---------------------------------------------------------------------
-- T5. 주소 부분일치
-- ---------------------------------------------------------------------
select 'T5' as case_id, jsonb_array_length(search_by_address('두포1길')) as result_count;
select jsonb_pretty(search_by_address('두포1길')) as t5_result;


-- ---------------------------------------------------------------------
-- T6. 복합 (이름 + 주소). 큰들횟집 한 가구만 남아야 함
-- ---------------------------------------------------------------------
select 'T6' as case_id, jsonb_array_length(search_combined('큰들', null, '두포')) as result_count;
select jsonb_pretty(search_combined('큰들', null, '두포')) as t6_result;


-- ---------------------------------------------------------------------
-- T7. 모든 파라미터 NULL → 빈 배열 ('[]')
-- ---------------------------------------------------------------------
select 'T7' as case_id,
       search_combined(null, null, null) as result,
       (search_combined(null, null, null) = '[]'::jsonb) as is_empty_array;


-- ---------------------------------------------------------------------
-- T8. 매칭 없음 → 빈 배열
-- ---------------------------------------------------------------------
select 'T8' as case_id,
       search_by_name('존재하지않는이름XYZ') as result,
       (search_by_name('존재하지않는이름XYZ') = '[]'::jsonb) as is_empty_array;


-- ---------------------------------------------------------------------
-- 추가: 비-fuzzy 모드 동작 확인 (T3' equivalent)
-- ---------------------------------------------------------------------
select 'T3-strict' as case_id,
       jsonb_array_length(search_by_name('큰들횟집', false)) as result_count;


-- ---------------------------------------------------------------------
-- 추가: 빈 문자열/공백 입력 sanitization
-- ---------------------------------------------------------------------
select
  (search_by_phone('') = '[]'::jsonb)        as phone_empty,
  (search_by_phone('--') = '[]'::jsonb)      as phone_only_separator,
  (search_by_name('') = '[]'::jsonb)         as name_empty,
  (search_by_name('  ') = '[]'::jsonb)       as name_whitespace,
  (search_by_address('') = '[]'::jsonb)      as addr_empty;


-- =====================================================================
-- 인덱스 사용 EXPLAIN ANALYZE
-- =====================================================================
-- 함수 안의 쿼리는 EXPLAIN 하기 까다로우므로 동등한 SQL 을 직접 실행해 확인.
-- pg_trgm % 연산자는 set_config 로 threshold 조정한 함수 내부 동작을 흉내내기 위해
-- 트랜잭션 로컬 GUC 설정 후 실행.

-- T1 류: 전화번호 부분일치 (digits 정규화 후 LIKE)
-- 20260520010000 마이그레이션 후로 idx_phone_numbers_phone_digits_trgm (functional GIN trgm) 사용 기대.
-- 마이그레이션 전이면 Seq Scan (~20ms / 11.6k rows) — 정상 fallback.
explain (analyze, buffers, format text)
select pn.customer_id
from public.phone_numbers pn
where regexp_replace(pn.phone, '\D', '', 'g') like '%01083317617%';


-- T5 류: 주소 ILIKE (trigram GIN 인덱스 사용 기대)
explain (analyze, buffers, format text)
select a.customer_id
from public.addresses a
where a.address ilike '%두포1길%';


-- 보너스: name % 연산자 (T3 류) — trigram GIN 사용 기대
set local pg_trgm.similarity_threshold = 0.1;
explain (analyze, buffers, format text)
select c.id, similarity(c.name, '큰들') as score
from public.customers c
where c.name % '큰들'
order by score desc
limit 50;
