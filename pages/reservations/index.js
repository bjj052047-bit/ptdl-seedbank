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
const EXPERIMENT_PURPOSES = [
  'DNA extraction',
  'RNA extraction',
  'Agarose gel electrophoresis',
  'PAGE gel electrophoresis',
  'PCR',
  '기타',
];

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function hourLabel(h) { return `${pad2(h)}-${pad2(h + 1 === 24 ? 0 : h + 1)}`; }
function deviceNamesOf(r) {
  const list = (r.lab_reservation_devices || []).map((x) => x.lab_devices?.name || x.device_id);
  return list.length ? list.join(', ') : '-';
}
function displayPurpose(r) { return r.experiment_purpose || r.purpose || '-'; }

// 실험 목적 값을 라디오 선택 상태로 되돌림: 5개 고정값 중 하나면 그대로, 아니면 '기타'+커스텀텍스트
function purposeToEditState(value) {
  if (!value) return { purpose: '', custom: '' };
  if (EXPERIMENT_PURPOSES.includes(value)) return { purpose: value, custom: '' };
  return { purpose: '기타', custom: value };
}

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
  const [reservations, setReservations] = useState([]); // 이번 달 전체 예약 (기기 정보 포함)
  const [myReservations, setMyReservations] = useState([]); // 나의 전체 예약 (두 실험실 모두)
  const [devices, setDevices] = useState([]); // 전체 실험실 기기 목록
  const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'
  const [selectedHours, setSelectedHours] = useState([]);
  const [experimentPurpose, setExperimentPurpose] = useState('');
  const [customPurpose, setCustomPurpose] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
  const [formMsg, setFormMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState(null);

  // 나의 예약 내역 - 인라인 수정
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editStartHour, setEditStartHour] = useState(9);
  const [editEndHour, setEditEndHour] = useState(10);
  const [editPurpose, setEditPurpose] = useState('');
  const [editCustomPurpose, setEditCustomPurpose] = useState('');
  const [editDeviceIds, setEditDeviceIds] = useState([]);
  const [editMsg, setEditMsg] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); return; }
    if (profile.status !== 'approved') { router.replace('/pending'); }
  }, [session, profile, loading, router]);

  useEffect(() => {
    async function loadDevices() {
      const { data, error } = await supabase.from('lab_devices').select('*').order('lab_id').order('sort_order');
      if (!error) setDevices(data || []);
    }
    if (session) loadDevices();
  }, [session]);

  const devicesForSelectedLab = useMemo(() => devices.filter((d) => d.lab_id === selectedLab), [devices, selectedLab]);
  function deviceName(id) { return devices.find((d) => d.id === id)?.name || id; }

  const loadReservations = useCallback(async (lab, year, month) => {
    const start = `${year}-${pad2(month + 1)}-01`;
    const endDate = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${pad2(month + 1)}-${pad2(endDate)}`;
    const { data, error } = await supabase
      .from('lab_reservations')
      .select('*, lab_reservation_devices(device_id, lab_devices(name))')
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
      .select('*, lab_reservation_devices(device_id, lab_devices(name))')
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

  function resetForm() {
    setSelectedHours([]);
    setExperimentPurpose('');
    setCustomPurpose('');
    setSelectedDeviceIds([]);
    setFormMsg(null);
  }

  function pickDate(date) {
    setSelectedDate(toDateStr(date));
    resetForm();
  }

  function toggleHour(h) {
    setSelectedHours((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].sort((a, b) => a - b)));
  }

  function toggleDevice(id) {
    setSelectedDeviceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const newStartHour = selectedHours.length ? selectedHours[0] : null;
  const newEndHour = selectedHours.length ? selectedHours[selectedHours.length - 1] + 1 : null;

  const deviceConflicts = useMemo(() => {
    if (newStartHour === null || selectedDeviceIds.length === 0) return [];
    const list = [];
    for (const r of dayList) {
      const overlap = newStartHour < r.end_hour && newEndHour > r.start_hour;
      if (!overlap) continue;
      const rDeviceIds = (r.lab_reservation_devices || []).map((x) => x.device_id);
      for (const id of selectedDeviceIds) {
        if (rDeviceIds.includes(id)) {
          list.push({ deviceName: deviceName(id), start: r.start_hour, end: r.end_hour, userName: r.user_name });
        }
      }
    }
    return list;
  }, [dayList, newStartHour, newEndHour, selectedDeviceIds, devices]);

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
    if (!experimentPurpose) { setFormMsg({ type: 'err', text: '실험 목적을 선택하세요.' }); return; }
    if (experimentPurpose === '기타' && !customPurpose.trim()) { setFormMsg({ type: 'err', text: '기타 실험 목적을 직접 입력하세요.' }); return; }
    if (deviceConflicts.length > 0) { setFormMsg({ type: 'err', text: '선택한 기기가 다른 예약과 겹칩니다. 아래 경고를 확인하고 기기를 다시 선택해주세요.' }); return; }

    const startHour = selectedHours[0];
    const endHour = selectedHours[selectedHours.length - 1] + 1;
    const finalPurpose = experimentPurpose === '기타' ? customPurpose.trim() : experimentPurpose;

    setBusy(true);
    const { data: inserted, error } = await supabase.from('lab_reservations').insert({
      lab_id: selectedLab,
      reservation_date: selectedDate,
      start_hour: startHour,
      end_hour: endHour,
      user_id: profile.id,
      user_name: profile.name,
      purpose: finalPurpose,
      experiment_purpose: finalPurpose,
    }).select().single();

    if (error) {
      setFormMsg({ type: 'err', text: `예약 실패: ${error.message}` });
      setBusy(false);
      return;
    }

    if (selectedDeviceIds.length > 0) {
      const rows = selectedDeviceIds.map((deviceId) => ({
        reservation_id: inserted.id, device_id: deviceId, reservation_date: selectedDate, start_hour: startHour, end_hour: endHour,
      }));
      const { error: devError } = await supabase.from('lab_reservation_devices').insert(rows);
      if (devError) {
        await supabase.from('lab_reservations').delete().eq('id', inserted.id);
        const msg = devError.code === '23P01'
          ? '방금 다른 사람이 같은 기기·시간을 먼저 예약했습니다. 새로고침 후 다시 시도해주세요.'
          : `기기 예약 실패: ${devError.message}`;
        setFormMsg({ type: 'err', text: msg });
        setBusy(false);
        return;
      }
    }

    setFormMsg({ type: 'ok', text: `${hourLabel(startHour).slice(0, 2)}:00 ~ ${pad2(endHour === 24 ? 0 : endHour)}:00 예약이 완료되었습니다.` });
    resetForm();
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

  function startEdit(r) {
    setEditingId(r.id);
    setEditDate(r.reservation_date);
    setEditStartHour(r.start_hour);
    setEditEndHour(r.end_hour);
    const { purpose, custom } = purposeToEditState(r.experiment_purpose || r.purpose);
    setEditPurpose(purpose);
    setEditCustomPurpose(custom);
    setEditDeviceIds((r.lab_reservation_devices || []).map((x) => x.device_id));
    setEditMsg(null);
  }
  function cancelEdit() { setEditingId(null); setEditMsg(null); }
  function toggleEditDevice(id) {
    setEditDeviceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveEdit(r) {
    setEditMsg(null);
    const sh = Number(editStartHour);
    const eh = Number(editEndHour);
    if (!editDate) { setEditMsg({ type: 'err', text: '날짜를 선택하세요.' }); return; }
    if (eh <= sh) { setEditMsg({ type: 'err', text: '종료 시간은 시작 시간보다 늦어야 합니다.' }); return; }
    if (!editPurpose) { setEditMsg({ type: 'err', text: '실험 목적을 선택하세요.' }); return; }
    if (editPurpose === '기타' && !editCustomPurpose.trim()) { setEditMsg({ type: 'err', text: '기타 실험 목적을 직접 입력하세요.' }); return; }

    const { data: others } = await supabase
      .from('lab_reservations')
      .select('*, lab_reservation_devices(device_id)')
      .eq('lab_id', r.lab_id)
      .eq('reservation_date', editDate)
      .neq('id', r.id);

    const conflictMsgs = [];
    for (const other of others || []) {
      const overlap = sh < other.end_hour && eh > other.start_hour;
      if (!overlap) continue;
      const otherDeviceIds = (other.lab_reservation_devices || []).map((x) => x.device_id);
      for (const id of editDeviceIds) {
        if (otherDeviceIds.includes(id)) {
          conflictMsgs.push(`${deviceName(id)} (${pad2(other.start_hour)}:00~${pad2(other.end_hour === 24 ? 0 : other.end_hour)}:00, ${other.user_name})`);
        }
      }
    }
    if (conflictMsgs.length > 0) {
      setEditMsg({ type: 'err', text: `다음 기기와 시간이 겹칩니다: ${conflictMsgs.join(', ')}` });
      return;
    }

    const finalPurpose = editPurpose === '기타' ? editCustomPurpose.trim() : editPurpose;

    const { error } = await supabase.from('lab_reservations').update({
      reservation_date: editDate,
      start_hour: sh,
      end_hour: eh,
      purpose: finalPurpose,
      experiment_purpose: finalPurpose,
    }).eq('id', r.id);
    if (error) {
      const msg = error.code === '23P01' ? '그 시간대는 이미 다른 예약과 겹칩니다.' : `저장 실패: ${error.message}`;
      setEditMsg({ type: 'err', text: msg });
      return;
    }

    await supabase.from('lab_reservation_devices').delete().eq('reservation_id', r.id);
    if (editDeviceIds.length > 0) {
      const rows = editDeviceIds.map((deviceId) => ({ reservation_id: r.id, device_id: deviceId, reservation_date: editDate, start_hour: sh, end_hour: eh }));
      const { error: devError } = await supabase.from('lab_reservation_devices').insert(rows);
      if (devError) {
        setEditMsg({
          type: 'err',
          text: devError.code === '23P01' ? '방금 다른 사람이 같은 기기·시간을 먼저 예약했습니다. 새로고침 후 다시 시도해주세요.' : `기기 저장 실패: ${devError.message}`,
        });
        return;
      }
    }

    setEditingId(null);
    await loadReservations(selectedLab, viewYear, viewMonth);
    await loadMyReservations();
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
            onClick={() => { setSelectedLab(lab.id); setSelectedDate(null); resetForm(); }}
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
            <p style={{ fontSize: 11, color: '#847d68', marginTop: -6 }}>같은 시간대라도 실험실은 여러 팀이 함께 쓸 수 있습니다. 기기가 겹치는 경우만 예약이 막힙니다.</p>
            {dayList.length === 0 ? (
              <p style={{ color: '#847d68', fontSize: 13 }}>아직 예약이 없습니다.</p>
            ) : (
              <table>
                <thead><tr><th>시간</th><th>예약자</th><th>실험 목적</th><th>사용 기기</th><th></th></tr></thead>
                <tbody>
                  {dayList.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{pad2(r.start_hour)}:00~{pad2(r.end_hour === 24 ? 0 : r.end_hour)}:00</td>
                      <td>{r.user_name}</td>
                      <td>{displayPurpose(r)}</td>
                      <td style={{ fontSize: 12.5 }}>{deviceNamesOf(r)}</td>
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
              연속된 시간을 클릭해서 선택하세요 (1시간 단위).
            </p>
            <div className="hour-grid">
              {HOURS.map((h) => {
                const sel = selectedHours.includes(h);
                return (
                  <button
                    type="button"
                    key={h}
                    className={`hour-btn ${sel ? 'selected' : ''}`}
                    onClick={() => toggleHour(h)}
                  >
                    {hourLabel(h)}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleReserve}>
              <div className="field">
                <label>실험 목적 *</label>
                <div className="purpose-options">
                  {EXPERIMENT_PURPOSES.map((p) => (
                    <label key={p} className="purpose-radio">
                      <input type="radio" name="experimentPurpose" checked={experimentPurpose === p} onChange={() => setExperimentPurpose(p)} />
                      {p}
                    </label>
                  ))}
                </div>
                {experimentPurpose === '기타' && (
                  <input
                    value={customPurpose}
                    onChange={(e) => setCustomPurpose(e.target.value)}
                    placeholder="실험 목적을 입력하세요"
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>

              {experimentPurpose && (
                <div className="field">
                  <label>사용할 기기 (선택, 여러 개 선택 가능)</label>
                  <div className="device-grid">
                    {devicesForSelectedLab.map((d) => (
                      <button
                        type="button"
                        key={d.id}
                        className={`device-btn ${selectedDeviceIds.includes(d.id) ? 'selected' : ''}`}
                        onClick={() => toggleDevice(d.id)}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                  {deviceConflicts.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {deviceConflicts.map((c, i) => (
                        <div key={i} style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700 }}>
                          ⚠ {c.deviceName} 기기가 {pad2(c.start)}:00~{pad2(c.end === 24 ? 0 : c.end)}:00에 이미 예약되어 있습니다 ({c.userName}).
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy || selectedHours.length === 0 || !experimentPurpose || (experimentPurpose === '기타' && !customPurpose.trim()) || deviceConflicts.length > 0}
              >
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
            <thead><tr><th>실험실</th><th>날짜</th><th>시간</th><th>실험 목적</th><th>사용 기기</th><th></th></tr></thead>
            <tbody>
              {myReservations.map((r) => (
                editingId === r.id ? (
                  <tr key={r.id}>
                    <td colSpan={6}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '8px 0' }}>
                        <div className="field" style={{ margin: 0 }}><label>날짜</label><input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} /></div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>시작 시간</label>
                          <select value={editStartHour} onChange={(e) => setEditStartHour(e.target.value)}>
                            {HOURS.map((h) => <option key={h} value={h}>{pad2(h)}:00</option>)}
                          </select>
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>종료 시간</label>
                          <select value={editEndHour} onChange={(e) => setEditEndHour(e.target.value)}>
                            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{pad2(h === 24 ? 0 : h)}:00</option>)}
                          </select>
                        </div>
                        <div className="field" style={{ margin: 0, minWidth: 180 }}>
                          <label>실험 목적</label>
                          <select value={editPurpose} onChange={(e) => setEditPurpose(e.target.value)}>
                            <option value="">선택하세요</option>
                            {EXPERIMENT_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        {editPurpose === '기타' && (
                          <div className="field" style={{ margin: 0, minWidth: 180 }}>
                            <label>기타 목적 직접입력</label>
                            <input value={editCustomPurpose} onChange={(e) => setEditCustomPurpose(e.target.value)} />
                          </div>
                        )}
                        <button className="btn btn-primary" style={{ padding: '9px 14px' }} onClick={() => saveEdit(r)}>저장</button>
                        <button className="btn btn-ghost" style={{ padding: '9px 14px' }} onClick={cancelEdit}>취소</button>
                      </div>
                      <div className="field" style={{ marginTop: 4 }}>
                        <label>사용할 기기 ({LABS.find((l) => l.id === r.lab_id)?.name})</label>
                        <div className="device-grid">
                          {devices.filter((d) => d.lab_id === r.lab_id).map((d) => (
                            <button
                              type="button"
                              key={d.id}
                              className={`device-btn ${editDeviceIds.includes(d.id) ? 'selected' : ''}`}
                              onClick={() => toggleEditDevice(d.id)}
                            >
                              {d.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      {editMsg && <div className={`msg ${editMsg.type}`}>{editMsg.text}</div>}
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td>{LABS.find((l) => l.id === r.lab_id)?.name || r.lab_id}</td>
                    <td className="mono">{r.reservation_date}</td>
                    <td className="mono">{pad2(r.start_hour)}:00~{pad2(r.end_hour === 24 ? 0 : r.end_hour)}:00</td>
                    <td>{displayPurpose(r)}</td>
                    <td style={{ fontSize: 12.5 }}>{deviceNamesOf(r)}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => startEdit(r)}>수정</button>
                      <button className="btn btn-danger" style={{ padding: '3px 9px', fontSize: 11.5 }} disabled={actingId === r.id} onClick={() => handleCancel(r)}>취소</button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
