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

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user.id);
      setLoading(false);
    });

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

  return { session, profile, loading, isStaff, refreshProfile: () => loadProfile(session?.user?.id) };
}
