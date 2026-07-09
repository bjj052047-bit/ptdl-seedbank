import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import { computeLineage } from '../lib/lineage';
import Nav from '../components/Nav';

const emptyForm = {
  code: '', crop: '', variety: '', sci: '', harvestYear: '', location: '', qty: '',
  origin: '', originYear: '', region: '', parentCode: '', individualNumber: '',
  manualGeneration: '', manualPedigree: '', notes: '',
};

export default function ManagePage() {
  const router = useRouter();
  const { session, profile, isStaff, isSupervisor, loading } = useProfile();

  const [allSeeds, setAllSeeds] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null); // 수정 중인 seed의 id (null이면 신규 등록)
  const [formMsg, setFormMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const [bulkText, setBulkText] = useState('');
  const [duplicateMode, setDuplicateMode] = useState('skip'); // 'skip' | 'overwrite'
  const [bulkMsg, setBulkMsg] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [manageQuery, setManageQuery] = useState('');
  const [manageSort, setManageSort] = useState('desc');

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); return; }
    if (profile.status !== 'approved') { router.replace('/pending'); return; }
    if (!isStaff) { router.replace('/'); }
  }, [session, profile, isStaff, loading, router]);

  const loadSeeds = useCallback(async () => {
    const { data, error } = await supabase.from('seeds').select('*').order('created_at', { ascending: false }).limit(5000);
    if (!error) setAllSeeds(data || []);
  }, []);

  useEffect(() => {
    if (isStaff) loadSeeds();
  }, [isStaff, loadSeeds]);

  const isDuplicateCode = useMemo(() => {
    if (editingId || !form.code.trim()) return false;
    return allSeeds.some((s) => s.code === form.code.trim());
  }, [form.code, allSeeds, editingId]);

  const lineage = useMemo(() => computeLineage({
    parentCode: form.parentCode,
    individualNumber: form.individualNumber,
    manualGeneration: form.manualGeneration,
    manualPedigree: form.manualPedigree,
    seeds: allSeeds,
  }), [form.parentCode, form.individualNumber, form.manualGeneration, form.manualPedigree, allSeeds]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function loadIntoForm(seed) {
    setEditingId(seed.id);
    setForm({
      code: seed.code, crop: seed.crop || '', variety: seed.variety || '', sci: seed.sci_name || '',
      harvestYear: seed.harvest_year || '', location: seed.location || '', qty: seed.qty_g ?? '',
      origin: seed.origin || '', originYear: seed.origin_year || '', region: seed.region || '',
      parentCode: seed.parent_code || '', individualNumber: seed.individual_number || '',
      manualGeneration: seed.generation || '', manualPedigree: seed.pedigree || '', notes: seed.notes || '',
    });
    setFormMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormMsg(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormMsg(null);

    if (!form.code.trim() || !form.crop.trim() || !form.variety.trim() || !form.location.trim()) {
      setFormMsg({ type: 'err', text: '종자 코드, 작물명, 품종명, 보관위치는 필수 입력입니다.' });
      return;
    }
    if (isDuplicateCode) {
      setFormMsg({ type: 'err', text: '이미 등록된 종자 코드입니다.' });
      return;
    }
    if (form.parentCode.trim() === form.code.trim()) {
      setFormMsg({ type: 'err', text: '자기 자신을 모종자로 지정할 수 없습니다.' });
      return;
    }
    if (lineage.error) {
      setFormMsg({ type: 'err', text: lineage.error });
      return;
    }

    const record = {
      code: form.code.trim(),
      crop: form.crop.trim(),
      variety: form.variety.trim(),
      sci_name: form.sci.trim(),
      harvest_year: form.harvestYear.trim(),
      location: form.location.trim(),
      qty_g: Number(form.qty) || 0,
      origin: form.origin.trim(),
      origin_year: form.originYear.trim(),
      region: form.region.trim(),
      parent_code: form.parentCode.trim() || null,
      individual_number: lineage.individualNumber || '',
      generation: lineage.generation || '',
      pedigree: lineage.pedigree || '',
      fixed_line: !!lineage.fixedLine,
      notes: form.notes.trim(),
    };

    setBusy(true);
    if (editingId) {
      const { error } = await supabase.from('seeds').update(record).eq('id', editingId);
      if (error) { setFormMsg({ type: 'err', text: `저장 실패: ${error.message}` }); setBusy(false); return; }
      // 초기 등록이 아닌 수정에서 재고가 바뀌면 '정정' 기록 남기기
      const original = allSeeds.find((s) => s.id === editingId);
      if (original && Number(original.qty_g) !== record.qty_g) {
        await supabase.from('seed_transactions').insert({
          seed_id: editingId, type: '정정', qty: record.qty_g - Number(original.qty_g), qty_after: record.qty_g,
          by_user: profile.id, by_name: profile.name, note: '수정 화면에서 재고 직접 정정',
        });
      }
    } else {
      const { data: inserted, error } = await supabase.from('seeds').insert(record).select().single();
      if (error) { setFormMsg({ type: 'err', text: `저장 실패: ${error.message}` }); setBusy(false); return; }
      await supabase.from('seed_transactions').insert({
        seed_id: inserted.id, type: '초기등록', qty: record.qty_g, qty_after: record.qty_g,
        by_user: profile.id, by_name: profile.name, note: '신규 등록',
      });
    }

    setFormMsg({ type: 'ok', text: '저장되었습니다.' });
    clearForm();
    loadSeeds();
    setBusy(false);
  }

  async function handleDelete(seed) {
    const ok = window.confirm(`'${seed.code}' 항목을 삭제할까요?`);
    if (!ok) return;
    await supabase.from('seeds').delete().eq('id', seed.id);
    loadSeeds();
  }

  async function handleBulkImport() {
    setBulkMsg(null);
    const raw = bulkText.trim();
    if (!raw) { setBulkMsg({ type: 'err', text: '붙여넣은 내용이 없습니다.' }); return; }

    let lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines[0] && lines[0].includes('종자코드')) lines = lines.slice(1);

    setBulkBusy(true);
    let workingSeeds = [...allSeeds]; // 붙여넣은 안에서 부모->자식 순서로 이어지는 걸 지원하기 위한 로컬 캐시
    let added = 0, updated = 0, skipped = 0, warnings = 0;

    for (const line of lines) {
      const cols = line.split('\t');
      const code = (cols[0] || '').trim();
      if (!code) { skipped++; continue; }
      const parentCode = (cols[10] || '').trim();
      if (parentCode === code) { skipped++; continue; }

      const existing = workingSeeds.find((s) => s.code === code);
      if (existing && duplicateMode === 'skip') { skipped++; continue; }

      const rowQty = Number((cols[6] || '').trim()) || 0;
      const rowLineage = computeLineage({
        parentCode,
        individualNumber: (cols[11] || '').trim(),
        manualGeneration: (cols[12] || '').trim(),
        manualPedigree: (cols[13] || '').trim(),
        seeds: workingSeeds,
      });
      if (rowLineage.error) warnings++;

      const record = {
        code,
        crop: (cols[1] || '').trim(),
        variety: (cols[2] || '').trim(),
        sci_name: (cols[3] || '').trim(),
        harvest_year: (cols[4] || '').trim(),
        location: (cols[5] || '').trim(),
        qty_g: rowQty,
        origin: (cols[7] || '').trim(),
        origin_year: (cols[8] || '').trim(),
        region: (cols[9] || '').trim(),
        parent_code: parentCode || null,
        individual_number: rowLineage.individualNumber || (cols[11] || '').trim(),
        generation: rowLineage.generation || '',
        pedigree: rowLineage.pedigree || '',
        fixed_line: !!rowLineage.fixedLine,
        notes: rowLineage.error ? `${(cols[14] || '').trim()} [주의: 개체번호 누락으로 Pedigree 미계산]`.trim() : (cols[14] || '').trim(),
      };

      if (existing && duplicateMode === 'overwrite') {
        const { data: updatedSeed, error } = await supabase.from('seeds').update(record).eq('id', existing.id).select().single();
        if (error) { skipped++; continue; }
        if (Number(existing.qty_g) !== rowQty) {
          await supabase.from('seed_transactions').insert({
            seed_id: existing.id, type: '정정', qty: rowQty - Number(existing.qty_g), qty_after: rowQty,
            by_user: profile.id, by_name: profile.name, note: '일괄 등록(덮어쓰기)으로 재고 정정',
          });
        }
        workingSeeds = workingSeeds.map((s) => (s.id === existing.id ? updatedSeed : s));
        updated++;
        continue;
      }

      const { data: inserted, error } = await supabase.from('seeds').insert(record).select().single();
      if (error) { skipped++; continue; }
      await supabase.from('seed_transactions').insert({
        seed_id: inserted.id, type: '초기등록', qty: rowQty, qty_after: rowQty,
        by_user: profile.id, by_name: profile.name, note: '일괄 등록',
      });
      workingSeeds.push(inserted);
      added++;
    }

    setBulkMsg({
      type: 'ok',
      text: `신규 ${added}건 등록, 덮어쓰기 ${updated}건, 건너뜀 ${skipped}건 (자기참조·빈 값 등)${warnings ? `, ${warnings}건은 개체번호 누락으로 Pedigree 미계산` : ''}.`,
    });
    setBulkText('');
    loadSeeds();
    setBulkBusy(false);
  }

  const filteredManageList = useMemo(() => {
    const q = manageQuery.trim().toLowerCase();
    let list = allSeeds.filter((s) => !q || (s.code || '').toLowerCase().includes(q) || (s.variety || '').toLowerCase().includes(q));
    list = list.slice().sort((a, b) => {
      const ya = Number(a.harvest_year) || 0, yb = Number(b.harvest_year) || 0;
      return manageSort === 'asc' ? ya - yb : yb - ya;
    });
    return list;
  }, [allSeeds, manageQuery, manageSort]);

  if (loading || !session || !isStaff) return <div className="wrap"><p>불러오는 중...</p></div>;

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>{editingId ? '종자 수정' : '종자 1건 등록'}</h4>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>종자 코드 (고유값) *</label>
              <input value={form.code} onChange={(e) => setField('code', e.target.value)} disabled={!!editingId} placeholder="예: RIC-2023-014" />
              {isDuplicateCode && <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600, marginTop: 4 }}>⚠ 이미 등록된 종자 코드입니다.</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>작물명 *</label><input value={form.crop} onChange={(e) => setField('crop', e.target.value)} placeholder="예: 벼 / 밀크씨슬" /></div>
              <div className="field"><label>품종명 *</label><input value={form.variety} onChange={(e) => setField('variety', e.target.value)} placeholder="예: 신동진" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>학명</label><input value={form.sci} onChange={(e) => setField('sci', e.target.value)} placeholder="예: Oryza sativa" /></div>
              <div className="field"><label>수확연도</label><input value={form.harvestYear} onChange={(e) => setField('harvestYear', e.target.value)} placeholder="예: 2023" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>보관 위치 *</label><input value={form.location} onChange={(e) => setField('location', e.target.value)} placeholder="예: 냉장고2-선반3-12번" /></div>
              <div className="field"><label>재고량 (g)</label><input value={form.qty} onChange={(e) => setField('qty', e.target.value)} placeholder="예: 1200" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>도입기관</label><input value={form.origin} onChange={(e) => setField('origin', e.target.value)} placeholder="예: 농촌진흥청" /></div>
              <div className="field"><label>도입연도</label><input value={form.originYear} onChange={(e) => setField('originYear', e.target.value)} placeholder="예: 2020" /></div>
            </div>
            <div className="field"><label>재배 지역 (조건)</label><input value={form.region} onChange={(e) => setField('region', e.target.value)} placeholder="예: 세종 시험포장 / 노지" /></div>

            <div className="field">
              <label>모종자 코드 (선택)</label>
              <input value={form.parentCode} onChange={(e) => setField('parentCode', e.target.value)} placeholder="예: MTH-2021-005" list="parent-code-list" />
              <datalist id="parent-code-list">
                {allSeeds.map((s) => <option key={s.id} value={s.code}>{s.variety}</option>)}
              </datalist>
              {lineage.parentMissing && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>아직 등록되지 않은 코드예요. 나중에 등록되면 계보가 자동으로 이어집니다.</div>
              )}
            </div>

            {form.parentCode.trim() ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field"><label>개체 번호</label><input value={form.individualNumber} onChange={(e) => setField('individualNumber', e.target.value)} placeholder="예: 3" /></div>
                <div className="field">
                  <label>세대 / Pedigree (자동계산)</label>
                  <div style={{ fontSize: 13.5, padding: '9px 11px', background: 'var(--paper-dark)', borderRadius: 6 }}>
                    {lineage.generation ? <b>{lineage.generation}</b> : '-'}
                    {lineage.pedigree ? ` · ${lineage.pedigree}` : ''}
                    {lineage.fixedLine && <span className="staff-badge" style={{ marginLeft: 6 }}>🔒 고정계통</span>}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field"><label>세대 (F1, F2...)</label><input value={form.manualGeneration} onChange={(e) => setField('manualGeneration', e.target.value)} placeholder="예: F1" /></div>
                <div className="field"><label>Pedigree</label><input value={form.manualPedigree} onChange={(e) => setField('manualPedigree', e.target.value)} placeholder="예: 530110/530111" /></div>
              </div>
            )}

            <div className="field"><label>비고</label><input value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="특이사항" /></div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '저장 중...' : '저장하기'}</button>
              <button className="btn btn-ghost" type="button" onClick={clearForm}>입력 지우기</button>
            </div>
            {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
          </form>
        </div>

        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>여러 건 한번에 붙여넣기</h4>
          <p style={{ fontSize: 11.5, color: '#847d68', lineHeight: 1.6 }}>
            엑셀에서 아래 순서로 열을 맞춰 복사한 뒤 붙여넣으세요 (탭 구분). 재고는 g 단위, 모종자코드가 있으면 세대·Pedigree는 자동 계산됩니다.<br />
            <b>종자코드 / 작물명 / 품종명 / 학명 / 수확연도 / 보관위치 / 재고량(g) / 도입기관 / 도입연도 / 재배지역 / 모종자코드 / 개체번호 / 세대(모종자없을때) / Pedigree(모종자없을때) / 비고</b>
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            style={{ minHeight: 140, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12.5 }}
            placeholder={"RIC-2024-001\t벼\t새일미\tOryza sativa\t2024\t냉장고1-선반1-01\t1200\t농촌진흥청\t2021\t세종 시험포장\tRIC-2021-003\t2\t\t\t"}
          />
          <div style={{ marginTop: 10, marginBottom: 10 }}>
            <label style={{ marginBottom: 6 }}>기존에 등록된 코드와 겹칠 경우</label>
            <div style={{ display: 'flex', gap: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
                <input type="radio" checked={duplicateMode === 'skip'} onChange={() => setDuplicateMode('skip')} style={{ width: 'auto' }} />
                기존 데이터 유지 (건너뜀)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
                <input type="radio" checked={duplicateMode === 'overwrite'} onChange={() => setDuplicateMode('overwrite')} style={{ width: 'auto' }} />
                덮어쓰기 (붙여넣은 내용으로 교체)
              </label>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={handleBulkImport} disabled={bulkBusy}>{bulkBusy ? '등록 중...' : '붙여넣은 내용 등록하기'}</button>
          </div>
          {bulkMsg && <div className={`msg ${bulkMsg.type}`}>{bulkMsg.text}</div>}
        </div>
      </div>

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>전체 데이터 ({allSeeds.length}건)</h4>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <input value={manageQuery} onChange={(e) => setManageQuery(e.target.value)} placeholder="종자 코드 또는 품종명으로 찾기" />
          <select value={manageSort} onChange={(e) => setManageSort(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="desc">수확연도 내림차순 (최신순)</option>
            <option value="asc">수확연도 오름차순 (오래된순)</option>
          </select>
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          <table>
            <thead><tr><th>코드</th><th>작물/품종</th><th>연도</th><th>위치</th><th>재고(g)</th><th></th></tr></thead>
            <tbody>
              {filteredManageList.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 24 }}>데이터가 없습니다.</td></tr>
              ) : filteredManageList.map((s) => (
                <tr key={s.id}>
                  <td className="code-cell">{s.code}</td>
                  <td>{s.crop} / {s.variety}</td>
                  <td>{s.harvest_year || '-'}</td>
                  <td>{s.location || '-'}</td>
                  <td>{Number(s.qty_g) || 0}g</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--line)', background: '#fff', cursor: 'pointer' }} onClick={() => loadIntoForm(s)}>수정</button>
                    <button style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--danger)', color: 'var(--danger)', background: '#fff', cursor: 'pointer' }} onClick={() => handleDelete(s)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}