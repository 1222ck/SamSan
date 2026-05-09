-- incoming_calls: CTI 브릿지(Python, 사무실 PC)가 전화 수신 시 insert
-- 웹 사무실 화면이 realtime 구독으로 배너 표시

create table if not exists public.incoming_calls (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  received_at timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references auth.users(id) on delete set null
);

create index if not exists incoming_calls_received_at_idx
  on public.incoming_calls (received_at desc);

create index if not exists incoming_calls_unhandled_idx
  on public.incoming_calls (received_at desc)
  where handled_at is null;

alter table public.incoming_calls enable row level security;

-- office / admin 만 조회/업데이트
drop policy if exists incoming_calls_select on public.incoming_calls;
create policy incoming_calls_select on public.incoming_calls
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('office', 'admin')
    )
  );

drop policy if exists incoming_calls_update on public.incoming_calls;
create policy incoming_calls_update on public.incoming_calls
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('office', 'admin')
    )
  );

-- insert 는 service_role(브릿지)만. RLS 활성 + insert 정책 없음 → anon/authenticated 차단됨
-- service_role 키는 RLS를 우회하므로 별도 정책 불필요

-- realtime 활성화
alter publication supabase_realtime add table public.incoming_calls;
