import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';
import { useLang } from '../lib/i18n';

export default function ApprovalsPage() {
  const router = useRouter();
  const { t, tMaybe, fmtDate } = useLang();
  const { session, profile, isStaff, isSupervisor, isDeveloper, loading } = useProfile();
  const isAdmin = isSupervisor || isDeveloper;

  const [profiles, setProfiles] = useState([]);
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); return; }
    if (profile.status !== 'approved') { router.replace('/pending'); return; }
    if (!isAdmin) { router.replace('/'); }
  }, [session, profile, isAdmin, loading, router]);

  const loadProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (!error) setProfiles(data || []);
  }, []);

  useEffect(() => {
    if (isAdmin) loadProfiles();
  }, [isAdmin, loadProfiles]);

  async function handleAction(target, status) {
    const label = status === 'approved' ? t('common.approve') : t('common.reject');
    if (!window.confirm(t('approvals.confirm', { name: target.name, email: target.email || t('approvals.noEmail'), action: label }))) return;
    setActingId(target.id);
    const { error } = await supabase.from('profiles').update({ status }).eq('id', target.id);
    if (error) alert(t('common.actionFailed', { msg: error.message }));
    await loadProfiles();
    setActingId(null);
  }

  if (loading || !session || !profile || !isAdmin) {
    return <div className="wrap"><p>{t('common.loading')}</p></div>;
  }

  const pending = profiles.filter((p) => p.status === 'pending');
  const others = profiles.filter((p) => p.status !== 'pending');

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} isDeveloper={isDeveloper} />

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>{t('approvals.pendingTitle', { n: pending.length })}</h4>
        {pending.length === 0 ? (
          <p style={{ color: '#847d68', fontSize: 13 }}>{t('approvals.noPending')}</p>
        ) : (
          <table>
            <thead><tr><th>{t('approvals.joined')}</th><th>{t('common.name')}</th><th>{t('common.email')}</th><th></th></tr></thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.created_at)}</td>
                  <td>{p.name}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{p.email || '-'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === p.id} onClick={() => handleAction(p, 'approved')}>{t('common.approve')}</button>
                    <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === p.id} onClick={() => handleAction(p, 'rejected')}>{t('common.reject')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>{t('approvals.allTitle', { n: others.length })}</h4>
        <table>
          <thead><tr><th>{t('approvals.joined')}</th><th>{t('common.name')}</th><th>{t('common.email')}</th><th>{t('approvals.role')}</th><th>{t('approvals.status')}</th><th></th></tr></thead>
          <tbody>
            {others.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>{t('approvals.noAccounts')}</td></tr>
            ) : others.map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.created_at)}</td>
                <td>{p.name}</td>
                <td className="mono" style={{ fontSize: 12.5 }}>{p.email || '-'}</td>
                <td>{tMaybe('role', p.role)}</td>
                <td>{p.status === 'approved' ? t('approvals.approved') : t('approvals.rejected')}</td>
                <td>
                  {p.status === 'rejected' && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === p.id} onClick={() => handleAction(p, 'approved')}>{t('approvals.reapprove')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11.5, color: '#847d68', marginTop: 10 }}>
          {t('approvals.roleHelp')}
        </p>
      </div>
    </div>
  );
}