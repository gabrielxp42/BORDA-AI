import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';
import { NetflixProfileModal } from '@/components/profile/NetflixProfileModal';

export const ProfileSwitcher: React.FC = () => {
  const { activeProfile, openProfileModal } = useProfile();

  return (
    <>
      <button
        onClick={openProfileModal}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border transition-all active:scale-95 shadow-sm bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
        title="Clique para Selecionar Perfil (Estilo Netflix)"
      >
        <div
          className="h-6 w-6 rounded-xl flex items-center justify-center font-bold text-xs shadow-sm"
          style={{ backgroundColor: `${activeProfile.color}33`, color: activeProfile.color, border: `1px solid ${activeProfile.color}66` }}
        >
          {activeProfile.icon}
        </div>

        <div className="text-left hidden sm:block">
          <p className="text-[10px] font-black uppercase tracking-wider leading-none text-white">
            {activeProfile.name}
          </p>
          <p className="text-[9px] text-zinc-400 font-semibold leading-none mt-0.5">
            {activeProfile.permissions.canSeeFinancials ? 'Acesso Total' : 'Restrito'}
          </p>
        </div>

        <ChevronDown className="h-3.5 w-3.5 opacity-60 text-zinc-400" />
      </button>

      {/* Netflix Profile Selection Modal */}
      <NetflixProfileModal />
    </>
  );
};
