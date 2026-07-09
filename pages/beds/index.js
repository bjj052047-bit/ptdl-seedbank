import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useProfile } from '../../lib/useProfile';
import Nav from '../../components/Nav';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const STATUS_LABEL = { pending: '대기중(승인전)', approved: '승인됨', rejected: '거절됨' };
const STATUS_COLOR = {
  pending: { bg: 'rgba(201,162,75,0.2)', fg: '#7a5d15' },
  approved: { bg: 'rgba(63,93,58,0.14)', fg: 'var(--green-deep)' },
  rejected: { bg: 'rgba(163,63,63,0.14)', fg: 'var(--danger)' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || {};
  return (
    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.fg }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

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
  const isAdmin = isStaff || isSupervisor;

  const today = useMemo(() => new Date(), []);
  const [beds, setBeds] = useState([]);
  const [selectedBedId, setSelectedBedId] = useState('');
  const [bedReservations, setBedReservations] = useState([]); // 선택된 배드의 전체 예약
  const [myBedReservations, setMyBedReservations] = useState([]); // 나의 배드 예약 (전체)
  const [pendingApprovals, setPendingApprovals] = useState([]); // 승인 대기 (담당자/승인자용)

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [crop, setCrop] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [formMsg, setFormMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  // 나의 배드 예약 내역 - 인라인 수정
  const [editingId, setEditingId] = useState(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editCrop, setEditCrop] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editMsg, setEditMsg] = useState(null);

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

  const loadPendingApprovals = useCallback(async () => {
    if (!isAdmin) { setPendingApprovals([]); return; }
    const { data, error } = await supabase
      .from('bed_reservations')
      .select('*, beds(id, facility)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (!error) setPendingApprovals(data || []);
  }, [isAdmin]);

  useEffect(() => {
    if (session && isAdmin) loadPendingApprovals();
  }, [session, isAdmin, loadPendingApprovals]);

  async function reloadAll() {
    await Promise.all([
      loadBedReservations(selectedBedId),
      loadMyBedReservations(),
      isAdmin ? loadPendingApprovals() : Promise.resolve(),
    ]);
  }

  // 이 배드를 실제로 점유 중(거절되지 않은)인 예약들 - 승인 대기 중인 것도 참고용으로 포함
  function occupantsOn(dateStr) {
    return bedReservations.filter((r) => r.status !== 'rejected' && dateStr >= r.start_date && dateStr <= r.end_date);
  }

  // 시작일이 바뀌면(직접 타이핑 포함) 미니 달력이 그 달로 자동 이동
  useEffect(() => {
    if (!startDate) return;
    const d = parseYMD(startDate);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [startDate]);

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

  // 달력 칸을 클릭해서 시작일/종료일을 고를 수 있게 함 (직접 타이핑도 그대로 가능)
  function pickCalendarDate(dateStr) {
    if (!startDate || endDate) {
      setStartDate(dateStr);
      setEndDate('');
      return;
    }
    if (dateStr < startDate) {
      setStartDate(dateStr);
      setEndDate('');
      return;
    }
    setEndDate(dateStr);
  }

  function checkOverlapAndConfirm(existingList, newStart, newEnd) {
    const overlaps = existingList.filter((r) => r.status !== 'rejected' && newStart <= r.end_date && newEnd >= r.start_date);
    if (overlaps.length === 0) return true;
    const detail = overlaps.map((r) => `${r.start_date}~${r.end_date} (${r.user_name})`).join(', ');
    return window.confirm(`${detail} 기간과 예약이 겹칩니다. 공유하도록 협의하셨나요?`);
  }

  async function handleReserve(e) {
    e.preventDefault();
    setFormMsg(null);
    if (!selectedBedId) { setFormMsg({ type: 'err', text: '배드를 선택하세요.' }); return; }
    if (!startDate || !endDate) { setFormMsg({ type: 'err', text: '시작일과 종료일을 모두 선택하세요.' }); return; }
    if (endDate < startDate) { setFormMsg({ type: 'err', text: '종료일은 시작일보다 빠를 수 없습니다.' }); return; }

    if (!checkOverlapAndConfirm(bedReservations, startDate, endDate)) return;

    setBusy(true);
    const { error } = await supabase.from('bed_reservations').insert({
      bed_id: selectedBedId,
      start_date: startDate,
      end_date: endDate,
      user_id: profile.id,
      user_name: profile.name,
      crop: crop.trim(),
      purpose: purpose.trim(),
      notes: notes.trim(),
      status: 'pending',
    });
    if (error) {
      setFormMsg({ type: 'err', text: `예약 실패: ${error.message}` });
      setBusy(false);
      return;
    }
    setFormMsg({ type: 'ok', text: `${startDate} ~ ${endDate} 예약을 신청했습니다. 담당자/승인자가 승인하면 확정됩니다.` });
    setStartDate('');
    setEndDate('');
    setCrop('');
    setPurpose('');
    setNotes('');
    await reloadAll();
    setBusy(false);
  }

  async function handleCancel(r) {
    if (!window.confirm(`${r.start_date} ~ ${r.end_date} 예약을 취소할까요?`)) return;
    setActingId(r.id);
    const { error } = await supabase.from('bed_reservations').delete().eq('id', r.id);
    if (error) alert(`취소 실패: ${error.message}`);
    await reloadAll();
    setActingId(null);
  }

  // 실제로는 예약 기간보다 일찍 실험이 끝난 경우 - 삭제하지 않고 종료일만 앞당겨서
  // 남은 기간을 다른 사람이 예약할 수 있게 풀어줌
  async function handleFinishEarly(r) {
    const suggested = todayStrForFinish() < r.start_date ? r.start_date
      : (todayStrForFinish() > r.end_date ? r.end_date : todayStrForFinish());
    const input = window.prompt(
      `실제로 종료된 날짜를 입력하세요 (YYYY-MM-DD). 이 날짜 다음날부터는 다른 사람이 예약할 수 있게 됩니다.\n(원래 예약 기간: ${r.start_date} ~ ${r.end_date})`,
      suggested
    );
    if (input === null) return; // 취소함
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) { alert('날짜 형식이 올바르지 않습니다. 예: 2026-07-20'); return; }
    if (input < r.start_date) { alert('시작일보다 빠른 날짜로는 종료할 수 없습니다.'); return; }
    if (input >= r.end_date) { alert('원래 종료일보다 빠른 날짜를 입력해야 종료 처리가 됩니다.'); return; }
    if (!window.confirm(`${r.start_date} ~ ${input} 로 종료 처리할까요? (원래 종료일 ${r.end_date}는 취소되고, 이후 날짜는 예약 가능해집니다)`)) return;

    setActingId(r.id);
    const { error } = await supabase.from('bed_reservations').update({ end_date: input }).eq('id', r.id);
    if (error) alert(`처리 실패: ${error.message}`);
    await reloadAll();
    setActingId(null);
  }
  function todayStrForFinish() { return toDateStr(new Date()); }

  async function handleApproval(r, action) {
    const label = action === 'approved' ? '승인' : '거절';
    if (!window.confirm(`${r.bed_id} (${r.start_date}~${r.end_date}, ${r.user_name}님) 예약을 ${label}할까요?`)) return;
    setApprovingId(r.id);
    const { error } = await supabase.from('bed_reservations').update({
      status: action, approved_by: profile.id, approved_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (error) alert(`처리 실패: ${error.message}`);
    await reloadAll();
    setApprovingId(null);
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditStart(r.start_date);
    setEditEnd(r.end_date);
    setEditCrop(r.crop || '');
    setEditPurpose(r.purpose || '');
    setEditNotes(r.notes || '');
    setEditMsg(null);
  }
  function cancelEdit() { setEditingId(null); setEditMsg(null); }

  async function saveEdit(r) {
    setEditMsg(null);
    if (!editStart || !editEnd) { setEditMsg({ type: 'err', text: '시작일과 종료일을 모두 입력하세요.' }); return; }
    if (editEnd < editStart) { setEditMsg({ type: 'err', text: '종료일은 시작일보다 빠를 수 없습니다.' }); return; }

    const { data: others } = await supabase.from('bed_reservations').select('*').eq('bed_id', r.bed_id).neq('id', r.id);
    if (!checkOverlapAndConfirm(others || [], editStart, editEnd)) return;

    const { error } = await supabase.from('bed_reservations').update({
      start_date: editStart,
      end_date: editEnd,
      crop: editCrop.trim(),
      purpose: editPurpose.trim(),
      notes: editNotes.trim(),
      status: 'pending',
      approved_by: null,
      approved_at: null,
    }).eq('id', r.id);
    if (error) { setEditMsg({ type: 'err', text: `저장 실패: ${error.message}` }); return; }
    setEditingId(null);
    await reloadAll();
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
        <p style={{ fontSize: 11.5, color: '#847d68', marginTop: -6, marginBottom: 10 }}>
          예약을 신청하면 바로 확정되지 않고, 담당자/승인자가 승인해야 최종 반영됩니다.
        </p>
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
              <label>시작일 * (직접 입력 가능)</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label>종료일 * (직접 입력 가능)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '신청 중...' : '예약 신청하기'}</button>
          </div>
          <div className="bed-form-row">
            <div className="field" style={{ flex: 1 }}>
              <label>재배 작물 (선택)</label>
              <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="예: 벼 F2" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>용도 (선택)</label>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="예: 세대 진전" />
            </div>
            <div className="field" style={{ flex: 1.5 }}>
              <label>비고 (선택)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="특이사항이 있으면 적어주세요" />
            </div>
          </div>
          {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
        </form>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed var(--line)' }}>
          <div className="cal-header">
            <button type="button" className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={goPrevMonth}>&larr;</button>
            <div className="mono" style={{ fontSize: 14, fontWeight: 700 }}>
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
              const hasApproved = occ.some((o) => o.status === 'approved');
              const hasPending = occ.some((o) => o.status === 'pending');
              const inRange = startDate && endDate && dateStr >= startDate && dateStr <= endDate;
              const isRangeEdge = dateStr === startDate || dateStr === endDate;
              const cls = ['cal-cell-mini'];
              if (dateStr === todayStr) cls.push('today');
              if (hasApproved) cls.push('occupied');
              else if (hasPending) cls.push('occupied-pending');
              if (inRange) cls.push('in-range');
              if (isRangeEdge) cls.push('range-edge');
              return (
                <button
                  key={i}
                  type="button"
                  className={cls.join(' ')}
                  onClick={() => pickCalendarDate(dateStr)}
                  title={occ.map((o) => `${o.user_name} (${o.start_date}~${o.end_date}) [${STATUS_LABEL[o.status]}]`).join('\n')}
                >
                  <span className="cal-date">{date.getDate()}</span>
                  {occ.length > 0 && <span className="cal-occ-count">{occ.length}건</span>}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: '#847d68', marginTop: 8 }}>
            진한 보라 = 승인된 예약, 연한 주황 = 승인 대기 중인 예약, 초록 테두리 = 지금 고르는 중인 기간. 날짜를 클릭해서 시작일/종료일을 고르거나, 위 입력칸에 직접 타이핑해도 됩니다.
          </p>
        </div>
      </div>

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>{selectedBed ? `${selectedBed.id} 예약 목록` : '예약 목록'} ({bedReservations.length})</h4>
        {bedReservations.length === 0 ? (
          <p style={{ color: '#847d68', fontSize: 13 }}>아직 예약이 없습니다.</p>
        ) : (
          <table>
            <thead><tr><th>기간</th><th>예약자</th><th>작물</th><th>용도</th><th>비고</th><th>상태</th><th></th></tr></thead>
            <tbody>
              {bedReservations.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.start_date} ~ {r.end_date}</td>
                  <td>{r.user_name}</td>
                  <td>{r.crop || '-'}</td>
                  <td>{r.purpose || '-'}</td>
                  <td>{r.notes || '-'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {(r.user_id === profile.id || isAdmin) && r.status !== 'rejected' && r.end_date >= todayStr && (
                      <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }} disabled={actingId === r.id} onClick={() => handleFinishEarly(r)}>종료</button>
                    )}
                    {(r.user_id === profile.id || isAdmin) && (
                      <button className="btn btn-danger" style={{ padding: '3px 9px', fontSize: 11.5 }} disabled={actingId === r.id} onClick={() => handleCancel(r)}>취소</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isAdmin && (
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>승인 대기 중인 배드 예약 ({pendingApprovals.length})</h4>
          {pendingApprovals.length === 0 ? (
            <p style={{ color: '#847d68', fontSize: 13 }}>승인 대기 중인 예약이 없습니다.</p>
          ) : (
            <table>
              <thead><tr><th>배드</th><th>시설</th><th>예약자</th><th>기간</th><th>작물</th><th>용도</th><th>비고</th><th></th></tr></thead>
              <tbody>
                {pendingApprovals.map((r) => (
                  <tr key={r.id}>
                    <td className="code-cell">{r.bed_id}</td>
                    <td>{r.beds?.facility || '-'}</td>
                    <td>{r.user_name}</td>
                    <td className="mono">{r.start_date} ~ {r.end_date}</td>
                    <td>{r.crop || '-'}</td>
                    <td>{r.purpose || '-'}</td>
                    <td>{r.notes || '-'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={approvingId === r.id} onClick={() => handleApproval(r, 'approved')}>승인</button>
                      <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} disabled={approvingId === r.id} onClick={() => handleApproval(r, 'rejected')}>거절</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>나의 배드 예약 내역 ({myBedReservations.length})</h4>
        {myBedReservations.length === 0 ? (
          <p style={{ color: '#847d68', fontSize: 13 }}>아직 예약한 배드가 없습니다.</p>
        ) : (
          <table>
            <thead><tr><th>배드</th><th>시설</th><th>기간</th><th>작물</th><th>용도</th><th>비고</th><th>상태</th><th></th></tr></thead>
            <tbody>
              {myBedReservations.map((r) => (
                editingId === r.id ? (
                  <tr key={r.id}>
                    <td colSpan={8}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1.5fr auto auto', gap: 8, alignItems: 'end', padding: '8px 0' }}>
                        <div className="field" style={{ margin: 0 }}><label>시작일</label><input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} /></div>
                        <div className="field" style={{ margin: 0 }}><label>종료일</label><input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} /></div>
                        <div className="field" style={{ margin: 0 }}><label>작물</label><input value={editCrop} onChange={(e) => setEditCrop(e.target.value)} /></div>
                        <div className="field" style={{ margin: 0 }}><label>용도</label><input value={editPurpose} onChange={(e) => setEditPurpose(e.target.value)} /></div>
                        <div className="field" style={{ margin: 0 }}><label>비고</label><input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></div>
                        <button className="btn btn-primary" style={{ padding: '9px 14px' }} onClick={() => saveEdit(r)}>저장</button>
                        <button className="btn btn-ghost" style={{ padding: '9px 14px' }} onClick={cancelEdit}>취소</button>
                      </div>
                      <p style={{ fontSize: 11, color: '#847d68', margin: '0 0 6px' }}>저장하면 다시 승인 대기 상태로 바뀝니다.</p>
                      {editMsg && <div className={`msg ${editMsg.type}`}>{editMsg.text}</div>}
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td className="code-cell">{r.bed_id}</td>
                    <td>{r.beds?.facility || '-'}</td>
                    <td className="mono">{r.start_date} ~ {r.end_date}</td>
                    <td>{r.crop || '-'}</td>
                    <td>{r.purpose || '-'}</td>
                    <td>{r.notes || '-'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => startEdit(r)}>수정</button>
                      {r.status !== 'rejected' && r.end_date >= todayStr && (
                        <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }} disabled={actingId === r.id} onClick={() => handleFinishEarly(r)}>종료</button>
                      )}
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
