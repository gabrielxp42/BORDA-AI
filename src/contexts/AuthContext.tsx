import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<boolean>;
  signUp: (email: string, pass: string, name?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Pega sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 2. Escuta mudanças no estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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

      // Tenta logar automaticamente caso a sessão não venha no signUp
      if (!data.session) {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password: pass,
        });

        if (loginError) {
          if (loginError.message.includes('Email not confirmed')) {
            toast.info('Conta criada! Verifique seu e-mail para confirmar a conta ou desative "Confirm Email" no Supabase.');
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
      toast.success('Você saiu da sua conta.');
    } catch (err: any) {
      toast.error('Erro ao sair: ' + err.message);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
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
