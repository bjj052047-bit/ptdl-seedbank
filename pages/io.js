import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';
import { useLang } from '../lib/i18n';

export default function IoPage() {
  const router = useRouter();
  const { t, tMaybe, fmtDate } = useLang();
  const { session, profile, isStaff, isSupervisor, isDeveloper, loading } = useProfile();

  const [codeInput, setCodeInput] = useState('');
  const [foundSeed, setFoundSeed] = useState(null);
  const [searchMsg, setSearchMsg] = useState('');
  const [type, setType] = useState('입고');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [formMsg, setFormMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const [logFilter, setLogFilter] = useState('');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!isStaff && !isSupervisor && !isDeveloper) { router.replace('/'); }
  }, [session, isStaff, isSupervisor, isDeveloper, loading, router]);

  useEffect(() => {
    setDate(new Date().toISOString().slice(0, 10));
  }, []);

  const loadLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('seed_transactions')
      .select('*, seeds(code)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error) setLogs(data || []);
  }, []);

  useEffect(() => {
    if (isStaff || isSupervisor || isDeveloper) loadLogs();
  }, [isStaff, isSupervisor, isDeveloper, loadLogs]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const code = codeInput.trim();
      if (!code) { setFoundSeed(null); setSearchMsg(''); return; }
      const { data } = await supabase.from('seeds').select('*').eq('code', code).maybeSingle();
      if (data) {
        setFoundSeed(data);
        setSearchMsg('');
      } else {
        setFoundSeed(null);
        setSearchMsg(t('common.seedNotFound'));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [codeInput, t]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormMsg(null);

    if (!foundSeed) { setFormMsg({ type: 'err', text: t('common.enterValidCode') }); return; }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { setFormMsg({ type: 'err', text: t('common.qtyPositive') }); return; }

    const cur = Number(foundSeed.qty_g) || 0;
    const next = type === '출고' ? cur - qtyNum : cur + qtyNum;

    if (next < 0) {
      const ok = window.confirm(t('io.confirmNegative', { next, cur }));
      if (!ok) return;
    }

    setBusy(true);
    const { error: txError } = await supabase.from('seed_transactions').insert({
      seed_id: foundSeed.id,
      type,
      qty: qtyNum,
      qty_after: next,
      by_user: profile.id,
      by_name: profile.name,
      note: note.trim(),
    });
    if (txError) {
      setFormMsg({ type: 'err', text: t('io.err.record', { msg: txError.message }) });
      setBusy(false);
      return;
    }
    const { error: updateError } = await supabase.from('seeds').update({ qty_g: next }).eq('id', foundSeed.id);
    if (updateError) {
      setFormMsg({ type: 'err', text: t('io.err.stock', { msg: updateError.message }) });
      setBusy(false);
      return;
    }

    setFormMsg({ type: 'ok', text: t('io.ok', { next }) });
    setFoundSeed({ ...foundSeed, qty_g: next });
    setQty('');
    setNote('');
    loadLogs();
    setBusy(false);
  }

  if (loading || !session || (!isStaff && !isSupervisor && !isDeveloper)) return <div className="wrap"><p>{t('common.loading')}</p></div>;

  const filteredLogs = logs.filter((l) => !logFilter.trim() || (l.seeds?.code || '').toLowerCase().includes(logFilter.trim().toLowerCase()));

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} isDeveloper={isDeveloper} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>{t('io.formTitle')}</h4>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>{t('io.codeLabel')}</label>
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder={t('io.codePlaceholder')} />
              {searchMsg && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{searchMsg}</div>}
              {foundSeed && (
                <div style={{ fontSize: 12.5, color: '#5c574a', marginTop: 6 }}>
                  {foundSeed.crop} · {foundSeed.variety} · {t('io.locationLabel')}: {foundSeed.location || '-'} · {t('io.currentStock')}: <b>{Number(foundSeed.qty_g) || 0}g</b>
                </div>
              )}
            </div>

            <div className="field">
              <label>{t('io.typeLabel')}</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13.5 }}>
                  <input type="radio" checked={type === '입고'} onChange={() => setType('입고')} style={{ width: 'auto' }} /> {t('txType.입고')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13.5 }}>
                  <input type="radio" checked={type === '출고'} onChange={() => setType('출고')} style={{ width: 'auto' }} /> {t('txType.출고')}
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>{t('io.qtyLabel')}</label><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder={t('io.qtyPlaceholder')} /></div>
              <div className="field"><label>{t('io.dateLabel')}</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            <div className="field"><label>{t('io.noteLabel')}</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('io.notePlaceholder')} /></div>

            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('common.processing') : t('io.submit')}</button>
            {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
          </form>
        </div>

        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>{t('io.logTitle')}</h4>
          <input value={logFilter} onChange={(e) => setLogFilter(e.target.value)} placeholder={t('io.logFilter')} style={{ marginBottom: 10 }} />
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table>
              <thead><tr><th>{t('detail.tx.date')}</th><th>{t('field.codeShort')}</th><th>{t('detail.tx.type')}</th><th>{t('io.col.qty')}</th><th>{t('detail.tx.by')}</th><th>{t('io.col.after')}</th></tr></thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>{t('common.noRecords')}</td></tr>
                ) : filteredLogs.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtDate(l.created_at)}</td>
                    <td className="code-cell">{l.seeds?.code || '-'}</td>
                    <td>{tMaybe('txType', l.type)}</td>
                    <td>{l.qty}g</td>
                    <td>{l.by_name || '-'}</td>
                    <td>{l.qty_after}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}