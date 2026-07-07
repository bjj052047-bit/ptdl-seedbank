import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';

const STATUS_LABEL = { pending: '대기중', fulfilled: '완료', rejected: '거절됨' };

export default function RequestsPage() {
  const router = useRouter();
  const { session, profile, isStaff, loading } = useProfile();

  const [codeInput, setCodeInput] = useState('');
  const [foundSeed, setFoundSeed] = useState(null);
  const [searchMsg, setSearchMsg] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [formMsg, setFormMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const [requests, setRequests] = useState([]);
  const [processingId, setProcessingId] = useState(null);

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
      .limit(100);
    if (!error) setRequests(data || []);
  }, []);

  useEffect(() => {
    if (session) loadRequests();
  }, [session, loadRequests]);

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

  async function handleSubmit(e) {
    e.preventDefault();
    setFormMsg(null);
    if (!foundSeed) { setFormMsg({ type: 'err', text: '먼저 유효한 종자 코드를 입력하세요.' }); return; }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { setFormMsg({ type: 'err', text: '수량은 0보다 큰 숫자여야 합니다.' }); return; }

    setBusy(true);
    const { error } = await supabase.from('seed_requests').insert({
      seed_id: foundSeed.id,
      requester_id: profile.id,
      requester_name: profile.name,
      qty_requested: qtyNum,
      note: note.trim(),
      status: 'pending',
    });
    if (error) {
      setFormMsg({ type: 'err', text: `요청 실패: ${error.message}` });
      setBusy(false);
      return;
    }
    setFormMsg({ type: 'ok', text: '요청이 등록되었습니다. 담당자가 처리하면 상태가 바뀝니다.' });
    setCodeInput('');
    setFoundSeed(null);
    setQty('');
    setNote('');
    loadRequests();
    setBusy(false);
  }

  async function handleProcess(req, action) {
    if (action === 'reject') {
      const ok = window.confirm('이 요청을 거절할까요?');
      if (!ok) return;
      setProcessingId(req.id);
      await supabase.from('seed_requests').update({
        status: 'rejected', processed_by: profile.id, processed_at: new Date().toISOString(),
      }).eq('id', req.id);
      loadRequests();
      setProcessingId(null);
      return;
    }

    // action === 'fulfill' : 출고 트랜잭션 생성 + 재고 반영 + 요청 상태 변경
    const { data: seed } = await supabase.from('seeds').select('*').eq('id', req.seed_id).maybeSingle();
    if (!seed) { alert('연결된 종자를 찾을 수 없습니다.'); return; }

    const cur = Number(seed.qty_g) || 0;
    const next = cur - Number(req.qty_requested);
    if (next < 0) {
      const ok = window.confirm(`처리 후 재고가 음수(${next})가 됩니다. 그래도 처리할까요?`);
      if (!ok) return;
    } else {
      const ok = window.confirm(`${seed.code} (${seed.variety}) ${req.qty_requested}g 출고 처리할까요?`);
      if (!ok) return;
    }

    setProcessingId(req.id);
    await supabase.from('seed_transactions').insert({
      seed_id: seed.id, type: '출고', qty: req.qty_requested, qty_after: next,
      by_user: profile.id, by_name: profile.name, note: `종자 요청 처리 (요청자: ${req.requester_name})`,
    });
    await supabase.from('seeds').update({ qty_g: next }).eq('id', seed.id);
    await supabase.from('seed_requests').update({
      status: 'fulfilled', processed_by: profile.id, processed_at: new Date().toISOString(),
    }).eq('id', req.id);

    loadRequests();
    setProcessingId(null);
  }

  if (loading || !session || !profile) return <div className="wrap"><p>불러오는 중...</p></div>;

  const pending = requests.filter((r) => r.status === 'pending');
  const others = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} />

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>종자 요청하기</h4>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>종자 코드 *</label>
            <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="코드 입력" />
            {searchMsg && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{searchMsg}</div>}
            {foundSeed && (
              <div style={{ fontSize: 12.5, color: '#5c574a', marginTop: 6 }}>
                {foundSeed.crop} · {foundSeed.variety} · 현재 재고: <b>{Number(foundSeed.qty_g) || 0}g</b>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div className="field"><label>필요 수량 (g) *</label><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="예: 20" /></div>
            <div className="field"><label>용도/사유</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: OO 실험용" /></div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '제출 중...' : '요청 제출'}</button>
          {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
        </form>
      </div>

      {isStaff && (
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>처리 대기 중인 요청 ({pending.length})</h4>
          {pending.length === 0 ? (
            <p style={{ color: '#847d68', fontSize: 13 }}>대기 중인 요청이 없습니다.</p>
          ) : (
            <table>
              <thead><tr><th>요청일</th><th>종자코드</th><th>품종</th><th>요청자</th><th>수량</th><th>사유</th><th></th></tr></thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                    <td className="code-cell">{r.seeds?.code || '-'}</td>
                    <td>{r.seeds?.variety || '-'}</td>
                    <td>{r.requester_name}</td>
                    <td>{r.qty_requested}g</td>
                    <td>{r.note || '-'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={processingId === r.id} onClick={() => handleProcess(r, 'fulfill')}>처리(출고)</button>
                      <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} disabled={processingId === r.id} onClick={() => handleProcess(r, 'reject')}>거절</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>요청 내역</h4>
        <table>
          <thead><tr><th>요청일</th><th>종자코드</th><th>요청자</th><th>수량</th><th>상태</th></tr></thead>
          <tbody>
            {[...pending, ...others].length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>요청 내역이 없습니다.</td></tr>
            ) : [...pending, ...others].map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                <td className="code-cell">{r.seeds?.code || '-'}</td>
                <td>{r.requester_name}</td>
                <td>{r.qty_requested}g</td>
                <td>
                  <span style={{
                    fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: r.status === 'fulfilled' ? 'rgba(63,93,58,0.14)' : r.status === 'rejected' ? 'rgba(163,63,63,0.14)' : 'rgba(201,162,75,0.2)',
                    color: r.status === 'fulfilled' ? 'var(--green-deep)' : r.status === 'rejected' ? 'var(--danger)' : '#7a5d15',
                  }}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}