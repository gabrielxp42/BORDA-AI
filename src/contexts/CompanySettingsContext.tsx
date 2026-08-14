import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from './AuthContext';

export interface TeamMember {
  id: string;
  name: string;
  phone: string;
  role: string;
  pin?: string;
  receiveAlerts: boolean;
}

interface CompanySettings {
  systemName: string;
  systemSubtitle: string;
  primaryColor: string;
  logoUrl: string | null;
  pixKey?: string | null;
  phone?: string | null;
  ownerPhone?: string | null;
  email?: string | null;
  address?: string | null;
  document?: string | null;
  workingHours?: string | null;
  fiscalApiToken?: string | null;
  fiscalEnvironment?: 'homologacao' | 'producao';
  machineSpeedSpm?: number;
  colorChangeTimeSec?: number;
  teamMembers?: TeamMember[];
}

interface CompanySettingsContextType {
  settings: CompanySettings;
  updateSettings: (newSettings: Partial<CompanySettings>, logoFile?: File) => Promise<boolean>;
  isLoading: boolean;
}

const defaultSettings: CompanySettings = {
  systemName: 'GUAÇU BORDADOS',
  systemSubtitle: 'GESTÃO INTELIGENTE DE BORDADOS',
  primaryColor: '#ef4444',
  logoUrl: 'https://lyjxrfkslzrmtlefswag.supabase.co/storage/v1/object/public/public_assets/246afa29-5a6b-4671-ade1-eb7d19ab3a9d/logo-1784750362264.png',
  pixKey: '',
  phone: '',
  email: '',
  address: '',
  document: '',
  workingHours: 'Seg à Sex: 08h às 18h | Sáb: 08h às 12h',
  fiscalApiToken: '',
  fiscalEnvironment: 'homologacao',
  machineSpeedSpm: 800,
  colorChangeTimeSec: 30,
  teamMembers: [
    { id: '1', name: 'Gabriel (Gerente)', phone: '5519999999999', role: 'Gerente de Produção', receiveAlerts: true },
    { id: '2', name: 'Carlos Bordador', phone: '5519988888888', role: 'Operador Máquina 1', receiveAlerts: true }
  ]
};

const CompanySettingsContext = createContext<CompanySettingsContextType | undefined>(undefined);

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Inicialização síncrona lendo direto do localStorage
  const [settings, setSettings] = useState<CompanySettings>(() => {
    const cachedColor = localStorage.getItem('cached_primary_color');
    const cachedName = localStorage.getItem('cached_system_name');
    const cachedSubtitle = localStorage.getItem('cached_system_subtitle');
    const cachedLogo = localStorage.getItem('cached_logo_url');
    const cachedPix = localStorage.getItem('cached_pix_key');
    const cachedPhone = localStorage.getItem('cached_company_phone');
    const cachedEmail = localStorage.getItem('cached_company_email');
    const cachedAddress = localStorage.getItem('cached_company_address');
    const cachedDoc = localStorage.getItem('cached_company_document');
    const cachedHours = localStorage.getItem('cached_company_hours');
    const cachedFiscalToken = localStorage.getItem('cached_fiscal_token');
    const cachedFiscalEnv = localStorage.getItem('cached_fiscal_env') as 'homologacao' | 'producao' | null;
    const cachedMachineSpeed = localStorage.getItem('cached_machine_speed_spm');
    const cachedColorTime = localStorage.getItem('cached_color_change_sec');
    const cachedTeam = localStorage.getItem('cached_team_members');

    let parsedTeam: TeamMember[] = defaultSettings.teamMembers || [];
    if (cachedTeam) {
      try { parsedTeam = JSON.parse(cachedTeam); } catch (e) {}
    }

    const effectiveColor = cachedColor || defaultSettings.primaryColor;
    document.documentElement.style.setProperty('--brand-primary', effectiveColor);

    return {
      systemName: cachedName || defaultSettings.systemName,
      systemSubtitle: cachedSubtitle || defaultSettings.systemSubtitle,
      primaryColor: effectiveColor,
      logoUrl: cachedLogo !== null && cachedLogo !== undefined ? cachedLogo : defaultSettings.logoUrl,
      pixKey: cachedPix || '',
      phone: cachedPhone || '',
      email: cachedEmail || '',
      address: cachedAddress || '',
      document: cachedDoc || '',
      workingHours: cachedHours || defaultSettings.workingHours,
      fiscalApiToken: cachedFiscalToken || '',
      fiscalEnvironment: cachedFiscalEnv || 'homologacao',
      machineSpeedSpm: cachedMachineSpeed ? Number(cachedMachineSpeed) : 800,
      colorChangeTimeSec: cachedColorTime ? Number(cachedColorTime) : 30,
      teamMembers: parsedTeam
    };
  });

  const [isLoading, setIsLoading] = useState(true);

  const saveToCache = (newSettings: CompanySettings) => {
    localStorage.setItem('cached_primary_color', newSettings.primaryColor);
    localStorage.setItem('cached_system_name', newSettings.systemName);
    localStorage.setItem('cached_system_subtitle', newSettings.systemSubtitle);
    if (newSettings.pixKey) localStorage.setItem('cached_pix_key', newSettings.pixKey);
    if (newSettings.phone) localStorage.setItem('cached_company_phone', newSettings.phone);
    if (newSettings.email) localStorage.setItem('cached_company_email', newSettings.email);
    if (newSettings.address) localStorage.setItem('cached_company_address', newSettings.address);
    if (newSettings.document) localStorage.setItem('cached_company_document', newSettings.document);
    if (newSettings.workingHours) localStorage.setItem('cached_company_hours', newSettings.workingHours);
    if (newSettings.fiscalApiToken) localStorage.setItem('cached_fiscal_token', newSettings.fiscalApiToken);
    if (newSettings.fiscalEnvironment) localStorage.setItem('cached_fiscal_env', newSettings.fiscalEnvironment);
    if (newSettings.machineSpeedSpm) localStorage.setItem('cached_machine_speed_spm', String(newSettings.machineSpeedSpm));
    if (newSettings.colorChangeTimeSec !== undefined) localStorage.setItem('cached_color_change_sec', String(newSettings.colorChangeTimeSec));
    if (newSettings.logoUrl) {
      localStorage.setItem('cached_logo_url', newSettings.logoUrl);
    }
    if (newSettings.teamMembers) {
      localStorage.setItem('cached_team_members', JSON.stringify(newSettings.teamMembers));
    }
  };

  const clearCache = () => {
    localStorage.removeItem('cached_primary_color');
    localStorage.removeItem('cached_system_name');
    localStorage.removeItem('cached_system_subtitle');
    localStorage.removeItem('cached_logo_url');
    localStorage.removeItem('cached_pix_key');
  };

  // Sempre que o usuário autenticado mudar (login/logout/troca de conta):
  useEffect(() => {
    if (user?.id) {
      fetchUserSettings(user.id);
    } else {
      // Usuário anônimo / Primeiro acesso: Carrega configurações padrão
      setSettings(defaultSettings);
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (settings.primaryColor) {
      document.documentElement.style.setProperty('--brand-primary', settings.primaryColor);
    }
  }, [settings.primaryColor]);

    const fetchUserSettings = async (userId: string) => {
    try {
      // Busca as configurações principais da empresa (compartilhadas entre todas as máquinas do estabelecimento)
      let { data } = await supabase
        .from('company_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const loaded: CompanySettings = {
          systemName: data.system_name || defaultSettings.systemName,
          systemSubtitle: data.system_subtitle || defaultSettings.systemSubtitle,
          primaryColor: data.primary_color || defaultSettings.primaryColor,
          logoUrl: data.logo_url || defaultSettings.logoUrl,
          pixKey: data.pix_key || localStorage.getItem('cached_pix_key') || '',
          phone: data.phone || localStorage.getItem('cached_company_phone') || '',
          email: data.email || localStorage.getItem('cached_company_email') || '',
          address: data.address || localStorage.getItem('cached_company_address') || '',
          document: data.document || localStorage.getItem('cached_company_document') || '',
          workingHours: data.working_hours || localStorage.getItem('cached_company_hours') || defaultSettings.workingHours,
          fiscalApiToken: data.fiscal_api_token || localStorage.getItem('cached_fiscal_token') || '',
          fiscalEnvironment: data.fiscal_environment || (localStorage.getItem('cached_fiscal_env') as any) || 'homologacao',
          machineSpeedSpm: data.machine_speed_spm || 800,
          colorChangeTimeSec: data.color_change_time_sec !== undefined ? data.color_change_time_sec : 30
        };
        setSettings(loaded);
        saveToCache(loaded);
      } else {
        setSettings(defaultSettings);
        saveToCache(defaultSettings);
      }
    } catch (err) {
      console.error('Erro ao buscar configurações da conta:', err);
      setSettings(defaultSettings);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<CompanySettings>, logoFile?: File): Promise<boolean> => {
    const targetId = user?.id || 'default';
    try {
      let logoUrl = newSettings.logoUrl ?? settings.logoUrl;

      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const filePath = `${targetId}/logo-${Date.now()}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage
          .from('public_assets')
          .upload(filePath, logoFile, { upsert: true });

        if (uploadErr) throw uploadErr;

        logoUrl = supabase.storage.from('public_assets').getPublicUrl(filePath).data.publicUrl;
      }

      // Objeto com todas as colunas válidas da tabela DB company_settings
      const dbPayload: Record<string, any> = {
        id: targetId,
        system_name: newSettings.systemName ?? settings.systemName,
        system_subtitle: newSettings.systemSubtitle ?? settings.systemSubtitle,
        primary_color: newSettings.primaryColor ?? settings.primaryColor,
        pix_key: newSettings.pixKey ?? settings.pixKey,
        phone: newSettings.phone ?? settings.phone,
        email: newSettings.email ?? settings.email,
        address: newSettings.address ?? settings.address,
        document: newSettings.document ?? settings.document,
        working_hours: newSettings.workingHours ?? settings.workingHours,
        fiscal_api_token: newSettings.fiscalApiToken ?? settings.fiscalApiToken,
        fiscal_environment: newSettings.fiscalEnvironment ?? settings.fiscalEnvironment,
        machine_speed_spm: newSettings.machineSpeedSpm ?? settings.machineSpeedSpm,
        color_change_time_sec: newSettings.colorChangeTimeSec ?? settings.colorChangeTimeSec,
        team_members: newSettings.teamMembers ?? settings.teamMembers,
        logo_url: logoUrl,
        updated_at: new Date().toISOString(),
      };

      try {
        const { error } = await supabase
          .from('company_settings')
          .upsert(dbPayload);

        if (error) {
          console.warn('⚠️ Supabase upsert avisou:', error.message);
        } else {
          console.log('✅ Configurações salvas no Supabase com sucesso!');
        }
      } catch (dbErr) {
        console.warn('⚠️ Erro de rede/schema Supabase (salvando em cache):', dbErr);
      }

      const newCompanySettings: CompanySettings = {
        systemName: dbPayload.system_name,
        systemSubtitle: dbPayload.system_subtitle,
        primaryColor: dbPayload.primary_color,
        logoUrl,
        pixKey: dbPayload.pix_key,
        phone: dbPayload.phone,
        email: dbPayload.email,
        address: newSettings.address ?? settings.address,
        document: dbPayload.document,
        workingHours: dbPayload.working_hours,
        fiscalApiToken: dbPayload.fiscal_api_token,
        fiscalEnvironment: dbPayload.fiscal_environment as any,
        machineSpeedSpm: dbPayload.machine_speed_spm,
        colorChangeTimeSec: dbPayload.color_change_time_sec,
        teamMembers: newSettings.teamMembers ?? settings.teamMembers,
      };

      setSettings(newCompanySettings);
      saveToCache(newCompanySettings);

      return true;
    } catch (err) {
      console.error('Erro ao atualizar configurações da conta:', err);
      return false;
    }
  };

  return (
    <CompanySettingsContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </CompanySettingsContext.Provider>
  );
};

export const useCompanySettings = () => {
  const context = useContext(CompanySettingsContext);
  if (!context) {
    throw new Error('useCompanySettings must be used within a CompanySettingsProvider');
  }
  return context;
};
