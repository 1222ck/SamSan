-- =====================================================================
-- 고객 검색 RPC 함수 (search_by_phone / search_by_name / search_by_address / search_combined)
-- =====================================================================
-- 작성: 2026-05-20
--
-- 목적
--   주유소 사무실/배달원이 이름·전화·주소로 가구 단위 검색을 수행하도록
--   백엔드 RPC 4종을 제공한다.
--
-- 공통 설계
--   * SECURITY INVOKER (호출자 권한, RLS 그대로 적용)
--   * STABLE          (조회 전용, 옵티마이저 친화)
--   * 반환은 JSONB 단일 컬럼. 형태:
--       [
--         {
--           "customer_id": uuid,
--           "name": text,
--           "type": text,            -- enum customer_type → text
--           "memo": text,
--           "raw_row_no": int,
--           "phones":    [{ phone, label }, ...],
--           "addresses": [{ address, fuel_type }, ...],
--           "match_score": numeric   -- pg_trgm similarity 또는 ILIKE면 1.0
--         },
--         ...
--       ]
--   * LIMIT 50, match_score DESC 정렬
--   * 빈 결과는 '[]'::jsonb (NULL 아님)
--   * 가구 그룹핑은 헬퍼(_search_results_json)에서 jsonb_agg + 인덱스 서브쿼리로 처리
--
-- 인덱스 의존 (이미 존재)
--   idx_customers_name_trgm           GIN (name gin_trgm_ops)
--   idx_phone_numbers_phone_trgm      GIN (phone gin_trgm_ops)
--   idx_phone_numbers_label_trgm      GIN (label gin_trgm_ops)
--   idx_addresses_address_trgm        GIN (address gin_trgm_ops)
--   idx_phone_numbers_customer_id     btree
--   idx_addresses_customer_id         btree
--
-- 비파괴: CREATE OR REPLACE FUNCTION 만 사용. 테이블/인덱스 변경 없음.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 헬퍼: 매칭 (customer_id, score) 페어 목록 → 가구 단위 JSONB 배열
-- ---------------------------------------------------------------------
-- 입력 형식: [{"id":"<uuid>","score":<numeric>}, ...]
-- LIMIT 50 / 정렬은 호출 측에서 처리. 헬퍼는 매칭된 customer만 받아 펼친다.
-- phones/addresses 는 customer_id 인덱스로 잡히는 스칼라 서브쿼리.
-- 결과 정렬은 score DESC, 동률이면 name ASC.
create or replace function public._search_results_json(p_matches jsonb)
returns jsonb
language sql
stable
security invoker
as $$
  with input as (
    select
      (elem->>'id')::uuid       as customer_id,
      (elem->>'score')::numeric as score
    from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) elem
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'customer_id', c.id,
        'name',        c.name,
        'type',        c.type::text,
        'memo',        c.memo,
        'raw_row_no',  c.raw_row_no,
        'phones', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object('phone', pn.phone, 'label', pn.label)
              order by pn.created_at
            ),
            '[]'::jsonb
          )
          from public.phone_numbers pn
          where pn.customer_id = c.id
        ),
        'addresses', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object('address', a.address, 'fuel_type', a.fuel_type::text)
              order by a.created_at
            ),
            '[]'::jsonb
          )
          from public.addresses a
          where a.customer_id = c.id
        ),
        'match_score', i.score
      )
      order by i.score desc nulls last, c.name asc
    ),
    '[]'::jsonb
  )
  from input i
  join public.customers c on c.id = i.customer_id;
$$;

comment on function public._search_results_json(jsonb) is
  '내부 헬퍼. (customer_id, score) JSONB 배열을 받아 가구 단위 결과 JSONB로 빌드.';


-- ---------------------------------------------------------------------
-- 1) search_by_phone(query_digits)
-- ---------------------------------------------------------------------
-- 입력: 숫자만('01083317617') 또는 하이픈 포함('010-8331-7617')
-- 내부: regexp_replace로 양쪽 모두 숫자만 비교
-- 인덱스: idx_phone_numbers_phone_trgm 은 '하이픈 포함' 원본에 걸려 있음.
--         숫자만 정규화 후 LIKE는 trigram 인덱스를 못 탈 수 있어 11k row 시퀀스 스캔이 될 수 있음.
--         11k 수준에서는 수 ms 내 응답이므로 실용상 허용. 추후 functional 인덱스 추가 가능.
-- 점수: 부분일치이므로 일률 1.0
create or replace function public.search_by_phone(query_digits text)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_digits  text;
  v_matches jsonb;
begin
  v_digits := regexp_replace(coalesce(query_digits, ''), '\D', '', 'g');
  if length(v_digits) = 0 then
    return '[]'::jsonb;
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object('id', customer_id, 'score', 1.0)),
           '[]'::jsonb
         )
  into v_matches
  from (
    select distinct pn.customer_id
    from public.phone_numbers pn
    where regexp_replace(pn.phone, '\D', '', 'g') like '%' || v_digits || '%'
    limit 50
  ) t;

  return public._search_results_json(v_matches);
end;
$$;

comment on function public.search_by_phone(text) is
  '전화번호 부분일치 검색. 입력은 하이픈/숫자 모두 허용. 매칭된 phone이 속한 가구 전체 반환 (max 50).';


-- ---------------------------------------------------------------------
-- 2) search_by_name(query_name, fuzzy DEFAULT TRUE)
-- ---------------------------------------------------------------------
-- 입력: 가구 대표명 또는 가구원 이름
-- 매칭 대상: customers.name UNION phone_numbers.label
-- fuzzy=TRUE  → pg_trgm `%` 연산자 (trigram GIN 인덱스 사용)
--               한글 단어는 trigram similarity 가 낮게 나오므로 threshold 0.1 로 인하
-- fuzzy=FALSE → ILIKE (trigram 인덱스를 substring 형태로 활용 가능)
-- 점수: fuzzy면 similarity(target, query), 아니면 1.0
create or replace function public.search_by_name(
  query_name text,
  fuzzy      boolean default true
)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_query   text;
  v_matches jsonb;
begin
  v_query := nullif(trim(coalesce(query_name, '')), '');
  if v_query is null then
    return '[]'::jsonb;
  end if;

  if fuzzy then
    -- 한글 trigram recall 확보 (트랜잭션 한정)
    perform set_config('pg_trgm.similarity_threshold', '0.1', true);

    select coalesce(
             jsonb_agg(jsonb_build_object('id', customer_id, 'score', score)),
             '[]'::jsonb
           )
    into v_matches
    from (
      select customer_id, max(score) as score
      from (
        select c.id as customer_id,
               similarity(c.name, v_query) as score
        from public.customers c
        where c.name % v_query
        union all
        select pn.customer_id,
               similarity(coalesce(pn.label, ''), v_query) as score
        from public.phone_numbers pn
        where pn.label is not null
          and pn.label % v_query
      ) u
      group by customer_id
      order by max(score) desc
      limit 50
    ) t;
  else
    select coalesce(
             jsonb_agg(jsonb_build_object('id', customer_id, 'score', 1.0)),
             '[]'::jsonb
           )
    into v_matches
    from (
      select distinct customer_id
      from (
        select c.id as customer_id
        from public.customers c
        where c.name ilike '%' || v_query || '%'
        union
        select pn.customer_id
        from public.phone_numbers pn
        where pn.label is not null
          and pn.label ilike '%' || v_query || '%'
      ) u
      limit 50
    ) t;
  end if;

  return public._search_results_json(v_matches);
end;
$$;

comment on function public.search_by_name(text, boolean) is
  '이름/가게명 검색. customers.name 과 phone_numbers.label 양쪽에서 매칭 (UNION). fuzzy=TRUE면 pg_trgm % 연산자(유사도, threshold 0.1), FALSE면 ILIKE. 매칭 가구 전체 반환 (max 50).';


-- ---------------------------------------------------------------------
-- 3) search_by_address(query_addr)
-- ---------------------------------------------------------------------
-- 입력: 주소 일부 ('두포1길', '포교')
-- 매칭: addresses.address ILIKE '%query%' (trigram GIN 인덱스 활용)
-- 점수: 부분일치이므로 1.0
create or replace function public.search_by_address(query_addr text)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_query   text;
  v_matches jsonb;
begin
  v_query := nullif(trim(coalesce(query_addr, '')), '');
  if v_query is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object('id', customer_id, 'score', 1.0)),
           '[]'::jsonb
         )
  into v_matches
  from (
    select distinct a.customer_id
    from public.addresses a
    where a.address ilike '%' || v_query || '%'
    limit 50
  ) t;

  return public._search_results_json(v_matches);
end;
$$;

comment on function public.search_by_address(text) is
  '주소 부분일치 검색 (ILIKE). 매칭 가구 전체 반환 (max 50).';


-- ---------------------------------------------------------------------
-- 4) search_combined(query_name, query_phone, query_address)
-- ---------------------------------------------------------------------
-- 입력: 셋 다 NULL 허용. NULL이 아닌 조건들만 AND 결합.
-- 셋 다 NULL이면 빈 배열 반환 (전체 조회 차단).
--
-- 실행 전략 (DoS 위험 회피):
--   가장 selective한 필터를 primary scan으로 잡고 나머지는 EXISTS 필터로 적용.
--   name > phone > address 순으로 primary 선택.
--     - name 은 trigram GIN 으로 신속 후보 추출 가능 + threshold 0.1
--     - phone 은 정규화 후 LIKE (인덱스 미사용일 수 있으나 11k 수준 OK)
--     - address 단독은 trigram ILIKE
--
-- 점수: name primary면 similarity, 그 외 1.0
create or replace function public.search_combined(
  query_name    text,
  query_phone   text,
  query_address text
)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_name         text;
  v_phone_digits text;
  v_addr         text;
  v_matches      jsonb;
begin
  v_name         := nullif(trim(coalesce(query_name, '')), '');
  v_addr         := nullif(trim(coalesce(query_address, '')), '');
  v_phone_digits := nullif(regexp_replace(coalesce(query_phone, ''), '\D', '', 'g'), '');

  -- 모든 조건 NULL이면 전체 조회 차단
  if v_name is null and v_phone_digits is null and v_addr is null then
    return '[]'::jsonb;
  end if;

  perform set_config('pg_trgm.similarity_threshold', '0.1', true);

  if v_name is not null then
    -- name 매칭 후보를 primary로, 나머지는 customer_id 인덱스 EXISTS
    select coalesce(
             jsonb_agg(jsonb_build_object('id', customer_id, 'score', score)),
             '[]'::jsonb
           )
    into v_matches
    from (
      select nc.customer_id, nc.score
      from (
        select customer_id, max(score) as score
        from (
          select c.id as customer_id,
                 similarity(c.name, v_name) as score
          from public.customers c
          where c.name % v_name
          union all
          select pn.customer_id,
                 similarity(coalesce(pn.label, ''), v_name) as score
          from public.phone_numbers pn
          where pn.label is not null
            and pn.label % v_name
        ) u
        group by customer_id
      ) nc
      where (
        v_phone_digits is null
        or exists (
          select 1
          from public.phone_numbers pn
          where pn.customer_id = nc.customer_id
            and regexp_replace(pn.phone, '\D', '', 'g') like '%' || v_phone_digits || '%'
        )
      )
      and (
        v_addr is null
        or exists (
          select 1
          from public.addresses a
          where a.customer_id = nc.customer_id
            and a.address ilike '%' || v_addr || '%'
        )
      )
      order by nc.score desc
      limit 50
    ) t;

  elsif v_phone_digits is not null then
    -- phone 매칭이 primary
    select coalesce(
             jsonb_agg(jsonb_build_object('id', customer_id, 'score', 1.0)),
             '[]'::jsonb
           )
    into v_matches
    from (
      select distinct pn.customer_id
      from public.phone_numbers pn
      where regexp_replace(pn.phone, '\D', '', 'g') like '%' || v_phone_digits || '%'
        and (
          v_addr is null
          or exists (
            select 1
            from public.addresses a
            where a.customer_id = pn.customer_id
              and a.address ilike '%' || v_addr || '%'
          )
        )
      limit 50
    ) t;

  else
    -- v_addr 단독
    select coalesce(
             jsonb_agg(jsonb_build_object('id', customer_id, 'score', 1.0)),
             '[]'::jsonb
           )
    into v_matches
    from (
      select distinct a.customer_id
      from public.addresses a
      where a.address ilike '%' || v_addr || '%'
      limit 50
    ) t;
  end if;

  return public._search_results_json(v_matches);
end;
$$;

comment on function public.search_combined(text, text, text) is
  '복합 검색. NULL 파라미터 무시. 모든 파라미터가 NULL이면 빈 배열 반환(전체 조회 차단). NULL 아닌 조건들은 AND. primary scan은 name > phone > address 우선순위로 결정. (max 50)';


-- =====================================================================
-- 권한
-- =====================================================================
-- RLS는 호출자 권한으로 평가됨(SECURITY INVOKER). 함수 EXECUTE 권한만 부여.
-- ai_query_role은 read-only Text-to-SQL 용이므로 RPC 호출 권한 부여하지 않음.
grant execute on function public.search_by_phone(text)             to authenticated;
grant execute on function public.search_by_name(text, boolean)     to authenticated;
grant execute on function public.search_by_address(text)           to authenticated;
grant execute on function public.search_combined(text, text, text) to authenticated;
-- 헬퍼는 외부 직접 호출 불필요 → authenticated에 부여하지 않음 (RPC에서만 invoke).
