import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useLang } from '../lib/i18n';
import LangToggle from '../components/LangToggle';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null); // { type: 'ok'|'err', text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  async function handleSignup(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setMsg({ type: 'err', text: t('login.err.fillAll') });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMsg({ type: 'err', text: t('login.err.signup', { msg: error.message }) });
      setBusy(false);
      return;
    }
    // 세션이 바로 생기는 경우 (이메일 확인이 꺼져 있을 때) profiles 행을 만들어줌
    // 새로 만드는 profiles 행은 항상 status='pending'(승인 대기)으로 시작합니다.
    if (data.session) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, name: name.trim(), email: email.trim(), role: 'researcher' });
      if (profileError) {
        setMsg({ type: 'err', text: t('login.err.profile', { msg: profileError.message }) });
        setBusy(false);
        return;
      }
      router.push('/pending');
      return;
    }
    setMsg({ type: 'ok', text: t('login.ok.signup') });
    setBusy(false);
  }

  async function handleSignin(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setMsg({ type: 'err', text: t('login.err.fillSignin') });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg({ type: 'err', text: t('login.err.signin', { msg: error.message }) });
      setBusy(false);
      return;
    }
    router.push('/');
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><LangToggle /></div>
      <div className="serif" style={{ fontWeight: 700, fontSize: 24, marginBottom: 4 }}>
        {t('login.title')} <span className="mono" style={{ fontSize: 12, color: 'var(--green-deep)' }}>PTDL</span>
      </div>
      <div className="mono" style={{ fontSize: 12, color: '#5c574a', marginBottom: 24 }}>
        {t('common.dept')}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={mode === 'signin' ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1 }}
            onClick={() => { setMode('signin'); setMsg(null); }}
          >
            {t('login.signin')}
          </button>
          <button
            className={mode === 'signup' ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1 }}
            onClick={() => { setMode('signup'); setMsg(null); }}
          >
            {t('login.signupTab')}
          </button>
        </div>

        <form onSubmit={mode === 'signup' ? handleSignup : handleSignin}>
          {mode === 'signup' && (
            <div className="field">
              <label>{t('login.nameLabel')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('common.namePlaceholder')} />
            </div>
          )}
          <div className="field">
            <label>{t('login.emailLabel')}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@sju.ac.kr" />
          </div>
          <div className="field">
            <label>{t('login.pwLabel')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('login.pwPlaceholder')} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} type="submit">
            {busy ? t('common.processing') : mode === 'signup' ? t('login.signupBtn') : t('login.signin')}
          </button>
        </form>

        {msg && <div className={`msg ${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}

        <p style={{ fontSize: 11.5, color: '#847d68', marginTop: 16, lineHeight: 1.5 }}>
          {t('login.help')}
        </p>
      </div>
    </div>
  );
}
