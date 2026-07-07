import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';

export default function RequestsPage() {
  const router = useRouter();
  const { session, profile, isStaff, loading } = useProfile();

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace('/login'); return; }
    if (!profile) { router.replace('/welcome'); }
  }, [session, profile, loading, router]);

  if (loading || !session || !profile) return <div className="wrap"><p>불러오는 중...</p></div>;

  return (
    <div className="wrap">
      <Nav profile={profile} isStaff={isStaff} />
      <div className="card" style={{ textAlign: 'center', padding: 50, color: '#847d68' }}>
        <b className="serif" style={{ display: 'block', fontSize: 18, color: 'var(--ink)', marginBottom: 6 }}>
          종자 요청 기능은 다음 단계에서 완성됩니다
        </b>
        요청 제출 → 담당자가 목록에서 확인 후 &apos;처리(출고)&apos;를 누르면 재고에 반영되는 흐름으로 이어서 만들 예정입니다.
      </div>
    </div>
  );
}