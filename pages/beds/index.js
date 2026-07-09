import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useProfile } from '../../lib/useProfile';
import Nav from '../../components/Nav';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function BedsPage() {
  const router = useRouter();
  const { session, profile, isStaff, isSupervisor, loading } = useProfile();

  const today = useMemo(() => new Date(), []);
  const [beds, setBeds] = useState([]);
  const [selectedBedId, setSelectedBedId] = useState('');
  const [bedReservations, setBedReservations] = useState([]); // 선택된 배드의 전체 예약
  const [myBedReservations, setMyBedReservations] = useState([]); // 나의 배드 예약 (전체)

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [formMsg, setFormMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); return; }
    if (profile.status !== 'approved') { router.replace('/pending'); }
  }, [session, profile, loading, router]);

  useEffect(() => {
    async function loadBeds() {
      const { data, error } = await supabase
        .from('beds')
        .select('*')
        .order('facility_order', { ascending: true })
        .order('sort_order', { ascending: true });
      if (!error && data) {
        setBeds(data);
        setSelectedBedId((prev) => prev || (data[0] && data[0].id) || '');
      }
    }
    if (session) loadBeds();
  }, [session]);

  const bedsByFacility = useMemo(() => {
    const groups = [];
    const index = {};
    for (const b of beds) {
      if (index[b.facility] === undefined) {
        index[b.facility] = groups.length;
        groups.push({ facility: b.facility, beds: [] });
      }
      groups[index[b.facility]].beds.push(b);
    }
    return groups;
  }, [beds]);

  const loadBedReservations = useCallback(async (bedId) => {
    if (!bedId) { setBedReservations([]); return; }
    const { data, error } = await supabase
      .from('bed_reservations')
      .select('*')
      .eq('bed_id', bedId)
      .order('start_date', { ascending: true });
    if (!error) setBedReservations(data || []);
  }, []);

  useEffect(() => {
    if (session && selectedBedId) loadBedReservations(selectedBedId);
  }, [session, selectedBedId, loadBedReservations]);

  const loadMyBedReservations = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('bed_reservations')
      .select('*, beds(id, facility)')
      .eq('user_id', profile.id)
      .order('start_date', { ascending: false });
    if (!error) setMyBedReservations(data || []);
  }, [profile]);

  useEffect(() => {
    if (session && profile) loadMyBedReservations();
  }, [session, profile, loadMyBedReservations]);

  function occupantsOn(dateStr) {
    return bedReservations.filter((r) => dateStr >= r.start_date && dateStr <= r.end_date);
  }

  function goPrevMonth() {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }
  function goNextMonth() {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }
  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  async function handleReserve(e) {
    e.preventDefault();
    setFormMsg(null);
    if (!selectedBedId) { setFormMsg({ type: 'err', text: '배드를 선택하세요.' }); return; }
    if (!startDate || !endDate) { setFormMsg({ type: 'err', text: '시작일과 종료일을 모두 선택하세요.' }); return; }
    if (endDate < startDate) { setFormMsg({ type: 'err', text: '종료일은 시작일보다 빠를 수 없습니다.' }); return; }

    const overlaps = bedReservations.filter((r) => startDate <= r.end_date && endDate >= r.start_date);
    if (overlaps.length > 0) {
      const detail = overlaps.map((r) => `${r.start_date}~${r.end_date} (${r.user_name})`).join(', ');
      const ok = window.confirm(`${detail} 기간과 예약이 겹칩니다. 공유하도록 협의하셨나요?`);
      if (!ok) return;
    }

    setBusy(true);
    const { error } = await supabase.from('bed_reservations').insert({
      bed_id: selectedBedId,
      start_date: startDate,
      end_date: endDate,
      user_id: profile.id,
      user_name: profile.name,
      purpose: purpose.trim(),
    });
    if (error) {
      setFormMsg({ type: 'err', text: `예약 실패: ${error.message}` });
      setBusy(false);
      return;
    }
    setFormMsg({ type: 'ok', text: `${startDate} ~ ${endDate} 예약이 완료되었습니다.` });
    setStartDate('');
    setEndDate('');
    setPurpose('');
    await loadBedReservations(selectedBedId);
    await loadMyBedReservations();
    setBusy(false);
  }

  async function handleCancel(r) {
    if (!window.confirm(`${r.start_date} ~ ${r.end_date} 예약을 취소할까요?`)) return;
    setActingId(r.id);
    const { error } = await supabase.from('bed_reservations').delete().eq('id', r.id);
    if (error) alert(`취소 실패: ${error.message}`);
    await loadBedReservations(selectedBedId);
    await loadMyBedReservations();
    setActingId(null);
  }

  if (loading || !session || !profile || profile.status !== 'approved') {
    return <div className="wrap"><p>불러오는 중...</p></div>;
  }

  const grid = buildMonthGrid(viewYear, viewMonth);
  const todayStr = toDateStr(today);
  const selectedBed = beds.find((b) => b.id === selectedBedId);

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} />

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>배드 예약하기</h4>
        <form onSubmit={handleReserve}>
          <div className="bed-form-row">
            <div className="field">
              <label>배드 선택 *</label>
              <select value={selectedBedId} onChange={(e) => setSelectedBedId(e.target.value)}>
                {bedsByFacility.map((g) => (
                  <optgroup key={g.facility} label={g.facility}>
                    {g.beds.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <label>시작일 *</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label>종료일 *</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>재배 작물 / 용도 (선택)</label>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="예: 벼 F2 재배" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '예약 중...' : '예약하기'}</button>
          </div>
          {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
        </form>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed var(--line)' }}>
          <div className="cal-header">
            <button type="button" className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={goPrevMonth}>&larr;</button>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
              {selectedBed ? `${selectedBed.id} (${selectedBed.facility})` : '배드'} · {viewYear}년 {viewMonth + 1}월
              <button type="button" className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11, marginLeft: 8 }} onClick={goToday}>오늘</button>
            </div>
            <button type="button" className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={goNextMonth}>&rarr;</button>
          </div>
          <div className="cal-grid-mini" style={{ marginBottom: 4 }}>
            {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          </div>
          <div className="cal-grid-mini">
            {grid.map((date, i) => {
              if (!date) return <div key={i} className="cal-cell-mini empty" />;
              const dateStr = toDateStr(date);
              const occ = occupantsOn(dateStr);
              const cls = ['cal-cell-mini'];
              if (dateStr === todayStr) cls.push('today');
              if (occ.length > 0) cls.push('occupied');
              return (
                <div key={i} className={cls.join(' ')} title={occ.map((o) => `${o.user_name} (${o.start_date}~${o.end_date})`).join('\n')}>
                  <span className="cal-date">{date.getDate()}</span>
                  {occ.length > 0 && <span className="cal-occ-count">{occ.length}건</span>}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: '#847d68', marginTop: 8 }}>보라색 칸 = 이미 예약된 날짜 (칸에 마우스를 올리면 예약자 확인 가능)</p>
        </div>
      </div>

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>{selectedBed ? `${selectedBed.id} 예약 목록` : '예약 목록'} ({bedReservations.length})</h4>
        {bedReservations.length === 0 ? (
          <p style={{ color: '#847d68', fontSize: 13 }}>아직 예약이 없습니다.</p>
        ) : (
          <table>
            <thead><tr><th>기간</th><th>예약자</th><th>작물/용도</th><th></th></tr></thead>
            <tbody>
              {bedReservations.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.start_date} ~ {r.end_date}</td>
                  <td>{r.user_name}</td>
                  <td>{r.purpose || '-'}</td>
                  <td>
                    {(r.user_id === profile.id || isStaff || isSupervisor) && (
                      <button className="btn btn-danger" style={{ padding: '3px 9px', fontSize: 11.5 }} disabled={actingId === r.id} onClick={() => handleCancel(r)}>취소</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>나의 배드 예약 내역 ({myBedReservations.length})</h4>
        {myBedReservations.length === 0 ? (
          <p style={{ color: '#847d68', fontSize: 13 }}>아직 예약한 배드가 없습니다.</p>
        ) : (
          <table>
            <thead><tr><th>배드</th><th>시설</th><th>기간</th><th>작물/용도</th><th></th></tr></thead>
            <tbody>
              {myBedReservations.map((r) => (
                <tr key={r.id}>
                  <td className="code-cell">{r.bed_id}</td>
                  <td>{r.beds?.facility || '-'}</td>
                  <td className="mono">{r.start_date} ~ {r.end_date}</td>
                  <td>{r.purpose || '-'}</td>
                  <td>
                    <button className="btn btn-danger" style={{ padding: '3px 9px', fontSize: 11.5 }} disabled={actingId === r.id} onClick={() => handleCancel(r)}>취소</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
