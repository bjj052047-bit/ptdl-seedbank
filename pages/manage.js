import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';

export default function ManagePage() {
  const router = useRouter();
  const { session, profile, isStaff, loading } = useProfile();

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!isStaff) { router.replace('/'); }
  }, [session, isStaff, loading, router]);

  if (loading || !session || !isStaff) return <div className="wrap"><p>불러오는 중...</p></div>;

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} />
      <div className="card" style={{ textAlign: 'center', padding: 50, color: '#847d68' }}>
        <b className="serif" style={{ display: 'block', fontSize: 18, color: 'var(--ink)', marginBottom: 6 }}>
          데이터 등록·관리 기능은 다음 단계에서 완성됩니다
        </b>
        단일 등록·수정, 일괄 붙여넣기, 세대·Pedigree 자동 계산, 검색·정렬까지 이전 버전과 동일하게 옮겨올 예정입니다.
      </div>
    </div>
  );
}
