import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  Calculator,
  Users,
  ShoppingBag,
  Cpu,
  Settings,
  Menu,
  X,
  Sparkles,
  Search,
  Bell,
  Sun,
  Moon,
  Plus,
  FileSpreadsheet
} from 'lucide-react';

import { CreateOrderModal } from '../orders/CreateOrderModal';
import { ProfileSwitcher } from './ProfileSwitcher';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: 'Painel Geral', path: '/', icon: LayoutDashboard },
  { label: 'Biblioteca de Matrizes', path: '/matrizes', icon: Layers, badge: 'Wilcom' },
  { label: 'Calculadora de Preço', path: '/calculadora', icon: Calculator, badge: 'IA' },
  { label: 'Faturamento', path: '/faturamento', icon: FileSpreadsheet },
  { label: 'Clientes & Empresas', path: '/clientes', icon: Users },
  { label: 'Fila de Produção', path: '/pedidos', icon: ShoppingBag },
  { label: 'Bordadeiras & Máquinas', path: '/maquinas', icon: Cpu },
  { label: 'Tabela de Preços', path: '/configuracoes', icon: Settings },
];

import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';

// (Dentro do componente AppLayout)
export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useCompanySettings();
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('borda-theme') !== 'light';
  });
  const location = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      localStorage.setItem('borda-theme', 'dark');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      localStorage.setItem('borda-theme', 'light');
    }
  }, [isDark]);

  const primaryStyle = { color: settings.primaryColor };

  return (
    <div className={`flex h-screen ${isDark ? 'bg-[#09090d] text-zinc-100' : 'bg-slate-50 text-slate-900'} overflow-hidden transition-colors duration-300`}>
      {/* Sidebar Desktop */}
      <aside className={`hidden md:flex flex-col w-64 glass-panel border-r ${isDark ? 'border-white/10' : 'border-slate-200'} z-20`}>
        <div className={`p-6 flex items-center gap-3 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="h-10 w-10 object-contain rounded-xl" />
          ) : (
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30" style={{ background: settings.primaryColor }}>
              <Sparkles className="h-5 w-5 text-white animate-pulse" />
            </div>
          )}
          <div>
            <h1 className={`font-black text-lg tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {settings.systemName}
            </h1>
            <p className="text-[9px] font-semibold uppercase tracking-widest opacity-80" style={primaryStyle}>
              {settings.systemSubtitle}
            </p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-4 py-3 rounded-2xl font-bold text-xs transition-all duration-200 ${
                  isActive
                    ? 'bg-primary/20 text-primary border border-primary/30 shadow-lg'
                    : isDark
                    ? 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
                style={isActive ? { color: settings.primaryColor, borderColor: `${settings.primaryColor}40`, backgroundColor: `${settings.primaryColor}20` } : undefined}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" style={isActive ? { color: settings.primaryColor } : undefined} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span 
                    className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border"
                    style={{ backgroundColor: `${settings.primaryColor}20`, color: settings.primaryColor, borderColor: `${settings.primaryColor}40` }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Canto inferior esquerdo: Perfil & Sair da Conta */}
        <div className={`p-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'} space-y-2`}>
          <Link 
            to="/perfil"
            className="border p-3 rounded-2xl flex items-center gap-3 transition-all group cursor-pointer"
            style={{ backgroundColor: `${settings.primaryColor}10`, borderColor: `${settings.primaryColor}30` }}
          >
            <div className="h-8 w-8 rounded-full flex items-center justify-center font-black text-xs text-white group-hover:scale-105 transition-transform shadow-md" style={{ backgroundColor: settings.primaryColor }}>
              {settings.systemName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{settings.systemName}</p>
              <p className="text-[10px] font-semibold truncate group-hover:underline" style={{ color: settings.primaryColor }}>Configurações & Perfil</p>
            </div>
          </Link>

          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold transition-all border border-red-500/20 active:scale-95"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair da Conta
          </button>
        </div>
      </aside>

      {/* Main Content Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className={`h-16 glass-panel border-b ${isDark ? 'border-white/10' : 'border-slate-200'} px-6 flex items-center justify-between z-10`}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`md:hidden p-2 rounded-xl ${isDark ? 'bg-white/5 text-zinc-400 hover:text-white' : 'bg-slate-200 text-slate-600 hover:text-slate-900'}`}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="relative hidden sm:block w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar matriz, cliente ou pedido..."
                className={`w-full ${isDark ? 'bg-white/5 border-white/10 text-zinc-200' : 'bg-slate-200/50 border-slate-300 text-slate-800'} border rounded-2xl pl-9 pr-4 py-1.5 text-xs placeholder:text-zinc-400 focus:outline-none`}
                style={{ borderColor: `${settings.primaryColor}30` }}
              />
            </div>
            
            {/* New Order Button */}
            <button
              onClick={() => setIsOrderModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-2xl text-white text-xs font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              <span className="uppercase tracking-wider">Novo Pedido</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <ProfileSwitcher />
            
            {/* Theme Toggle Button */}
            <button
              onClick={() => setIsDark(!isDark)}
              title={isDark ? "Alternar para Modo Claro" : "Alternar para Modo Escuro"}
              className={`p-2.5 rounded-2xl border transition-all ${
                isDark
                  ? 'bg-white/5 border-white/10 text-amber-300 hover:bg-white/10 hover:text-amber-200'
                  : 'bg-slate-200/60 border-slate-300 hover:bg-slate-200'
              }`}
              style={!isDark ? { color: settings.primaryColor } : undefined}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button className={`p-2.5 rounded-2xl border ${isDark ? 'bg-white/5 border-white/10 text-zinc-400 hover:text-white' : 'bg-slate-200/60 border-slate-300 text-slate-600 hover:text-slate-900'} relative`}>
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full animate-ping" style={{ backgroundColor: settings.primaryColor }} />
            </button>

            <div 
              className="h-8 px-3 rounded-2xl border flex items-center gap-2 text-xs font-bold"
              style={{ backgroundColor: `${settings.primaryColor}15`, borderColor: `${settings.primaryColor}30`, color: settings.primaryColor }}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">Wilcom Engine OK</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Workspace */}
        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {children}
        </main>
      </div>

      {/* Global Order Modal */}
      <CreateOrderModal 
        isOpen={isOrderModalOpen} 
        onClose={() => setIsOrderModalOpen(false)} 
      />
    </div>
  );
};
