import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';

const STATUS_LABEL = { pending: '대기중(승인전)', approved: '승인됨(출고대기)', fulfilled: '완료', rejected: '거절됨' };
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
function displayQty(qty, unit) {
  if (unit === '립') return `${qty}립 (약 ${toGrams(qty, unit)}g)`;
  return `${qty}g`;
}

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || {};
  return (
    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function RequestsPage() {
  const router = useRouter();
  const { session, profile, isStaff, isSupervisor, loading } = useProfile();

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
    const t = setTimeout(async () => {
      let req = supabase.from('seeds').select('id, code, crop, variety, location, qty_g').order('harvest_year', { ascending: false }).limit(100);
      if (listQuery.trim()) req = req.or(`code.ilike.%${listQuery.trim()}%,variety.ilike.%${listQuery.trim()}%`);
      const { data, error } = await req;
      if (!error) setSeedList(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [listQuery, session]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const code = codeInput.trim();
      if (!code) { setFoundSeed(null); setSearchMsg(''); return; }
      const { data } = await supabase.from('seeds').select('*').eq('code', code).maybeSingle();
      if (data) { setFoundSeed(data); setSearchMsg(''); }
      else { setFoundSeed(null); setSearchMsg('해당 코드의 종자를 찾을 수 없습니다.'); }
    }, 300);
    return () => clearTimeout(t);
  }, [codeInput]);

  function pickFromList(seed) {
    setCodeInput(seed.code);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormMsg(null);
    if (!foundSeed) { setFormMsg({ type: 'err', text: '먼저 유효한 종자 코드를 입력하세요.' }); return; }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { setFormMsg({ type: 'err', text: '수량은 0보다 큰 숫자여야 합니다.' }); return; }

    setBusy(true);
    const { error } = await supabase.from('seed_requests').insert({
      seed_id: foundSeed.id, requester_id: profile.id, requester_name: profile.name,
      qty_requested: qtyNum, qty_unit: unit, note: note.trim(), status: 'pending',
    });
    if (error) { setFormMsg({ type: 'err', text: `요청 실패: ${error.message}` }); setBusy(false); return; }

    setFormMsg({ type: 'ok', text: '요청이 등록되었습니다. 승인자 확인 후 담당자가 처리하면 상태가 바뀝니다.' });
    setCodeInput(''); setFoundSeed(null); setQty(''); setUnit('g'); setNote('');
    loadRequests();
    setBusy(false);
  }

  // 승인자: 승인 / 거절
  async function handleApproval(req, action) {
    if (action === 'reject') {
      if (!window.confirm('이 요청을 거절할까요?')) return;
      setActingId(req.id);
      await supabase.from('seed_requests').update({
        status: 'rejected', processed_by: profile.id, processed_at: new Date().toISOString(),
      }).eq('id', req.id);
      loadRequests();
      setActingId(null);
      return;
    }
    if (!window.confirm(`${req.seeds?.code} ${displayQty(req.qty_requested, req.qty_unit)} 요청을 승인할까요? (승인 후 담당자가 출고 처리합니다)`)) return;
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
      if (!window.confirm('이 요청을 거절할까요?')) return;
      setActingId(req.id);
      await supabase.from('seed_requests').update({
        status: 'rejected', processed_by: profile.id, processed_at: new Date().toISOString(),
      }).eq('id', req.id);
      loadRequests();
      setActingId(null);
      return;
    }

    const { data: seed } = await supabase.from('seeds').select('*').eq('id', req.seed_id).maybeSingle();
    if (!seed) { alert('연결된 종자를 찾을 수 없습니다.'); return; }

    const gramsToDeduct = toGrams(req.qty_requested, req.qty_unit);
    const cur = Number(seed.qty_g) || 0;
    const next = cur - gramsToDeduct;
    const ok = window.confirm(
      next < 0
        ? `처리 후 재고가 음수(${next}g)가 됩니다. 그래도 처리할까요?`
        : `${seed.code} (${seed.variety}) ${displayQty(req.qty_requested, req.qty_unit)} 출고 처리할까요?`
    );
    if (!ok) return;

    setActingId(req.id);
    await supabase.from('seed_transactions').insert({
      seed_id: seed.id, type: '출고', qty: gramsToDeduct, qty_after: next,
      by_user: profile.id, by_name: profile.name,
      note: `종자 요청 처리 (요청자: ${req.requester_name}, 요청량: ${displayQty(req.qty_requested, req.qty_unit)})`,
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
    if (!code) { setEditMsg({ type: 'err', text: '종자 코드를 입력하세요.' }); return; }
    if (!qtyNum || qtyNum <= 0) { setEditMsg({ type: 'err', text: '수량은 0보다 큰 숫자여야 합니다.' }); return; }
    const { data: seed } = await supabase.from('seeds').select('id').eq('code', code).maybeSingle();
    if (!seed) { setEditMsg({ type: 'err', text: '해당 코드의 종자를 찾을 수 없습니다.' }); return; }
    const { error } = await supabase.from('seed_requests').update({
      seed_id: seed.id, qty_requested: qtyNum, qty_unit: editUnit, note: editNote.trim(),
    }).eq('id', req.id);
    if (error) { setEditMsg({ type: 'err', text: `저장 실패: ${error.message}` }); return; }
    setEditingReqId(null);
    loadRequests();
  }

  function EditRow({ req, onSave }) {
    return (
      <tr>
        <td colSpan={7}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr auto auto', gap: 8, alignItems: 'end', padding: '8px 0' }}>
            <div className="field" style={{ margin: 0 }}><label>종자코드</label><input value={editCode} onChange={(e) => setEditCode(e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}><label>수량</label><input value={editQty} onChange={(e) => setEditQty(e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}>
              <label>단위</label>
              <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)}><option value="g">g</option><option value="립">립</option></select>
            </div>
            <div className="field" style={{ margin: 0 }}><label>사유</label><input value={editNote} onChange={(e) => setEditNote(e.target.value)} /></div>
            <button className="btn btn-primary" style={{ padding: '9px 14px' }} onClick={() => onSave(req)}>저장</button>
            <button className="btn btn-ghost" style={{ padding: '9px 14px' }} onClick={cancelEdit}>취소</button>
          </div>
          {editMsg && <div className={`msg ${editMsg.type}`}>{editMsg.text}</div>}
        </td>
      </tr>
    );
  }

  if (loading || !session || !profile) return <div className="wrap"><p>불러오는 중...</p></div>;

  const myRequests = requests.filter((r) => r.requester_id === profile.id);
  const awaitingApproval = requests.filter((r) => r.status === 'pending');
  const awaitingFulfillment = requests.filter((r) => r.status === 'approved');

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>종자 요청하기</h4>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>종자 코드 *</label>
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="코드 입력 (오른쪽 목록에서 클릭해도 됩니다)" />
              {searchMsg && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{searchMsg}</div>}
              {foundSeed && (
                <div style={{ fontSize: 12.5, color: '#5c574a', marginTop: 6 }}>
                  {foundSeed.crop} · {foundSeed.variety} · 현재 재고: <b>{Number(foundSeed.qty_g) || 0}g</b>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
              <div className="field"><label>필요 수량 *</label><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="예: 20" /></div>
              <div className="field">
                <label>단위</label>
                <select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="g">g</option><option value="립">립</option></select>
              </div>
              <div className="field"><label>용도/사유</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: OO 실험용" /></div>
            </div>
            {unit === '립' && qty && (
              <div style={{ fontSize: 12, color: '#5c574a', marginTop: -6, marginBottom: 12 }}>
                약 {toGrams(qty, '립')}g 로 환산되어 재고에 반영됩니다 (100립 = 2g 기준)
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '제출 중...' : '요청 제출'}</button>
            {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
          </form>
        </div>

        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>등록된 종자 목록</h4>
          <input value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder="종자 코드 또는 품종명으로 검색" style={{ marginBottom: 10 }} />
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table>
              <thead><tr><th>코드</th><th>작물/품종</th><th>위치</th><th>재고</th></tr></thead>
              <tbody>
                {seedList.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>검색 결과가 없습니다.</td></tr>
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
        <h4 className="serif" style={{ marginTop: 0 }}>나의 요청 내역 ({myRequests.length})</h4>
        <table>
          <thead><tr><th>요청일</th><th>종자코드</th><th>수량</th><th>사유</th><th>상태</th></tr></thead>
          <tbody>
            {myRequests.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>아직 요청한 내역이 없습니다.</td></tr>
            ) : myRequests.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                <td className="code-cell">{r.seeds?.code || '-'}</td>
                <td>{displayQty(r.qty_requested, r.qty_unit)}</td>
                <td>{r.note || '-'}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isSupervisor && (
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>승인 대기 중인 요청 ({awaitingApproval.length})</h4>
          {awaitingApproval.length === 0 ? (
            <p style={{ color: '#847d68', fontSize: 13 }}>승인 대기 중인 요청이 없습니다.</p>
          ) : (
            <table>
              <thead><tr><th>요청일</th><th>종자코드</th><th>품종</th><th>요청자</th><th>수량</th><th>사유</th><th></th></tr></thead>
              <tbody>
                {awaitingApproval.map((r) => (
                  editingReqId === r.id ? <EditRow key={r.id} req={r} onSave={saveEdit} /> : (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                      <td className="code-cell">{r.seeds?.code || '-'}</td>
                      <td>{r.seeds?.variety || '-'}</td>
                      <td>{r.requester_name}</td>
                      <td>{displayQty(r.qty_requested, r.qty_unit)}</td>
                      <td>{r.note || '-'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => handleApproval(r, 'approve')}>승인</button>
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => startEdit(r)}>수정</button>
                        <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => handleApproval(r, 'reject')}>거절</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {isStaff && (
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>처리(출고) 대기 중인 요청 ({awaitingFulfillment.length})</h4>
          <p style={{ fontSize: 11.5, color: '#847d68', marginTop: -6 }}>승인자가 승인한 요청만 여기 나타납니다.</p>
          {awaitingFulfillment.length === 0 ? (
            <p style={{ color: '#847d68', fontSize: 13 }}>처리 대기 중인 요청이 없습니다.</p>
          ) : (
            <table>
              <thead><tr><th>요청일</th><th>종자코드</th><th>품종</th><th>요청자</th><th>수량</th><th>사유</th><th></th></tr></thead>
              <tbody>
                {awaitingFulfillment.map((r) => (
                  editingReqId === r.id ? <EditRow key={r.id} req={r} onSave={saveEdit} /> : (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                      <td className="code-cell">{r.seeds?.code || '-'}</td>
                      <td>{r.seeds?.variety || '-'}</td>
                      <td>{r.requester_name}</td>
                      <td>{displayQty(r.qty_requested, r.qty_unit)}</td>
                      <td>{r.note || '-'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => handleFulfillment(r, 'fulfill')}>처리(출고)</button>
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => startEdit(r)}>수정</button>
                        <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === r.id} onClick={() => handleFulfillment(r, 'reject')}>거절</button>
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
        <h4 className="serif" style={{ marginTop: 0 }}>전체 요청 내역</h4>
        <table>
          <thead><tr><th>요청일</th><th>종자코드</th><th>요청자</th><th>수량</th><th>상태</th></tr></thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>요청 내역이 없습니다.</td></tr>
            ) : requests.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                <td className="code-cell">{r.seeds?.code || '-'}</td>
                <td>{r.requester_name}</td>
                <td>{displayQty(r.qty_requested, r.qty_unit)}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}