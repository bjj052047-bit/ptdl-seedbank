import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';

export default function IoPage() {
  const router = useRouter();
  const { session, profile, isStaff, isSupervisor, loading } = useProfile();

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
    if (!profile) { router.replace('/welcome'); return; }
    if (profile.status !== 'approved') { router.replace('/pending'); return; }
    if (!isStaff) { router.replace('/'); }
  }, [session, profile, isStaff, loading, router]);

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
    if (isStaff) loadLogs();
  }, [isStaff, loadLogs]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const code = codeInput.trim();
      if (!code) { setFoundSeed(null); setSearchMsg(''); return; }
      const { data } = await supabase.from('seeds').select('*').eq('code', code).maybeSingle();
      if (data) {
        setFoundSeed(data);
        setSearchMsg('');
      } else {
        setFoundSeed(null);
        setSearchMsg('해당 코드의 종자를 찾을 수 없습니다.');
      }
    }, 300);
    return () => clearTimeout(t);
  }, [codeInput]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormMsg(null);

    if (!foundSeed) { setFormMsg({ type: 'err', text: '먼저 유효한 종자 코드를 입력하세요.' }); return; }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { setFormMsg({ type: 'err', text: '수량은 0보다 큰 숫자여야 합니다.' }); return; }

    const cur = Number(foundSeed.qty_g) || 0;
    const next = type === '출고' ? cur - qtyNum : cur + qtyNum;

    if (next < 0) {
      const ok = window.confirm(
        `처리 후 재고가 음수(${next})가 됩니다. 현재 재고(${cur}g)보다 많은 출고입니다. 그래도 기록할까요?`
      );
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
      setFormMsg({ type: 'err', text: `기록 실패: ${txError.message}` });
      setBusy(false);
      return;
    }
    const { error: updateError } = await supabase.from('seeds').update({ qty_g: next }).eq('id', foundSeed.id);
    if (updateError) {
      setFormMsg({ type: 'err', text: `재고 반영 실패: ${updateError.message}` });
      setBusy(false);
      return;
    }

    setFormMsg({ type: 'ok', text: `기록되었습니다. 처리 후 재고: ${next}g` });
    setFoundSeed({ ...foundSeed, qty_g: next });
    setQty('');
    setNote('');
    loadLogs();
    setBusy(false);
  }

  if (loading || !session || !isStaff) return <div className="wrap"><p>불러오는 중...</p></div>;

  const filteredLogs = logs.filter((l) => !logFilter.trim() || (l.seeds?.code || '').toLowerCase().includes(logFilter.trim().toLowerCase()));

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>입출고 기록하기</h4>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>종자 코드 *</label>
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="코드 입력" />
              {searchMsg && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{searchMsg}</div>}
              {foundSeed && (
                <div style={{ fontSize: 12.5, color: '#5c574a', marginTop: 6 }}>
                  {foundSeed.crop} · {foundSeed.variety} · 위치: {foundSeed.location || '-'} · 현재 재고: <b>{Number(foundSeed.qty_g) || 0}g</b>
                </div>
              )}
            </div>

            <div className="field">
              <label>구분 *</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13.5 }}>
                  <input type="radio" checked={type === '입고'} onChange={() => setType('입고')} style={{ width: 'auto' }} /> 입고
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13.5 }}>
                  <input type="radio" checked={type === '출고'} onChange={() => setType('출고')} style={{ width: 'auto' }} /> 출고
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>수량 (g) *</label><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="예: 50" /></div>
              <div className="field"><label>일자</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            <div className="field"><label>사유/용도</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 파종용 반출" /></div>

            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '처리 중...' : '기록하기'}</button>
            {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
          </form>
        </div>

        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>최근 입출고 내역</h4>
          <input value={logFilter} onChange={(e) => setLogFilter(e.target.value)} placeholder="종자코드로 필터링" style={{ marginBottom: 10 }} />
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table>
              <thead><tr><th>일자</th><th>코드</th><th>구분</th><th>수량</th><th>담당자</th><th>처리후재고</th></tr></thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>내역이 없습니다.</td></tr>
                ) : filteredLogs.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleDateString('ko-KR')}</td>
                    <td className="code-cell">{l.seeds?.code || '-'}</td>
                    <td>{l.type}</td>
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