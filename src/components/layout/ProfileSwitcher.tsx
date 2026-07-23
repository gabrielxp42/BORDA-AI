import React from 'react';
import { Crown, Scissors, UserCheck, ChevronDown } from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';
import { NetflixProfileModal } from '@/components/profile/NetflixProfileModal';

export const ProfileSwitcher: React.FC = () => {
  const { isUnlocked, openProfileModal } = useProfile();

  return (
    <>
      <button
        onClick={openProfileModal}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border transition-all active:scale-95 shadow-sm ${
          isUnlocked
            ? 'bg-purple-500/15 border-purple-500/30 text-purple-300 hover:bg-purple-500/25 hover:border-purple-400'
            : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 hover:border-cyan-400'
        }`}
        title="Clique para Selecionar Perfil (Estilo Netflix)"
      >
        <div
          className={`h-6 w-6 rounded-xl flex items-center justify-center font-bold text-xs shadow-sm ${
            isUnlocked
              ? 'bg-gradient-to-tr from-purple-600 to-pink-500 text-white'
              : 'bg-gradient-to-tr from-cyan-500 to-teal-400 text-black'
          }`}
        >
          {isUnlocked ? <Crown className="h-3.5 w-3.5" /> : <Scissors className="h-3.5 w-3.5" />}
        </div>

        <div className="text-left hidden sm:block">
          <p className="text-[10px] font-black uppercase tracking-wider leading-none">
            {isUnlocked ? '👑 Chefe' : '🧵 Operador'}
          </p>
          <p className="text-[9px] text-zinc-400 font-semibold leading-none mt-0.5">
            {isUnlocked ? 'Acesso Total' : 'Produção'}
          </p>
        </div>

        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      {/* Netflix Profile Selection Modal */}
      <NetflixProfileModal />
    </>
  );
};
