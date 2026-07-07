import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

// 모든 페이지에서 "지금 로그인한 사람이 누구인지, 담당자인지"를 알기 위해 쓰는 훅
export function useProfile() {
  const [session, setSession] = useState(undefined); // undefined = 아직 확인중
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!error) setProfile(data);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id); // 세션뿐 아니라 프로필까지 다 불러온 뒤에
      }
      if (mounted) setLoading(false); // 그제서야 loading을 false로 바꿈
    }
    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [loadProfile]);

  const isStaff = profile?.role === 'staff';
  const isSupervisor = profile?.role === 'supervisor';

  return { session, profile, loading, isStaff, isSupervisor, refreshProfile: () => loadProfile(session?.user?.id) };
}