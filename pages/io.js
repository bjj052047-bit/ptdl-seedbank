import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useProfile } from '../lib/useProfile';
import Nav from '../components/Nav';

export default function IoPage() {
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
          입출고 기록 기능은 다음 단계에서 완성됩니다
        </b>
        종자 코드 검색 → 입고/출고 선택 → 수량·사유 입력 → 재고 실시간 반영 흐름으로 이어서 만들 예정입니다.
      </div>
    </div>
  );
}
