import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';
import { useLang } from '../lib/i18n';

// 상태 이름은 lib/i18n.js의 'req.status.*'에 있습니다
const STATUS_COLOR = {
  pending: { bg: 'rgba(201,162,75,0.2)', fg: '#7a5d15' },
  approved: { bg: 'rgba(63,93,58,0.14)', fg: 'var(--green-deep)' },
  fulfilled: { bg: 'rgba(63,93,58,0.14)', fg: 'var(--green-deep)' },
  rejected: { bg: 'rgba(163,63,63,0.14)', fg: 'var(--danger)' },
};

// 100립 = 2g 기준 (1립 = 0.02g). 작물마다 실제 립당 무게는 다르지만,
// 별도 안내가 있기 전까지는 공통 환산 기준으로 사용합니다.
const GRAMS_PER_GRAIN = 0.02;
function toGrams(qty, unit) {
  const n = Number(qty) || 0;
  return unit === '립' ? Math.round(n * GRAMS_PER_GRAIN * 100) / 100 : n;
}
// t: 번역 함수 (화면 언어에 맞게 '립'을 grains 등으로 표시)
function displayQty(qty, unit, t) {
  if (unit === '립') return t('unit.grainQty', { q: qty, g: toGrams(qty, unit) });
  return `${qty}g`;
}

function StatusBadge({ status }) {
  const { tMaybe } = useLang();
  const c = STATUS_COLOR[status] || {};
  return (
    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.fg }}>
      {tMaybe('req.status', status)}
    </span>
  );
}

export default function RequestsPage() {
  const router = useRouter();
  const { t, fmtDate } = useLang();
  const { session, profile, isStaff, isSupervisor, isDeveloper, loading } = useProfile();

  // 요청 제출 폼
  const [codeInput, setCodeInput] = useState('');
  const [foundSeed, setFoundSeed] = useState(null);
  const [searchMsg, setSearchMsg] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('g');
  const [note, setNote] = useState('');
  const [formMsg, setFormMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // 종자 목록 검색
  const [listQuery, setListQuery] = useState('');
  const [seedList, setSeedList] = useState([]);

  // 요청 목록 (전체)
  const [requests, setRequests] = useState([]);
  const [actingId, setActingId] = useState(null);

  // 수정 모드 (승인자/담당자 공용)
  const [editingReqId, setEditingReqId] = useState(null);
  const [editCode, setEditCode] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('g');
  const [editNote, setEditNote] = useState('');
  const [editMsg, setEditMsg] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); }
  }, [session, profile, loading, router]);

  const loadRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('seed_requests')
      .select('*, seeds(code, variety, qty_g)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error) setRequests(data || []);
  }, []);

  useEffect(() => {
    if (session) loadRequests();
  }, [session, loadRequests]);

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(async () => {
      let req = supabase.from('seeds').select('id, code, crop, variety, location, qty_g').order('harvest_year', { ascending: false }).limit(100);
      if (listQuery.trim()) req = req.or(`code.ilike.%${listQuery.trim()}%,variety.ilike.%${listQuery.trim()}%`);
      const { data, error } = await req;
      if (!error) setSeedList(data || []);
    }, 250);
    return () => clearTimeout(timer);
  }, [listQuery, session]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const code = codeInput.trim();
      if (!code) { setFoundSeed(null); setSearchMsg(''); return; }
      const { data } = await supabase.from('seeds').select('*').eq('code', code).maybeSingle();
      if (data) { setFoundSeed(data); setSearchMsg(''); }
      else { setFoundSeed(null); setSearchMsg(t('common.seedNotFound')); }
    }, 300);
    return () => clearTimeout(timer);
  }, [codeInput, t]);

  function pickFromList(seed) {
    setCodeInput(seed.code);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormMsg(null);
    if (!foundSeed) { setFormMsg({ type: 'err', text: t('common.enterValidCode') }); return; }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { setFormMsg({ type: 'err', text: t('common.qtyPositive') }); return; }

    setBusy(true);
    const { error } = await supabase.from('seed_requests').insert({
      seed_id: foundSeed.id, requester_id: profile.id, requester_name: profile.name,
      qty_requested: qtyNum, qty_unit: unit, note: note.trim(), status: 'pending',
    });
    if (error) { setFormMsg({ type: 'err', text: t('req.err.submit', { msg: error.message }) }); setBusy(false); return; }

    setFormMsg({ type: 'ok', text: t('req.ok.submit') });
    setCodeInput(''); setFoundSeed(null); setQty(''); setUnit('g'); setNote('');
    loadRequests();
    setBusy(false);
  }

  // 승인자: 승인 / 거절
  async function handleApproval(req, action) {
    if (action === 'reject') {
      if (!window.confirm(t('req.confirmReject'))) return;
      setActingId(req.id);
      await supabase.from('seed_requests').update({
        status: 'rejected', processed_by: profile.id, processed_at: new Date().toISOString(),
      }).eq('id', req.id);
      loadRequests();
      setActingId(null);
      return;
    }
    if (!window.confirm(t('req.confirmApprove', { code: req.seeds?.code, qty: displayQty(req.qty_requested, req.qty_unit, t) }))) return;
    setActingId(req.id);
    await supabase.from('seed_requests').update({
      status: 'approved', approved_by: profile.id, approved_at: new Date().toISOString(),
    }).eq('id', req.id);
    loadRequests();
    setActingId(null);
  }

  // 담당자: 출고 처리 / 거절
  async function handleFulfillment(req, action) {
    if (action === 'reject') {
      if (!window.confirm(t('req.confirmReject'))) return;
      setActingId(req.id);
      await supabase.from('seed_requests').update({
        status: 'rejected', processed_by: profile.id, processed_at: new Date().toISOString(),
      }).eq('id', req.id);
      loadRequests();
      setActingId(null);
      return;
    }

    const { data: seed } = await supabase.from('seeds').select('*').eq('id', req.seed_id).maybeSingle();
    if (!seed) { alert(t('req.err.seedMissing')); return; }

    const gramsToDeduct = toGrams(req.qty_requested, req.qty_unit);
    const cur = Number(seed.qty_g) || 0;
    const next = cur - gramsToDeduct;
    const ok = window.confirm(
      next < 0
        ? t('req.confirmNegative', { next })
        : t('req.confirmFulfill', { code: seed.code, variety: seed.variety, qty: displayQty(req.qty_requested, req.qty_unit, t) })
    );
    if (!ok) return;

    setActingId(req.id);
    await supabase.from('seed_transactions').insert({
      seed_id: seed.id, type: '출고', qty: gramsToDeduct, qty_after: next,
      by_user: profile.id, by_name: profile.name,
      note: `종자 요청 처리 (요청자: ${req.requester_name}, 요청량: ${req.qty_unit === '립' ? `${req.qty_requested}립 (약 ${toGrams(req.qty_requested, '립')}g)` : `${req.qty_requested}g`})`,
    });
    await supabase.from('seeds').update({ qty_g: next }).eq('id', seed.id);
    await supabase.from('seed_requests').update({
      status: 'fulfilled', processed_by: profile.id, processed_at: new Date().toISOString(),
    }).eq('id', req.id);
    loadRequests();
    setActingId(null);
  }

  function startEdit(req) {
    setEditingReqId(req.id);
    setEditCode(req.seeds?.code || '');
    setEditQty(req.qty_requested);
    setEditUnit(req.qty_unit || 'g');
    setEditNote(req.note || '');
    setEditMsg(null);
  }
  function cancelEdit() { setEditingReqId(null); setEditMsg(null); }

  async function saveEdit(req) {
    setEditMsg(null);
    const code = editCode.trim();
    const qtyNum = Number(editQty);
    if (!code) { setEditMsg({ type: 'err', text: t('req.err.enterCode') }); return; }
    if (!qtyNum || qtyNum <= 0) { setEditMsg({ type: 'err', text: t('common.qtyPositive') }); return; }
    const { data: seed } = await supabase.from('seeds').select('id').eq('code', code).maybeSingle();
    if (!seed) { setEditMsg({ type: 'err', text: t('common.seedNotFound') }); return; }
    const { error } = await supabase.from('seed_requests').update({
      seed_id: seed.id, qty_requested: qtyNum, qty_unit: editUnit, note: editNote.trim(),
    }).eq('id', req.id);
    if (error) { setEditMsg({ type: 'err', text: t('common.saveFailed', { msg: error.message }) }); return; }
    setEditingReqId(null);
    loadRequests();
  }

  function EditRow({ req, onSave }) {
    return (
      <tr>
        <td colSpan={7}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr auto auto', gap: 8, alignItems: 'end', padding: '8px 0' }}>
            <div className="field" style={{ margin: 0 }}><label>{t('field.code')}</label><input value={editCode} onChange={(e) => setEditCode(e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}><label>{t('req.qty')}</label><input value={editQty} onChange={(e) => setEditQty(e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}>
              <label>{t('req.unitLabel')}</label>
              <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)}><option value="g">g</option><option value="립">{t('unit.립')}</option></select>
            </div>
            <div className="field" style={{ margin: 0 }}><label>{t('req.reason')}</label><input value={editNote} onChange={(e) => setEditNote(e.target.value)} /></div>
            <button className="btn btn-primary" style={{ padding: '9px 14px' }} onClick={() => onSave(req)}>{t('common.save')}</button>
            <button className="btn btn-ghost" style={{ padding: '9px 14px' }} onClick={cancelEdit}>{t('common.cancel')}</button>
          </div>
          {editMsg && <div className={`msg ${editMsg.type}`}>{editMsg.text}</div>}
        </td>
      </tr>
    );
  }

  if (loading || !session || !profile) return <div className="wrap"><p>{t('common.loading')}</p></div>;

  const myRequests = requests.filter((r) => r.requester_id === profile.id);
  const awaitingApproval = requests.filter((r) => r.status === 'pending');
  const awaitingFulfillment = requests.filter((r) => r.status === 'approved');

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} isDeveloper={isDeveloper} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>{t('req.formTitle')}</h4>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>{t('io.codeLabel')}</label>
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder={t('req.codePlaceholder')} />
              {searchMsg && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{searchMsg}</div>}
              {foundSeed && (
                <div style={{ fontSize: 12.5, color: '#5c574a', marginTop: 6 }}>
                  {foundSeed.crop} · {foundSeed.variety} · {t('io.currentStock')}: <b>{Number(foundSeed.qty_g) || 0}g</b>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
              <div className="field"><label>{t('req.qtyLabel')}</label><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder={t('req.qtyPlaceholder')} /></div>
              <div className="field">
                <label>{t('req.unitLabel')}</label>
                <select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="g">g</option><option value="립">{t('unit.립')}</option></select>
              </div>
              <div className="field"><label>{t('req.noteLabel')}</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('req.notePlaceholder')} /></div>
            </div>
            {unit === '립' && qty && (
              <div style={{ fontSize: 12, color: '#5c574a', marginTop: -6, marginBottom: 12 }}>
                {t('req.grainHint', { g: toGrams(qty, '립') })}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('req.submitting') : t('req.submit')}</button>
            {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
          </form>
        </div>

        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>{t('req.listTitle')}</h4>
          <input value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder={t('search.codeOrVariety')} style={{ marginBottom: 10 }} />
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table>
              <thead><tr><th>{t('field.codeShort')}</th><th>{t('field.cropVariety')}</th><th>{t('field.locationShort')}</th><th>{t('field.qty')}</th></tr></thead>
              <tbody>
                {seedList.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>{t('search.noResultShort')}</td></tr>
                ) : seedList.map((s) => (
                  <tr key={s.id} onClick={() => pickFromList(s)} style={{ cursor: 'pointer' }}>
                    <td className="code-cell">{s.code}</td><td>{s.crop} / {s.variety}</td><td>{s.location || '-'}</td><td>{Number(s.qty_g) || 0}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>{t('req.myTitle', { n: myRequests.length })}</h4>
        <table>
          <thead><tr><th>{t('req.date')}</th><th>{t('field.code')}</th><th>{t('req.qty')}</th><th>{t('req.reason')}</th><th>{t('req.status')}</th></tr></thead>
          <tbody>
            {myRequests.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>{t('req.noMine')}</td></tr>
            ) : myRequests.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.created_at)}</td>
                <td className="code-cell">{r.seeds?.code || '-'}</td>
                <td>{displayQty(r.qty_requested, r.qty_unit, t)}</td>
                <td>{r.note || '-'}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(isSupervisor || isDeveloper) && (
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>{t('req.awaitApprovalTitle', { n: awaitingApproval.length })}</h4>
          {awaitingApproval.length === 0 ? (
            <p style={{ color: '#847d68', fontSize: 13 }}>{t('req.noAwaitApproval')}</p>
          ) : (
            <table>
              <thead><tr><th>{t('req.date')}</th><th>{t('field.code')}</th><th>{t('field.varietyShort')}</th><th>{t('req.requester')}</th><th>{t('req.qty')}</th><th>{t('req.reason')}</th><th></th></tr></thead>
              <tbody>
                {awaitingApproval.map((r) => (
                  editingReqId === r.id ? <EditRow key={r.id} req={r} onSave={saveEdit} /> : (
                    <tr key={r.id}>
                      <td>{fmtDate(r.created_at)}</td>
                      <td className="code-cell">{r.seeds?.code || '-'}</td>
                      <td>{r.seeds?.variety || '-'}</td>
                      <td>{r.requester_name}</td>
                      <td>{displayQty(r.qty_requested, r.qty_unit, t)}</td>
                      <td>{r.note || '-'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => handleApproval(r, 'approve')}>{t('common.approve')}</button>
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => startEdit(r)}>{t('common.edit')}</button>
                        <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => handleApproval(r, 'reject')}>{t('common.reject')}</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(isStaff || isDeveloper) && (
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>{t('req.awaitFulfillTitle', { n: awaitingFulfillment.length })}</h4>
          <p style={{ fontSize: 11.5, color: '#847d68', marginTop: -6 }}>{t('req.awaitFulfillHelp')}</p>
          {awaitingFulfillment.length === 0 ? (
            <p style={{ color: '#847d68', fontSize: 13 }}>{t('req.noAwaitFulfill')}</p>
          ) : (
            <table>
              <thead><tr><th>{t('req.date')}</th><th>{t('field.code')}</th><th>{t('field.varietyShort')}</th><th>{t('req.requester')}</th><th>{t('req.qty')}</th><th>{t('req.reason')}</th><th></th></tr></thead>
              <tbody>
                {awaitingFulfillment.map((r) => (
                  editingReqId === r.id ? <EditRow key={r.id} req={r} onSave={saveEdit} /> : (
                    <tr key={r.id}>
                      <td>{fmtDate(r.created_at)}</td>
                      <td className="code-cell">{r.seeds?.code || '-'}</td>
                      <td>{r.seeds?.variety || '-'}</td>
                      <td>{r.requester_name}</td>
                      <td>{displayQty(r.qty_requested, r.qty_unit, t)}</td>
                      <td>{r.note || '-'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => handleFulfillment(r, 'fulfill')}>{t('req.fulfill')}</button>
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => startEdit(r)}>{t('common.edit')}</button>
                        <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => handleFulfillment(r, 'reject')}>{t('common.reject')}</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>{t('req.allTitle')}</h4>
        <table>
          <thead><tr><th>{t('req.date')}</th><th>{t('field.code')}</th><th>{t('req.requester')}</th><th>{t('req.qty')}</th><th>{t('req.status')}</th></tr></thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>{t('req.noAll')}</td></tr>
            ) : requests.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.created_at)}</td>
                <td className="code-cell">{r.seeds?.code || '-'}</td>
                <td>{r.requester_name}</td>
                <td>{displayQty(r.qty_requested, r.qty_unit, t)}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
