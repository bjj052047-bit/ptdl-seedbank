import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useLang, DICT } from '../lib/i18n';
import LangToggle from './LangToggle';


export default function Nav({ profile, isStaff, isSupervisor, isDeveloper }) {
  const router = useRouter();
  const { t } = useLang();
  const canApprove = isSupervisor || isDeveloper; // 가입 승인 권한
  const canManageInventory = isStaff || isSupervisor || isDeveloper; // 입출고·데이터관리 권한

  const tabs = [
    { href: '/', label: t('nav.tab.search'), staffOnly: false, adminOnly: false },
    { href: '/requests', label: t('nav.tab.requests'), staffOnly: false, adminOnly: false },
    { href: '/reservations', label: t('nav.tab.reservations'), staffOnly: false, adminOnly: false },
    { href: '/beds', label: t('nav.tab.beds'), staffOnly: false, adminOnly: false },
    { href: '/io', label: t('nav.tab.io'), staffOnly: true, adminOnly: false },
    { href: '/manage', label: t('nav.tab.manage'), staffOnly: true, adminOnly: false },
    { href: '/approvals', label: t('nav.tab.approvals'), staffOnly: false, adminOnly: true },
    { href: '/audit', label: t('nav.tab.audit'), staffOnly: false, adminOnly: false, devOnly: true },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header style={{ borderBottom: '2px solid var(--ink)', paddingBottom: 14, marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div className="serif" style={{ fontWeight: 700, fontSize: 26, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            {t('nav.title')}
            <small className="mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--green-deep)', background: 'rgba(63,93,58,0.1)', padding: '3px 8px', borderRadius: 3 }}>
              PTDL
            </small>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 한글 / English 전환 버튼 (로그인 여부와 무관하게 항상 표시) */}
          <LangToggle />
          {profile && (
            <>
              <span className={profile.role === 'researcher' ? 'role-badge' : 'staff-badge'}>
                {DICT[`role.${profile.role}`] ? t(`role.${profile.role}`) : profile.role} · {profile.name}
              </span>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={handleLogout}>
                {t('nav.logout')}
              </button>
            </>
          )}
        </div>
      </div>
      <nav className="tabs">
        {tabs
          .filter((t) => !t.staffOnly || canManageInventory)
          .filter((t) => !t.adminOnly || canApprove)
          .filter((t) => !t.devOnly || isDeveloper)
          .map((t) => (
            <Link key={t.href} href={t.href} className={router.pathname === t.href ? 'active' : ''}>
              {t.label}
            </Link>
          ))}
      </nav>
    </header>
  );
}