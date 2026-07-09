import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useProfile } from '../../lib/useProfile';
import Nav from '../../components/Nav';

const LABS = [
  { id: '405B', name: '405B 실험실' },
  { id: '311C', name: '311C 실험실' },
];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0 ~ 23

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function hourLabel(h) { return `${pad2(h)}-${pad2(h + 1 === 24 ? 0 : h + 1)}`; }

// 해당 월의 캘린더 칸(6주 x 7일)을 만듦. 이번 달이 아닌 칸은 null.
function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=일요일
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function ReservationsPage() {
  const router = useRouter();
  const { session, profile, isStaff, isSupervisor, loading } = useProfile();

  const today = useMemo(() => new Date(), []);
  const [selectedLab, setSelectedLab] = useState('405B');
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [reservations, setReservations] = useState([]); // 이번 달 전체 예약
  const [myReservations, setMyReservations] = useState([]); // 나의 전체 예약 (두 실험실 모두)
  const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'
  const [selectedHours, setSelectedHours] = useState([]);
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

  const loadReservations = useCallback(async (lab, year, month) => {
    const start = `${year}-${pad2(month + 1)}-01`;
    const endDate = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${pad2(month + 1)}-${pad2(endDate)}`;
    const { data, error } = await supabase
      .from('lab_reservations')
      .select('*')
      .eq('lab_id', lab)
      .gte('reservation_date', start)
      .lte('reservation_date', end)
      .order('reservation_date', { ascending: true })
      .order('start_hour', { ascending: true });
    if (!error) setReservations(data || []);
  }, []);

  useEffect(() => {
    if (session) loadReservations(selectedLab, viewYear, viewMonth);
  }, [session, selectedLab, viewYear, viewMonth, loadReservations]);

  const loadMyReservations = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('lab_reservations')
      .select('*')
      .eq('user_id', profile.id)
      .order('reservation_date', { ascending: false })
      .order('start_hour', { ascending: true });
    if (!error) setMyReservations(data || []);
  }, [profile]);

  useEffect(() => {
    if (session && profile) loadMyReservations();
  }, [session, profile, loadMyReservations]);

  const reservationsByDate = useMemo(() => {
    const map = {};
    for (const r of reservations) {
      if (!map[r.reservation_date]) map[r.reservation_date] = [];
      map[r.reservation_date].push(r);
    }
    return map;
  }, [reservations]);

  const dayList = selectedDate ? (reservationsByDate[selectedDate] || []) : [];

  function isHourBooked(hour) {
    return dayList.some((r) => hour >= r.start_hour && hour < r.end_hour);
  }

  function goPrevMonth() {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(null);
  }
  function goNextMonth() {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(null);
  }
  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(toDateStr(today));
  }

  function pickDate(date) {
    setSelectedDate(toDateStr(date));
    setSelectedHours([]);
    setFormMsg(null);
  }

  function toggleHour(h) {
    if (isHourBooked(h)) return;
    setSelectedHours((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].sort((a, b) => a - b)));
  }

  async function handleReserve(e) {
    e.preventDefault();
    setFormMsg(null);
    if (!selectedDate) return;
    if (selectedHours.length === 0) {
      setFormMsg({ type: 'err', text: '예약할 시간을 1개 이상 선택하세요.' });
      return;
    }
    for (let i = 1; i < selectedHours.length; i++) {
      if (selectedHours[i] !== selectedHours[i - 1] + 1) {
        setFormMsg({ type: 'err', text: '연속된 시간대만 한 번에 예약할 수 있어요. (예: 09-11시는 가능, 09-10시 + 13-14시는 따로따로 예약해주세요)' });
        return;
      }
    }
    const startHour = selectedHours[0];
    const endHour = selectedHours[selectedHours.length - 1] + 1;

    setBusy(true);
    const { error } = await supabase.from('lab_reservations').insert({
      lab_id: selectedLab,
      reservation_date: selectedDate,
      start_hour: startHour,
      end_hour: endHour,
      user_id: profile.id,
      user_name: profile.name,
      purpose: purpose.trim(),
    });
    if (error) {
      const msg = error.code === '23P01'
        ? '방금 다른 사람이 같은 시간대를 먼저 예약했습니다. 새로고침 후 다시 시도해주세요.'
        : `예약 실패: ${error.message}`;
      setFormMsg({ type: 'err', text: msg });
      setBusy(false);
      return;
    }
    setFormMsg({ type: 'ok', text: `${hourLabel(startHour).slice(0, 2)}:00 ~ ${pad2(endHour === 24 ? 0 : endHour)}:00 예약이 완료되었습니다.` });
    setSelectedHours([]);
    setPurpose('');
    await loadReservations(selectedLab, viewYear, viewMonth);
    await loadMyReservations();
    setBusy(false);
  }

  async function handleCancel(r) {
    if (!window.confirm(`${r.user_name}님의 ${hourLabel(r.start_hour).slice(0, 2)}~${pad2(r.end_hour === 24 ? 0 : r.end_hour)}시 예약을 취소할까요?`)) return;
    setActingId(r.id);
    const { error } = await supabase.from('lab_reservations').delete().eq('id', r.id);
    if (error) alert(`취소 실패: ${error.message}`);
    await loadReservations(selectedLab, viewYear, viewMonth);
    await loadMyReservations();
    setActingId(null);
  }

  if (loading || !session || !profile || profile.status !== 'approved') {
    return <div className="wrap"><p>불러오는 중...</p></div>;
  }

  const grid = buildMonthGrid(viewYear, viewMonth);
  const todayStr = toDateStr(today);

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} />

      <div className="lab-tabs">
        {LABS.map((lab) => (
          <button
            key={lab.id}
            className={`lab-tab ${selectedLab === lab.id ? 'active' : ''}`}
            onClick={() => { setSelectedLab(lab.id); setSelectedDate(null); setSelectedHours([]); }}
          >
            {lab.name}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="cal-header">
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={goPrevMonth}>&larr; 이전달</button>
          <div className="serif" style={{ fontSize: 19, fontWeight: 700 }}>
            {viewYear}년 {viewMonth + 1}월
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginLeft: 10 }} onClick={goToday}>오늘</button>
          </div>
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={goNextMonth}>다음달 &rarr;</button>
        </div>

        <div className="cal-grid" style={{ marginBottom: 6 }}>
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        </div>
        <div className="cal-grid">
          {grid.map((date, i) => {
            if (!date) return <div key={i} className="cal-cell empty" />;
            const dateStr = toDateStr(date);
            const dayReservations = reservationsByDate[dateStr] || [];
            const cls = ['cal-cell'];
            if (dateStr === todayStr) cls.push('today');
            if (dateStr === selectedDate) cls.push('selected');
            return (
              <button key={i} className={cls.join(' ')} onClick={() => pickDate(date)}>
                <span className="cal-date">{date.getDate()}</span>
                {dayReservations.length > 0 && <span className="cal-count">{dayReservations.length}건</span>}
                {dayReservations.slice(0, 2).map((r) => (
                  <span key={r.id} className="cal-chip">{pad2(r.start_hour)}-{pad2(r.end_hour === 24 ? 0 : r.end_hour)} {r.user_name}</span>
                ))}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <h4 className="serif" style={{ marginTop: 0 }}>{selectedDate} 예약 현황 ({LABS.find((l) => l.id === selectedLab)?.name})</h4>
            {dayList.length === 0 ? (
              <p style={{ color: '#847d68', fontSize: 13 }}>아직 예약이 없습니다.</p>
            ) : (
              <table>
                <thead><tr><th>시간</th><th>예약자</th><th>용도</th><th></th></tr></thead>
                <tbody>
                  {dayList.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{pad2(r.start_hour)}:00~{pad2(r.end_hour === 24 ? 0 : r.end_hour)}:00</td>
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
            <h4 className="serif" style={{ marginTop: 0 }}>예약하기</h4>
            <p style={{ fontSize: 11.5, color: '#847d68', marginTop: -6, marginBottom: 10 }}>
              연속된 시간을 클릭해서 선택하세요 (1시간 단위, 빨간 칸은 이미 예약됨).
            </p>
            <div className="hour-grid">
              {HOURS.map((h) => {
                const booked = isHourBooked(h);
                const sel = selectedHours.includes(h);
                return (
                  <button
                    type="button"
                    key={h}
                    className={`hour-btn ${booked ? 'booked' : ''} ${sel ? 'selected' : ''}`}
                    disabled={booked}
                    onClick={() => toggleHour(h)}
                  >
                    {hourLabel(h)}
                  </button>
                );
              })}
            </div>
            <form onSubmit={handleReserve}>
              <div className="field">
                <label>용도 (선택)</label>
                <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="예: PCR 실험" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy || selectedHours.length === 0}>
                {busy ? '예약 중...' : `${selectedHours.length > 0 ? selectedHours.length + '시간 ' : ''}예약하기`}
              </button>
              {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>나의 예약 내역 ({myReservations.length})</h4>
        {myReservations.length === 0 ? (
          <p style={{ color: '#847d68', fontSize: 13 }}>아직 예약한 내역이 없습니다.</p>
        ) : (
          <table>
            <thead><tr><th>실험실</th><th>날짜</th><th>시간</th><th>용도</th><th></th></tr></thead>
            <tbody>
              {myReservations.map((r) => (
                <tr key={r.id}>
                  <td>{LABS.find((l) => l.id === r.lab_id)?.name || r.lab_id}</td>
                  <td className="mono">{r.reservation_date}</td>
                  <td className="mono">{pad2(r.start_hour)}:00~{pad2(r.end_hour === 24 ? 0 : r.end_hour)}:00</td>
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
