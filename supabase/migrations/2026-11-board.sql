-- ============================================================
-- 마이그레이션 (2026-11): 게시판 (공지사항 · 수정 제안 · 질문 · 자유)
-- Supabase > SQL Editor에 이 파일 내용을 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 권한 정리
--   - 글 보기 / 글쓰기 / 댓글: 가입 승인된 모든 사용자
--   - 글 수정·삭제: 작성자 본인 + 관리자(종자실 담당자·승인자·개발자)
--   - 공지 분류로 쓰기, 상단 고정, 수정 제안 진행상태 변경: 관리자만
-- ============================================================

-- ------------------------------------------------------------
-- 0) 도우미 함수
-- ------------------------------------------------------------
-- 지금 로그인한 사람이 가입 승인된 사용자인지
create or replace function public.is_approved_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved');
$$;

-- 지금 로그인한 사람이 게시판 관리자(종자실 담당자·승인자·개발자)인지
create or replace function public.is_board_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'approved' and role in ('staff','supervisor','developer')
  );
$$;

-- ------------------------------------------------------------
-- 1) 게시글
-- ------------------------------------------------------------
create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'general'
    check (category in ('notice','suggestion','question','general')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '',
  author_id uuid not null default auth.uid() references public.profiles(id),
  author_name text not null default '',
  is_pinned boolean not null default false,
  -- 수정 제안 진행상태: received(접수) / reviewing(검토중) / done(반영완료) / hold(보류)
  suggestion_status text check (suggestion_status in ('received','reviewing','done','hold')),
  -- 첨부파일 목록: [{ "path": "...", "name": "원래파일명.pdf", "size": 1234, "type": "application/pdf" }]
  attachments jsonb not null default '[]'::jsonb,
  view_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_board_posts_list on public.board_posts (is_pinned desc, created_at desc);
create index if not exists idx_board_posts_category on public.board_posts (category, created_at desc);

-- ------------------------------------------------------------
-- 2) 댓글
-- ------------------------------------------------------------
create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id),
  author_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_board_comments_post on public.board_comments (post_id, created_at);

-- ------------------------------------------------------------
-- 3) 서버가 강제하는 규칙 (화면을 우회해도 지켜짐)
-- ------------------------------------------------------------
-- 게시글 저장 전 검사
create or replace function public.board_posts_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin boolean := public.is_board_admin();
begin
  -- 조회수·댓글수 자동 갱신(아래 함수들)은 검사 없이 통과
  if current_setting('board.internal', true) = '1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 작성자 이름은 프로필에서 가져옴 (다른 사람 이름으로 쓰기 방지)
    new.author_id := auth.uid();
    new.author_name := coalesce((select name from profiles where id = auth.uid()), '');
    new.view_count := 0;
    new.comment_count := 0;
    if not admin then
      if new.category = 'notice' then
        raise exception '공지 분류는 관리자만 쓸 수 있습니다.';
      end if;
      new.is_pinned := false;
      new.suggestion_status := null;
    end if;
    if new.category = 'suggestion' and new.suggestion_status is null then
      new.suggestion_status := 'received';
    end if;
    if new.category <> 'suggestion' then
      new.suggestion_status := null;
    end if;
    return new;
  end if;

  -- UPDATE: 작성자·조회수·댓글수·작성일은 바꿀 수 없음
  new.author_id := old.author_id;
  new.author_name := old.author_name;
  new.view_count := old.view_count;
  new.comment_count := old.comment_count;
  new.created_at := old.created_at;
  new.updated_at := now();
  if not admin then
    if new.category = 'notice' and old.category <> 'notice' then
      raise exception '공지 분류는 관리자만 쓸 수 있습니다.';
    end if;
    new.is_pinned := old.is_pinned;
    new.suggestion_status := old.suggestion_status;
  end if;
  if new.category = 'suggestion' and new.suggestion_status is null then
    new.suggestion_status := 'received';
  end if;
  if new.category <> 'suggestion' then
    new.suggestion_status := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_board_posts_guard on public.board_posts;
create trigger trg_board_posts_guard
  before insert or update on public.board_posts
  for each row execute function public.board_posts_guard();

-- 댓글 저장 전: 작성자 이름을 프로필에서 가져옴
create or replace function public.board_comments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := coalesce((select name from profiles where id = auth.uid()), '');
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.post_id := old.post_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_board_comments_guard on public.board_comments;
create trigger trg_board_comments_guard
  before insert or update on public.board_comments
  for each row execute function public.board_comments_guard();

-- 댓글이 달리거나 지워지면 게시글의 댓글 수 갱신
create or replace function public.board_comments_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.post_id, old.post_id);
begin
  perform set_config('board.internal', '1', true);
  update board_posts
     set comment_count = (select count(*) from board_comments where post_id = pid)
   where id = pid;
  perform set_config('board.internal', '0', true);
  return null;
end;
$$;

drop trigger if exists trg_board_comments_count on public.board_comments;
create trigger trg_board_comments_count
  after insert or delete on public.board_comments
  for each row execute function public.board_comments_count();

-- 조회수 1 올리기 (글을 열 때 화면에서 호출)
create or replace function public.increment_board_view(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_approved_user() then return; end if;
  perform set_config('board.internal', '1', true);
  update board_posts set view_count = view_count + 1 where id = p_post_id;
  perform set_config('board.internal', '0', true);
end;
$$;

-- ------------------------------------------------------------
-- 4) 행 단위 권한 (RLS)
-- ------------------------------------------------------------
alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;

drop policy if exists "board_posts_select" on public.board_posts;
create policy "board_posts_select" on public.board_posts for select
  using (public.is_approved_user());

drop policy if exists "board_posts_insert" on public.board_posts;
create policy "board_posts_insert" on public.board_posts for insert
  with check (public.is_approved_user());

drop policy if exists "board_posts_update" on public.board_posts;
create policy "board_posts_update" on public.board_posts for update
  using (author_id = auth.uid() or public.is_board_admin());

drop policy if exists "board_posts_delete" on public.board_posts;
create policy "board_posts_delete" on public.board_posts for delete
  using (author_id = auth.uid() or public.is_board_admin());

drop policy if exists "board_comments_select" on public.board_comments;
create policy "board_comments_select" on public.board_comments for select
  using (public.is_approved_user());

drop policy if exists "board_comments_insert" on public.board_comments;
create policy "board_comments_insert" on public.board_comments for insert
  with check (public.is_approved_user());

drop policy if exists "board_comments_update" on public.board_comments;
create policy "board_comments_update" on public.board_comments for update
  using (author_id = auth.uid());

drop policy if exists "board_comments_delete" on public.board_comments;
create policy "board_comments_delete" on public.board_comments for delete
  using (author_id = auth.uid() or public.is_board_admin());

grant select, insert, update, delete on public.board_posts to authenticated;
grant select, insert, update, delete on public.board_comments to authenticated;
grant execute on function public.increment_board_view(uuid) to authenticated;
grant execute on function public.is_approved_user() to authenticated;
grant execute on function public.is_board_admin() to authenticated;

-- ------------------------------------------------------------
-- 5) 첨부파일 저장소 (Supabase Storage)
--    - 비공개 저장소: 로그인한 사용자만 볼 수 있음
--    - 파일 1개당 최대 20MB
--    - 각자 자기 폴더(사용자ID/...)에만 올릴 수 있음
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('board-files', 'board-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "board_files_select" on storage.objects;
create policy "board_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'board-files' and public.is_approved_user());

drop policy if exists "board_files_insert" on storage.objects;
create policy "board_files_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'board-files'
    and public.is_approved_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "board_files_delete" on storage.objects;
create policy "board_files_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'board-files'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_board_admin())
  );
