import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useProfile } from '../../lib/useProfile';
import Nav from '../../components/Nav';
import { useLang } from '../../lib/i18n';
import {
  CATEGORIES, CATEGORY_COLOR, STATUS_COLOR, PAGE_SIZE, Badge, fmtListDate,
} from '../../lib/board';

// 게시판 목록: 상단 고정 공지 → 일반 글(최신순), 분류 탭, 검색, 페이지 번호
export default function BoardListPage() {
  const router = useRouter();
  const { t } = useLang();
  const { session, profile, isStaff, isSupervisor, isDeveloper, loading } = useProfile();

  // 분류·검색·페이지는 주소(?cat=&q=&page=)에 저장 → 글을 보고 '목록'으로 돌아와도 그대로
  const cat = typeof router.query.cat === 'string' ? router.query.cat : 'all';
  const q = typeof router.query.q === 'string' ? router.query.q : '';
  const page = Math.max(1, parseInt(router.query.page, 10) || 1);

  const [searchField, setSearchField] = useState('title_body');
  const [searchInput, setSearchInput] = useState('');
  const [pinned, setPinned] = useState([]);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); return; }
    if (profile.status !== 'approved') router.replace('/pending');
  }, [session, profile, loading, router]);

  useEffect(() => {
    if (!router.isReady) return;
    setSearchInput(q);
    const f = router.query.f;
    if (f === 'title' || f === 'author' || f === 'title_body') setSearchField(f);
  }, [router.isReady, q, router.query.f]);

  const load = useCallback(async () => {
    setBusy(true);
    setLoadErr('');
    const cols = 'id, category, title, author_name, is_pinned, suggestion_status, attachments, view_count, comment_count, created_at';
    const field = typeof router.query.f === 'string' ? router.query.f : 'title_body';
    // 검색어 안의 쉼표·괄호는 검색 문법과 겹치므로 공백으로 바꿈
    const term = q.trim().replace(/[,()%]/g, ' ');

    function applyFilters(req) {
      if (cat !== 'all') req = req.eq('category', cat);
      if (term) {
        if (field === 'title') req = req.ilike('title', `%${term}%`);
        else if (field === 'author') req = req.ilike('author_name', `%${term}%`);
        else req = req.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
      }
      return req;
    }

    // 1) 상단 고정 글 (검색 중이 아닐 때, 첫 페이지에만)
    let pinnedRows = [];
    if (!term && page === 1) {
      let pr = supabase.from('board_posts').select(cols).eq('is_pinned', true).order('created_at', { ascending: false });
      if (cat !== 'all') pr = pr.eq('category', cat);
      const { data } = await pr;
      pinnedRows = data || [];
    }

    // 2) 일반 글 (고정 글은 위에서 보여주므로 제외)
    let req = supabase.from('board_posts').select(cols, { count: 'exact' });
    req = applyFilters(req);
    if (!term) req = req.eq('is_pinned', false);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await req.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);

    if (error) setLoadErr(error.message);
    setPinned(pinnedRows);
    setPosts(data || []);
    setTotal(count || 0);
    setBusy(false);
  }, [cat, q, page, router.query.f]);

  useEffect(() => {
    if (router.isReady && session && profile?.status === 'approved') load();
  }, [router.isReady, session, profile, load]);

  function go(params) {
    const next = { cat, q, f: searchField, page: 1, ...params };
    const query = {};
    if (next.cat && next.cat !== 'all') query.cat = next.cat;
    if (next.q) { query.q = next.q; query.f = next.f; }
    if (next.page > 1) query.page = next.page;
    router.push({ pathname: '/board', query });
  }

  function handleSearch(e) {
    e.preventDefault();
    go({ q: searchInput.trim(), page: 1 });
  }

  if (loading || !session || !profile) return <div className="wrap"><p>{t('common.loading')}</p></div>;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNums = [];
  const startPage = Math.floor((page - 1) / 10) * 10 + 1;
  for (let p = startPage; p <= Math.min(totalPages, startPage + 9); p++) pageNums.push(p);

  function renderRow(p, numLabel, isPinnedRow) {
    const fileCount = Array.isArray(p.attachments) ? p.attachments.length : 0;
    return (
      <tr key={(isPinnedRow ? 'pin-' : '') + p.id} className={isPinnedRow ? 'board-pinned' : ''}
        onClick={() => router.push(`/board/${p.id}`)} style={{ cursor: 'pointer' }}>
        <td className="board-num">
          {isPinnedRow ? <Badge colors={CATEGORY_COLOR.notice}>{t('board.pinned')}</Badge> : numLabel}
        </td>
        <td className="board-hide-sm"><Badge colors={CATEGORY_COLOR[p.category]}>{t(`board.cat.${p.category}`)}</Badge></td>
        <td className="board-title-cell">
          <Link href={`/board/${p.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: isPinnedRow ? 700 : 500 }}>
            {p.title}
          </Link>
          {p.comment_count > 0 && <span style={{ color: 'var(--plum)', fontSize: 12, fontWeight: 700, marginLeft: 6 }}>[{p.comment_count}]</span>}
          {fileCount > 0 && <span title={t('board.hasFiles')} style={{ fontSize: 12, marginLeft: 6 }}>📎</span>}
          {p.category === 'suggestion' && p.suggestion_status && (
            <span style={{ marginLeft: 8 }}><Badge colors={STATUS_COLOR[p.suggestion_status]}>{t(`board.status.${p.suggestion_status}`)}</Badge></span>
          )}
          <div className="board-show-sm" style={{ fontSize: 11.5, color: '#847d68', marginTop: 3 }}>
            {t(`board.cat.${p.category}`)} · {p.author_name} · {fmtListDate(p.created_at)}
          </div>
        </td>
        <td className="board-hide-sm">{p.author_name}</td>
        <td className="board-hide-sm" style={{ whiteSpace: 'nowrap' }}>{fmtListDate(p.created_at)}</td>
        <td className="board-hide-sm" style={{ textAlign: 'center' }}>{p.view_count}</td>
      </tr>
    );
  }

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} isDeveloper={isDeveloper} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <h3 className="serif" style={{ margin: 0 }}>{t('board.title')}</h3>
          <div style={{ fontSize: 12.5, color: '#847d68', marginTop: 4 }}>{t('board.subtitle')}</div>
        </div>
        <Link href="/board/write" className="btn btn-primary" style={{ textDecoration: 'none' }}>{t('board.write')}</Link>
      </div>

      {/* 분류 탭 */}
      <div className="board-cats">
        {['all', ...CATEGORIES].map((c) => (
          <button key={c} type="button" className={cat === c ? 'active' : ''} onClick={() => go({ cat: c, q: '', page: 1 })}>
            {c === 'all' ? t('board.cat.all') : t(`board.cat.${c}`)}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12.5, color: '#5c574a', margin: '10px 0 8px' }}>
        {q ? t('board.searchResult', { q, n: total }) : t('board.totalCount', { n: total })}
      </div>

      <table className="board-table">
        <thead>
          <tr>
            <th className="board-num">{t('board.col.num')}</th>
            <th className="board-hide-sm" style={{ width: 90 }}>{t('board.col.cat')}</th>
            <th>{t('board.col.title')}</th>
            <th className="board-hide-sm" style={{ width: 100 }}>{t('board.col.author')}</th>
            <th className="board-hide-sm" style={{ width: 100 }}>{t('board.col.date')}</th>
            <th className="board-hide-sm" style={{ width: 60, textAlign: 'center' }}>{t('board.col.views')}</th>
          </tr>
        </thead>
        <tbody>
          {busy ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 30 }}>{t('common.loading')}</td></tr>
          ) : loadErr ? (
            <tr><td colSpan={6} style={{ color: 'var(--danger)', padding: 20 }}>{t('board.err.load', { msg: loadErr })}</td></tr>
          ) : pinned.length === 0 && posts.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 30 }}>{q ? t('board.noResult') : t('board.empty')}</td></tr>
          ) : (
            <>
              {pinned.map((p) => renderRow(p, null, true))}
              {posts.map((p, i) => renderRow(p, total - (page - 1) * PAGE_SIZE - i, false))}
            </>
          )}
        </tbody>
      </table>

      {/* 페이지 번호 */}
      {totalPages > 1 && (
        <div className="board-pager">
          <button type="button" disabled={startPage === 1} onClick={() => go({ page: startPage - 1 })}>‹</button>
          {pageNums.map((p) => (
            <button type="button" key={p} className={p === page ? 'active' : ''} onClick={() => go({ page: p })}>{p}</button>
          ))}
          <button type="button" disabled={startPage + 9 >= totalPages} onClick={() => go({ page: startPage + 10 })}>›</button>
        </div>
      )}

      {/* 검색 */}
      <form onSubmit={handleSearch} className="board-search">
        <select value={searchField} onChange={(e) => setSearchField(e.target.value)} style={{ width: 120 }}>
          <option value="title_body">{t('board.search.titleBody')}</option>
          <option value="title">{t('board.search.title')}</option>
          <option value="author">{t('board.search.author')}</option>
        </select>
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t('board.search.placeholder')} />
        <button className="btn btn-ghost" type="submit" style={{ padding: '8px 16px' }}>{t('board.search.button')}</button>
        {q && <button className="btn btn-ghost" type="button" style={{ padding: '8px 12px' }} onClick={() => go({ q: '', page: 1 })}>{t('board.search.reset')}</button>}
      </form>
    </div>
  );
}
