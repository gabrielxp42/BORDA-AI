import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../integrations/supabase/client';
import { toast } from 'sonner';

export type UserRole = string;

export interface ProfilePermissions {
  routes: {
    dashboard: boolean;        // '/'
    pedidos: boolean;          // '/pedidos'
    calculadora: boolean;      // '/calculadora'
    matrizes: boolean;         // '/matrizes'
    estoque: boolean;          // '/estoque'
    faturamento: boolean;      // '/faturamento'
    clientes: boolean;         // '/clientes'
    maquinas: boolean;         // '/maquinas'
    configuracoes: boolean;    // '/configuracoes'
    perfil: boolean;           // '/perfil'
  };
  canSeeFinancials: boolean;   // Ver faturamento e valores
  canEditOrders: boolean;      // Criar e alterar pedidos
  canManageClients: boolean;   // Gerenciar cadastro de clientes
  canManageStock: boolean;     // Gerenciar estoque de insumos
  canExportReports: boolean;   // Exportar relatórios / PDFs
  canSendWhatsApp: boolean;    // Enviar WhatsApp via Evolution API
  canChangeSettings: boolean;  // Alterar configurações da empresa
}

export interface CustomProfile {
  id: string;
  name: string;
  icon: string;
  color: string;
  pin?: string;                // PIN opcional de 4 dígitos definido pelo Chefe
  permissions: ProfilePermissions;
  isBuiltIn?: boolean;
}

export const CHEFE_PERMISSIONS: ProfilePermissions = {
  routes: {
    dashboard: true,
    pedidos: true,
    calculadora: true,
    matrizes: true,
    estoque: true,
    faturamento: true,
    clientes: true,
    maquinas: true,
    configuracoes: true,
    perfil: true,
  },
  canSeeFinancials: true,
  canEditOrders: true,
  canManageClients: true,
  canManageStock: true,
  canExportReports: true,
  canSendWhatsApp: true,
  canChangeSettings: true,
};

export const PRODUCAO_PERMISSIONS: ProfilePermissions = {
  routes: {
    dashboard: false,
    pedidos: true,
    calculadora: false,
    matrizes: true,
    estoque: false,
    faturamento: false,
    clientes: false,
    maquinas: true,
    configuracoes: false,
    perfil: false,
  },
  canSeeFinancials: false,
  canEditOrders: true,
  canManageClients: false,
  canManageStock: false,
  canExportReports: false,
  canSendWhatsApp: true,
  canChangeSettings: false,
};

export const DEFAULT_PROFILES: CustomProfile[] = [
  {
    id: 'chefe',
    name: '👑 CHEFE',
    icon: '👑',
    color: '#ef4444',
    permissions: CHEFE_PERMISSIONS,
    isBuiltIn: true,
  },
  {
    id: 'producao',
    name: '🧵 OPERADOR',
    icon: '✂️',
    color: '#06b6d4',
    permissions: PRODUCAO_PERMISSIONS,
    isBuiltIn: true,
  },
];

interface ProfileContextType {
  role: UserRole;
  activeProfile: CustomProfile;
  customProfiles: CustomProfile[];
  permissions: ProfilePermissions;
  isUnlocked: boolean;
  hasPinSet: boolean;
  unlockChefe: (pin: string) => boolean;
  selectProfile: (profileId: string, pinInput?: string) => boolean;
  lockToProducao: () => void;
  setMasterPin: (pin: string) => void;
  resetMasterPin: () => void;
  createProfile: (profile: Omit<CustomProfile, 'id'>) => Promise<boolean>;
  updateProfile: (id: string, profile: Partial<CustomProfile>) => Promise<boolean>;
  deleteProfile: (id: string) => Promise<boolean>;
  isProfileModalOpen: boolean;
  openProfileModal: () => void;
  closeProfileModal: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const LOCAL_STORAGE_PROFILES_KEY = 'borda_custom_profiles_v1';
const LOCAL_STORAGE_ACTIVE_ID_KEY = 'borda_active_profile_id_v1';

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [masterPin, setMasterPinState] = useState<string | null>(() => {
    return localStorage.getItem('borda-master-pin');
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID_KEY) || localStorage.getItem('borda-role') || 'producao';
  });

  const [customProfiles, setCustomProfiles] = useState<CustomProfile[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_PROFILES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* fallback */ }
    return DEFAULT_PROFILES;
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  // Carrega perfis do Supabase na inicialização
  useEffect(() => {
    const loadSupabaseProfiles = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const targetId = user?.id || '246afa29-5a6b-4671-ade1-eb7d19ab3a9d';
        
        const { data } = await supabase
          .from('company_settings')
          .select('team_members')
          .eq('id', targetId)
          .maybeSingle();

        if (data && (data as any).custom_profiles) {
          const remoteProfiles: CustomProfile[] = (data as any).custom_profiles;
          if (Array.isArray(remoteProfiles) && remoteProfiles.length > 0) {
            setCustomProfiles(remoteProfiles);
            localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(remoteProfiles));
          }
        }
      } catch (e) {
        console.warn('[ProfileContext] Não foi possível buscar perfis remotos:', e);
      }
    };

    loadSupabaseProfiles();
  }, []);

  // Salva perfis no Supabase + localStorage
  const saveProfiles = useCallback(async (profiles: CustomProfile[]) => {
    setCustomProfiles(profiles);
    localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(profiles));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const targetId = user?.id || '246afa29-5a6b-4671-ade1-eb7d19ab3a9d';

      await supabase
        .from('company_settings')
        .update({
          // Grava como campo JSON se suportado
          custom_profiles: profiles as any
        } as any)
        .eq('id', targetId);
    } catch (e) {
      console.warn('[ProfileContext] Falha ao sincronizar perfis com Supabase:', e);
    }
  }, []);

  // Encontra perfil ativo
  const activeProfile = customProfiles.find(p => p.id === activeProfileId) || customProfiles[0] || DEFAULT_PROFILES[0];
  const permissions = activeProfile.permissions || (activeProfile.id === 'chefe' ? CHEFE_PERMISSIONS : PRODUCAO_PERMISSIONS);
  const isUnlocked = activeProfile.id === 'chefe' || permissions.canSeeFinancials;

  const selectProfile = (profileId: string, pinInput?: string): boolean => {
    const target = customProfiles.find(p => p.id === profileId);
    if (!target) return false;

    // Se for Chefe, exige masterPin
    if (target.id === 'chefe') {
      if (masterPin === null) return false;
      if (pinInput !== masterPin) return false;
    } 
    // Se o perfil tiver um PIN customizado exigido pelo Chefe
    else if (target.pin && target.pin.trim() !== '') {
      if (pinInput !== target.pin) return false;
    }

    setActiveProfileId(target.id);
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, target.id);
    localStorage.setItem('borda-role', target.id === 'chefe' ? 'chefe' : 'producao');
    setIsProfileModalOpen(false);
    return true;
  };

  const unlockChefe = (pin: string) => {
    return selectProfile('chefe', pin);
  };

  const lockToProducao = () => {
    selectProfile('producao');
  };

  const setMasterPin = (pin: string) => {
    localStorage.setItem('borda-master-pin', pin);
    setMasterPinState(pin);
    setActiveProfileId('chefe');
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, 'chefe');
    localStorage.setItem('borda-role', 'chefe');
    setIsProfileModalOpen(false);
  };

  const resetMasterPin = () => {
    localStorage.removeItem('borda-master-pin');
    setMasterPinState(null);
    lockToProducao();
  };

  const createProfile = async (newProfileData: Omit<CustomProfile, 'id'>): Promise<boolean> => {
    const id = `profile_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newProfile: CustomProfile = {
      ...newProfileData,
      id,
      isBuiltIn: false,
    };
    const updated = [...customProfiles, newProfile];
    await saveProfiles(updated);
    toast.success(`Perfil "${newProfile.name}" criado com sucesso!`);
    return true;
  };

  const updateProfile = async (id: string, updatedFields: Partial<CustomProfile>): Promise<boolean> => {
    const updated = customProfiles.map(p => {
      if (p.id === id) {
        return { ...p, ...updatedFields };
      }
      return p;
    });
    await saveProfiles(updated);
    toast.success('Perfil atualizado!');
    return true;
  };

  const deleteProfile = async (id: string): Promise<boolean> => {
    const target = customProfiles.find(p => p.id === id);
    if (target?.isBuiltIn) {
      toast.error('Não é possível excluir perfis padrão do sistema.');
      return false;
    }

    const updated = customProfiles.filter(p => p.id !== id);
    await saveProfiles(updated);

    if (activeProfileId === id) {
      setActiveProfileId('producao');
      localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, 'producao');
    }

    toast.success('Perfil removido!');
    return true;
  };

  const openProfileModal = () => setIsProfileModalOpen(true);
  const closeProfileModal = () => setIsProfileModalOpen(false);

  return (
    <ProfileContext.Provider
      value={{
        role: activeProfile.id,
        activeProfile,
        customProfiles,
        permissions,
        isUnlocked,
        hasPinSet: masterPin !== null,
        unlockChefe,
        selectProfile,
        lockToProducao,
        setMasterPin,
        resetMasterPin,
        createProfile,
        updateProfile,
        deleteProfile,
        isProfileModalOpen,
        openProfileModal,
        closeProfileModal,
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
