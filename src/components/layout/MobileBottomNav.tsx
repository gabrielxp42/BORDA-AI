import React, { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Layers, 
  Cpu, 
  Plus, 
  Calculator, 
  Boxes, 
  FileSpreadsheet, 
  Users, 
  Settings, 
  X, 
  Crown, 
  Scissors, 
  Sun, 
  Moon, 
  Sparkles,
  Zap
} from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';

interface MobileBottomNavProps {
  onOpenNewOrder: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  onOpenNewOrder,
  isDark,
  onToggleTheme,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isUnlocked, openProfileModal } = useProfile();
  const { settings } = useCompanySettings();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const pc = settings.primaryColor;

  // Itens de navegação da barra inferior (Esquerda e Direita do botão central)
  const navItemsLeft = useMemo(() => {
    if (!isUnlocked) {
      return [{ href: '/pedidos', icon: ShoppingBag, label: 'Pedidos' }];
    }
    return [
      { href: '/', icon: LayoutDashboard, label: 'Início' },
      { href: '/pedidos', icon: ShoppingBag, label: 'Pedidos' },
    ];
  }, [isUnlocked]);

  const navItemsRight = useMemo(() => {
    if (!isUnlocked) {
      return [
        { href: '/clientes', icon: Users, label: 'Clientes' },
        { href: '/matrizes', icon: Layers, label: 'Matrizes' },
      ];
    }
    return [
      { href: '/clientes', icon: Users, label: 'Clientes' },
      { href: '/faturamento', icon: FileSpreadsheet, label: 'Faturamento' },
    ];
  }, [isUnlocked]);

  const handleNavigate = (path: string) => {
    setIsSheetOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* 1. Barra de Navegação Fixa Inferior Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 pb-safe bg-white/80 dark:bg-[#09090d]/85 backdrop-blur-2xl border-t border-slate-200 dark:border-white/10 z-40 shadow-2xl">
        <div className="flex items-center h-full px-2">
          
          {/* Esquerda */}
          <div className="flex-1 flex justify-around items-center">
            {navItemsLeft.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-all ${
                    isActive
                      ? 'font-black scale-105'
                      : 'text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200'
                  }`}
                  style={isActive ? { color: pc } : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] uppercase font-bold tracking-tight">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Espaçador do Botão Central */}
          <div className="w-16 shrink-0" />

          {/* Direita */}
          <div className="flex-1 flex justify-around items-center">
            {navItemsRight.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-all ${
                    isActive
                      ? 'font-black scale-105'
                      : 'text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200'
                  }`}
                  style={isActive ? { color: pc } : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] uppercase font-bold tracking-tight">{item.label}</span>
                </Link>
              );
            })}
          </div>

        </div>
      </div>

      {/* 2. Botão Central Flutuante com Brilho (+ NOVO PEDIDO) */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          className="h-16 w-16 rounded-full text-white shadow-2xl border-4 border-slate-100 dark:border-[#09090d] flex items-center justify-center hover:brightness-110 active:scale-95 transition-all"
          style={{
            backgroundColor: pc,
            boxShadow: `0 0 25px ${pc}70`,
          }}
          title="Menu Rápido de Ações"
        >
          <Plus className="h-8 w-8 stroke-[3]" />
        </button>
      </div>

      {/* 3. Sheet Drawer de Ações Rápidas (Padrão iOS Liquid Glass) */}
      {isSheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-[100] bg-black/80 backdrop-blur-md animate-in fade-in duration-200 flex flex-col justify-end"
          onClick={() => setIsSheetOpen(false)}
        >
          <div
            className="w-full bg-white dark:bg-[#0f0f16] border-t border-slate-200 dark:border-white/10 rounded-t-[32px] p-6 pb-10 shadow-2xl space-y-6 animate-in slide-in-from-bottom duration-300 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Puxador iOS */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1 bg-slate-300 dark:bg-white/20 rounded-full" />

            {/* Cabeçalho */}
            <div className="flex items-center justify-between pt-2">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5" style={{ color: pc }} /> O que vamos fazer?
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Ações rápidas de produção e navegação no ERP
                </p>
              </div>
              <button
                onClick={() => setIsSheetOpen(false)}
                className="p-2 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-zinc-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Botão Principal Em Destaque (CRIAR NOVO PEDIDO) */}
            <button
              type="button"
              onClick={() => {
                setIsSheetOpen(false);
                onOpenNewOrder();
              }}
              className="w-full py-4 px-6 rounded-2xl text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl active:scale-98 transition-all"
              style={{
                backgroundColor: pc,
                boxShadow: `0 10px 25px -5px ${pc}60`,
              }}
            >
              <ShoppingBag className="h-6 w-6" />
              <span>⚡ Novo Pedido de Produção</span>
            </button>

            {/* Ações Rápidas de Produção */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                Ferramentas Rápidas
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {isUnlocked && (
                  <button
                    onClick={() => handleNavigate('/calculadora')}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-2.5 text-left hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900 dark:text-white">Orçamento</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400">Calcular preço</p>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => handleNavigate('/matrizes')}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-2.5 text-left hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white">Matrizes</p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400">Acervo Wilcom</p>
                  </div>
                </button>

                <button
                  onClick={() => handleNavigate('/clientes')}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-2.5 text-left hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white">Clientes</p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400">CRM & Contatos</p>
                  </div>
                </button>

                {isUnlocked && (
                  <button
                    onClick={() => handleNavigate('/estoque')}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-2.5 text-left hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900 dark:text-white">Estoque</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400">Linhas & Peças</p>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => handleNavigate('/maquinas')}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-2.5 text-left hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white">Máquinas</p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400">Bordadeiras</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Perfil & Preferências */}
            <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsSheetOpen(false);
                  openProfileModal();
                }}
                className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center gap-2 text-xs font-bold text-slate-800 dark:text-white"
              >
                {isUnlocked ? <Crown className="h-4 w-4 text-purple-400" /> : <Scissors className="h-4 w-4 text-cyan-400" />}
                <span>{isUnlocked ? '👑 Perfil Chefe' : '🧵 Perfil Operador'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleTheme}
                className="p-3 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300"
                title="Alternar Tema"
              >
                {isDark ? <Sun className="h-5 w-5 text-amber-300" /> : <Moon className="h-5 w-5" style={{ color: pc }} />}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
