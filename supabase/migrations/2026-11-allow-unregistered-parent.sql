-- ============================================================
-- 마이그레이션 (2026-11): 모종자 미등록 상태로도 종자 등록 허용
-- 기존에는 parent_code가 seeds(code)를 반드시 가리켜야 해서
-- 모종자를 먼저 등록하지 않으면 저장이 거부됐습니다.
-- ============================================================
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'public.seeds'::regclass
      and con.contype = 'f'
      and att.attname = 'parent_code'
  loop
    execute format('alter table public.seeds drop constraint %I', r.conname);
  end loop;
end $$;
