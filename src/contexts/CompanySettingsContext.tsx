import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from './AuthContext';

interface CompanySettings {
  systemName: string;
  systemSubtitle: string;
  primaryColor: string;
  logoUrl: string | null;
}

interface CompanySettingsContextType {
  settings: CompanySettings;
  updateSettings: (newSettings: Partial<CompanySettings>, logoFile?: File) => Promise<boolean>;
  isLoading: boolean;
}

const defaultSettings: CompanySettings = {
  systemName: 'BORDA AI',
  systemSubtitle: 'INDUSTRIAL EMBROIDERIES ERP',
  primaryColor: '#9333ea',
  logoUrl: null,
};

const CompanySettingsContext = createContext<CompanySettingsContextType | undefined>(undefined);

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Inicialização síncrona lendo direto do localStorage para eliminar 100% o piscar do roxo no F5
  const [settings, setSettings] = useState<CompanySettings>(() => {
    const cachedColor = localStorage.getItem('cached_primary_color');
    const cachedName = localStorage.getItem('cached_system_name');
    const cachedSubtitle = localStorage.getItem('cached_system_subtitle');
    const cachedLogo = localStorage.getItem('cached_logo_url');

    if (cachedColor) {
      document.documentElement.style.setProperty('--brand-primary', cachedColor);
    }

    return {
      systemName: cachedName || defaultSettings.systemName,
      systemSubtitle: cachedSubtitle || defaultSettings.systemSubtitle,
      primaryColor: cachedColor || defaultSettings.primaryColor,
      logoUrl: cachedLogo || null,
    };
  });

  const [isLoading, setIsLoading] = useState(true);

  const saveToCache = (newSettings: CompanySettings) => {
    localStorage.setItem('cached_primary_color', newSettings.primaryColor);
    localStorage.setItem('cached_system_name', newSettings.systemName);
    localStorage.setItem('cached_system_subtitle', newSettings.systemSubtitle);
    if (newSettings.logoUrl) {
      localStorage.setItem('cached_logo_url', newSettings.logoUrl);
    } else {
      localStorage.removeItem('cached_logo_url');
    }
  };

  const clearCache = () => {
    localStorage.removeItem('cached_primary_color');
    localStorage.removeItem('cached_system_name');
    localStorage.removeItem('cached_system_subtitle');
    localStorage.removeItem('cached_logo_url');
  };

  // Sempre que o usuário autenticado mudar (login/logout/troca de conta):
  useEffect(() => {
    if (user?.id) {
      fetchUserSettings(user.id);
    } else {
      // Usuário anônimo / Não logado: Limpa cache e restaura padrão neutro
      clearCache();
      setSettings(defaultSettings);
      document.documentElement.style.setProperty('--brand-primary', defaultSettings.primaryColor);
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
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        const loaded: CompanySettings = {
          systemName: data.system_name || defaultSettings.systemName,
          systemSubtitle: data.system_subtitle || defaultSettings.systemSubtitle,
          primaryColor: data.primary_color || defaultSettings.primaryColor,
          logoUrl: data.logo_url || null,
        };
        setSettings(loaded);
        saveToCache(loaded);
      }
    } catch (err) {
      console.error('Erro ao buscar configurações da conta:', err);
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

      const updated = {
        id: targetId,
        system_name: newSettings.systemName ?? settings.systemName,
        system_subtitle: newSettings.systemSubtitle ?? settings.systemSubtitle,
        primary_color: newSettings.primaryColor ?? settings.primaryColor,
        logo_url: logoUrl,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('company_settings')
        .upsert(updated);

      if (error) throw error;

      const newCompanySettings: CompanySettings = {
        systemName: updated.system_name,
        systemSubtitle: updated.system_subtitle,
        primaryColor: updated.primary_color,
        logoUrl,
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
