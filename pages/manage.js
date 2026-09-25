import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import { computeLineage } from '../lib/lineage';
import Nav from '../components/Nav';
import { useLang } from '../lib/i18n';

const emptyForm = {
  code: '', crop: '', variety: '', sci: '', harvestYear: '', location: '', qty: '',
  origin: '', originYear: '', region: '', parentCode: '', individualNumber: '',
  manualGeneration: '', manualPedigree: '', notes: '',
};

export default function ManagePage() {
  const router = useRouter();
  const { t } = useLang();
  const { session, profile, isStaff, isSupervisor, isDeveloper, loading } = useProfile();

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
  const [exportBusy, setExportBusy] = useState(false);
  const [manageSort, setManageSort] = useState('desc');

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!isStaff && !isSupervisor && !isDeveloper) { router.replace('/'); }
  }, [session, isStaff, isSupervisor, isDeveloper, loading, router]);

  const loadSeeds = useCallback(async () => {
    const { data, error } = await supabase.from('seeds').select('*').order('created_at', { ascending: false }).limit(5000);
    if (!error) setAllSeeds(data || []);
  }, []);

  useEffect(() => {
    if (isStaff || isSupervisor || isDeveloper) loadSeeds();
  }, [isStaff, isSupervisor, isDeveloper, loadSeeds]);

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
      setFormMsg({ type: 'err', text: t('manage.err.required') });
      return;
    }
    if (isDuplicateCode) {
      setFormMsg({ type: 'err', text: t('manage.err.dup') });
      return;
    }
    if (form.parentCode.trim() === form.code.trim()) {
      setFormMsg({ type: 'err', text: t('manage.err.selfParent') });
      return;
    }
    if (lineage.error) {
      setFormMsg({ type: 'err', text: t('manage.err.needIndiv') });
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
      if (error) { setFormMsg({ type: 'err', text: t('common.saveFailed', { msg: error.message }) }); setBusy(false); return; }
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
      if (error) { setFormMsg({ type: 'err', text: t('common.saveFailed', { msg: error.message }) }); setBusy(false); return; }
      await supabase.from('seed_transactions').insert({
        seed_id: inserted.id, type: '초기등록', qty: record.qty_g, qty_after: record.qty_g,
        by_user: profile.id, by_name: profile.name, note: '신규 등록',
      });
    }

    setFormMsg({ type: 'ok', text: t('manage.ok.saved') });
    clearForm();
    loadSeeds();
    setBusy(false);
  }

  async function handleDelete(seed) {
    const ok = window.confirm(t('manage.confirmDelete', { code: seed.code }));
    if (!ok) return;
    await supabase.from('seeds').delete().eq('id', seed.id);
    loadSeeds();
  }

  async function handleExportExcel() {
    setExportBusy(true);
    try {
      const [{ data: seedsData }, { data: txData }, { data: reqData }] = await Promise.all([
        supabase.from('seeds').select('*').order('code'),
        supabase.from('seed_transactions').select('*, seeds(code)').order('created_at', { ascending: false }),
        supabase.from('seed_requests').select('*, seeds(code)').order('created_at', { ascending: false }),
      ]);

      const seedsSheet = (seedsData || []).map((s) => ({
        종자코드: s.code, 작물명: s.crop, 품종명: s.variety, 학명: s.sci_name,
        수확연도: s.harvest_year, 보관위치: s.location, '재고량(g)': s.qty_g,
        도입기관: s.origin, 도입연도: s.origin_year, 재배지역: s.region,
        모종자코드: s.parent_code, 개체번호: s.individual_number, 세대: s.generation,
        Pedigree: s.pedigree, 고정계통: s.fixed_line ? 'Y' : '', 비고: s.notes,
        등록일시: s.created_at,
      }));
      // 엑셀 백업의 열 이름은 언어와 관계없이 한글로 고정 (일괄등록·복구 시 형식이 흔들리지 않도록)
      const txSheet = (txData || []).map((tx) => ({
        일시: tx.created_at, 종자코드: tx.seeds?.code || '', 구분: tx.type,
        '수량(g)': tx.qty, '처리후재고(g)': tx.qty_after, 담당자: tx.by_name, 비고: tx.note,
      }));
      const reqSheet = (reqData || []).map((r) => ({
        요청일시: r.created_at, 종자코드: r.seeds?.code || '', 요청자: r.requester_name,
        요청수량: r.qty_requested, 단위: r.qty_unit, 상태: r.status, 사유: r.note,
        처리일시: r.processed_at,
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seedsSheet), '종자목록');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txSheet), '입출고기록');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reqSheet), '요청내역');

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `ptdl-seed-backup-${dateStr}.xlsx`);
    } finally {
      setExportBusy(false);
    }
  }

  async function handleBulkImport() {
    setBulkMsg(null);
    const raw = bulkText.trim();
    if (!raw) { setBulkMsg({ type: 'err', text: t('manage.err.bulkEmpty') }); return; }

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
      text: `${t('manage.bulkResult', { added, updated, skipped })}${warnings ? t('manage.bulkWarn', { n: warnings }) : ''}.`,
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

  if (loading || !session || (!isStaff && !isSupervisor && !isDeveloper)) return <div className="wrap"><p>{t('common.loading')}</p></div>;

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} isDeveloper={isDeveloper} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>{editingId ? t('manage.editTitle') : t('manage.addTitle')}</h4>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>{t('manage.codeLabel')}</label>
              <input value={form.code} onChange={(e) => setField('code', e.target.value)} disabled={!!editingId} placeholder={`${t('common.eg')} RIC-2023-014`} />
              {isDuplicateCode && <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600, marginTop: 4 }}>{t('manage.dupCode')}</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>{t('manage.cropLabel')}</label><input value={form.crop} onChange={(e) => setField('crop', e.target.value)} placeholder={`${t('common.eg')} 벼 / 밀크씨슬`} /></div>
              <div className="field"><label>{t('manage.varietyLabel')}</label><input value={form.variety} onChange={(e) => setField('variety', e.target.value)} placeholder={`${t('common.eg')} 신동진`} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>{t('manage.sciLabel')}</label><input value={form.sci} onChange={(e) => setField('sci', e.target.value)} placeholder={`${t('common.eg')} Oryza sativa`} /></div>
              <div className="field"><label>{t('manage.harvestLabel')}</label><input value={form.harvestYear} onChange={(e) => setField('harvestYear', e.target.value)} placeholder={`${t('common.eg')} 2023`} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>{t('manage.locationLabel')}</label><input value={form.location} onChange={(e) => setField('location', e.target.value)} placeholder={`${t('common.eg')} 냉장고2-선반3-12번`} /></div>
              <div className="field"><label>{t('manage.qtyLabel')}</label><input value={form.qty} onChange={(e) => setField('qty', e.target.value)} placeholder={`${t('common.eg')} 1200`} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>{t('manage.originLabel')}</label><input value={form.origin} onChange={(e) => setField('origin', e.target.value)} placeholder={`${t('common.eg')} 농촌진흥청`} /></div>
              <div className="field"><label>{t('manage.originYearLabel')}</label><input value={form.originYear} onChange={(e) => setField('originYear', e.target.value)} placeholder={`${t('common.eg')} 2020`} /></div>
            </div>
            <div className="field"><label>{t('manage.regionLabel')}</label><input value={form.region} onChange={(e) => setField('region', e.target.value)} placeholder={`${t('common.eg')} 세종 시험포장 / 노지`} /></div>

            <div className="field">
              <label>{t('manage.parentLabel')}</label>
              <input value={form.parentCode} onChange={(e) => setField('parentCode', e.target.value)} placeholder={`${t('common.eg')} MTH-2021-005`} list="parent-code-list" />
              <datalist id="parent-code-list">
                {allSeeds.map((s) => <option key={s.id} value={s.code}>{s.variety}</option>)}
              </datalist>
              {lineage.parentMissing && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{t('manage.parentMissing')}</div>
              )}
            </div>

            {form.parentCode.trim() ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field"><label>{t('manage.indivLabel')}</label><input value={form.individualNumber} onChange={(e) => setField('individualNumber', e.target.value)} placeholder={`${t('common.eg')} 3`} /></div>
                <div className="field">
                  <label>{t('manage.autoGenLabel')}</label>
                  <div style={{ fontSize: 13.5, padding: '9px 11px', background: 'var(--paper-dark)', borderRadius: 6 }}>
                    {lineage.generation ? <b>{lineage.generation}</b> : '-'}
                    {lineage.pedigree ? ` · ${lineage.pedigree}` : ''}
                    {lineage.fixedLine && <span className="staff-badge" style={{ marginLeft: 6 }}>{t('detail.fixedLine')}</span>}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field"><label>{t('manage.genLabel')}</label><input value={form.manualGeneration} onChange={(e) => setField('manualGeneration', e.target.value)} placeholder={`${t('common.eg')} F1`} /></div>
                <div className="field"><label>Pedigree</label><input value={form.manualPedigree} onChange={(e) => setField('manualPedigree', e.target.value)} placeholder={`${t('common.eg')} 530110/530111`} /></div>
              </div>
            )}

            <div className="field"><label>{t('field.notes')}</label><input value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder={t('manage.notesPlaceholder')} /></div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('common.saving') : t('manage.saveBtn')}</button>
              <button className="btn btn-ghost" type="button" onClick={clearForm}>{t('manage.clear')}</button>
            </div>
            {formMsg && <div className={`msg ${formMsg.type}`}>{formMsg.text}</div>}
          </form>
        </div>

        <div className="card">
          <h4 className="serif" style={{ marginTop: 0 }}>{t('manage.bulkTitle')}</h4>
          <p style={{ fontSize: 11.5, color: '#847d68', lineHeight: 1.6 }}>
            {t('manage.bulkHelp')}<br />
            <b>{t('manage.bulkColumns')}</b>
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            style={{ minHeight: 140, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12.5 }}
            placeholder={"RIC-2024-001\t벼\t새일미\tOryza sativa\t2024\t냉장고1-선반1-01\t1200\t농촌진흥청\t2021\t세종 시험포장\tRIC-2021-003\t2\t\t\t"}
          />
          <div style={{ marginTop: 10, marginBottom: 10 }}>
            <label style={{ marginBottom: 6 }}>{t('manage.dupModeLabel')}</label>
            <div style={{ display: 'flex', gap: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
                <input type="radio" checked={duplicateMode === 'skip'} onChange={() => setDuplicateMode('skip')} style={{ width: 'auto' }} />
                {t('manage.dupSkip')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
                <input type="radio" checked={duplicateMode === 'overwrite'} onChange={() => setDuplicateMode('overwrite')} style={{ width: 'auto' }} />
                {t('manage.dupOverwrite')}
              </label>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={handleBulkImport} disabled={bulkBusy}>{bulkBusy ? t('manage.bulkBusy') : t('manage.bulkSubmit')}</button>
          </div>
          {bulkMsg && <div className={`msg ${bulkMsg.type}`}>{bulkMsg.text}</div>}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h4 className="serif" style={{ margin: 0 }}>{t('manage.allTitle', { n: allSeeds.length })}</h4>
          <button className="btn btn-ghost" onClick={handleExportExcel} disabled={exportBusy}>
            {exportBusy ? t('manage.exporting') : t('manage.export')}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: '#847d68', marginTop: 6 }}>
          {t('manage.exportHelp')}
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, marginTop: 10 }}>
          <input value={manageQuery} onChange={(e) => setManageQuery(e.target.value)} placeholder={t('manage.findPlaceholder')} />
          <select value={manageSort} onChange={(e) => setManageSort(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="desc">{t('search.sort.desc')}</option>
            <option value="asc">{t('search.sort.asc')}</option>
          </select>
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          <table>
            <thead><tr><th>{t('field.codeShort')}</th><th>{t('field.cropVariety')}</th><th>{t('field.year')}</th><th>{t('field.locationShort')}</th><th>{t('field.qtyG')}</th><th></th></tr></thead>
            <tbody>
              {filteredManageList.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 24 }}>{t('manage.noData')}</td></tr>
              ) : filteredManageList.map((s) => (
                <tr key={s.id}>
                  <td className="code-cell">{s.code}</td>
                  <td>{s.crop} / {s.variety}</td>
                  <td>{s.harvest_year || '-'}</td>
                  <td>{s.location || '-'}</td>
                  <td>{Number(s.qty_g) || 0}g</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--line)', background: '#fff', cursor: 'pointer' }} onClick={() => loadIntoForm(s)}>{t('common.edit')}</button>
                    <button style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--danger)', color: 'var(--danger)', background: '#fff', cursor: 'pointer' }} onClick={() => handleDelete(s)}>{t('common.delete')}</button>
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