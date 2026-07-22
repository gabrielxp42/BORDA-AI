import React, { useState } from 'react';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { useProfile } from '../contexts/ProfileContext';
import { Palette, Upload, Building2, Check, User, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const COLOR_PRESETS = [
  { name: 'Roxo Imperial', value: '#9333ea' },
  { name: 'Azul Elétrico', value: '#2563eb' },
  { name: 'Verde Esmeralda', value: '#10b981' },
  { name: 'Rosa Choque', value: '#ec4899' },
  { name: 'Laranja Flame', value: '#f97316' },
  { name: 'Vermelho Ruby', value: '#ef4444' },
  { name: 'Ciano Neon', value: '#06b6d4' },
];

export const PerfilConfig: React.FC = () => {
  const { settings, updateSettings } = useCompanySettings();
  const { role, isUnlocked, lockToProducao } = useProfile();

  const [systemName, setSystemName] = useState(settings.systemName);
  const [systemSubtitle, setSystemSubtitle] = useState(settings.systemSubtitle);
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logoUrl);
  const [isSaving, setIsSaving] = useState(false);

  // Preview ao vivo da cor
  React.useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', primaryColor);
    
    // Ao sair da tela (desmontar), se não salvou, restaura a cor salva oficialmente no banco
    return () => {
      document.documentElement.style.setProperty('--brand-primary', settings.primaryColor);
    };
  }, [primaryColor, settings.primaryColor]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    toast.info('Atualizando configurações da empresa...', { id: 'settings-toast' });

    const success = await updateSettings(
      { systemName, systemSubtitle, primaryColor },
      logoFile || undefined
    );

    if (success) {
      toast.success('Configurações salvas com sucesso!', { id: 'settings-toast' });
    } else {
      toast.error('Erro ao salvar configurações.', { id: 'settings-toast' });
    }
    setIsSaving(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <Building2 className="h-7 w-7 text-purple-600 dark:text-purple-400" />
          Perfil & Configurações da Empresa
        </h1>
        <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
          Personalize a identidade visual do ERP, altere a logo, nome do sistema e esquema de cores.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card: Identidade do Sistema */}
        <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm dark:shadow-none backdrop-blur-xl space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-4">
            <Palette className="h-5 w-5 text-purple-600 dark:text-purple-400" /> Identidade Visual & Branding
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nome do Sistema */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Nome da Empresa / Sistema
              </label>
              <input
                type="text"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 font-semibold transition-colors"
                placeholder="Ex: BORDA AI"
                required
              />
            </div>

            {/* Subtítulo */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Subtítulo / Slogan
              </label>
              <input
                type="text"
                value={systemSubtitle}
                onChange={(e) => setSystemSubtitle(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="Ex: INDUSTRIAL EMBROIDERIES ERP"
              />
            </div>
          </div>

          {/* Logo Upload */}
          <div className="space-y-3 pt-2">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
              Logo da Empresa (Barra Lateral)
            </label>
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-black/40 flex items-center justify-center overflow-hidden shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <Building2 className="h-8 w-8 text-slate-400 dark:text-white/20" />
                )}
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-300 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-white cursor-pointer transition-colors">
                  <Upload className="h-4 w-4 text-purple-600 dark:text-purple-400" /> Escolher Nova Imagem
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
                <p className="text-xs text-slate-500 dark:text-zinc-500">
                  Recomendado: PNG transparente ou SVG em alta resolução (formato quadrado).
                </p>
              </div>
            </div>
          </div>

          {/* Cor Principal */}
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/5">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
              Cor Principal do Sistema
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setPrimaryColor(color.value)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    primaryColor === color.value ? 'ring-2 ring-purple-600 dark:ring-white scale-110 shadow-md' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  {primaryColor === color.value && <Check className="h-5 w-5 text-white stroke-[3]" />}
                </button>
              ))}

              <div className="flex items-center gap-2 ml-2 pl-4 border-l border-slate-300 dark:border-white/10">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border-0"
                />
                <span className="text-xs font-mono font-bold text-slate-600 dark:text-zinc-400 uppercase">{primaryColor}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Perfil de Acesso do Operador (Estilo Netflix) */}
        <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm dark:shadow-none backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <User className="h-5 w-5 text-purple-600 dark:text-purple-400" /> Perfil de Acesso no Dispositivo (Estilo Netflix)
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Defina qual perfil está operando este computador/tablet dentro da sua conta da empresa.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5">
              <span className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase">Perfil Selecionado</span>
              <p className="text-base font-black text-slate-900 dark:text-white capitalize mt-0.5">{role}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5">
              <span className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase">Visibilidade Financeira</span>
              <p className="text-base font-black text-purple-600 dark:text-purple-400 mt-0.5">
                {isUnlocked ? 'Modo Chefe (Valores Visíveis)' : 'Modo Produção (Valores Ocultos)'}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {isUnlocked 
                ? 'Você está no Perfil Chefe. Para impedir que operadores vejam faturamento e preços, altere para Produção.' 
                : 'Você está no Perfil Produção (valores financeiros ocultos). Clique em CHEFE no topo para trocar com PIN.'}
            </p>
            {isUnlocked && (
              <button
                type="button"
                onClick={() => {
                  lockToProducao();
                  toast.success('Perfil alterado para Produção (Valores Ocultos).');
                }}
                className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all flex items-center gap-2"
              >
                Alternar para Perfil Produção
              </button>
            )}
          </div>
        </div>

        {/* Botão de Salvar */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-8 py-3.5 rounded-2xl text-white font-black text-sm transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 hover:brightness-110"
            style={{ backgroundColor: primaryColor }}
          >
            {isSaving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Salvar Alterações
          </button>
        </div>
      </form>
    </div>
  );
};
