import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Settings, Save, CheckCircle2, Sliders, MessageSquare, RefreshCw } from 'lucide-react';
import { PricingRule } from '@/types/borda';
import { usePricing } from '@/contexts/PricingContext';
import { WhatsAppConnectionCard } from '@/components/whatsapp/WhatsAppConnectionCard';
import { toast } from 'sonner';

export const Configuracoes: React.FC = () => {
  const location = useLocation();
  const { rules: globalRules, saveAllRules } = usePricing();
  const [activeTab, setActiveTab] = useState<'pricing' | 'whatsapp'>(
    location.state?.activeTab === 'whatsapp' ? 'whatsapp' : 'pricing'
  );
  const [localRules, setLocalRules] = useState<PricingRule[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (globalRules && globalRules.length > 0) {
      setLocalRules(JSON.parse(JSON.stringify(globalRules)));
    }
  }, [globalRules]);

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
  }, [location.state]);

  const handleRuleValueChange = (id: string, val: number) => {
    setLocalRules(prev => prev.map((r) => (r.id === id ? { ...r, value: val } : r)));
  };

  const handleSaveRules = async () => {
    setIsSaving(true);
    const ok = await saveAllRules(localRules);
    setIsSaving(false);
    if (ok) {
      setSaved(true);
      toast.success("Tabela de Preços e Regras salvas com sucesso!");
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Settings className="h-6 w-6 text-purple-400" /> Configurações do Sistema
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Gerencie as regras de precificação por pontos e pareamento do WhatsApp com o seu ateliê.
          </p>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('pricing')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'pricing'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 shadow-lg shadow-purple-500/10'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Sliders className="h-4 w-4" /> Tabela de Preços & Regras
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'whatsapp'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 shadow-lg shadow-emerald-500/10'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare className="h-4 w-4" /> Conexão WhatsApp (QR Code)
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'pricing' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-purple-300 flex items-center gap-2">
              <Sliders className="h-4 w-4" /> Parametrização da Engine de Cálculo
            </h3>

            <button
              type="button"
              onClick={handleSaveRules}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs shadow-lg shadow-purple-500/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Salvando...' : 'Salvar Regras da Tabela'}
            </button>
          </div>

          {saved && (
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in zoom-in-95">
              <CheckCircle2 className="h-4 w-4" /> Regras salvas no Supabase e Sistema com sucesso!
            </div>
          )}

          <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {localRules.map((r) => (
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
      )}

      {activeTab === 'whatsapp' && (
        <WhatsAppConnectionCard />
      )}
    </div>
  );
};

