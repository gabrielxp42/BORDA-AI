import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from './AuthContext';

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
  canDownloadMatrices: boolean;// Baixar arquivos de matriz
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
  canDownloadMatrices: true,
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
  canDownloadMatrices: false,
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
  const { user } = useAuth();
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
        return parsed.map((p: any) => ({
          ...p,
          permissions: {
            ...p.permissions,
            canDownloadMatrices: p.permissions?.canDownloadMatrices ?? (p.id === 'chefe')
          }
        }));
      }
    } catch { /* fallback */ }
    return DEFAULT_PROFILES;
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  // Carrega perfis customizados e PIN mestre do Supabase na inicialização (Compartilhado entre todas as máquinas)
  useEffect(() => {
    const fetchCloudProfiles = async () => {
      try {
        const { data } = await supabase
          .from('company_settings')
          .select('custom_profiles, master_pin')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          if (data.custom_profiles && Array.isArray(data.custom_profiles) && data.custom_profiles.length > 0) {
            setCustomProfiles(data.custom_profiles);
            localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(data.custom_profiles));
          }
          // Se o PIN for retornado do banco (mesmo vazio), sincronizamos o estado
          if (data.master_pin) {
            setMasterPinState(data.master_pin);
            localStorage.setItem('borda-master-pin', data.master_pin);
          } else {
            // Se master_pin for null na nuvem, resetamos localmente
            setMasterPinState(null);
            localStorage.removeItem('borda-master-pin');
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar perfis da nuvem:', err);
      }
    };

    fetchCloudProfiles();
  }, []);

  // Salva perfis no localStorage E no Supabase (nuvem)
  const saveProfiles = useCallback(async (profiles: CustomProfile[]) => {
    setCustomProfiles(profiles);
    localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(profiles));

    // Sync para Supabase imediatamente
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      
      if (!userId) return; // Não salvar na nuvem se deslogado

      await supabase
        .from('company_settings')
        .upsert({
          id: userId,
          custom_profiles: profiles,
          updated_at: new Date().toISOString()
        });
    } catch (err) {
      console.warn('Erro ao salvar perfis na nuvem:', err);
    }
  }, [user?.id]);

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

  const setMasterPin = async (pin: string) => {
    localStorage.setItem('borda-master-pin', pin);
    setMasterPinState(pin);
    setActiveProfileId('chefe');
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, 'chefe');
    localStorage.setItem('borda-role', 'chefe');
    setIsProfileModalOpen(false);

    // Sync PIN para Supabase
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      
      if (!userId) return;

      await supabase
        .from('company_settings')
        .upsert({ id: userId, master_pin: pin, updated_at: new Date().toISOString() });
    } catch (err) {
      console.warn('Erro ao salvar PIN na nuvem:', err);
    }
  };

  const resetMasterPin = async () => {
    localStorage.removeItem('borda-master-pin');
    setMasterPinState(null);
    lockToProducao();

    // Sync para Supabase
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      
      if (!userId) return;

      await supabase
        .from('company_settings')
        .upsert({ id: userId, master_pin: null, updated_at: new Date().toISOString() });
    } catch (err) {
      console.warn('Erro ao resetar PIN na nuvem:', err);
    }
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
