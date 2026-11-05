// Supabase는 한 번 요청에 최대 1000줄까지만 돌려줍니다 (.limit(5000)을 써도 1000줄에서 잘림).
// 그래서 1000줄씩 나눠서 끝까지 모두 가져오는 도우미 함수입니다.
// 사용법: const { data, error } = await fetchAll(() => supabase.from('seeds').select('*').order('created_at', { ascending: false }).order('id'));
const PAGE = 1000;

export async function fetchAll(makeQuery) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: all, error: null };
}
