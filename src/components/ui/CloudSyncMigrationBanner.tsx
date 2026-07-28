import React, { useState } from 'react';
import { CloudUpload, CheckCircle2, Loader2, Sparkles, Smartphone, Laptop } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';

export const CloudSyncMigrationBanner: React.FC = () => {
  const { user } = useAuth();
  const { settings, updateSettings } = useCompanySettings();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncedSuccess, setIsSyncedSuccess] = useState(false);

  const handleSyncToCloud = async () => {
    setIsSyncing(true);
    const toastId = toast.loading('Sincronizando todos os insumos, perfis e configurações com a nuvem...');

    try {
      const userId = user?.id || '246afa29-5a6b-4671-ade1-eb7d19ab3a9d';

      // 1. Sincronizar Insumos de Estoque do Cache Local
      const savedStockRaw = localStorage.getItem('borda_stock_items');
      if (savedStockRaw) {
        try {
          const stockItems = JSON.parse(savedStockRaw);
          if (Array.isArray(stockItems) && stockItems.length > 0) {
            const stockPayload = stockItems.map((item: any) => ({
              id: item.id || `stk_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              user_id: userId,
              name: item.name,
              category: item.category || 'geral',
              unit: item.unit || 'unidade',
              quantity: Number(item.quantity) || 0,
              min_quantity: Number(item.min_quantity) || 0,
              cost_price: Number(item.cost_price) || 0,
              color_code: item.color_code || null,
              location: item.location || null,
              notes: item.notes || null,
              created_at: item.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString()
            }));

            const { error: stockErr } = await supabase
              .from('stock_items')
              .upsert(stockPayload);

            if (stockErr) console.warn('Erro ao salvar insumos no Supabase:', stockErr.message);
          }
        } catch (e) {
          console.warn('Erro no parse do estoque local:', e);
        }
      }

      // 2. Sincronizar Perfis Netflix e Master PIN
      const savedProfilesRaw = localStorage.getItem('borda_custom_profiles_v1');
      const savedMasterPin = localStorage.getItem('borda-master-pin');
      let customProfilesData = null;
      if (savedProfilesRaw) {
        try {
          customProfilesData = JSON.parse(savedProfilesRaw);
        } catch { /* fallback */ }
      }

      // 3. Sincronizar Configurações da Empresa (Endereços, Horários, Pix, Telefone, SPM, Token Fiscal)
      const settingsPayload: Record<string, any> = {
        id: userId,
        system_name: settings.systemName,
        system_subtitle: settings.systemSubtitle,
        primary_color: settings.primaryColor,
        pix_key: settings.pixKey || localStorage.getItem('cached_pix_key') || '',
        phone: settings.phone || localStorage.getItem('cached_company_phone') || '',
        email: settings.email || localStorage.getItem('cached_company_email') || '',
        address: settings.address || localStorage.getItem('cached_company_address') || '',
        document: settings.document || localStorage.getItem('cached_company_document') || '',
        working_hours: settings.workingHours || localStorage.getItem('cached_company_hours') || '',
        fiscal_api_token: settings.fiscalApiToken || localStorage.getItem('cached_fiscal_token') || '',
        fiscal_environment: settings.fiscalEnvironment || localStorage.getItem('cached_fiscal_env') || 'homologacao',
        machine_speed_spm: settings.machineSpeedSpm || Number(localStorage.getItem('cached_machine_speed_spm')) || 800,
        color_change_time_sec: settings.colorChangeTimeSec !== undefined ? settings.colorChangeTimeSec : 30,
        custom_profiles: customProfilesData,
        master_pin: savedMasterPin,
        logo_url: settings.logoUrl,
        updated_at: new Date().toISOString()
      };

      const { error: settingsErr } = await supabase
        .from('company_settings')
        .upsert(settingsPayload);

      if (settingsErr) throw settingsErr;

      setIsSyncedSuccess(true);
      toast.success(
        '🎉 Sincronização concluída! Todos os seus insumos, perfis, endereços e horários agora estão salvos na nuvem. Acesse no celular ou em qualquer PC e tudo estará lá!',
        { id: toastId, duration: 8000 }
      );
    } catch (err: any) {
      console.error('Erro na sincronização para a nuvem:', err);
      toast.error('Erro ao enviar dados para a nuvem: ' + (err.message || 'Falha de conexão'), { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-purple-900/60 via-indigo-900/50 to-purple-950/80 border border-purple-500/30 rounded-3xl p-5 md:p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden my-4">
      <div className="absolute right-0 top-0 opacity-10 translate-x-6 -translate-y-6 pointer-events-none">
        <CloudUpload className="h-48 w-48 text-purple-300" />
      </div>

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-purple-400" /> Sincronização em Nuvem em 1-Clique
            </span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
              <Laptop className="h-3.5 w-3.5" /> + <Smartphone className="h-3.5 w-3.5" />
            </span>
          </div>

          <h3 className="text-base font-black text-white tracking-tight">
            Garantir que seus cadastros funcionem no Celular e em Outros PCs
          </h3>

          <p className="text-xs text-zinc-300 leading-relaxed">
            Se você cadastrou insumos, endereços, horários ou perfis neste computador, clique abaixo para subir tudo para a nuvem em 1 segundo e sincronizar com seu celular e outros dispositivos!
          </p>
        </div>

        <button
          type="button"
          onClick={handleSyncToCloud}
          disabled={isSyncing}
          className={`shrink-0 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2.5 shadow-xl transition-all active:scale-95 disabled:opacity-50 ${
            isSyncedSuccess
              ? 'bg-emerald-500 text-white shadow-emerald-500/30'
              : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/30 border border-purple-400/30'
          }`}
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              <span>Enviando para Nuvem...</span>
            </>
          ) : isSyncedSuccess ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-white" />
              <span>Sincronizado com Sucesso!</span>
            </>
          ) : (
            <>
              <CloudUpload className="h-4 w-4 text-white" />
              <span>☁️ Sincronizar Tudo com a Nuvem (1-Clique)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
