import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Crown, Scissors, KeyRound, Lock, Unlock, X, Check, ShieldCheck, Sparkles, Delete, RotateCcw } from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';

export const NetflixProfileModal: React.FC = () => {
  const {
    role,
    isUnlocked,
    unlockChefe,
    lockToProducao,
    hasPinSet,
    setMasterPin,
    isProfileModalOpen,
    closeProfileModal,
  } = useProfile();

  const { settings } = useCompanySettings();
  const pc = settings.primaryColor;

  // Mode inside modal: 'select' | 'pin_input'
  const [modalStep, setModalStep] = useState<'select' | 'pin_input'>('select');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  // Escuta teclado físico do computador quando no passo de PIN
  useEffect(() => {
    if (!isProfileModalOpen || modalStep !== 'pin_input') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 6) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          setError(false);
          if (hasPinSet && nextPin.length === 4) {
            submitPin(nextPin);
          }
        }
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
        setError(false);
      } else if (e.key === 'Enter') {
        submitPin(pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProfileModalOpen, modalStep, pin, hasPinSet]);

  if (!isProfileModalOpen) return null;

  const handleSelectChefeCard = () => {
    if (isUnlocked) {
      closeProfileModal();
      return;
    }
    setModalStep('pin_input');
    setPin('');
    setError(false);
  };

  const handleSelectOperadorCard = () => {
    lockToProducao();
    toast.info('Perfil alternado para Operador de Produção (Modo Restrito)');
    setModalStep('select');
    closeProfileModal();
  };

  const handleKeypadPress = (num: string) => {
    if (pin.length < 6) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError(false);

      // Auto-submit se já tiver PIN definido e completar 4 dígitos
      if (hasPinSet && nextPin.length === 4) {
        submitPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  const handleClear = () => {
    setPin('');
    setError(false);
  };

  const submitPin = (pinToSubmit: string) => {
    if (!hasPinSet) {
      if (pinToSubmit.length >= 4) {
        setMasterPin(pinToSubmit);
        toast.success('Senha de Chefe cadastrada com sucesso!');
        setModalStep('select');
        closeProfileModal();
      } else {
        setError(true);
      }
      return;
    }

    const success = unlockChefe(pinToSubmit);
    if (success) {
      toast.success('Modo Chefe Desbloqueado! Acesso total concedido.');
      setModalStep('select');
      setPin('');
      setError(false);
      closeProfileModal();
    } else {
      setError(true);
      setPin('');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitPin(pin);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/94 backdrop-blur-2xl p-4 animate-in fade-in duration-200">
      
      {/* Botão Fechar */}
      <button
        onClick={() => {
          setModalStep('select');
          closeProfileModal();
        }}
        className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-all shadow-lg"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="w-full max-w-3xl flex flex-col items-center space-y-6 animate-in zoom-in-95 duration-200">
        
        {/* Header Estilo Netflix */}
        <div className="text-center space-y-2">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest"
            style={{ backgroundColor: `${pc}20`, borderColor: `${pc}40`, color: pc }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Seletor de Perfil
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            {modalStep === 'select' ? 'Quem está usando?' : 'Digite a Senha do Chefe'}
          </h1>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            {modalStep === 'select'
              ? 'Selecione o perfil para carregar as permissões e a interface correspondente'
              : hasPinSet
              ? 'Insira o PIN de 4 dígitos para autorizar o acesso completo'
              : 'Como é seu primeiro acesso como Chefe, crie uma nova senha de 4 dígitos'}
          </p>
        </div>

        {/* PASSO 1: Seleção de Cards */}
        {modalStep === 'select' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl px-4">
            
            {/* CARD 1: CHEFE */}
            <div
              onClick={handleSelectChefeCard}
              className={`group relative overflow-hidden p-8 rounded-3xl border transition-all duration-300 cursor-pointer text-center flex flex-col items-center space-y-4 ${
                isUnlocked
                  ? 'bg-black/60 shadow-2xl ring-2'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:scale-105 shadow-xl'
              }`}
              style={{
                borderColor: isUnlocked ? pc : undefined,
                boxShadow: isUnlocked ? `0 0 30px ${pc}35` : undefined
              }}
            >
              {/* Badge Ativo */}
              {isUnlocked && (
                <span
                  className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-[10px] font-black uppercase tracking-wider shadow-md"
                  style={{ backgroundColor: pc }}
                >
                  <Check className="h-3 w-3" /> Ativo Agora
                </span>
              )}

              {/* Avatar Icon */}
              <div className="relative">
                <div
                  className="h-28 w-28 rounded-3xl p-1 shadow-2xl group-hover:scale-110 transition-transform duration-300"
                  style={{ background: `linear-gradient(135deg, ${pc} 0%, #ec4899 100%)` }}
                >
                  <div className="h-full w-full rounded-[22px] bg-[#0d0d14] flex items-center justify-center">
                    <Crown className="h-14 w-14 transition-colors" style={{ color: pc }} />
                  </div>
                </div>
                <div
                  className="absolute -bottom-2 -right-2 p-2 rounded-2xl text-white shadow-lg"
                  style={{ backgroundColor: pc }}
                >
                  <Lock className="h-4 w-4" />
                </div>
              </div>

              {/* Textos */}
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-white group-hover:brightness-125 transition-colors">
                  👑 CHEFE
                </h3>
                <p className="text-xs font-semibold" style={{ color: pc }}>
                  Administrador Master
                </p>
                <p className="text-[11px] text-zinc-400 pt-1 leading-snug">
                  Acesso completo a faturamento, relatórios, estoque, preços e configurações.
                </p>
              </div>

              {/* Footer Badge */}
              <div className="pt-2">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold"
                  style={{ backgroundColor: `${pc}15`, borderColor: `${pc}35`, color: pc }}
                >
                  {hasPinSet ? '🔒 Requer PIN de Segurança' : '🔑 Cadastrar Nova Senha'}
                </span>
              </div>
            </div>

            {/* CARD 2: OPERADOR DE PRODUÇÃO */}
            <div
              onClick={handleSelectOperadorCard}
              className={`group relative overflow-hidden p-8 rounded-3xl border transition-all duration-300 cursor-pointer text-center flex flex-col items-center space-y-4 ${
                !isUnlocked
                  ? 'border-cyan-500 bg-cyan-950/30 shadow-2xl shadow-cyan-500/20 ring-2 ring-cyan-500'
                  : 'border-white/10 bg-white/5 hover:border-cyan-500/80 hover:bg-cyan-950/20 hover:scale-105 shadow-xl'
              }`}
            >
              {/* Badge Ativo */}
              {!isUnlocked && (
                <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500 text-black text-[10px] font-black uppercase tracking-wider">
                  <Check className="h-3 w-3" /> Ativo Agora
                </span>
              )}

              {/* Avatar Icon */}
              <div className="relative">
                <div className="h-28 w-28 rounded-3xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 p-1 shadow-2xl shadow-cyan-500/40 group-hover:scale-110 transition-transform duration-300">
                  <div className="h-full w-full rounded-[22px] bg-[#0d0d14] flex items-center justify-center">
                    <Scissors className="h-14 w-14 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
                  </div>
                </div>
                <div className="absolute -bottom-2 -right-2 p-2 rounded-2xl bg-cyan-600 text-black shadow-lg font-black">
                  <Unlock className="h-4 w-4" />
                </div>
              </div>

              {/* Textos */}
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-white group-hover:text-cyan-300 transition-colors">
                  🧵 OPERADOR
                </h3>
                <p className="text-xs text-cyan-300/80 font-semibold">Produção de Bordados</p>
                <p className="text-[11px] text-zinc-400 pt-1 leading-snug">
                  Acesso restrito a Pedidos, Kanban de Produção, Matrizes e Máquinas.
                </p>
              </div>

              {/* Footer Badge */}
              <div className="pt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-bold">
                  ⚡ Acesso Direto (Sem Senha)
                </span>
              </div>
            </div>

          </div>
        )}

        {/* PASSO 2: Entrada do PIN do Chefe (TECLADO NUMÉRICO LIQUID GLASS IPHONE) */}
        {modalStep === 'pin_input' && (
          <div className="w-full max-w-sm glass-panel p-6 sm:p-8 rounded-[36px] border border-white/15 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <form onSubmit={handleFormSubmit} className="space-y-6">
              
              {/* Indicadores de PIN Estilo iPhone (Bolinhas) */}
              <div className="space-y-3 text-center">
                <div
                  className="h-14 w-14 rounded-2xl border flex items-center justify-center mx-auto shadow-xl"
                  style={{ backgroundColor: `${pc}20`, borderColor: `${pc}40`, color: pc }}
                >
                  <KeyRound className="h-7 w-7" />
                </div>
                
                <h3 className="text-lg font-black text-white">
                  {hasPinSet ? 'Senha do Chefe' : 'Criar Senha de 4 Dígitos'}
                </h3>

                {/* Bolinhas estilo Lockscreen iOS */}
                <div className="flex items-center justify-center gap-3 pt-2">
                  {[0, 1, 2, 3].map((idx) => {
                    const isFilled = pin.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`h-4 w-4 rounded-full transition-all duration-200 ${
                          error
                            ? 'bg-rose-500 border border-rose-400 animate-shake shadow-lg shadow-rose-500/50'
                            : isFilled
                            ? 'scale-125 shadow-lg'
                            : 'bg-white/10 border border-white/25'
                        }`}
                        style={isFilled && !error ? { backgroundColor: pc, boxShadow: `0 0 12px ${pc}` } : undefined}
                      />
                    );
                  })}
                </div>

                {error && (
                  <p className="text-rose-400 text-xs font-bold pt-1 animate-in fade-in">
                    {hasPinSet ? 'PIN incorreto. Tente novamente.' : 'A senha deve ter pelo menos 4 números.'}
                  </p>
                )}
              </div>

              {/* Input Invisível / ReadOnly para Bloquear Teclado Nativo no Celular */}
              <input
                type="password"
                readOnly
                inputMode="none"
                value={pin}
                className="sr-only"
              />

              {/* TECLADO NUMÉRICO LIQUID GLASS (3x4 Grid) */}
              <div className="grid grid-cols-3 gap-3.5 max-w-[260px] mx-auto pt-2">
                {[
                  { num: '1', sub: '' },
                  { num: '2', sub: 'ABC' },
                  { num: '3', sub: 'DEF' },
                  { num: '4', sub: 'GHI' },
                  { num: '5', sub: 'JKL' },
                  { num: '6', sub: 'MNO' },
                  { num: '7', sub: 'PQRS' },
                  { num: '8', sub: 'TUV' },
                  { num: '9', sub: 'WXYZ' },
                ].map((item) => (
                  <button
                    key={item.num}
                    type="button"
                    onClick={() => handleKeypadPress(item.num)}
                    className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/15 backdrop-blur-xl flex flex-col items-center justify-center text-white shadow-lg active:scale-90 transition-all select-none mx-auto"
                  >
                    <span className="text-xl font-black leading-none">{item.num}</span>
                    {item.sub && (
                      <span className="text-[8px] font-bold text-zinc-400 tracking-widest leading-none mt-0.5">
                        {item.sub}
                      </span>
                    )}
                  </button>
                ))}

                {/* Botão Limpar */}
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-16 w-16 rounded-full bg-white/5 hover:bg-white/15 active:bg-white/20 border border-white/10 backdrop-blur-xl flex items-center justify-center text-zinc-400 hover:text-white shadow-md active:scale-90 transition-all select-none mx-auto"
                  title="Limpar tudo"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>

                {/* Número 0 */}
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/15 backdrop-blur-xl flex flex-col items-center justify-center text-white shadow-lg active:scale-90 transition-all select-none mx-auto"
                >
                  <span className="text-xl font-black leading-none">0</span>
                </button>

                {/* Botão Apagar / Backspace */}
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="h-16 w-16 rounded-full bg-white/5 hover:bg-white/15 active:bg-white/20 border border-white/10 backdrop-blur-xl flex items-center justify-center text-zinc-400 hover:text-white shadow-md active:scale-90 transition-all select-none mx-auto"
                  title="Apagar dígito"
                >
                  <Delete className="h-5 w-5" />
                </button>
              </div>

              {/* Botões de Ação */}
              <div className="space-y-2 pt-2">
                {!hasPinSet && (
                  <button
                    type="submit"
                    disabled={pin.length < 4}
                    className="w-full py-3.5 rounded-2xl font-black text-xs uppercase text-white transition-all shadow-xl disabled:opacity-40 hover:brightness-110 active:scale-98 flex items-center justify-center gap-2"
                    style={{ backgroundColor: pc }}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>CRIAR SENHA E CONFIRMAR</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setModalStep('select')}
                  className="w-full py-2 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Voltar à seleção de perfis
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
