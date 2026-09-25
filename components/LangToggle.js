import { useLang } from '../lib/i18n';

// 한글 / English 전환 버튼 (Nav, 로그인 화면 등에서 공통으로 사용)
export default function LangToggle() {
  const { t, toggleLang } = useLang();
  return (
    <button
      type="button"
      className="btn btn-ghost mono"
      style={{ padding: '6px 12px', fontSize: 12 }}
      onClick={toggleLang}
      title="한글 / English"
    >
      🌐 {t('nav.langToggle')}
    </button>
  );
}
