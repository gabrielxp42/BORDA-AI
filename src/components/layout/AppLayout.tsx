import React, { useState, useEffect, useMemo } from 'react';
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
  FileSpreadsheet,
  Zap,
  Boxes,
  UserCircle2
} from 'lucide-react';

import { CreateOrderModal } from '../orders/CreateOrderModal';
import { ProfileSwitcher } from './ProfileSwitcher';
import { MobileBottomNav } from './MobileBottomNav';
import { PWAManager } from '../pwa/PWAManager';
import { GlobalNotificationCenter } from '../notifications/GlobalNotificationCenter';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  badge?: React.ReactNode;
}

const SewingMachineIcon: React.FC<{ className?: string }> = ({ className = "h-3 w-3" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 19h18" />
    <path d="M5 19V8a2 2 0 0 1 2-2h9a3 3 0 0 1 3 3v4h-6" />
    <path d="M9 12v7" />
    <circle cx="16" cy="10" r="1.5" />
  </svg>
);

const navItems: NavItem[] = [
  { label: 'Painel Geral', path: '/', icon: LayoutDashboard },
  { label: 'Pedidos & Produção', path: '/pedidos', icon: ShoppingBag },
  { label: 'Fazer Orçamento', path: '/calculadora', icon: Calculator, badge: <Zap className="h-3 w-3 fill-current" /> },
  { label: 'Biblioteca de Matrizes', path: '/matrizes', icon: Layers, badge: <SewingMachineIcon className="h-3 w-3" /> },
  { label: 'Estoque de Insumos', path: '/estoque', icon: Boxes },
  { label: 'Faturamento', path: '/faturamento', icon: FileSpreadsheet },
  { label: 'Clientes & Empresas', path: '/clientes', icon: Users },
  { label: 'Bordadeiras & Máquinas', path: '/maquinas', icon: Cpu },
  { label: 'Tabela de Preços', path: '/configuracoes', icon: Settings },
  { label: 'GABI Automações', path: '/gabi', icon: Sparkles, badge: <Zap className="h-3 w-3 fill-current text-amber-400" /> },
];

import { LogOut, ShieldCheck, Crown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useNavigate } from 'react-router-dom';

// (Dentro do componente AppLayout)
export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useCompanySettings();
  const { isUnlocked, permissions } = useProfile();
  const { user, profile: authProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('borda-theme') !== 'light';
  });
  const location = useLocation();

  const isMasterAdmin = useMemo(() => {
    const userEmail = user?.email?.toLowerCase() || authProfile?.email?.toLowerCase();
    return userEmail === 'gabrielxp45@gmail.com';
  }, [user?.email, authProfile?.email]);

  // Mapeamento de rotas para a chave de permissão
  const pathToKey: Record<string, keyof typeof permissions.routes> = useMemo(() => ({
    '/': 'dashboard',
    '/gabi': 'dashboard', // GABI acessível para quem tem acesso ao painel
    '/pedidos': 'pedidos',
    '/calculadora': 'calculadora',
    '/matrizes': 'matrizes',
    '/estoque': 'estoque',
    '/faturamento': 'faturamento',
    '/clientes': 'clientes',
    '/maquinas': 'maquinas',
    '/configuracoes': 'configuracoes',
    '/perfil': 'perfil',
  }), []);

  // Redireciona Operador se tentar acessar rota restrita
  useEffect(() => {
    const key = pathToKey[location.pathname];
    if (key && permissions.routes[key] === false) {
      // Procura a primeira rota permitida
      const firstAllowed = Object.entries(permissions.routes).find(([, allowed]) => allowed);
      const targetPath = firstAllowed ? (firstAllowed[0] === 'dashboard' ? '/' : `/${firstAllowed[0]}`) : '/pedidos';
      navigate(targetPath, { replace: true });
    }
  }, [permissions.routes, location.pathname, navigate, pathToKey]);

  // Filtra itens do menu conforme o perfil e permissões
  const visibleNavItems = useMemo(() => {
    let items = navItems.filter((item: NavItem) => {
      const key = pathToKey[item.path];
      return key ? permissions.routes[key] !== false : true;
    });

    if (isMasterAdmin) {
      items = [
        ...items,
        { label: 'Painel Master Admin', path: '/admin', icon: ShieldCheck, badge: <Crown className="h-3.5 w-3.5 text-amber-400" /> }
      ];
    }
    return items;
  }, [permissions.routes, isMasterAdmin, pathToKey]);

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
          {visibleNavItems.map((item: NavItem) => {
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
                    className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border flex items-center justify-center"
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
            {/* Mobile Logo Brand */}
            <Link to="/perfil" className="md:hidden flex items-center gap-2 active:scale-95 transition-transform" title="Perfil & Configurações">
              {settings.logoUrl ? (
                <img 
                  src={settings.logoUrl} 
                  alt={settings.systemName} 
                  className="h-8 w-auto max-w-[120px] object-contain rounded-lg" 
                />
              ) : (
                <div className="flex items-center gap-2">
                  <div 
                    className="h-8 w-8 rounded-xl flex items-center justify-center shadow-md border shrink-0"
                    style={{
                      backgroundColor: `${settings.primaryColor}20`,
                      borderColor: `${settings.primaryColor}40`,
                      color: settings.primaryColor
                    }}
                  >
                    <Sparkles className="h-4 w-4 animate-pulse" />
                  </div>
                  <span className="font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white truncate max-w-[110px]">
                    {settings.systemName || 'BORDA AI'}
                  </span>
                </div>
              )}
            </Link>
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

            <button
              onClick={() => setIsNotifOpen(true)}
              className={`p-2.5 rounded-2xl border ${isDark ? 'bg-white/5 border-white/10 text-zinc-400 hover:text-white' : 'bg-slate-200/60 border-slate-300 text-slate-600 hover:text-slate-900'} relative transition-all`}
              title="Central de Notificações"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full animate-ping" style={{ backgroundColor: settings.primaryColor }} />
            </button>

            {/* Mobile Profile Button + Dropdown */}
            <div className="relative md:hidden">
              <button
                onClick={() => setIsMobileProfileOpen(prev => !prev)}
                className={`p-2.5 rounded-2xl border transition-all ${
                  isDark
                    ? 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                    : 'bg-slate-200/60 border-slate-300 text-slate-600 hover:text-slate-900'
                }`}
                title="Perfil e configurações"
              >
                <UserCircle2 className="h-4 w-4" />
              </button>

              {/* Dropdown Menu */}
              {isMobileProfileOpen && (
                <>
                  {/* Overlay para fechar ao clicar fora */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsMobileProfileOpen(false)}
                  />
                  <div
                    className={`absolute right-0 top-12 z-50 w-52 rounded-2xl border shadow-2xl overflow-hidden ${
                      isDark ? 'bg-zinc-900 border-white/10' : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* User Info */}
                    <div className={`px-4 py-3 border-b ${ isDark ? 'border-white/10' : 'border-slate-100' }`}>
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-black" style={{ backgroundColor: settings.primaryColor }}>
                          {(user?.email || settings.systemName || 'U')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${ isDark ? 'text-white' : 'text-slate-900' }`}>
                            {settings.systemName || 'Usuário'}
                          </p>
                          <p className="text-[10px] text-zinc-400 truncate">{user?.email || ''}</p>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="p-1.5 flex flex-col gap-0.5">
                      <button
                        onClick={() => { navigate('/gabi'); setIsMobileProfileOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all ${
                          isDark ? 'text-indigo-300 hover:bg-white/10' : 'text-indigo-600 hover:bg-indigo-50'
                        }`}
                      >
                        <Sparkles className="h-4 w-4" />
                        GABI Automações
                      </button>

                      <button
                        onClick={() => { navigate('/configuracoes'); setIsMobileProfileOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all ${
                          isDark ? 'text-zinc-300 hover:bg-white/10 hover:text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Settings className="h-4 w-4" />
                        Configurações
                      </button>

                      <button
                        onClick={async () => { setIsMobileProfileOpen(false); await signOut(); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-medium text-red-500 hover:bg-red-500/10 transition-all"
                      >
                        <LogOut className="h-4 w-4" />
                        Sair da conta
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Status Gabi / WhatsApp Engine — only desktop */}
            <button
              onClick={() => navigate('/configuracoes', { state: { activeTab: 'whatsapp' } })}
              className={`h-8 px-3 rounded-2xl border hidden md:flex items-center gap-2 text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm ${
                authProfile?.whatsapp_status === 'connected'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                  : authProfile?.whatsapp_status === 'connecting'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-500 hover:bg-rose-500/20'
              }`}
              title="Configurações da Gabi (WhatsApp)"
            >
              <span className={`h-2 w-2 rounded-full ${
                authProfile?.whatsapp_status === 'connected' ? 'bg-emerald-500 animate-pulse' :
                authProfile?.whatsapp_status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
              }`} />
              <span className="hidden sm:inline">
                {authProfile?.whatsapp_status === 'connected' ? 'Motor Gabi Conectado' : 
                 authProfile?.whatsapp_status === 'connecting' ? 'Gabi Conectando...' : 'Motor Gabi Offline'}
              </span>
            </button>
          </div>
        </header>

        {/* Dynamic Page Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 md:pb-6 custom-scrollbar">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav 
        onOpenNewOrder={() => setIsOrderModalOpen(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
      />

      {/* Global Order Modal */}
      <CreateOrderModal 
        isOpen={isOrderModalOpen} 
        onClose={() => setIsOrderModalOpen(false)} 
      />

      {/* Global Notification Center (Bell Drawer) */}
      <GlobalNotificationCenter isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />

      {/* PWA Ecosystem Manager (Auto-Update & Smart Banners) */}
      <PWAManager />
    </div>
  );
};
