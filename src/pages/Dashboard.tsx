import React from 'react';
import { Layers, Calculator, Cpu, Users, ArrowUpRight, TrendingUp, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCompanySettings } from '../contexts/CompanySettingsContext';

export const Dashboard: React.FC = () => {
  const { settings } = useCompanySettings();

  return (
    <div className="space-y-6">
      {/* Banner de Boas-vindas Dinâmico */}
      <div 
        className="relative overflow-hidden rounded-3xl p-8 border shadow-2xl backdrop-blur-xl transition-all"
        style={{ 
          background: `linear-gradient(135deg, ${settings.primaryColor}35 0%, ${settings.primaryColor}15 50%, rgba(0,0,0,0.8) 100%)`,
          borderColor: `${settings.primaryColor}40`
        }}
      >
        <div className="relative z-10 space-y-2">
          <div 
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest"
            style={{ 
              backgroundColor: `${settings.primaryColor}25`, 
              borderColor: `${settings.primaryColor}40`, 
              color: settings.primaryColor 
            }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Gestão Inteligente de Bordados
          </div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Painel Geral <span style={{ color: settings.primaryColor }}>{settings.systemName}</span>
          </h2>
          <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-xl">
            Integração direta com parâmetros do Wilcom, orçamentador automático por milheiro de pontos e acervo inteligente de matrizes.
          </p>
        </div>
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { 
            title: 'Matrizes Cadastradas', 
            value: '1.240', 
            icon: Layers, 
            style: {
              background: `linear-gradient(135deg, ${settings.primaryColor}20 0%, ${settings.primaryColor}05 100%)`,
              borderColor: `${settings.primaryColor}30`,
              color: settings.primaryColor
            } 
          },
          { title: 'Orçamentos no Mês', value: '184', icon: Calculator, style: { background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(6,182,212,0.05) 100%)', borderColor: 'rgba(6,182,212,0.3)', color: '#06b6d4' } },
          { title: 'Bordadeiras Ativas', value: '6 / 8', icon: Cpu, style: { background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%)', borderColor: 'rgba(16,185,129,0.3)', color: '#10b981' } },
          { title: 'Clientes Recorrentes', value: '92%', icon: Users, style: { background: 'linear-gradient(135deg, rgba(244,63,94,0.2) 0%, rgba(244,63,94,0.05) 100%)', borderColor: 'rgba(244,63,94,0.3)', color: '#f43f5e' } },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="p-5 rounded-3xl border backdrop-blur-md transition-all" style={stat.style}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">{stat.title}</span>
                <div className="p-2.5 rounded-2xl bg-white/10 dark:bg-white/5" style={{ color: stat.style.color }}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 dark:text-white">{stat.value}</span>
                <span className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5">
                  <TrendingUp className="h-3 w-3" /> +14%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ações Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2" style={{ color: settings.primaryColor }}>
            <Calculator className="h-4 w-4" /> Novo Orçamento Rápido
          </h3>
          <p className="text-xs text-slate-600 dark:text-zinc-400">
            Calcule o preço em segundos inserindo a quantidade de pontos do Wilcom e os adicionais da peça.
          </p>
          <Link
            to="/calculadora"
            className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-white font-bold text-xs shadow-lg hover:brightness-110 transition-all"
            style={{ backgroundColor: settings.primaryColor }}
          >
            <span>Abrir Calculadora Dinâmica</span>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
            <Layers className="h-4 w-4" /> Cadastrar Nova Matriz
          </h3>
          <p className="text-xs text-slate-600 dark:text-zinc-400">
            Suba arquivos .dst, .emb ou imagens para guardar a versão e associar ao cliente.
          </p>
          <Link
            to="/matrizes"
            className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white font-bold text-xs hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
          >
            <span>Acessar Biblioteca</span>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};
