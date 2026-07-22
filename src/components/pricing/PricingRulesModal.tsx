import React, { useState, useEffect } from 'react';
import { X, Save, DollarSign, Layers, CheckCircle2, Sliders, Sparkles, RefreshCw } from 'lucide-react';
import { usePricing } from '../../contexts/PricingContext';
import { useCompanySettings } from '../../contexts/CompanySettingsContext';
import { PricingRule } from '../../types/borda';

export const PricingRulesModal: React.FC = () => {
  const { rules, isModalOpen, closePricingModal, saveAllRules, loading } = usePricing();
  const { settings } = useCompanySettings();
  const [localRules, setLocalRules] = useState<PricingRule[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (rules && rules.length > 0) {
      setLocalRules(JSON.parse(JSON.stringify(rules)));
    }
  }, [rules, isModalOpen]);

  if (!isModalOpen) return null;

  const handleValueChange = (id: string, newValue: number) => {
    setLocalRules(prev =>
      prev.map(r => (r.id === id ? { ...r, value: newValue } : r))
    );
  };

  const handleToggleActive = (id: string) => {
    setLocalRules(prev =>
      prev.map(r => (r.id === id ? { ...r, is_active: !r.is_active } : r))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveAllRules(localRules);
    setSaving(false);
    if (ok) {
      setSuccessMsg('Tabela de preços salva com sucesso!');
      setTimeout(() => {
        setSuccessMsg(null);
        closePricingModal();
      }, 1200);
    }
  };

  // Separar regras em categorias visuais intuitivas
  const thousandStitchRule = localRules.find(r => r.rule_type === 'thousand_stitches');
  const percentMarginRule = localRules.find(r => r.name.toLowerCase().includes('margem'));
  const colorRules = localRules.filter(r => r.rule_type === 'color_percent');
  const addonRules = localRules.filter(r => 
    r.rule_type === 'percent_addon' && !r.name.toLowerCase().includes('margem') || 
    r.rule_type === 'fixed_addon'
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div 
              className="p-3 rounded-2xl text-white shadow-lg"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Tabela de Precificação Personalizada
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Ajuste suas margens, milheiro e custos adicionais do seu negócio.
              </p>
            </div>
          </div>

          <button
            onClick={closePricingModal}
            className="p-2 rounded-2xl hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
          {successMsg && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-bold flex items-center gap-2 animate-in zoom-in-95">
              <CheckCircle2 className="h-4 w-4" />
              {successMsg}
            </div>
          )}

          {/* 1. Base do Milheiro & Margem */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" style={{ color: settings.primaryColor }} /> Base de Cálculo & Margem
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {thousandStitchRule && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
                    {thousandStitchRule.name} (R$ / 1.000 Pontos)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="number"
                      step="0.05"
                      value={thousandStitchRule.value}
                      onChange={e => handleValueChange(thousandStitchRule.id, parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              )}

              {percentMarginRule && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
                    {percentMarginRule.name} (%)
                  </label>
                  <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                    <input
                      type="number"
                      step="1"
                      value={percentMarginRule.value}
                      onChange={e => handleValueChange(percentMarginRule.id, parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl pl-4 pr-9 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. Adicional de Cores */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" style={{ color: settings.primaryColor }} /> Adicional por Complexidade de Cores (%)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {colorRules.map(rule => (
                <div key={rule.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block truncate">
                    {rule.name}
                  </label>
                  <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                    <input
                      type="number"
                      step="1"
                      value={rule.value}
                      onChange={e => handleValueChange(rule.id, parseFloat(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl pl-3 pr-8 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Adicionais Operacionais */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
              <Layers className="h-4 w-4" style={{ color: settings.primaryColor }} /> Adicionais Operacionais & Especiais
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {addonRules.map(rule => (
                <div key={rule.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 truncate">
                    {rule.name}
                  </span>
                  <div className="relative w-28 shrink-0">
                    <span className={`absolute ${rule.rule_type === 'fixed_addon' ? 'left-2.5' : 'right-2.5'} top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400`}>
                      {rule.rule_type === 'fixed_addon' ? 'R$' : '%'}
                    </span>
                    <input
                      type="number"
                      step={rule.rule_type === 'fixed_addon' ? '0.1' : '1'}
                      value={rule.value}
                      onChange={e => handleValueChange(rule.id, parseFloat(e.target.value) || 0)}
                      className={`w-full bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl ${rule.rule_type === 'fixed_addon' ? 'pl-8 pr-2' : 'pl-2 pr-7'} py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-3 bg-slate-50 dark:bg-white/5">
          <button
            type="button"
            onClick={closePricingModal}
            className="px-5 py-2.5 rounded-2xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-2xl text-xs font-bold text-white shadow-lg flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
            style={{ backgroundColor: settings.primaryColor }}
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Salvar Tabela de Preços
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
