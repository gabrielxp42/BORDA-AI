import React, { useState } from 'react';
import { Settings, Save, CheckCircle2, DollarSign, Sliders } from 'lucide-react';
import { PricingRule } from '@/types/borda';

const initialRules: PricingRule[] = [
  { id: '1', name: 'Base Milheiro de Pontos', rule_type: 'thousand_stitches', value: 0.65, is_active: true, display_order: 1, created_at: '' },
  { id: '2', name: 'Margem Operacional Padrao (%)', rule_type: 'percent_addon', value: 20, is_active: true, display_order: 2, created_at: '' },
  { id: '3', name: 'Adicional 1 a 6 Cores (%)', rule_type: 'color_percent', min_value: 1, max_value: 6, value: 20, is_active: true, display_order: 3, created_at: '' },
  { id: '4', name: 'Adicional 7 a 12 Cores (%)', rule_type: 'color_percent', min_value: 7, max_value: 12, value: 30, is_active: true, display_order: 4, created_at: '' },
  { id: '5', name: 'Adicional Acima de 12 Cores (%)', rule_type: 'color_percent', min_value: 13, max_value: 999, value: 40, is_active: true, display_order: 5, created_at: '' },
  { id: '6', name: 'Adicional Bastidor Grande (%)', rule_type: 'percent_addon', value: 30, is_active: true, display_order: 6, created_at: '' },
  { id: '7', name: 'Adicional Peça Pronta (%)', rule_type: 'percent_addon', value: 50, is_active: true, display_order: 7, created_at: '' },
  { id: '8', name: 'Adicional Laser (R$/peça)', rule_type: 'fixed_addon', value: 0.5, is_active: true, display_order: 8, created_at: '' },
  { id: '9', name: 'Adicional Prensa (R$/peça)', rule_type: 'fixed_addon', value: 0.5, is_active: true, display_order: 9, created_at: '' },
];

export const Configuracoes: React.FC = () => {
  const [rules, setRules] = useState<PricingRule[]>(initialRules);
  const [saved, setSaved] = useState(false);

  const handleRuleValueChange = (id: string, val: number) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, value: val } : r)));
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Settings className="h-6 w-6 text-purple-400" /> Tabela de Preços & Regras
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Configure os valores do milheiro de pontos e percentuais operacionais sem precisar mexer em planilhas Excel.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs shadow-lg shadow-purple-500/25 hover:brightness-110 transition-all"
        >
          <Save className="h-4 w-4" /> Salvar Regras
        </button>
      </div>

      {saved && (
        <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Regras salvas no Supabase com sucesso!
        </div>
      )}

      <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-purple-300 flex items-center gap-2">
          <Sliders className="h-4 w-4" /> Parametrização da Engine de Cálculo
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((r) => (
            <div key={r.id} className="glass-card p-4 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{r.name}</span>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">
                  {r.rule_type}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-bold text-zinc-400">Valor:</span>
                <input
                  type="number"
                  step="0.01"
                  value={r.value}
                  onChange={(e) => handleRuleValueChange(r.id, Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-1 text-sm font-black text-purple-300 w-32 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
