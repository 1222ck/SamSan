-- =====================================================================
-- AI Search Phase 1: pgvector + 검색 인프라 + Excel raw 보존 + 일일 집계
-- =====================================================================
-- 작성: 2026-05-17
-- 산출물 2 (Phase 1)
-- 자동 실행 금지. Supabase Studio SQL Editor에서 직접 실행할 것.
--
-- 포함:
--   1) pgvector 확장
--   2) embeddings 테이블 + HNSW 인덱스
--   3) customer_raw_imports (거래처등록정보.xlsx 56컬럼 원본 보존)
--   4) daily_sales_summary (판매현황.xlsx 일일 집계)
--   5) ai_query_role (Text-to-SQL 전용 read-only role)
--
-- 미포함 (Phase 2~3):
--   - embeddings 자동 생성 트리거/함수
--   - Text-to-SQL 함수
--   - RAG 검색 함수
-- =====================================================================


-- =====================================================================
-- 1) pgvector 확장
-- =====================================================================
create extension if not exists vector;


-- =====================================================================
-- 2) embeddings 테이블
-- =====================================================================
-- source_type: 'customer' | 'address' | 'transaction' (Phase 1 한정)
-- source_id  : 해당 테이블 row id (FK 강제 안함 — 다형 참조이므로 application level에서 보장)
-- content    : 임베딩 원본 텍스트 (디버깅/재생성용)
-- embedding  : OpenAI text-embedding-3-small (1536-dim)
-- metadata   : 검색 시 필터에 쓸 보조 정보 (예: {"customer_id":"...","fuel_type":"등유"})

create table if not exists public.embeddings (
  id           uuid primary key default gen_random_uuid(),
  source_type  text not null check (source_type in ('customer', 'address', 'transaction')),
  source_id    uuid not null,
  content      text not null,
  embedding    vector(1536),
  metadata     jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- source 조회용 (재임베딩, 동기화 시)
create unique index if not exists embeddings_source_unique_idx
  on public.embeddings (source_type, source_id);

-- 코사인 유사도 검색 인덱스 (HNSW)
-- m=16, ef_construction=64 는 pgvector 권장 기본값. 데이터 늘면 ef_search 튜닝
create index if not exists embeddings_hnsw_cosine_idx
  on public.embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- metadata GIN (Phase 2 필터링용)
create index if not exists embeddings_metadata_gin_idx
  on public.embeddings using gin (metadata);

alter table public.embeddings enable row level security;

-- SELECT: office/admin
drop policy if exists embeddings_select on public.embeddings;
create policy embeddings_select on public.embeddings
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('office', 'admin')
    )
  );

-- INSERT/UPDATE/DELETE 정책 없음 → service_role(서버 임베딩 생성기)만 가능


-- =====================================================================
-- 3) customer_raw_imports
-- =====================================================================
-- 거래처등록정보.xlsx 56컬럼 원본을 jsonb로 통째 보존.
-- customers 와 1:1 (cascade delete).
-- UPSERT 키: (source_file, serial_no)

create table if not exists public.customer_raw_imports (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  source_file  text not null,                  -- '거래처등록정보.xlsx'
  source_row   integer,                        -- Excel 행 번호 (디버깅용, 1-based)
  serial_no    text not null,                  -- 일련번호 (예: '6286')
  raw          jsonb not null,                 -- 56컬럼 {컬럼명: 값}
  imported_at  timestamptz not null default now(),
  unique (source_file, serial_no)
);

create index if not exists customer_raw_imports_customer_idx
  on public.customer_raw_imports (customer_id);

create index if not exists customer_raw_imports_raw_gin_idx
  on public.customer_raw_imports using gin (raw);

alter table public.customer_raw_imports enable row level security;

-- admin만 접근 (민감 메모/이력 포함)
drop policy if exists customer_raw_imports_select on public.customer_raw_imports;
create policy customer_raw_imports_select on public.customer_raw_imports
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- INSERT는 service_role(import 스크립트)만


-- =====================================================================
-- 4) daily_sales_summary
-- =====================================================================
-- 판매현황.xlsx 일일 집계.
-- Excel 원본이 피벗/머지 형식이라 (date, fuel_type, sale_channel) 단위로 분해해 저장.
-- 단위는 Excel 미표기. 'L' 가정 (사용자 검증 후 변경 가능).
-- 신규 테이블이므로 enum 안 쓰고 text로 유연성 확보. import 후 분포 보고 enum화 검토.

create table if not exists public.daily_sales_summary (
  id            uuid primary key default gen_random_uuid(),
  sale_date     date not null,
  fuel_type     text not null,                  -- '무연' | '경유' | '등유' (Excel 원문)
  sale_channel  text not null,                  -- '면세-산림조합' | '면세-농협' | '면세-CD' | '면세-외상' | '면세-현금' | '가판-...' | '스탠드-...'
  quantity      numeric,                        -- 양 (단위 unit 참조)
  unit          text not null default 'L',      -- 'L' 가정
  source_file   text not null,                  -- '판매현황.xlsx'
  source_sheet  text not null,                  -- '1월25일' 등
  source_cell   text,                           -- 디버깅용 (예: 'D5')
  raw_row       jsonb,                          -- 해당 시트 행 dump (참고용)
  imported_at   timestamptz not null default now(),
  unique (sale_date, fuel_type, sale_channel)
);

create index if not exists daily_sales_summary_date_idx
  on public.daily_sales_summary (sale_date desc);

create index if not exists daily_sales_summary_fuel_channel_idx
  on public.daily_sales_summary (fuel_type, sale_channel);

alter table public.daily_sales_summary enable row level security;

-- office/admin SELECT
drop policy if exists daily_sales_summary_select on public.daily_sales_summary;
create policy daily_sales_summary_select on public.daily_sales_summary
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('office', 'admin')
    )
  );

-- INSERT는 service_role(import 스크립트)만


-- =====================================================================
-- 5) ai_query_role (Text-to-SQL 전용 read-only role)
-- =====================================================================
-- LLM이 생성한 SQL을 실행할 때 사용할 격리된 DB role.
-- nologin 으로 만들고, 서버 코드에서 SET ROLE 또는 별도 connection pool 통해 사용.
-- service_role 키는 절대 LLM 컨텍스트에 노출 금지.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ai_query_role') then
    create role ai_query_role nologin;
  end if;
end$$;

-- 일단 전체 권한 회수 (안전 baseline)
revoke all on schema public from ai_query_role;
grant usage on schema public to ai_query_role;

revoke all on all tables in schema public from ai_query_role;
revoke all on all sequences in schema public from ai_query_role;
revoke all on all functions in schema public from ai_query_role;

-- 허용 테이블 (5개): SELECT만
-- - customers, addresses, phone_numbers, transactions: 작업 지시
-- - daily_sales_summary: 사용자 확정 (일일 판매 집계 질의 가능하도록)
grant select on public.customers           to ai_query_role;
grant select on public.addresses           to ai_query_role;
grant select on public.phone_numbers       to ai_query_role;
grant select on public.transactions        to ai_query_role;
grant select on public.daily_sales_summary to ai_query_role;

-- 명시적 REVOKE (실수로 grant 되어도 차단되도록 다시 명시)
revoke all on public.deliveries            from ai_query_role;
revoke all on public.profiles              from ai_query_role;
revoke all on public.incoming_calls        from ai_query_role;
revoke all on public.embeddings            from ai_query_role;
revoke all on public.customer_raw_imports  from ai_query_role;

-- 향후 추가될 테이블은 기본적으로 권한 없게 (default privileges)
-- → 새 테이블 만들어도 ai_query_role 자동 차단
alter default privileges in schema public
  revoke all on tables   from ai_query_role;
alter default privileges in schema public
  revoke all on sequences from ai_query_role;
alter default privileges in schema public
  revoke all on functions from ai_query_role;

-- RLS: ai_query_role도 RLS 적용 받게 (BYPASS RLS 권한 없음)
-- → 추후 customers/transactions에 RLS 정책 추가 시 동일 적용됨
-- service_role 만 BYPASSRLS 가능 (Supabase 기본 설정)


-- =====================================================================
-- 검증 쿼리 (실행 후 직접 확인용, 주석 처리)
-- =====================================================================
-- select extname, extversion from pg_extension where extname = 'vector';
-- select tablename from pg_tables where schemaname = 'public' order by tablename;
-- select rolname from pg_roles where rolname = 'ai_query_role';
-- select table_name, privilege_type
--   from information_schema.role_table_grants
--   where grantee = 'ai_query_role' order by table_name;
