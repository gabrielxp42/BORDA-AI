import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { Sparkles, Lock, Mail, User, ArrowRight, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signIn, signUp } = useAuth();
  const { settings } = useCompanySettings();
  const navigate = useNavigate();

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

        <div className="pt-4 border-t border-white/5 text-center">
          <p className="text-[10px] text-zinc-500 flex items-center justify-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Autenticação Segura via Supabase Auth
          </p>
        </div>
      </div>
    </div>
  );
};
