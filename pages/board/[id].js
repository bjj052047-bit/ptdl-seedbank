import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useProfile } from '../../lib/useProfile';
import Nav from '../../components/Nav';
import { useLang } from '../../lib/i18n';
import {
  CATEGORY_COLOR, STATUS_COLOR, SUGGESTION_STATUSES, Badge, fmtFullDate, fmtSize,
  isImage, isBoardAdmin, canEditPost, signedUrls, downloadUrl, removeAttachments, linkify,
} from '../../lib/board';

// 게시글 보기: 본문, 사진 미리보기, 첨부파일 다운로드, 댓글, (관리자) 고정·진행상태
export default function BoardPostPage() {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useLang();
  const { session, profile, isStaff, isSupervisor, isDeveloper, loading } = useProfile();

  const [post, setPost] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [imageUrls, setImageUrls] = useState({});
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [acting, setActing] = useState(false);
  const viewedRef = useRef(null); // 같은 글 조회수를 한 번만 올리기

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); return; }
    if (profile.status !== 'approved') router.replace('/pending');
  }, [session, profile, loading, router]);

  const loadPost = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('board_posts').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setNotFound(true); return; }
    setPost(data);
    const imgs = (data.attachments || []).filter(isImage).map((a) => a.path);
    setImageUrls(await signedUrls(imgs));
  }, [id]);

  const loadComments = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('board_comments').select('*').eq('post_id', id).order('created_at');
    setComments(data || []);
  }, [id]);

  useEffect(() => {
    if (!id || !session || profile?.status !== 'approved') return;
    (async () => {
      if (viewedRef.current !== id) {
        viewedRef.current = id;
        await supabase.rpc('increment_board_view', { p_post_id: id });
      }
      loadPost();
      loadComments();
    })();
  }, [id, session, profile, loadPost, loadComments]);

  async function handleDownload(att) {
    const url = await downloadUrl(att);
    if (!url) { setMsg({ type: 'err', text: t('board.err.download') }); return; }
    window.location.href = url;
  }

  async function handleDelete() {
    if (!window.confirm(t('board.confirmDelete'))) return;
    setActing(true);
    const { error } = await supabase.from('board_posts').delete().eq('id', post.id);
    if (error) { setMsg({ type: 'err', text: t('board.err.delete', { msg: error.message }) }); setActing(false); return; }
    await removeAttachments((post.attachments || []).map((a) => a.path));
    router.push('/board');
  }

  async function updatePost(fields) {
    setActing(true);
    setMsg(null);
    const { error } = await supabase.from('board_posts').update(fields).eq('id', post.id);
    setActing(false);
    if (error) { setMsg({ type: 'err', text: t('common.saveFailed', { msg: error.message }) }); return; }
    loadPost();
  }

  async function handleComment(e) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    setCommentBusy(true);
    const { error } = await supabase.from('board_comments').insert({ post_id: post.id, body, author_id: profile.id, author_name: profile.name });
    setCommentBusy(false);
    if (error) { setMsg({ type: 'err', text: t('board.err.comment', { msg: error.message }) }); return; }
    setCommentText('');
    loadComments();
  }

  async function handleDeleteComment(c) {
    if (!window.confirm(t('board.confirmDeleteComment'))) return;
    const { error } = await supabase.from('board_comments').delete().eq('id', c.id);
    if (error) { setMsg({ type: 'err', text: t('board.err.delete', { msg: error.message }) }); return; }
    loadComments();
  }

  if (loading || !session || !profile) return <div className="wrap"><p>{t('common.loading')}</p></div>;

  const admin = isBoardAdmin(profile);
  const editable = canEditPost(post, profile);
  const attachments = post?.attachments || [];
  const images = attachments.filter(isImage);

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} isDeveloper={isDeveloper} />

      {notFound ? (
        <div className="card">
          <p>{t('board.notFound')}</p>
          <Link href="/board" className="btn btn-ghost" style={{ textDecoration: 'none' }}>{t('board.toList')}</Link>
        </div>
      ) : !post ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <div className="card board-post">
            {/* 머리글 */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <Badge colors={CATEGORY_COLOR[post.category]}>{t(`board.cat.${post.category}`)}</Badge>
              {post.is_pinned && <Badge colors={CATEGORY_COLOR.notice}>📌 {t('board.pinned')}</Badge>}
              {post.category === 'suggestion' && post.suggestion_status && (
                <Badge colors={STATUS_COLOR[post.suggestion_status]}>{t(`board.status.${post.suggestion_status}`)}</Badge>
              )}
            </div>
            <h2 className="serif" style={{ margin: '0 0 10px', fontSize: 22, lineHeight: 1.35, wordBreak: 'break-word' }}>{post.title}</h2>
            <div style={{ fontSize: 12.5, color: '#847d68', display: 'flex', gap: 14, flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid #eee5d0' }}>
              <span>{post.author_name}</span>
              <span>{fmtFullDate(post.created_at)}</span>
              {post.updated_at && new Date(post.updated_at) - new Date(post.created_at) > 60000 && (
                <span>{t('board.edited', { d: fmtFullDate(post.updated_at) })}</span>
              )}
              <span>{t('board.views', { n: post.view_count })}</span>
            </div>

            {/* 본문 */}
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.75, fontSize: 14.5, padding: '18px 0', minHeight: 80 }}>
              {linkify(post.body)}
            </div>

            {/* 사진 */}
            {images.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {images.map((a) => imageUrls[a.path] && (
                  <a key={a.path} href={imageUrls[a.path]} target="_blank" rel="noopener noreferrer">
                    <img src={imageUrls[a.path]} alt={a.name} style={{ maxWidth: '100%', maxHeight: 600, borderRadius: 6, border: '1px solid #eee5d0' }} />
                  </a>
                ))}
              </div>
            )}

            {/* 첨부파일 */}
            {attachments.length > 0 && (
              <div className="board-files">
                <div style={{ fontSize: 12, fontWeight: 700, color: '#5c574a', marginBottom: 6 }}>{t('board.attachments', { n: attachments.length })}</div>
                {attachments.map((a) => (
                  <button key={a.path} type="button" onClick={() => handleDownload(a)} className="board-file-link">
                    📎 {a.name} <span style={{ color: '#847d68', fontWeight: 400 }}>({fmtSize(a.size)})</span>
                  </button>
                ))}
              </div>
            )}

            {/* 관리자 도구 */}
            {admin && (
              <div className="board-admin">
                <span style={{ fontSize: 12, fontWeight: 700, color: '#5c574a' }}>{t('board.adminTools')}</span>
                <button type="button" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }} disabled={acting}
                  onClick={() => updatePost({ is_pinned: !post.is_pinned })}>
                  {post.is_pinned ? t('board.unpin') : t('board.pin')}
                </button>
                {post.category === 'suggestion' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    {t('board.statusLabel')}
                    <select value={post.suggestion_status || 'received'} disabled={acting} style={{ width: 'auto', padding: '5px 8px' }}
                      onChange={(e) => updatePost({ suggestion_status: e.target.value })}>
                      {SUGGESTION_STATUSES.map((s) => <option key={s} value={s}>{t(`board.status.${s}`)}</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}

            {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={() => (window.history.length > 1 ? router.back() : router.push('/board'))}>{t('board.toList')}</button>
              {editable && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link href={`/board/write?id=${post.id}`} className="btn btn-ghost" style={{ textDecoration: 'none' }}>{t('common.edit')}</Link>
                  <button type="button" className="btn btn-danger" disabled={acting} onClick={handleDelete}>{t('common.delete')}</button>
                </div>
              )}
            </div>
          </div>

          {/* 댓글 */}
          <div className="card">
            <h4 className="serif" style={{ marginTop: 0 }}>{t('board.comments', { n: comments.length })}</h4>
            {comments.length === 0 && <p style={{ color: '#847d68', fontSize: 13 }}>{t('board.noComments')}</p>}
            {comments.map((c) => (
              <div key={c.id} style={{ borderBottom: '1px solid #eee5d0', padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                  <span>
                    <b>{c.author_name}</b>
                    {c.author_id === post.author_id && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--green-deep)' }}>{t('board.authorMark')}</span>}
                    <span style={{ color: '#847d68', marginLeft: 8 }}>{fmtFullDate(c.created_at)}</span>
                  </span>
                  {(c.author_id === profile.id || admin) && (
                    <button type="button" onClick={() => handleDeleteComment(c)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>
                      {t('common.delete')}
                    </button>
                  )}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, marginTop: 4, lineHeight: 1.6 }}>{linkify(c.body)}</div>
              </div>
            ))}
            <form onSubmit={handleComment} style={{ marginTop: 12 }}>
              <textarea rows={3} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={t('board.commentPlaceholder')} maxLength={2000} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={commentBusy || !commentText.trim()}>
                  {commentBusy ? t('board.saving') : t('board.commentSubmit')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
