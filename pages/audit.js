import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';
import { useLang } from '../lib/i18n';

// 테이블/동작 이름은 lib/i18n.js의 'audit.tbl.*', 'audit.act.*'에 있습니다
const TABLES = ['seeds', 'seed_transactions', 'seed_requests', 'lab_reservations', 'bed_reservations'];
const ACTION_COLOR = {
  INSERT: { bg: 'rgba(63,93,58,0.14)', fg: 'var(--green-deep)' },
  UPDATE: { bg: 'rgba(201,162,75,0.2)', fg: '#7a5d15' },
  DELETE: { bg: 'rgba(163,63,63,0.14)', fg: 'var(--danger)' },
};

function ActionBadge({ action }) {
  const { tMaybe } = useLang();
  const c = ACTION_COLOR[action] || {};
  return (
    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.fg }}>
      {tMaybe('audit.act', action)}
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

function fmt(v, t) {
  if (v === null || v === undefined || v === '') return t('audit.empty');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function AuditLogPage() {
  const router = useRouter();
  const { t, tMaybe, fmtDateTime } = useLang();
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
    const timer = setTimeout(loadLogs, 200);
    return () => clearTimeout(timer);
  }, [isDeveloper, loadLogs]);

  if (loading || !session || !profile || !isDeveloper) return <div className="wrap"><p>{t('common.loading')}</p></div>;

  return (
    <div className="wrap">
      <Nav profile={profile} isDeveloper={isDeveloper} />

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>{t('audit.title')}</h4>
        <p style={{ fontSize: 11.5, color: '#847d68', marginTop: -6 }}>
          {t('audit.desc')}
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">{t('audit.allTables')}</option>
            {TABLES.map((k) => <option key={k} value={k}>{tMaybe('audit.tbl', k)}</option>)}
          </select>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('audit.searchPlaceholder')} />
        </div>
        <div className="mono" style={{ fontSize: 12, color: '#5c574a', marginBottom: 10 }}>
          {fetching ? t('common.loading') : t('common.count', { n: logs.length })}
        </div>
        <div style={{ maxHeight: 480, overflow: 'auto' }}>
          <table>
            <thead><tr><th>{t('audit.when')}</th><th>{t('audit.table')}</th><th>{t('audit.item')}</th><th>{t('audit.action')}</th><th>{t('audit.by')}</th><th></th></tr></thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 24 }}>{t('audit.noRecords')}</td></tr>
              ) : logs.map((l) => (
                <tr key={l.id} onClick={() => setSelected(l)} style={{ cursor: 'pointer' }}>
                  <td className="mono" style={{ fontSize: 12 }}>{fmtDateTime(l.changed_at)}</td>
                  <td>{tMaybe('audit.tbl', l.table_name)}</td>
                  <td className="code-cell">{l.record_label || l.record_id || '-'}</td>
                  <td><ActionBadge action={l.action} /></td>
                  <td>{l.changed_by_name || t('common.unknown')}</td>
                  <td style={{ fontSize: 12, color: 'var(--green-deep)' }}>{t('audit.details')}</td>
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
            <h3 className="serif" style={{ marginTop: 0 }}>{tMaybe('audit.tbl', selected.table_name)} · {selected.record_label || selected.record_id}</h3>
            <div className="mono" style={{ fontSize: 12, color: '#5c574a', marginBottom: 4 }}>
              {fmtDateTime(selected.changed_at)} · {selected.changed_by_name || t('common.unknown')} · <ActionBadge action={selected.action} />
            </div>

            <div style={{ marginTop: 16 }}>
              {selected.action === 'INSERT' && (
                <>
                  <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>{t('audit.inserted')}</div>
                  <table>
                    <thead><tr><th>{t('audit.field')}</th><th>{t('audit.value')}</th></tr></thead>
                    <tbody>
                      {Object.entries(selected.new_data || {}).filter(([k]) => !['id'].includes(k)).map(([k, v]) => (
                        <tr key={k}><td className="mono" style={{ fontSize: 12 }}>{k}</td><td>{fmt(v, t)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {selected.action === 'DELETE' && (
                <>
                  <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>{t('audit.deleted')}</div>
                  <table>
                    <thead><tr><th>{t('audit.field')}</th><th>{t('audit.value')}</th></tr></thead>
                    <tbody>
                      {Object.entries(selected.old_data || {}).filter(([k]) => !['id'].includes(k)).map(([k, v]) => (
                        <tr key={k}><td className="mono" style={{ fontSize: 12 }}>{k}</td><td>{fmt(v, t)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {selected.action === 'UPDATE' && (
                <>
                  <div className="mono" style={{ fontSize: 11, color: '#736c58', textTransform: 'uppercase', marginBottom: 8 }}>{t('audit.changedOnly')}</div>
                  {diffFields(selected.old_data, selected.new_data).length === 0 ? (
                    <p style={{ fontSize: 13, color: '#847d68' }}>{t('audit.noChange')}</p>
                  ) : (
                    <table>
                      <thead><tr><th>{t('audit.field')}</th><th>{t('audit.before')}</th><th>{t('audit.after')}</th></tr></thead>
                      <tbody>
                        {diffFields(selected.old_data, selected.new_data).map((d) => (
                          <tr key={d.key}>
                            <td className="mono" style={{ fontSize: 12 }}>{d.key}</td>
                            <td style={{ color: 'var(--danger)' }}>{fmt(d.before, t)}</td>
                            <td style={{ color: 'var(--green-deep)' }}>{fmt(d.after, t)}</td>
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
