import React, { createContext, useContext, useState } from 'react';

export type UserRole = 'chefe' | 'producao';

interface ProfileContextType {
  role: UserRole;
  unlockChefe: (pin: string) => boolean;
  lockToProducao: () => void;
  isUnlocked: boolean;
  hasPinSet: boolean;
  setMasterPin: (pin: string) => void;
  resetMasterPin: () => void;
  isProfileModalOpen: boolean;
  openProfileModal: () => void;
  closeProfileModal: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<UserRole>(() => {
    return (localStorage.getItem('borda-role') as UserRole) || 'producao';
  });

  const [masterPin, setMasterPinState] = useState<string | null>(() => {
    return localStorage.getItem('borda-master-pin');
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  const unlockChefe = (pin: string) => {
    if (masterPin === null) return false;
    
    if (pin === masterPin) {
      setRole('chefe');
      localStorage.setItem('borda-role', 'chefe');
      setIsProfileModalOpen(false);
      return true;
    }
    return false;
  };

  const setMasterPin = (pin: string) => {
    localStorage.setItem('borda-master-pin', pin);
    setMasterPinState(pin);
    setRole('chefe');
    localStorage.setItem('borda-role', 'chefe');
    setIsProfileModalOpen(false);
  };

  const resetMasterPin = () => {
    localStorage.removeItem('borda-master-pin');
    setMasterPinState(null);
    setRole('producao');
    localStorage.setItem('borda-role', 'producao');
  };

  const lockToProducao = () => {
    setRole('producao');
    localStorage.setItem('borda-role', 'producao');
    setIsProfileModalOpen(false);
  };

  const openProfileModal = () => setIsProfileModalOpen(true);
  const closeProfileModal = () => setIsProfileModalOpen(false);

  return (
    <ProfileContext.Provider 
      value={{ 
        role, 
        unlockChefe, 
        lockToProducao,
        isUnlocked: role === 'chefe',
        hasPinSet: masterPin !== null,
        setMasterPin,
        resetMasterPin,
        isProfileModalOpen,
        openProfileModal,
        closeProfileModal
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
