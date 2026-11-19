import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useProfile } from '../../lib/useProfile';
import Nav from '../../components/Nav';
import { useLang } from '../../lib/i18n';
import {
  CATEGORIES, MAX_FILES, MAX_FILE_MB, fmtSize, isBoardAdmin, canEditPost,
  uploadAttachment, removeAttachments,
} from '../../lib/board';

// 글쓰기 / 글 수정 (/board/write → 새 글, /board/write?id=... → 수정)
export default function BoardWritePage() {
  const router = useRouter();
  const editId = typeof router.query.id === 'string' ? router.query.id : null;
  const { t } = useLang();
  const { session, profile, isStaff, isSupervisor, isDeveloper, loading } = useProfile();
  const fileInputRef = useRef(null);

  const [category, setCategory] = useState('suggestion');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [existingFiles, setExistingFiles] = useState([]); // 수정 시: 이미 올라가 있는 파일
  const [removedFiles, setRemovedFiles] = useState([]);   // 수정 시: 지우기로 한 파일
  const [newFiles, setNewFiles] = useState([]);           // 새로 고른 파일 (File 객체)
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); return; }
    if (profile.status !== 'approved') router.replace('/pending');
  }, [session, profile, loading, router]);

  const admin = isBoardAdmin(profile);

  // 수정 모드: 기존 글 불러오기
  useEffect(() => {
    if (!router.isReady || !profile) return;
    if (!editId) {
      // 새 글: 주소에 ?cat=notice 처럼 분류가 있으면 그걸로 시작
      const c = router.query.cat;
      if (typeof c === 'string' && CATEGORIES.includes(c) && (c !== 'notice' || admin)) setCategory(c);
      setLoaded(true);
      return;
    }
    (async () => {
      const { data } = await supabase.from('board_posts').select('*').eq('id', editId).maybeSingle();
      if (!data || !canEditPost(data, profile)) { setMsg({ type: 'err', text: t('board.err.noPermission') }); return; }
      setCategory(data.category);
      setTitle(data.title);
      setBody(data.body || '');
      setIsPinned(!!data.is_pinned);
      setExistingFiles(data.attachments || []);
      setLoaded(true);
    })();
  }, [router.isReady, editId, profile, admin, router.query.cat, t]);

  const keptFiles = existingFiles.filter((f) => !removedFiles.includes(f.path));
  const fileCount = keptFiles.length + newFiles.length;

  function handlePickFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // 같은 파일을 다시 골라도 동작하도록 초기화
    setMsg(null);
    const tooBig = picked.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig.length) {
      setMsg({ type: 'err', text: t('board.err.fileTooBig', { mb: MAX_FILE_MB, names: tooBig.map((f) => f.name).join(', ') }) });
    }
    const ok = picked.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    const room = MAX_FILES - fileCount;
    if (ok.length > room) setMsg({ type: 'err', text: t('board.err.tooManyFiles', { n: MAX_FILES }) });
    setNewFiles((prev) => [...prev, ...ok.slice(0, Math.max(0, room))]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);
    if (!title.trim()) { setMsg({ type: 'err', text: t('board.err.titleRequired') }); return; }
    if (!body.trim()) { setMsg({ type: 'err', text: t('board.err.bodyRequired') }); return; }
    if (category === 'notice' && !admin) { setMsg({ type: 'err', text: t('board.err.noticeAdminOnly') }); return; }

    setBusy(true);
    // 1) 새 파일 올리기
    const uploaded = [];
    for (let i = 0; i < newFiles.length; i++) {
      setProgress(t('board.uploading', { i: i + 1, n: newFiles.length }));
      const { attachment, error } = await uploadAttachment(newFiles[i], profile.id);
      if (error) {
        await removeAttachments(uploaded.map((a) => a.path)); // 중간에 실패하면 방금 올린 것 정리
        setMsg({ type: 'err', text: t('board.err.upload', { name: newFiles[i].name, msg: error.message }) });
        setBusy(false);
        setProgress('');
        return;
      }
      uploaded.push(attachment);
    }
    setProgress('');

    // 2) 글 저장
    const fields = {
      category,
      title: title.trim(),
      body: body.trim(),
      attachments: [...keptFiles, ...uploaded],
      ...(admin ? { is_pinned: isPinned } : {}),
    };
    let savedId = editId;
    if (editId) {
      const { error } = await supabase.from('board_posts').update(fields).eq('id', editId);
      if (error) {
        await removeAttachments(uploaded.map((a) => a.path));
        setMsg({ type: 'err', text: t('common.saveFailed', { msg: error.message }) });
        setBusy(false);
        return;
      }
      // 수정하면서 뺀 파일은 저장소에서도 지움
      await removeAttachments(removedFiles);
    } else {
      const { data, error } = await supabase.from('board_posts')
        .insert({ ...fields, author_id: profile.id, author_name: profile.name })
        .select('id').single();
      if (error) {
        await removeAttachments(uploaded.map((a) => a.path));
        setMsg({ type: 'err', text: t('common.saveFailed', { msg: error.message }) });
        setBusy(false);
        return;
      }
      savedId = data.id;
    }
    router.replace(`/board/${savedId}`);
  }

  if (loading || !session || !profile) return <div className="wrap"><p>{t('common.loading')}</p></div>;

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} isDeveloper={isDeveloper} />

      <div className="card">
        <h3 className="serif" style={{ marginTop: 0 }}>{editId ? t('board.editTitle') : t('board.writeTitle')}</h3>

        {!loaded ? (
          msg ? <div className={`msg ${msg.type}`}>{msg.text}</div> : <p>{t('common.loading')}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: 10 }} className="board-write-head">
              <div className="field">
                <label>{t('board.col.cat')} *</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.filter((c) => c !== 'notice' || admin || category === 'notice').map((c) => (
                    <option key={c} value={c}>{t(`board.cat.${c}`)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('board.col.title')} *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t('board.titlePlaceholder')} />
              </div>
            </div>

            {category === 'suggestion' && (
              <div style={{ fontSize: 12.5, color: '#5c574a', background: 'var(--paper-dark)', padding: '8px 10px', borderRadius: 6, marginBottom: 12 }}>
                {t('board.suggestionHint')}
              </div>
            )}

            <div className="field">
              <label>{t('board.body')} *</label>
              <textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} placeholder={category === 'suggestion' ? t('board.suggestionPlaceholder') : t('board.bodyPlaceholder')} style={{ lineHeight: 1.6, resize: 'vertical' }} />
            </div>

            {/* 첨부파일 */}
            <div className="field">
              <label>{t('board.attachLabel', { n: MAX_FILES, mb: MAX_FILE_MB })}</label>
              <input ref={fileInputRef} type="file" multiple onChange={handlePickFiles} style={{ display: 'none' }} />
              <button type="button" className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }} disabled={busy || fileCount >= MAX_FILES}
                onClick={() => fileInputRef.current?.click()}>
                {t('board.addFiles')}
              </button>
              {fileCount > 0 && (
                <ul className="board-file-list">
                  {keptFiles.map((f) => (
                    <li key={f.path}>
                      <span>📎 {f.name} <small>({fmtSize(f.size)})</small></span>
                      <button type="button" onClick={() => setRemovedFiles((r) => [...r, f.path])} disabled={busy}>{t('common.delete')}</button>
                    </li>
                  ))}
                  {newFiles.map((f, i) => (
                    <li key={`new-${i}`}>
                      <span>📎 {f.name} <small>({fmtSize(f.size)}) · {t('board.newFile')}</small></span>
                      <button type="button" onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))} disabled={busy}>{t('common.delete')}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {admin && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '4px 0 14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} style={{ width: 'auto' }} />
                {t('board.pinCheckbox')}
              </label>
            )}

            {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 10 }}>{msg.text}</div>}
            {progress && <div className="msg ok" style={{ marginBottom: 10 }}>{progress}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-ghost" disabled={busy}
                onClick={() => (window.history.length > 1 ? router.back() : router.push('/board'))}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? t('board.saving') : editId ? t('board.saveEdit') : t('board.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
