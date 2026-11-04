import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';
import { useLang, DICT } from '../lib/i18n';
import { getBaseCode, compareMemberCodes, findGroupMembers } from '../lib/lineage';

function cropTagClass(crop) {
  if (!crop) return 'crop-other';
  if (crop.includes('벼')) return 'crop-rice';
  if (crop.includes('밀크씨슬') || crop.includes('국화')) return 'crop-thistle';
  return 'crop-other';
}

export default function SearchPage() {
  const router = useRouter();
  const { t, lang } = useLang();
  const { session, profile, isStaff, isSupervisor, isDeveloper, loading } = useProfile();

  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc'); // 수확연도 내림차순(desc)/오름차순(asc)
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null); // 선택된 종자 상세 (lineage 포함)
  const [detailLoading, setDetailLoading] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set()); // 펼쳐진 대표 코드들
  const [openGroup, setOpenGroup] = useState(null); // 상세 팝업에서 펼친 묶음 모종자 코드

  // 52200-B, 52200-1, 52200-2 ... 를 대표 코드 52200 하나로 묶기
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of results) {
      const base = getBaseCode(s.code);
      if (!map.has(base)) map.set(base, []);
      map.get(base).push(s);
    }
    return [...map.entries()].map(([base, members]) => {
      members = members.slice().sort((a, b) => compareMemberCodes(a.code, b.code));
      const uniq = (arr) => [...new Set(arr.filter(Boolean))];
      const years = uniq(members.map((m) => m.harvest_year));
      const locations = uniq(members.map((m) => m.location));
      return {
        base,
        members,
        crop: members[0].crop,
        varieties: uniq(members.map((m) => m.variety)),
        years: years.sort(),
        locations,
        totalQty: members.reduce((sum, m) => sum + (Number(m.qty_g) || 0), 0),
        bulk: members.filter((m) => /-B$/i.test(m.code)).length,
        single: members.filter((m) => /-\d+$/.test(m.code)).length,
        // 묶을 게 없는 종자 (코드가 대표 코드 그대로이고 1개뿐)
        isSolo: members.length === 1 && members[0].code === base,
      };
    });
  }, [results]);

  function toggleGroup(base) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(base)) next.delete(base); else next.add(base);
      return next;
    });
  }

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); }
  }, [session, profile, loading, router]);

  const runSearch = useCallback(async (q, order) => {
    setSearching(true);
    let req = supabase.from('seeds').select('*').order('harvest_year', { ascending: order === 'asc' }).limit(1000);
    if (q.trim()) {
      req = req.or(`code.ilike.%${q.trim()}%,variety.ilike.%${q.trim()}%`);
    }
    const { data, error } = await req;
    if (!error) setResults(data || []);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => runSearch(query, sortOrder), 250); // 입력 디바운스
    return () => clearTimeout(timer);
  }, [query, sortOrder, session, runSearch]);

  async function openDetail(seed) {
    setDetailLoading(true);
    setOpenGroup(null);
    setSelected({ seed, ancestors: [], children: [], groupChildren: [], transactions: [] });

    // 조상 체인 (최대 20세대까지, 순환 참조 방지)
    const ancestors = [];
    let currentCode = seed.parent_code;
    const visited = new Set([seed.code]);
    for (let i = 0; i < 20 && currentCode; i++) {
      if (visited.has(currentCode)) break;
      visited.add(currentCode);
      const { data: parent } = await supabase.from('seeds').select('*').eq('code', currentCode).maybeSingle();
      if (parent) {
        ancestors.push({ code: currentCode, seed: parent });
        currentCode = parent.parent_code;
        continue;
      }
      // 정확한 코드가 없으면 대표 코드 묶음(52200 → 52200-1, 52200-2, 52200-B …)인지 확인
      const { data: candidates } = await supabase.from('seeds').select('*').like('code', `${currentCode}-%`);
      const members = findGroupMembers(currentCode, candidates || []);
      if (!members.length) {
        ancestors.push({ code: currentCode, seed: null });
        break;
      }
      ancestors.push({ code: currentCode, group: members });
      // 묶음 구성 종자들이 가장 많이 가리키는 모종자로 계속 거슬러 올라감
      const counts = new Map();
      for (const m of members) if (m.parent_code) counts.set(m.parent_code, (counts.get(m.parent_code) || 0) + 1);
      currentCode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    const { data: children } = await supabase.from('seeds').select('*').eq('parent_code', seed.code);
    // 이 종자가 속한 묶음(52200)을 섞어 파종해서 얻은 종자
    const base = getBaseCode(seed.code);
    let groupChildren = [];
    if (base !== seed.code) {
      const { data } = await supabase.from('seeds').select('*').eq('parent_code', base);
      groupChildren = data || [];
    }
    const { data: transactions } = await supabase
      .from('seed_transactions')
      .select('*')
      .eq('seed_id', seed.id)
      .order('created_at', { ascending: false })
      .limit(5);

    setSelected({ seed, ancestors: ancestors.reverse(), children: children || [], groupChildren, transactions: transactions || [] });
    setDetailLoading(false);
  }

  if (loading || !session || !profile) {
    return <div className="wrap"><p>{t('common.loading')}</p></div>;
  }

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} isDeveloper={isDeveloper} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="desc">{t('search.sort.desc')}</option>
          <option value="asc">{t('search.sort.asc')}</option>
        </select>
      </div>

      <div className="mono" style={{ fontSize: 12.5, color: '#5c574a', marginBottom: 10 }}>
        {searching ? t('search.searching') : t('search.resultCount', { n: groups.length })}
        {!searching && groups.some((g) => !g.isSolo) && <span style={{ marginLeft: 10, color: '#847d68' }}>· {t('search.groupHint')}</span>}
      </div>

      {results.length === 0 && !searching ? (
        <div className="card" style={{ textAlign: 'center', padding: 50, color: '#847d68' }}>
          {t('search.noResult')}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('field.code')}</th><th>{t('field.crop')}</th><th>{t('field.variety')}</th><th>{t('field.harvestYear')}</th><th>{t('field.location')}</th><th>{t('field.qtyG')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const open = expanded.has(g.base) || groups.length === 1;
              if (g.isSolo) {
                const s = g.members[0];
                return (
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
                );
              }
              return [
                <tr key={`g-${g.base}`} onClick={() => toggleGroup(g.base)} style={{ cursor: 'pointer', background: open ? 'var(--paper-dark)' : undefined }}>
                  <td className="code-cell">
                    <span style={{ display: 'inline-block', width: 14, color: '#847d68' }}>{open ? '▾' : '▸'}</span>
                    {g.base}
                    <div className="mono" style={{ fontSize: 10.5, color: '#847d68', marginLeft: 14 }}>
                      {t('search.groupCount', { n: g.members.length })}
                      {g.bulk ? ` · ${t('search.groupBulk', { n: g.bulk })}` : ''}
                      {g.single ? ` · ${t('search.groupSingle', { n: g.single })}` : ''}
                    </div>
                  </td>
                  <td><span className={`crop-tag ${cropTagClass(g.crop)}`}>{g.crop || '-'}</span></td>
                  <td>{g.varieties.join(', ') || '-'}</td>
                  <td>{g.years.length ? (g.years.length === 1 ? g.years[0] : `${g.years[0]}~${g.years[g.years.length - 1]}`) : '-'}</td>
                  <td>{g.locations.length ? g.locations.slice(0, 2).join(', ') + (g.locations.length > 2 ? ' …' : '') : '-'}</td>
                  <td style={{ fontWeight: 600 }}>{g.totalQty} g</td>
                </tr>,
                ...(open ? g.members.map((s) => (
                  <tr key={s.id} onClick={() => openDetail(s)} style={{ cursor: 'pointer', fontSize: 13 }}>
                    <td className="code-cell" style={{ paddingLeft: 30 }}>↳ {s.code}</td>
                    <td><span className={`crop-tag ${cropTagClass(s.crop)}`}>{s.crop || '-'}</span></td>
                    <td>{s.variety || '-'}{s.generation ? <span className="mono" style={{ fontSize: 11, color: '#847d68' }}> · {s.generation}</span> : ''}</td>
                    <td>{s.harvest_year || '-'}</td>
                    <td>{s.location || '-'}</td>
                    <td style={{ color: Number(s.qty_g) <= 50 ? 'var(--danger)' : 'var(--ok)', fontWeight: 600 }}>
                      {Number(s.qty_g) || 0} g
                    </td>
                  </tr>
                )) : []),
              ];
            })}
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
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>{t('field.crop')}</dt><dd style={{ margin: 0 }}>{selected.seed.crop || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>{t('field.harvestYear')}</dt><dd style={{ margin: 0 }}>{selected.seed.harvest_year || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>{t('field.location')}</dt><dd style={{ margin: 0 }}>{selected.seed.location || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>{t('field.qty')}</dt><dd style={{ margin: 0 }}>{Number(selected.seed.qty_g) || 0} g</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>{t('field.origin')}</dt><dd style={{ margin: 0 }}>{selected.seed.origin || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>{t('field.region')}</dt><dd style={{ margin: 0 }}>{selected.seed.region || '-'}</dd>
              <dt className="mono" style={{ color: '#736c58', fontSize: 11.5 }}>{t('field.notes')}</dt><dd style={{ margin: 0 }}>{selected.seed.notes || '-'}</dd>
            </dl>

            {(selected.seed.generation || selected.seed.pedigree) && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--line)' }}>
                <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>{t('detail.genPedigree')}</div>
                <div style={{ fontSize: 13.5 }}>
                  {selected.seed.generation && <b>{selected.seed.generation}</b>}
                  {selected.seed.generation && selected.seed.pedigree ? ' · ' : ''}
                  {selected.seed.pedigree && <span className="mono">{selected.seed.pedigree}</span>}
                  {selected.seed.fixed_line && <span className="staff-badge" style={{ marginLeft: 6 }}>{t('detail.fixedLine')}</span>}
                </div>
              </div>
            )}

            {detailLoading && <p style={{ fontSize: 12, color: '#847d68', marginTop: 12 }}>{t('detail.loadingLineage')}</p>}

            {!detailLoading && selected.ancestors.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>{t('detail.lineage')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                  {selected.ancestors.map((a, i) => a.group ? (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => setOpenGroup(openGroup === a.code ? null : a.code)}
                        style={{
                          fontFamily: 'Inter,sans-serif', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                          background: openGroup === a.code ? 'var(--paper-dark)' : '#fff',
                          border: '1.5px solid var(--line)', borderRadius: 6, padding: '6px 10px',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        {openGroup === a.code ? '▾ ' : '▸ '}{t('detail.group', { n: a.group.length })}
                        <div className="mono" style={{ fontSize: 10, color: '#847d68' }}>{a.code}</div>
                      </button>
                      <span style={{ color: '#a3987c' }}>→</span>
                    </span>
                  ) : (
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
                        {a.seed ? (a.seed.variety || '-') : t('detail.unregistered')}
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
                    <div className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>{selected.seed.code} · {t('detail.current')}</div>
                  </span>
                </div>
              </div>
            )}

            {!detailLoading && openGroup && (() => {
              const g = selected.ancestors.find((a) => a.code === openGroup && a.group);
              if (!g) return null;
              return (
                <div style={{ marginTop: 10, padding: 10, background: 'var(--paper-dark)', borderRadius: 6 }}>
                  <div className="mono" style={{ fontSize: 11, color: '#736c58', marginBottom: 6 }}>{t('detail.groupMembers', { code: g.code })}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {g.group.map((m) => (
                      <button key={m.id} onClick={() => openDetail(m)} style={{ fontSize: 12, fontWeight: 600, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '5px 11px', cursor: 'pointer' }}>
                        {m.code}{m.generation ? ` · ${m.generation}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {!detailLoading && selected.groupChildren.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: '#736c58', marginBottom: 8 }}>
                  {t('detail.groupChildren', { code: getBaseCode(selected.seed.code), n: selected.groupChildren.length })}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.groupChildren.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openDetail(c)}
                      style={{
                        fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--plum)',
                        background: 'rgba(122,59,70,0.08)', border: '1px dashed rgba(122,59,70,0.4)',
                        borderRadius: 14, padding: '5px 11px', cursor: 'pointer',
                      }}
                    >
                      {c.variety || '-'} ({c.code})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!detailLoading && selected.children.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>
                  {t('detail.children', { n: selected.children.length })}
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
                <thead><tr><th>{t('detail.tx.date')}</th><th>{t('detail.tx.type')}</th><th>{t('detail.tx.change')}</th><th>{t('detail.tx.by')}</th></tr></thead>
                <tbody>
                  {selected.transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'ko-KR')}</td>
                      <td>{DICT[`txType.${tx.type}`] ? t(`txType.${tx.type}`) : tx.type}</td>
                      <td>{tx.type === '출고' ? '-' : '+'}{tx.qty} g</td>
                      <td>{tx.by_name || '-'}</td>
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

