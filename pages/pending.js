import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';

const STATUS_TEXT = {
  pending: {
    title: '가입 승인 대기중입니다 ⏳',
    body: '관리자(담당자/승인자)가 가입 신청을 확인한 뒤 승인하면 이용하실 수 있습니다. 승인이 늦어지면 연구실 관리자에게 직접 문의해주세요.',
  },
  rejected: {
    title: '가입이 거절되었습니다',
    body: '관리자가 가입 신청을 거절했습니다. 사유가 궁금하시면 연구실 관리자에게 문의해주세요.',
  },
};

// profiles.status가 'approved'가 아닌 사람이 오게 되는 안내 페이지
export default function PendingPage() {
  const router = useRouter();
  const { session, profile, loading, isApproved, refreshProfile } = useProfile();

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); return; }
    if (isApproved) { router.replace('/'); }
  }, [session, profile, loading, isApproved, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading || !session || !profile || isApproved) {
    return <div className="wrap"><p>불러오는 중...</p></div>;
  }

  const info = STATUS_TEXT[profile.status] || STATUS_TEXT.pending;

  return (
    <div className="wrap" style={{ maxWidth: 460, paddingTop: 80 }}>
      <div className="serif" style={{ fontWeight: 700, fontSize: 24, marginBottom: 4 }}>
        PTDL 연구실 포털 <span className="mono" style={{ fontSize: 12, color: 'var(--green-deep)' }}>PTDL</span>
      </div>
      <div className="mono" style={{ fontSize: 12, color: '#5c574a', marginBottom: 24 }}>
        세종대학교 스마트생명산업융합학과
      </div>

      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <h3 className="serif" style={{ marginTop: 0 }}>{info.title}</h3>
        <p style={{ fontSize: 13.5, color: '#5c574a', lineHeight: 1.6 }}>{info.body}</p>
        <div style={{ fontSize: 12.5, color: '#847d68', marginBottom: 20 }}>
          이름: <b>{profile.name}</b> · 이메일: {profile.email || '-'}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={refreshProfile}>상태 새로고침</button>
          <button className="btn btn-ghost" onClick={handleLogout}>로그아웃</button>
        </div>
      </div>
    </div>
  );
}
