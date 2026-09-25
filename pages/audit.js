import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';

const TABLE_LABEL = {
  seeds: '종자',
  seed_transactions: '입출고기록',
  seed_requests: '종자요청',
  lab_reservations: '실험실예약',
  bed_reservations: '배드예약',
};
const ACTION_LABEL = { INSERT: '추가', UPDATE: '수정', DELETE: '삭제' };
const ACTION_COLOR = {
  INSERT: { bg: 'rgba(63,93,58,0.14)', fg: 'var(--green-deep)' },
  UPDATE: { bg: 'rgba(201,162,75,0.2)', fg: '#7a5d15' },
  DELETE: { bg: 'rgba(163,63,63,0.14)', fg: 'var(--danger)' },
};

function ActionBadge({ action }) {
  const c = ACTION_COLOR[action] || {};
  return (
    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.fg }}>
      {ACTION_LABEL[action] || action}
    </span>
  );
}

// old_data/new_data(jsonb)를 비교해서 바뀐 필드만 뽑아냄
function diffFields(oldData, newData) {
  const keys = new Set([...(oldData ? Object.keys(oldData) : []), ...(newData ? Object.keys(newData) : [])]);
  const rows = [];
  keys.forEach((k) => {
    if (['id', 'created_at', 'updated_at'].includes(k)) return;
    const before = oldData ? oldData[k] : undefined;
    const after = newData ? newData[k] : undefined;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      rows.push({ key: k, before, after });
    }
  });
  return rows;
}

function fmt(v) {
  if (v === null || v === undefined || v === '') return '(비어있음)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function AuditLogPage() {
  const router = useRouter();
  const { session, profile, isDeveloper, loading } = useProfile();

  const [logs, setLogs] = useState([]);
  const [tableFilter, setTableFilter] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); return; }
    if (!isDeveloper) { router.replace('/'); }
  }, [session, profile, isDeveloper, loading, router]);

  const loadLogs = useCallback(async () => {
    setFetching(true);
    let req = supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(300);
    if (tableFilter) req = req.eq('table_name', tableFilter);
    if (query.trim()) req = req.ilike('record_label', `%${query.trim()}%`);
    const { data, error } = await req;
    if (!error) setLogs(data || []);
    setFetching(false);
  }, [tableFilter, query]);

  useEffect(() => {
    if (!isDeveloper) return;
    const t = setTimeout(loadLogs, 200);
    return () => clearTimeout(t);
  }, [isDeveloper, loadLogs]);

  if (loading || !session || !profile || !isDeveloper) return <div className="wrap"><p>불러오는 중...</p></div>;

  return (
    <div className="wrap">
      <Nav profile={profile} isDeveloper={isDeveloper} />

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>수정 이력 (개발자 전용)</h4>
        <p style={{ fontSize: 11.5, color: '#847d68', marginTop: -6 }}>
          종자·입출고·요청·예약(실험실/배드) 데이터의 추가·수정·삭제 기록입니다. 누가, 언제, 무엇을 바꿨는지 확인할 수 있습니다.
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">전체 테이블</option>
            {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="종자코드·이름 등으로 검색" />
        </div>
        <div className="mono" style={{ fontSize: 12, color: '#5c574a', marginBottom: 10 }}>
          {fetching ? '불러오는 중...' : `${logs.length}건`}
        </div>
        <div style={{ maxHeight: 480, overflow: 'auto' }}>
          <table>
            <thead><tr><th>일시</th><th>테이블</th><th>항목</th><th>동작</th><th>담당자</th><th></th></tr></thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 24 }}>기록이 없습니다.</td></tr>
              ) : logs.map((l) => (
                <tr key={l.id} onClick={() => setSelected(l)} style={{ cursor: 'pointer' }}>
                  <td className="mono" style={{ fontSize: 12 }}>{new Date(l.changed_at).toLocaleString('ko-KR')}</td>
                  <td>{TABLE_LABEL[l.table_name] || l.table_name}</td>
                  <td className="code-cell">{l.record_label || l.record_id || '-'}</td>
                  <td><ActionBadge action={l.action} /></td>
                  <td>{l.changed_by_name || '(알수없음)'}</td>
                  <td style={{ fontSize: 12, color: 'var(--green-deep)' }}>자세히 →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(43,42,37,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="card" style={{ maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
            <button onClick={() => setSelected(null)} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#736c58' }}>&times;</button>
            <h3 className="serif" style={{ marginTop: 0 }}>{TABLE_LABEL[selected.table_name] || selected.table_name} · {selected.record_label || selected.record_id}</h3>
            <div className="mono" style={{ fontSize: 12, color: '#5c574a', marginBottom: 4 }}>
              {new Date(selected.changed_at).toLocaleString('ko-KR')} · {selected.changed_by_name || '(알수없음)'} · <ActionBadge action={selected.action} />
            </div>

            <div style={{ marginTop: 16 }}>
              {selected.action === 'INSERT' && (
                <>
                  <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>새로 추가된 내용</div>
                  <table>
                    <thead><tr><th>항목</th><th>값</th></tr></thead>
                    <tbody>
                      {Object.entries(selected.new_data || {}).filter(([k]) => !['id'].includes(k)).map(([k, v]) => (
                        <tr key={k}><td className="mono" style={{ fontSize: 12 }}>{k}</td><td>{fmt(v)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {selected.action === 'DELETE' && (
                <>
                  <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>삭제 직전 내용</div>
                  <table>
                    <thead><tr><th>항목</th><th>값</th></tr></thead>
                    <tbody>
                      {Object.entries(selected.old_data || {}).filter(([k]) => !['id'].includes(k)).map(([k, v]) => (
                        <tr key={k}><td className="mono" style={{ fontSize: 12 }}>{k}</td><td>{fmt(v)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {selected.action === 'UPDATE' && (
                <>
                  <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>바뀐 항목만 표시</div>
                  {diffFields(selected.old_data, selected.new_data).length === 0 ? (
                    <p style={{ fontSize: 13, color: '#847d68' }}>실제로 값이 바뀐 항목이 없습니다.</p>
                  ) : (
                    <table>
                      <thead><tr><th>항목</th><th>수정 전</th><th>수정 후</th></tr></thead>
                      <tbody>
                        {diffFields(selected.old_data, selected.new_data).map((d) => (
                          <tr key={d.key}>
                            <td className="mono" style={{ fontSize: 12 }}>{d.key}</td>
                            <td style={{ color: 'var(--danger)' }}>{fmt(d.before)}</td>
                            <td style={{ color: 'var(--green-deep)' }}>{fmt(d.after)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
