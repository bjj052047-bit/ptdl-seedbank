import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[PTDL] Supabase 환경변수가 설정되지 않았습니다. .env.local (로컬) 또는 Vercel 환경변수(배포)를 확인하세요.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);