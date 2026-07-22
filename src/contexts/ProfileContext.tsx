import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'chefe' | 'producao';

interface ProfileContextType {
  role: UserRole;
  unlockChefe: (pin: string) => boolean;
  lockToProducao: () => void;
  isUnlocked: boolean;
  hasPinSet: boolean;
  setMasterPin: (pin: string) => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Inicializa com producao por padrão, ou lê do localStorage se já tiver logado como chefe
  const [role, setRole] = useState<UserRole>(() => {
    return (localStorage.getItem('borda-role') as UserRole) || 'producao';
  });

  const [masterPin, setMasterPinState] = useState<string | null>(() => {
    return localStorage.getItem('borda-master-pin');
  });

  const unlockChefe = (pin: string) => {
    if (masterPin === null) return false;
    
    if (pin === masterPin) {
      setRole('chefe');
      localStorage.setItem('borda-role', 'chefe');
      return true;
    }
    return false;
  };

  const setMasterPin = (pin: string) => {
    localStorage.setItem('borda-master-pin', pin);
    setMasterPinState(pin);
    // Automaticamente destrava após cadastrar
    setRole('chefe');
    localStorage.setItem('borda-role', 'chefe');
  };

  const lockToProducao = () => {
    setRole('producao');
    localStorage.setItem('borda-role', 'producao');
  };

  return (
    <ProfileContext.Provider 
      value={{ 
        role, 
        unlockChefe, 
        lockToProducao,
        isUnlocked: role === 'chefe',
        hasPinSet: masterPin !== null,
        setMasterPin
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
