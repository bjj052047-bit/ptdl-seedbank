import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
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
      setMsg({ type: 'err', text: '이름, 이메일, 비밀번호를 모두 입력하세요.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMsg({ type: 'err', text: `가입 실패: ${error.message}` });
      setBusy(false);
      return;
    }
    // 세션이 바로 생기는 경우 (이메일 확인이 꺼져 있을 때) profiles 행을 만들어줌
    if (data.session) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, name: name.trim(), role: 'researcher' });
      if (profileError) {
        setMsg({ type: 'err', text: `프로필 생성 실패: ${profileError.message}` });
        setBusy(false);
        return;
      }
      router.push('/');
      return;
    }
    setMsg({ type: 'ok', text: '가입 신청이 완료되었습니다. 이메일 확인이 켜져 있다면 메일함을 확인한 뒤 로그인해주세요.' });
    setBusy(false);
  }

  async function handleSignin(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setMsg({ type: 'err', text: '이메일과 비밀번호를 입력하세요.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg({ type: 'err', text: `로그인 실패: ${error.message}` });
      setBusy(false);
      return;
    }
    router.push('/');
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div className="serif" style={{ fontWeight: 700, fontSize: 24, marginBottom: 4 }}>
        종자실 재고 관리 <span className="mono" style={{ fontSize: 12, color: 'var(--green-deep)' }}>PTDL</span>
      </div>
      <div className="mono" style={{ fontSize: 12, color: '#5c574a', marginBottom: 24 }}>
        세종대학교 스마트생명산업융합학과
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={mode === 'signin' ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1 }}
            onClick={() => { setMode('signin'); setMsg(null); }}
          >
            로그인
          </button>
          <button
            className={mode === 'signup' ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1 }}
            onClick={() => { setMode('signup'); setMsg(null); }}
          >
            처음이신가요? (가입)
          </button>
        </div>

        <form onSubmit={mode === 'signup' ? handleSignup : handleSignin}>
          {mode === 'signup' && (
            <div className="field">
              <label>이름 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동" />
            </div>
          )}
          <div className="field">
            <label>이메일 *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@sju.ac.kr" />
          </div>
          <div className="field">
            <label>비밀번호 *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6자 이상" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} type="submit">
            {busy ? '처리 중...' : mode === 'signup' ? '가입하기' : '로그인'}
          </button>
        </form>

        {msg && <div className={`msg ${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}

        <p style={{ fontSize: 11.5, color: '#847d68', marginTop: 16, lineHeight: 1.5 }}>
          가입 후에는 기본적으로 &apos;연구원&apos; 권한으로 시작합니다. 담당자 권한이 필요하면
          연구실 관리자(Supabase 프로젝트 소유자)에게 요청해 role을 변경해달라고 하세요.
        </p>
      </div>
    </div>
  );
}
