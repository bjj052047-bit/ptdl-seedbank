import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';

const ROLE_LABEL = { staff: '담당자', supervisor: '승인자', researcher: '연구원' };

export default function ApprovalsPage() {
  const router = useRouter();
  const { session, profile, isStaff, isSupervisor, loading } = useProfile();
  const isAdmin = isStaff || isSupervisor;

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
    const label = status === 'approved' ? '승인' : '거절';
    if (!window.confirm(`${target.name}(${target.email || '이메일 없음'}) 님의 가입을 ${label}할까요?`)) return;
    setActingId(target.id);
    const { error } = await supabase.from('profiles').update({ status }).eq('id', target.id);
    if (error) alert(`처리 실패: ${error.message}`);
    await loadProfiles();
    setActingId(null);
  }

  if (loading || !session || !profile || !isAdmin) {
    return <div className="wrap"><p>불러오는 중...</p></div>;
  }

  const pending = profiles.filter((p) => p.status === 'pending');
  const others = profiles.filter((p) => p.status !== 'pending');

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} isSupervisor={isSupervisor} />

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>가입 승인 대기 ({pending.length})</h4>
        {pending.length === 0 ? (
          <p style={{ color: '#847d68', fontSize: 13 }}>승인 대기 중인 가입 신청이 없습니다.</p>
        ) : (
          <table>
            <thead><tr><th>가입일</th><th>이름</th><th>이메일</th><th></th></tr></thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.created_at).toLocaleDateString('ko-KR')}</td>
                  <td>{p.name}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{p.email || '-'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === p.id} onClick={() => handleAction(p, 'approved')}>승인</button>
                    <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === p.id} onClick={() => handleAction(p, 'rejected')}>거절</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h4 className="serif" style={{ marginTop: 0 }}>전체 계정 ({others.length})</h4>
        <table>
          <thead><tr><th>가입일</th><th>이름</th><th>이메일</th><th>역할</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {others.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#847d68', padding: 20 }}>계정이 없습니다.</td></tr>
            ) : others.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleDateString('ko-KR')}</td>
                <td>{p.name}</td>
                <td className="mono" style={{ fontSize: 12.5 }}>{p.email || '-'}</td>
                <td>{ROLE_LABEL[p.role] || p.role}</td>
                <td>{p.status === 'approved' ? '승인됨' : '거절됨'}</td>
                <td>
                  {p.status === 'rejected' && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={actingId === p.id} onClick={() => handleAction(p, 'approved')}>다시 승인</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11.5, color: '#847d68', marginTop: 10 }}>
          담당자/승인자 역할 변경은 아직 이 화면에서 지원하지 않습니다. Supabase 대시보드 → Table Editor → profiles 테이블에서 role 값을 직접 수정해주세요.
        </p>
      </div>
    </div>
  );
}
