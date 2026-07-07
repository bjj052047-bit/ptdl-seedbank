import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';

function cropTagClass(crop) {
  if (!crop) return 'crop-other';
  if (crop.includes('벼')) return 'crop-rice';
  if (crop.includes('밀크씨슬') || crop.includes('국화')) return 'crop-thistle';
  return 'crop-other';
}

export default function SearchPage() {
  const router = useRouter();
  const { session, profile, isStaff, loading } = useProfile();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null); // 선택된 종자 상세 (lineage 포함)
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); }
  }, [session, profile, loading, router]);

  const runSearch = useCallback(async (q) => {
    setSearching(true);
    let req = supabase.from('seeds').select('*').order('harvest_year', { ascending: false }).limit(200);
    if (q.trim()) {
      req = req.or(`code.ilike.%${q.trim()}%,variety.ilike.%${q.trim()}%`);
    }
    const { data, error } = await req;
    if (!error) setResults(data || []);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => runSearch(query), 250); // 입력 디바운스
    return () => clearTimeout(t);
  }, [query, session, runSearch]);

  async function openDetail(seed) {
    setDetailLoading(true);
    setSelected({ seed, ancestors: [], children: [], transactions: [] });

    // 조상 체인 (최대 20세대까지, 순환 참조 방지)
    const ancestors = [];
    let currentCode = seed.parent_code;
    const visited = new Set([seed.code]);
    for (let i = 0; i < 20 && currentCode; i++) {
      if (visited.has(currentCode)) break;
      visited.add(currentCode);
      const { data: parent } = await supabase.from('seeds').select('*').eq('code', currentCode).maybeSingle();
      ancestors.push({ code: currentCode, seed: parent || null });
      if (!parent) break;
      currentCode = parent.parent_code;
    }

    const { data: children } = await supabase.from('seeds').select('*').eq('parent_code', seed.code);
    const { data: transactions } = await supabase
      .from('seed_transactions')
      .select('*')
      .eq('seed_id', seed.id)
      .order('created_at', { ascending: false })
      .limit(5);

    setSelected({ seed, ancestors: ancestors.reverse(), children: children || [], transactions: transactions || [] });
    setDetailLoading(false);
  }

  if (loading || !session || !profile) {
    return <div className="wrap"><p>불러오는 중...</p></div>;
  }

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} />

      <div className="field" style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="종자 코드 또는 품종명으로 검색 (예: RIC-2023-014, 밀크씨슬)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mono" style={{ fontSize: 12.5, color: '#5c574a', marginBottom: 10 }}>
        {searching ? '검색 중...' : `검색 결과: ${results.length}건`}
      </div>

      {results.length === 0 && !searching ? (
        <div className="card" style={{ textAlign: 'center', padding: 50, color: '#847d68' }}>
          검색 결과가 없습니다. 다른 코드나 품종명으로 검색해보세요.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>종자코드</th><th>작물</th><th>품종명</th><th>수확연도</th><th>보관위치</th><th>재고(g)</th>
            </tr>
          </thead>
          <tbody>
            {results.map((s) => (
              <tr key={s.id} onClick={() => openDetail(s)} style={{ cursor: 'pointer' }}>
                <td className="code-cell">{s.code}</td>
                <td><span className={`crop-tag ${cropTagClass(s.crop)}`}>{s.crop || '-'}</span></td>
                <td>{s.variety || '-'}</td>
                <td>{s.harvest_year || '-'}</td>
                <td>{s.location || '-'}</td>
                <td style={{ color: Number(s.qty_g) <= 50 ? 'var(--danger)' : 'var(--ok)', fontWeight: 600 }}>
                  {Number(s.qty_g) || 0} g
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(43,42,37,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="card" style={{ maxWidth: 560, width: '100%', maxHeight: '88vh', overflowY: 'auto', position: 'relative' }}>
            <button
              onClick={() => setSelected(null)}
              style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#736c58' }}
            >
              &times;
            </button>
            <h3 className="serif" style={{ margin: '0 0 2px', fontSize: 20 }}>{selected.seed.variety || '-'}</h3>
            <div className="mono" style={{ fontSize: 12.5, color: 'var(--green-deep)', marginBottom: 14 }}>
              {selected.seed.code}{selected.seed.sci_name ? ` · ${selected.seed.sci_name}` : ''}
            </div>

            <dl style={{ display: 'grid', gridTemplateColumns: '100px 1fr', rowGap: 8, fontSize: 13.5 }}>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>작물</dt><dd style={{ margin: 0 }}>{selected.seed.crop || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>수확연도</dt><dd style={{ margin: 0 }}>{selected.seed.harvest_year || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>보관위치</dt><dd style={{ margin: 0 }}>{selected.seed.location || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>재고</dt><dd style={{ margin: 0 }}>{Number(selected.seed.qty_g) || 0} g</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>도입기관</dt><dd style={{ margin: 0 }}>{selected.seed.origin || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>재배지역</dt><dd style={{ margin: 0 }}>{selected.seed.region || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>비고</dt><dd style={{ margin: 0 }}>{selected.seed.notes || '-'}</dd>
            </dl>

            {(selected.seed.generation || selected.seed.pedigree) && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--line)' }}>
                <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>세대 / Pedigree</div>
                <div style={{ fontSize: 13.5 }}>
                  {selected.seed.generation && <b>{selected.seed.generation}</b>}
                  {selected.seed.generation && selected.seed.pedigree ? ' · ' : ''}
                  {selected.seed.pedigree && <span className="mono">{selected.seed.pedigree}</span>}
                  {selected.seed.fixed_line && <span className="staff-badge" style={{ marginLeft: 6 }}>🔒 고정계통</span>}
                </div>
              </div>
            )}

            {detailLoading && <p style={{ fontSize: 12, color: '#847d68', marginTop: 12 }}>계보 불러오는 중...</p>}

            {!detailLoading && selected.ancestors.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>세대 계보</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                  {selected.ancestors.map((a, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => a.seed && openDetail(a.seed)}
                        disabled={!a.seed}
                        style={{
                          fontFamily: 'Inter,sans-serif', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                          background: '#fff', border: `1.5px solid ${a.seed ? 'var(--line)' : 'transparent'}`,
                          borderStyle: a.seed ? 'solid' : 'dashed', borderRadius: 6, padding: '6px 10px',
                          cursor: a.seed ? 'pointer' : 'default', textAlign: 'left',
                        }}
                      >
                        {a.seed ? (a.seed.variety || '-') : '미등록'}
                        <div className="mono" style={{ fontSize: 10, color: '#847d68' }}>{a.code}</div>
                      </button>
                      <span style={{ color: '#a3987c' }}>→</span>
                    </span>
                  ))}
                  <span style={{
                    fontFamily: 'Inter,sans-serif', fontSize: 12.5, fontWeight: 600, color: '#fff',
                    background: 'var(--green-deep)', borderRadius: 6, padding: '6px 10px',
                  }}>
                    {selected.seed.variety || '-'}
                    <div className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>{selected.seed.code} · 현재</div>
                  </span>
                </div>
              </div>
            )}

            {!detailLoading && selected.children.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>
                  이 종자를 심어서 얻은 종자 ({selected.children.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.children.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openDetail(c)}
                      style={{
                        fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--plum)',
                        background: 'rgba(122,59,70,0.08)', border: '1px solid rgba(122,59,70,0.3)',
                        borderRadius: 14, padding: '5px 11px', cursor: 'pointer',
                      }}
                    >
                      {c.variety || '-'} ({c.code})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!detailLoading && selected.transactions.length > 0 && (
              <table style={{ marginTop: 16, boxShadow: 'none' }}>
                <thead><tr><th>일자</th><th>구분</th><th>변동</th><th>담당자</th></tr></thead>
                <tbody>
                  {selected.transactions.map((t) => (
                    <tr key={t.id}>
                      <td>{new Date(t.created_at).toLocaleDateString('ko-KR')}</td>
                      <td>{t.type}</td>
                      <td>{t.type === '출고' ? '-' : '+'}{t.qty} g</td>
                      <td>{t.by_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}