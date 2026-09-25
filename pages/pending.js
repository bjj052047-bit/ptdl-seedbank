import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import { useLang } from '../lib/i18n';
import LangToggle from '../components/LangToggle';

// 상태별 안내 문구의 사전 key (실제 문구는 lib/i18n.js에 있음)
const STATUS_TEXT = {
  pending: { title: 'pending.title', body: 'pending.body' },
  rejected: { title: 'rejected.title', body: 'rejected.body' },
};

// profiles.status가 'approved'가 아닌 사람이 오게 되는 안내 페이지
export default function PendingPage() {
  const router = useRouter();
  const { t } = useLang();
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
    return <div className="wrap"><p>{t('common.loading')}</p></div>;
  }

  const info = STATUS_TEXT[profile.status] || STATUS_TEXT.pending;

  return (
    <div className="wrap" style={{ maxWidth: 460, paddingTop: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><LangToggle /></div>
      <div className="serif" style={{ fontWeight: 700, fontSize: 24, marginBottom: 4 }}>
        {t('nav.title')} <span className="mono" style={{ fontSize: 12, color: 'var(--green-deep)' }}>PTDL</span>
      </div>
      <div className="mono" style={{ fontSize: 12, color: '#5c574a', marginBottom: 24 }}>
        {t('common.dept')}
      </div>

      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <h3 className="serif" style={{ marginTop: 0 }}>{t(info.title)}</h3>
        <p style={{ fontSize: 13.5, color: '#5c574a', lineHeight: 1.6 }}>{t(info.body)}</p>
        <div style={{ fontSize: 12.5, color: '#847d68', marginBottom: 20 }}>
          {t('common.name')}: <b>{profile.name}</b> · {t('common.email')}: {profile.email || '-'}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={refreshProfile}>{t('pending.refresh')}</button>
          <button className="btn btn-ghost" onClick={handleLogout}>{t('nav.logout')}</button>
        </div>
      </div>
    </div>
  );
}
