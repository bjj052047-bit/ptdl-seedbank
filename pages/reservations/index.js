import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useProfile } from '../../lib/useProfile';
import Nav from '../../components/Nav';
import { useLang } from '../../lib/i18n';

// 실험실 표시 이름은 lib/i18n.js의 'lab.name' ("405B 실험실" / "Lab 405B")
const LABS = [{ id: '405B' }, { id: '311C' }];
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
  const { t, tMaybe, yearMonth, dow } = useLang();
  const labName = (id) => t('lab.name', { id });
  // '기타'는 DB에 한글로 저장되는 값 → 화면에서만 'Other'로 표시
  const purposeLabel = (p) => tMaybe('lab.purpose', p);
  const { session, profile, isStaff, isSupervisor, isDeveloper, loading } = useProfile();

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
      setFormMsg({ type: 'err', text: t('lab.err.noHours') });
      return;
    }
    for (let i = 1; i < selectedHours.length; i++) {
      if (selectedHours[i] !== selectedHours[i - 1] + 1) {
        setFormMsg({ type: 'err', text: t('lab.err.notContiguous') });
        return;
      }
    }
    if (!experimentPurpose) { setFormMsg({ type: 'err', text: t('lab.err.noPurpose') }); return; }
    if (experimentPurpose === '기타' && !customPurpose.trim()) { setFormMsg({ type: 'err', text: t('lab.err.noCustom') }); return; }
    if (deviceConflicts.length > 0) { setFormMsg({ type: 'err', text: t('lab.err.conflict') }); return; }

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
      setFormMsg({ type: 'err', text: t('lab.err.reserve', { msg: error.message }) });
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
          ? t('lab.err.race')
          : t('lab.err.device', { msg: devError.message });
        setFormMsg({ type: 'err', text: msg });
        setBusy(false);
        return;
      }
    }

    setFormMsg({ type: 'ok', text: t('lab.ok.reserve', { range: `${hourLabel(startHour).slice(0, 2)}:00 ~ ${pad2(endHour === 24 ? 0 : endHour)}:00` }) });
    resetForm();
    await loadReservations(selectedLab, viewYear, viewMonth);
    await loadMyReservations();
    setBusy(false);
  }

  async function handleCancel(r) {
    if (!window.confirm(t('lab.confirmCancel', { user: r.user_name, range: `${hourLabel(r.start_hour).slice(0, 2)}:00~${pad2(r.end_hour === 24 ? 0 : r.end_hour)}:00` }))) return;
    setActingId(r.id);
    const { error } = await supabase.from('lab_reservations').delete().eq('id', r.id);
    if (error) alert(t('common.cancelFailed', { msg: error.message }));
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
    if (!editDate) { setEditMsg({ type: 'err', text: t('lab.err.noDate') }); return; }
    if (eh <= sh) { setEditMsg({ type: 'err', text: t('lab.err.endBeforeStart') }); return; }
    if (!editPurpose) { setEditMsg({ type: 'err', text: t('lab.err.noPurpose') }); return; }
    if (editPurpose === '기타' && !editCustomPurpose.trim()) { setEditMsg({ type: 'err', text: t('lab.err.noCustom') }); return; }

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
      setEditMsg({ type: 'err', text: t('lab.err.editConflict', { list: conflictMsgs.join(', ') }) });
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
      const msg = error.code === '23P01' ? t('lab.err.overlap') : t('common.saveFailed', { msg: error.message });
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
          text: devError.code === '23P01' ? t('lab.err.race') : t('lab.err.deviceSave', { msg: devError.message }),
        });
        return;
      }
    }

    setEditingId(null);
    await loadReservations(selectedLab, viewYear, viewMonth);
    await loadMyReservations();
  }

  if (loading || !session || !profile || profile.status !== 'approved') {
    return <div className="wrap"><p>{t('common.loading')}</p></div>;
  }

  const grid = buildMonthGrid(viewYear, viewMonth);
  const todayStr = toDateStr(today);

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} isDeveloper={isDeveloper} />

      <div className="lab-tabs">
        {LABS.map((lab) => (
          <button
            key={lab.id}
            className={`lab-tab ${selectedLab === lab.id ? 'active' : ''}`}
            onClick={() => { setSelectedLab(lab.id); setSelectedDate(null); resetForm(); }}
          >
            {labName(lab.id)}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="cal-header">
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={goPrevMonth}>&larr; {t('common.prevMonth')}</button>
          <div className="serif" style={{ fontSize: 19, fontWeight: 700 }}>
            {yearMonth(viewYear, viewMonth)}
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginLeft: 10 }} onClick={goToday}>{t('common.today')}</button>
          </div>
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={goNextMonth}>{t('common.nextMonth')} &rarr;</button>
        </div>

        <div className="cal-grid" style={{ marginBottom: 6 }}>
          {dow.map((d) => <div key={d} className="cal-dow">{d}</div>)}
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
                {dayReservations.length > 0 && <span className="cal-count">{t('common.count', { n: dayReservations.length })}</span>}
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
            <h4 className="serif" style={{ marginTop: 0 }}>{t('lab.statusTitle', { date: selectedDate, lab: labName(selectedLab) })}</h4>
            <p style={{ fontSize: 11, color: '#847d68', marginTop: -6 }}>{t('lab.shareHelp')}</p>
            {dayList.length === 0 ? (
              <p style={{ color: '#847d68', fontSize: 13 }}>{t('lab.noneYet')}</p>
            ) : (
              <table>
                <thead><tr><th>{t('lab.time')}</th><th>{t('lab.user')}</th><th>{t('lab.purpose')}</th><th>{t('lab.devices')}</th><th></th></tr></thead>
                <tbody>
                  {dayList.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{pad2(r.start_hour)}:00~{pad2(r.end_hour === 24 ? 0 : r.end_hour)}:00</td>
                      <td>{r.user_name}</td>
                      <td>{purposeLabel(displayPurpose(r))}</td>
                      <td style={{ fontSize: 12.5 }}>{deviceNamesOf(r)}</td>
                      <td>
                        {(r.user_id === profile.id || isStaff || isSupervisor || isDeveloper) && (
                          <button className="btn btn-danger" style={{ padding: '3px 9px', fontSize: 11.5 }} disabled={actingId === r.id} onClick={() => handleCancel(r)}>{t('common.cancel')}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h4 className="serif" style={{ marginTop: 0 }}>{t('lab.reserveTitle')}</h4>
            <p style={{ fontSize: 11.5, color: '#847d68', marginTop: -6, marginBottom: 10 }}>
              {t('lab.hourHelp')}
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
                <label>{t('lab.purposeLabel')}</label>
                <div className="purpose-options">
                  {EXPERIMENT_PURPOSES.map((p) => (
                    <label key={p} className="purpose-radio">
                      <input type="radio" name="experimentPurpose" checked={experimentPurpose === p} onChange={() => setExperimentPurpose(p)} />
                      {purposeLabel(p)}
                    </label>
                  ))}
                </div>
                {experimentPurpose === '기타' && (
                  <input
                    value={customPurpose}
                    onChange={(e) => setCustomPurpose(e.target.value)}
                    placeholder={t('lab.purposeCustom')}
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>

              {experimentPurpose && (
                <div className="field">
                  <label>{t('lab.devicesLabel')}</label>
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
                          {t('lab.deviceConflict', { device: c.deviceName, range: `${pad2(c.start)}:00~${pad2(c.end === 24 ? 0 : c.end)}:00`, user: c.userName })}
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
                {busy ? t('lab.reserving') : (selectedHours.length > 0 ? t('lab.reserveBtnHours', { n: selectedHours.length }) : t('lab.reserveBtn'))}
              </button>
              {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>{t('lab.myTitle', { n: myReservations.length })}</h4>
        {myReservations.length === 0 ? (
          <p style={{ color: '#847d68', fontSize: 13 }}>{t('lab.noMine')}</p>
        ) : (
          <table>
            <thead><tr><th>{t('lab.lab')}</th><th>{t('common.date')}</th><th>{t('lab.time')}</th><th>{t('lab.purpose')}</th><th>{t('lab.devices')}</th><th></th></tr></thead>
            <tbody>
              {myReservations.map((r) => (
                editingId === r.id ? (
                  <tr key={r.id}>
                    <td colSpan={6}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '8px 0' }}>
                        <div className="field" style={{ margin: 0 }}><label>{t('common.date')}</label><input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} /></div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>{t('lab.startHour')}</label>
                          <select value={editStartHour} onChange={(e) => setEditStartHour(e.target.value)}>
                            {HOURS.map((h) => <option key={h} value={h}>{pad2(h)}:00</option>)}
                          </select>
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>{t('lab.endHour')}</label>
                          <select value={editEndHour} onChange={(e) => setEditEndHour(e.target.value)}>
                            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{pad2(h === 24 ? 0 : h)}:00</option>)}
                          </select>
                        </div>
                        <div className="field" style={{ margin: 0, minWidth: 180 }}>
                          <label>{t('lab.purpose')}</label>
                          <select value={editPurpose} onChange={(e) => setEditPurpose(e.target.value)}>
                            <option value="">{t('lab.choose')}</option>
                            {EXPERIMENT_PURPOSES.map((p) => <option key={p} value={p}>{purposeLabel(p)}</option>)}
                          </select>
                        </div>
                        {editPurpose === '기타' && (
                          <div className="field" style={{ margin: 0, minWidth: 180 }}>
                            <label>{t('lab.customLabel')}</label>
                            <input value={editCustomPurpose} onChange={(e) => setEditCustomPurpose(e.target.value)} />
                          </div>
                        )}
                        <button className="btn btn-primary" style={{ padding: '9px 14px' }} onClick={() => saveEdit(r)}>{t('common.save')}</button>
                        <button className="btn btn-ghost" style={{ padding: '9px 14px' }} onClick={cancelEdit}>{t('common.cancel')}</button>
                      </div>
                      <div className="field" style={{ marginTop: 4 }}>
                        <label>{t('lab.devicesFor', { lab: labName(r.lab_id) })}</label>
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
                    <td>{labName(r.lab_id)}</td>
                    <td className="mono">{r.reservation_date}</td>
                    <td className="mono">{pad2(r.start_hour)}:00~{pad2(r.end_hour === 24 ? 0 : r.end_hour)}:00</td>
                    <td>{purposeLabel(displayPurpose(r))}</td>
                    <td style={{ fontSize: 12.5 }}>{deviceNamesOf(r)}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => startEdit(r)}>{t('common.edit')}</button>
                      <button className="btn btn-danger" style={{ padding: '3px 9px', fontSize: 11.5 }} disabled={actingId === r.id} onClick={() => handleCancel(r)}>{t('common.cancel')}</button>
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
