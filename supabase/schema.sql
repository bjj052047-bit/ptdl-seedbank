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
  role text not null default 'researcher' check (role in ('staff','researcher')),
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
  status text not null default 'pending' check (status in ('pending','fulfilled','rejected')),
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
-- 참고: 처음 가입한 사람은 모두 'researcher'(연구원)로 시작합니다.
-- 담당자를 지정하려면, Supabase 대시보드 > Table Editor > profiles 테이블에서
-- 해당 계정의 role 값을 'researcher' -> 'staff' 로 직접 바꿔주세요.
-- (이 작업은 프로젝트 소유자만 할 수 있어 안전합니다)
-- ============================================================
