import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';
import { Profile } from '@/types/borda';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<boolean>;
  signUp: (email: string, pass: string, name?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data && !error) {
        setProfile(data as Profile);
      } else {
        // Fallback local profile if record is missing in DB
        setProfile({
          id: userId,
          full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário',
          email: user?.email || '',
          role: 'admin',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch {
      // Ignore network errors
    }
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [fetchProfile, user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, pass: string): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (error) {
        toast.error(error.message || 'Erro ao fazer login. Verifique suas credenciais.');
        return false;
      }

      toast.success('Login realizado com sucesso!');
      return true;
    } catch (err: any) {
      toast.error('Falha na autenticação: ' + err.message);
      return false;
    }
  };

  const signUp = async (email: string, pass: string, name?: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: {
            full_name: name || '',
          },
        },
      });

      if (error) {
        toast.error(error.message || 'Erro ao criar conta.');
        return false;
      }

      if (!data.session) {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password: pass,
        });

        if (loginError) {
          if (loginError.message.includes('Email not confirmed')) {
            toast.info('Conta criada! Verifique seu e-mail para confirmar a conta.');
            return false;
          }
          toast.error('Conta criada, faça login com seu e-mail e senha.');
          return false;
        }
      }

      toast.success('Conta criada e autenticada com sucesso!');
      return true;
    } catch (err: any) {
      toast.error('Erro ao cadastrar: ' + err.message);
      return false;
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setProfile(null);
      toast.success('Você saiu da sua conta.');
    } catch (err: any) {
      toast.error('Erro ao sair: ' + err.message);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
