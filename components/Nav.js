import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

const ROLE_LABEL = { staff: '담당자', supervisor: '승인자', researcher: '연구원' };

export default function Nav({ profile, isStaff }) {
  const router = useRouter();

  const tabs = [
    { href: '/', label: '검색 / 조회', staffOnly: false },
    { href: '/requests', label: '종자 요청', staffOnly: false },
    { href: '/io', label: '입출고 기록', staffOnly: true },
    { href: '/manage', label: '데이터 등록·관리', staffOnly: true },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header style={{ borderBottom: '2px solid var(--ink)', paddingBottom: 14, marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div className="serif" style={{ fontWeight: 700, fontSize: 26, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            종자실 재고 관리
            <small className="mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--green-deep)', background: 'rgba(63,93,58,0.1)', padding: '3px 8px', borderRadius: 3 }}>
              PTDL
            </small>
          </div>
          <div className="mono" style={{ fontSize: 12.5, color: '#5c574a' }}>
            세종대학교 스마트생명산업융합학과 · 벼과 · 국화과 다양성 컬렉션
          </div>
        </div>
        {profile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={profile.role === 'researcher' ? 'role-badge' : 'staff-badge'}>
              {ROLE_LABEL[profile.role] || profile.role} · {profile.name}
            </span>
            <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        )}
      </div>
      <nav className="tabs">
        {tabs
          .filter((t) => !t.staffOnly || isStaff)
          .map((t) => (
            <Link key={t.href} href={t.href} className={router.pathname === t.href ? 'active' : ''}>
              {t.label}
            </Link>
          ))}
      </nav>
    </header>
  );
}