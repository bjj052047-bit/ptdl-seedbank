-- ============================================================
-- 마이그레이션 (2026-11): 종자 요청 취소 + 거절 사유
-- Supabase > SQL Editor에 이 파일 내용을 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
-- ============================================================

-- 1) 요청 상태에 '취소됨(cancelled)' 추가
alter table public.seed_requests drop constraint if exists seed_requests_status_check;
alter table public.seed_requests add constraint seed_requests_status_check
  check (status in ('pending','approved','fulfilled','rejected','cancelled'));

-- 2) 거절 사유 칸 추가
alter table public.seed_requests add column if not exists reject_reason text;

-- 3) 요청자 본인이 '승인 전(pending)' 요청만 '취소됨'으로 바꿀 수 있도록 허용
--    (승인된 뒤에는 status가 pending이 아니므로 서버가 거부합니다)
drop policy if exists "req_cancel_own_pending" on public.seed_requests;
create policy "req_cancel_own_pending" on public.seed_requests for update
  using (requester_id = auth.uid() and status = 'pending')
  with check (requester_id = auth.uid() and status = 'cancelled');
