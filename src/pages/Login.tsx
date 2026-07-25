import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Sparkles, Lock, Mail, User, ArrowRight, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signIn, signUp, user } = useAuth();
  const { settings } = useCompanySettings();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsSubmitting(true);
    let success = false;

    if (isRegister) {
      success = await signUp(email, password, name);
    } else {
      success = await signIn(email, password);
    }

    if (success) {
      navigate('/');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen w-screen bg-[#09090d] text-zinc-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Glow Effects */}
      <div 
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[120px] opacity-30 pointer-events-none"
        style={{ backgroundColor: settings.primaryColor }}
      />

      <div className="w-full max-w-md bg-zinc-900/80 border border-white/10 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl z-10 space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="h-16 w-16 object-contain mx-auto rounded-2xl" />
          ) : (
            <div 
              className="h-14 w-14 rounded-2xl mx-auto flex items-center justify-center shadow-lg animate-pulse"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <Sparkles className="h-7 w-7 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-black text-white tracking-wider">{settings.systemName}</h1>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mt-0.5">
              {settings.systemSubtitle}
            </p>
          </div>
        </div>

        {/* Form Toggle */}
        <div className="grid grid-cols-2 p-1 bg-black/40 border border-white/10 rounded-2xl">
          <button
            type="button"
            onClick={() => setIsRegister(false)}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              !isRegister ? 'bg-white/10 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Entrar na Conta
          </button>
          <button
            type="button"
            onClick={() => setIsRegister(true)}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              isRegister ? 'bg-white/10 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Criar Conta
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-400 uppercase">Seu Nome / Nome da Empresa</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Bordados Elite"
                  className="w-full bg-black/50 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-500"
                  style={{ borderColor: `${settings.primaryColor}40` }}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-400 uppercase">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@empresa.com"
                className="w-full bg-black/50 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                style={{ borderColor: `${settings.primaryColor}40` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-400 uppercase">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/50 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                style={{ borderColor: `${settings.primaryColor}40` }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-2xl text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 mt-2"
            style={{ backgroundColor: settings.primaryColor }}
          >
            <span>{isSubmitting ? 'Processando...' : isRegister ? 'Cadastrar Empresa' : 'Entrar no Sistema'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* Divisor Visual Elegante */}
        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-white/10 w-full" />
          <span className="bg-[#12121a] px-3 text-[10px] font-black tracking-widest text-zinc-500 uppercase shrink-0">
            ou continuar com
          </span>
          <div className="border-t border-white/10 w-full" />
        </div>

        {/* 🚀 BOTÃO DE LOGIN COM GOOGLE MODERNO, ANIMADO E INTUITIVO */}
        <button
          type="button"
          onClick={async () => {
            try {
              setIsSubmitting(true);
              const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: `${window.location.origin}/`,
                },
              });
              if (error) throw error;
            } catch (err: any) {
              console.error('Erro no login com Google:', err);
              if (err?.message?.includes('provider is not enabled')) {
                toast.error('O login do Google precisa ser ativado no Supabase Dashboard (Authentication -> Providers -> Google).', { duration: 6000 });
              } else {
                toast.error('Erro ao conectar com Google: ' + (err.message || 'Falha de autenticação'));
              }
            } finally {
              setIsSubmitting(false);
            }
          }}
          disabled={isSubmitting}
          className="group relative w-full overflow-hidden p-3.5 rounded-2xl bg-zinc-950/80 border border-white/15 hover:border-white/40 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer"
        >
          {/* Efeito Neon Glow Suave no Hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-red-500/10 via-amber-500/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

          {/* Ícone do Google em SVG com 4 Cores Oficiais */}
          <div className="relative z-10 flex items-center justify-center h-5 w-5 group-hover:scale-110 transition-transform duration-300 shrink-0">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.13C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.63H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.37l3.99-3.13z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.63l3.99 3.13c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
          </div>

          <span className="relative z-10 font-bold text-xs text-zinc-100 group-hover:text-white tracking-wide transition-colors">
            Continuar com o Google
          </span>
        </button>

        <div className="pt-4 border-t border-white/5 text-center">
          <p className="text-[10px] text-zinc-500 flex items-center justify-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Autenticação Segura via Supabase Auth
          </p>
        </div>
      </div>
    </div>
  );
};
