-- ============================================================
-- PTDL 종자실 재고 관리 시스템 - 데이터베이스 스키마
-- Supabase SQL Editor에 이 파일 전체를 붙여넣고 실행하세요.
-- ============================================================

-- 확장 기능 (UUID 생성용, Supabase는 기본 활성화되어 있음)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. profiles: 로그인한 사용자의 이름·역할(담당자/연구원)
--    auth.users(Supabase 내장 로그인 테이블)와 1:1로 연결됨
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  role text not null default 'researcher' check (role in ('staff','researcher','supervisor')),
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 2. seeds: 종자 마스터 데이터 (검색/조회, 계보의 대상)
-- ------------------------------------------------------------
create table if not exists seeds (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  crop text,
  variety text,
  sci_name text,
  harvest_year text,
  location text,
  qty_g numeric not null default 0,
  origin text,
  origin_year text,
  region text,
  parent_code text references seeds(code) on delete set null,
  individual_number text,
  generation text,
  pedigree text,
  fixed_line boolean not null default false,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_seeds_code on seeds (code);
create index if not exists idx_seeds_parent on seeds (parent_code);

-- ------------------------------------------------------------
-- 3. seed_transactions: 입출고 기록 (실시간 재고 반영 로그)
-- ------------------------------------------------------------
create table if not exists seed_transactions (
  id uuid primary key default gen_random_uuid(),
  seed_id uuid references seeds(id) on delete cascade not null,
  type text not null check (type in ('초기등록','입고','출고','정정')),
  qty numeric not null,
  qty_after numeric not null,
  by_user uuid references profiles(id),
  by_name text,
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_tx_seed on seed_transactions (seed_id);

-- ------------------------------------------------------------
-- 4. seed_requests: 종자 요청 (연구원 요청 → 담당자 처리)
-- ------------------------------------------------------------
create table if not exists seed_requests (
  id uuid primary key default gen_random_uuid(),
  seed_id uuid references seeds(id) on delete cascade not null,
  requester_id uuid references profiles(id) not null,
  requester_name text not null,
  qty_requested numeric not null,
  status text not null default 'pending' check (status in ('pending','approved','fulfilled','rejected')),
  note text,
  processed_by uuid references profiles(id),
  processed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_req_status on seed_requests (status);

-- ============================================================
-- Row Level Security (RLS): 실제 서버가 강제하는 접근 권한
-- ============================================================
alter table profiles enable row level security;
alter table seeds enable row level security;
alter table seed_transactions enable row level security;
alter table seed_requests enable row level security;

-- profiles: 로그인한 사람이면 누구나 이름 목록을 볼 수 있음, 본인 것만 수정 가능
create policy "profiles_select_all" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_insert_self" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_self_name_only" on profiles for update using (auth.uid() = id);

-- seeds: 로그인한 사람이면 누구나 조회 가능, 등록·수정·삭제는 담당자(staff)만
create policy "seeds_select_authenticated" on seeds for select using (auth.role() = 'authenticated');
create policy "seeds_insert_staff" on seeds for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'staff')
);
create policy "seeds_update_staff" on seeds for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'staff')
);
create policy "seeds_delete_staff" on seeds for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'staff')
);

-- seed_transactions: 누구나 조회 가능, 기록(입출고 처리)은 담당자만
create policy "tx_select_authenticated" on seed_transactions for select using (auth.role() = 'authenticated');
create policy "tx_insert_staff" on seed_transactions for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'staff')
);

-- seed_requests: 누구나 조회 가능, 요청 등록은 본인 이름으로만, 상태 변경(처리)은 담당자만
create policy "req_select_authenticated" on seed_requests for select using (auth.role() = 'authenticated');
create policy "req_insert_self" on seed_requests for insert with check (auth.uid() = requester_id);
create policy "req_update_staff" on seed_requests for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'staff')
);

-- ============================================================
-- 마이그레이션: 승인자(supervisor) 역할 및 승인 워크플로우 추가
-- 흐름: 연구원 요청(pending) -> 승인자 승인(approved)/거절(rejected)
--       -> 담당자가 승인된 건만 처리(fulfilled)
-- ============================================================

-- 역할에 supervisor 추가
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('staff','researcher','supervisor'));

-- 요청 상태에 approved 추가 + 승인 정보 컬럼
alter table seed_requests drop constraint if exists seed_requests_status_check;
alter table seed_requests add constraint seed_requests_status_check check (status in ('pending','approved','fulfilled','rejected'));
alter table seed_requests add column if not exists approved_by uuid references profiles(id);
alter table seed_requests add column if not exists approved_at timestamptz;

-- 요청 상태 변경(승인/거절/처리)은 담당자뿐 아니라 승인자도 할 수 있도록 정책 교체
drop policy if exists "req_update_staff" on seed_requests;
drop policy if exists "req_update_staff_or_supervisor" on seed_requests;
create policy "req_update_staff_or_supervisor" on seed_requests for update using (
  exists (select 1 from profiles where id = auth.uid() and role in ('staff','supervisor'))
);

-- ============================================================
-- 마이그레이션: 종자 요청에 수량 단위(g/립) 추가
-- 이미 schema.sql을 실행한 적이 있다면, 아래 부분만 SQL Editor에서 추가로 실행하세요.
-- ============================================================
alter table seed_requests add column if not exists qty_unit text not null default 'g' check (qty_unit in ('g','립'));

-- ============================================================
-- 테이블 접근 권한 (GRANT)
-- Supabase 프로젝트 생성 시 "Automatically expose new tables"를 꺼두었다면
-- (권장 설정입니다) 아래 GRANT 구문이 반드시 필요합니다.
-- RLS 정책은 "행 단위" 권한이고, 이 GRANT는 그 이전 단계인 "테이블 자체 접근 권한"입니다.
-- ============================================================
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.seeds to authenticated;
grant select, insert, update, delete on public.seed_transactions to authenticated;
grant select, insert, update, delete on public.seed_requests to authenticated;

-- ============================================================
-- 참고: 처음 가입한 사람은 모두 'researcher'(연구원)로 시작합니다.
-- 담당자를 지정하려면, Supabase 대시보드 > Table Editor > profiles 테이블에서
-- 해당 계정의 role 값을 'researcher' -> 'staff' 로 직접 바꿔주세요.
-- (이 작업은 프로젝트 소유자만 할 수 있어 안전합니다)
-- ============================================================

-- ============================================================
-- 마이그레이션: 연구실 통합 포털 확장
--  1) 가입 승인 시스템 (profiles.status)
--  2) 실험실 예약 시스템 (labs, lab_reservations)
-- 이미 위쪽 schema.sql을 한 번 실행한 적이 있다면,
-- Supabase SQL Editor에 이 블록부터 끝까지만 새로 붙여넣고 실행하면 됩니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 가입 승인 시스템
-- ------------------------------------------------------------

-- 이메일도 같이 저장해서, 관리자가 승인 화면에서 "누가 가입했는지" 알아보기 쉽게 함
alter table profiles add column if not exists email text;

-- 가입 승인 상태: pending(대기) -> approved(승인) 또는 rejected(거절)
alter table profiles add column if not exists status text not null default 'pending';
alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check check (status in ('pending','approved','rejected'));

-- 이미 활동 중이던 기존 계정들은 이번 마이그레이션으로 막히지 않도록 한 번만 승인 처리
-- (이 UPDATE는 지금 한 번만 실행되면 되고, 이후 새로 가입하는 사람만 'pending'으로 시작합니다)
update profiles set status = 'approved' where status = 'pending';

-- 담당자(staff)·승인자(supervisor)는 다른 사람의 가입 상태를 승인/거절할 수 있어야 함
drop policy if exists "profiles_update_status_by_admin" on profiles;
create policy "profiles_update_status_by_admin" on profiles for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','supervisor'))
);

-- ------------------------------------------------------------
-- 2) labs: 실험실 목록
-- ------------------------------------------------------------
create table if not exists labs (
  id text primary key,   -- '405B' / '311C'
  name text not null
);
insert into labs (id, name) values
  ('405B', '405B 실험실'),
  ('311C', '311C 실험실')
on conflict (id) do nothing;

alter table labs enable row level security;
drop policy if exists "labs_select_authenticated" on labs;
create policy "labs_select_authenticated" on labs for select using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 3) lab_reservations: 실험실 예약 (1시간 단위 슬롯)
-- ------------------------------------------------------------
create extension if not exists btree_gist;

create table if not exists lab_reservations (
  id uuid primary key default gen_random_uuid(),
  lab_id text references labs(id) not null,
  reservation_date date not null,
  start_hour int not null check (start_hour >= 0 and start_hour <= 23),
  end_hour int not null check (end_hour > start_hour and end_hour <= 24),
  user_id uuid references profiles(id) not null,
  user_name text not null,
  purpose text,
  created_at timestamptz default now()
);
create index if not exists idx_resv_lab_date on lab_reservations (lab_id, reservation_date);

-- 같은 실험실 + 같은 날짜 + 겹치는 시간대 예약을 DB 차원에서 원천 차단
-- (한 슬롯 = 한 팀만 사용 가능하다는 규칙을 서버가 강제)
alter table lab_reservations drop constraint if exists no_overlap;
alter table lab_reservations add constraint no_overlap exclude using gist (
  lab_id with =,
  reservation_date with =,
  int4range(start_hour, end_hour) with &&
);

alter table lab_reservations enable row level security;

drop policy if exists "resv_select_authenticated" on lab_reservations;
create policy "resv_select_authenticated" on lab_reservations for select using (auth.role() = 'authenticated');

-- 예약 등록은 승인된(approved) 사용자가 본인 이름으로만 가능
drop policy if exists "resv_insert_self_approved" on lab_reservations;
create policy "resv_insert_self_approved" on lab_reservations for insert with check (
  auth.uid() = user_id
  and exists (select 1 from profiles where id = auth.uid() and status = 'approved')
);

-- 예약 취소(삭제)는 본인 또는 담당자/승인자만 가능
drop policy if exists "resv_delete_self_or_admin" on lab_reservations;
create policy "resv_delete_self_or_admin" on lab_reservations for delete using (
  auth.uid() = user_id
  or exists (select 1 from profiles where id = auth.uid() and role in ('staff','supervisor'))
);

grant usage on schema public to authenticated, anon;
grant select on public.labs to authenticated;
grant select, insert, delete on public.lab_reservations to authenticated;
grant select, update on public.profiles to authenticated;
-- ============================================================