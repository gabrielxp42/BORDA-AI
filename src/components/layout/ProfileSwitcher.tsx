import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Lock, Unlock, KeyRound, X } from 'lucide-react';
import { useProfile } from '../../contexts/ProfileContext';

export const ProfileSwitcher: React.FC = () => {
  const { role, isUnlocked, unlockChefe, lockToProducao, hasPinSet, setMasterPin } = useProfile();
  const [showModal, setShowModal] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPinSet) {
      if (pin.length >= 4) {
        setMasterPin(pin);
        setShowModal(false);
        setPin('');
      } else {
        setError(true);
      }
      return;
    }

    const success = unlockChefe(pin);
    if (success) {
      setShowModal(false);
      setPin('');
      setError(false);
    } else {
      setError(true);
      setPin('');
    }
  };

  const toggleProfile = () => {
    if (isUnlocked) {
      lockToProducao();
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        onClick={toggleProfile}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-all ${
          isUnlocked 
            ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20' 
            : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400 hover:bg-zinc-500/20'
        }`}
        title={isUnlocked ? "Modo Chefe Ativo (Desbloqueado)" : "Modo Produção (Valores Ocultos)"}
      >
        {isUnlocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        <span className="text-xs font-bold uppercase tracking-wider hidden sm:block">
          {isUnlocked ? 'Chefe' : 'Produção'}
        </span>
      </button>

      {/* PIN Modal */}
      {showModal && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f0f13] border border-white/10 w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl shadow-black/80">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <KeyRound className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-white font-black text-lg">Modo Chefe</h2>
                    <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                      {hasPinSet ? 'Acesso Restrito' : 'Cadastro de Senha'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowModal(false)}
                  className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleUnlock}>
                <div className="space-y-4">
                  <div>
                    <input
                      type="password"
                      autoFocus
                      placeholder={hasPinSet ? "Digite o seu PIN" : "Crie um PIN (ex: 1234)"}
                      value={pin}
                      onChange={(e) => { setPin(e.target.value); setError(false); }}
                      className={`w-full bg-black/40 border ${error ? 'border-red-500' : 'border-white/10'} rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] text-white focus:outline-none focus:border-purple-500/50`}
                      maxLength={4}
                    />
                    {error && (
                      <p className="text-red-400 text-xs text-center mt-2 font-semibold">
                        {hasPinSet ? 'PIN incorreto. Tente novamente.' : 'O PIN deve ter 4 dígitos.'}
                      </p>
                    )}
                    {!hasPinSet && !error && (
                      <p className="text-purple-400 text-xs text-center mt-2 font-semibold">
                        Como é seu primeiro acesso, digite 4 números para criar sua senha de Chefe.
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-colors shadow-lg shadow-purple-600/20"
                  >
                    {hasPinSet ? 'DESBLOQUEAR ACESSO' : 'CRIAR SENHA E ENTRAR'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
