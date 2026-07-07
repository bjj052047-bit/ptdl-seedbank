import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

// 로그인은 됐는데 profiles 테이블에 이름표가 없는 경우를 위한 안전장치 페이지
export default function WelcomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      // 이미 프로필이 있다면 이 페이지에 있을 필요가 없으니 바로 이동
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.session.user.id)
        .maybeSingle();
      if (profile) {
        router.replace('/');
        return;
      }
      setChecking(false);
    });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setMsg({ type: 'err', text: '이름을 입력해주세요.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace('/login');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .insert({ id: data.session.user.id, name: name.trim(), role: 'researcher' });
    if (error) {
      setMsg({ type: 'err', text: `저장 실패: ${error.message}` });
      setBusy(false);
      return;
    }
    router.push('/');
  }

  if (checking) {
    return <div className="wrap"><p>확인 중...</p></div>;
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div className="serif" style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>
        거의 다 됐습니다 👋
      </div>
      <div className="mono" style={{ fontSize: 12, color: '#5c574a', marginBottom: 24 }}>
        마지막으로 이름만 알려주세요
      </div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>이름 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} type="submit">
            {busy ? '저장 중...' : '시작하기'}
          </button>
        </form>
        {msg && <div className={`msg ${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}
      </div>
    </div>
  );
}