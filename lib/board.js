// 게시판 공용 설정과 도우미 함수
import { supabase } from './supabaseClient';

export const BOARD_BUCKET = 'board-files';
export const PAGE_SIZE = 15;
export const MAX_FILES = 10;
export const MAX_FILE_MB = 20;

// 분류 (이름은 lib/i18n.js의 'board.cat.*')
export const CATEGORIES = ['notice', 'suggestion', 'question', 'general'];
export const CATEGORY_COLOR = {
  notice: { bg: 'rgba(163,63,63,0.12)', fg: 'var(--danger)' },
  suggestion: { bg: 'rgba(201,162,75,0.22)', fg: '#7a5d15' },
  question: { bg: 'rgba(63,93,58,0.14)', fg: 'var(--green-deep)' },
  general: { bg: 'rgba(120,114,98,0.15)', fg: '#5c574a' },
};

// 수정 제안 진행상태 (이름은 'board.status.*')
export const SUGGESTION_STATUSES = ['received', 'reviewing', 'done', 'hold'];
export const STATUS_COLOR = {
  received: { bg: 'rgba(120,114,98,0.15)', fg: '#5c574a' },
  reviewing: { bg: 'rgba(201,162,75,0.22)', fg: '#7a5d15' },
  done: { bg: 'rgba(63,93,58,0.14)', fg: 'var(--green-deep)' },
  hold: { bg: 'rgba(163,63,63,0.12)', fg: 'var(--danger)' },
};

// 관리자: 종자실 담당자·승인자·개발자 (공지 쓰기, 상단 고정, 진행상태 변경, 모든 글 수정·삭제)
export function isBoardAdmin(profile) {
  return ['staff', 'supervisor', 'developer'].includes(profile?.role);
}

export function canEditPost(post, profile) {
  return !!post && !!profile && (post.author_id === profile.id || isBoardAdmin(profile));
}

// 목록용 날짜: 오늘이면 시:분, 아니면 2026.11.19
export function fmtListDate(v) {
  const d = new Date(v);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function fmtFullDate(v) {
  const d = new Date(v);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function isImage(att) {
  return /^image\//.test(att?.type || '') || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(att?.name || '');
}

// 파일 올리기: 저장소는 한글 파일명을 못 쓰므로 "사용자ID/시간-무작위.확장자"로 저장하고
// 원래 파일명은 게시글의 attachments에 따로 기록합니다.
export async function uploadAttachment(file, userId) {
  const extMatch = (file.name || '').match(/\.([A-Za-z0-9]{1,10})$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${userId}/${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage.from(BOARD_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) return { error };
  return { attachment: { path, name: file.name, size: file.size, type: file.type || '' } };
}

export async function removeAttachments(paths) {
  if (!paths.length) return;
  await supabase.storage.from(BOARD_BUCKET).remove(paths);
}

// 비공개 저장소라서 1시간짜리 임시 주소를 만들어 보여줍니다
export async function signedUrls(paths) {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(BOARD_BUCKET).createSignedUrls(paths, 3600);
  const map = {};
  for (const row of data || []) if (row.signedUrl) map[row.path] = row.signedUrl;
  return map;
}

// 다운로드: 원래 파일명으로 저장되도록 임시 주소 생성
export async function downloadUrl(att) {
  const { data, error } = await supabase.storage.from(BOARD_BUCKET).createSignedUrl(att.path, 3600, { download: att.name });
  if (error) return null;
  return data.signedUrl;
}

// 본문 속 인터넷 주소(http...)를 누를 수 있는 링크로 바꾸기
export function linkify(text) {
  const parts = String(text || '').split(/(https?:\/\/[^\s<>"')]+)/g);
  return parts.map((p, i) => (
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green-deep)', wordBreak: 'break-all' }}>{p}</a>
      : <span key={i}>{p}</span>
  ));
}

export function Badge({ colors, children }) {
  const c = colors || {};
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: c.bg, color: c.fg, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}
