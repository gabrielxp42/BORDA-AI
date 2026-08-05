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
  UserCircle2,
  ZoomIn,
  ZoomOut,
  CloudLightning,
  Cloud
} from 'lucide-react';
import { toast } from 'sonner';
import { LogOut, ShieldCheck, Crown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

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



// Subcomponente otimizado e memorizado para isolar o estado de hover da Sidebar
// Isso previne que a tela principal (Kanban, Faturamento, etc) sofra re-renderizações desnecessárias

// Subcomponente otimizado e memorizado para isolar o estado de hover da Sidebar
// Isso previne que a tela principal (Kanban, Faturamento, etc) sofra re-renderizações desnecessárias
const DesktopSidebar: React.FC<{
  settings: any;
  isDark: boolean;
  visibleNavItems: NavItem[];
  location: any;
  signOut: () => void;
  primaryStyle: any;
}> = React.memo(({ settings, isDark, visibleNavItems, location, signOut, primaryStyle }) => {
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  return (
    <aside 
      onMouseEnter={() => setIsSidebarHovered(true)}
      onMouseLeave={() => setIsSidebarHovered(false)}
      className={`hidden md:flex flex-col glass-panel border-r ${isDark ? 'border-white/10' : 'border-slate-200'} z-20 transition-all duration-300 ease-in-out overflow-hidden ${
        isSidebarHovered ? 'w-64' : 'w-[78px]'
      }`}
      style={{ willChange: 'width' }}
    >
      <div className={`p-4 flex items-center justify-start gap-3 border-b h-[73px] shrink-0 overflow-hidden ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        {settings.logoUrl ? (
          <img src={settings.logoUrl} alt="Logo" className="h-9 w-9 object-contain rounded-xl shrink-0" />
        ) : (
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shadow-lg shrink-0" style={{ background: settings.primaryColor }}>
            <Sparkles className="h-4.5 w-4.5 text-white animate-pulse" />
          </div>
        )}
        <div className={`flex flex-col transition-all duration-300 ease-in-out origin-left ${
          isSidebarHovered ? 'opacity-100 translate-x-0 max-w-[160px]' : 'opacity-0 -translate-x-4 max-w-0 pointer-events-none'
        }`}>
          <h1 className={`font-black text-sm tracking-wider uppercase leading-none truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {settings.systemName}
          </h1>
          <p className="text-[8px] font-black uppercase tracking-widest opacity-80 mt-0.5 truncate" style={primaryStyle}>
            {settings.systemSubtitle}
          </p>
        </div>
      </div>

      <nav className="flex-1 p-3.5 space-y-1.5 overflow-y-auto custom-scrollbar overflow-x-hidden">
        {visibleNavItems.map((item: NavItem) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center rounded-2xl font-bold text-xs transition-all duration-200 ${
                isSidebarHovered ? 'justify-between px-4 py-3' : 'justify-center p-3'
              } ${
                isActive
                  ? 'bg-primary/20 text-primary border border-primary/30 shadow-lg'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              style={isActive ? { color: settings.primaryColor, borderColor: `${settings.primaryColor}40`, backgroundColor: `${settings.primaryColor}20` } : undefined}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="h-4.5 w-4.5 shrink-0" style={isActive ? { color: settings.primaryColor } : undefined} />
                <span className={`transition-all duration-300 ease-in-out origin-left truncate ${
                  isSidebarHovered ? 'opacity-100 max-w-[150px]' : 'opacity-0 max-w-0 pointer-events-none'
                }`}>
                  {item.label}
                </span>
              </div>
              {item.badge && isSidebarHovered && (
                <span 
                  className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border flex items-center justify-center shrink-0 transition-opacity duration-300"
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
      <div className={`p-3.5 border-t ${isDark ? 'border-white/10' : 'border-slate-200'} space-y-2 shrink-0 overflow-hidden`}>
        <Link 
          to="/perfil"
          className={`border rounded-2xl flex items-center transition-all group cursor-pointer ${
            isSidebarHovered ? 'p-3 gap-3 justify-start' : 'p-2 justify-center'
          }`}
          style={{ backgroundColor: `${settings.primaryColor}10`, borderColor: `${settings.primaryColor}30` }}
        >
          <div className="h-7 w-7 rounded-full flex items-center justify-center font-black text-xs text-white group-hover:scale-105 transition-transform shadow-md shrink-0" style={{ backgroundColor: settings.primaryColor }}>
            {settings.systemName.charAt(0)}
          </div>
          <div className={`flex-1 min-w-0 transition-all duration-300 origin-left ${
            isSidebarHovered ? 'opacity-100 max-w-[130px]' : 'opacity-0 max-w-0 pointer-events-none'
          }`}>
            <p className={`text-[11px] font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{settings.systemName}</p>
            <p className="text-[9px] font-semibold truncate group-hover:underline" style={{ color: settings.primaryColor }}>Acessar Perfil</p>
          </div>
        </Link>

        <button
          onClick={() => signOut()}
          className={`w-full flex items-center justify-center rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 active:scale-95 transition-all ${
            isSidebarHovered ? 'gap-2 py-2.5 px-4 text-xs font-bold' : 'p-2.5 text-sm'
          }`}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          <span className={`transition-all duration-300 origin-left truncate ${
            isSidebarHovered ? 'opacity-100 max-w-[120px]' : 'opacity-0 max-w-0 pointer-events-none'
          }`}>
            Sair
          </span>
        </button>
      </div>
    </aside>
  );
});

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useCompanySettings();
  const { isUnlocked, permissions } = useProfile();
  const { user, profile: authProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [hasUnsyncedData, setHasUnsyncedData] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('borda-theme') !== 'light';
  });
  const location = useLocation();

  const [globalZoom, setGlobalZoom] = useState<number>(() => {
    const saved = localStorage.getItem('borda-global-zoom');
    return saved ? Number(saved) : 100;
  });

  useEffect(() => {
    const checkUnsynced = () => {
      const hasUnsyncedFin = localStorage.getItem('borda_financial_transactions') && !localStorage.getItem('borda_fin_migrated_to_cloud');
      const hasUnsyncedMovements = localStorage.getItem('borda_stock_movements') && !localStorage.getItem('borda_stock_movements_migrated');
      setHasUnsyncedData(!!(hasUnsyncedFin || hasUnsyncedMovements));
    };
    checkUnsynced();
    window.addEventListener('focus', checkUnsynced);
    return () => window.removeEventListener('focus', checkUnsynced);
  }, [location.pathname]);

  useEffect(() => {
    // Aplica o fator de zoom e ajusta a altura proporcional no elemento raiz para eliminar vãos pretos no rodape
    const zoomRatio = globalZoom / 100;
    const minH = `${100 / zoomRatio}vh`;

    (document.documentElement.style as any).zoom = `${zoomRatio}`;
    document.documentElement.style.minHeight = minH;
    document.documentElement.style.height = minH;
    document.documentElement.style.backgroundColor = isDark ? '#09090d' : '#f8fafc';
    
    document.body.style.minHeight = minH;
    document.body.style.height = minH;
    document.body.style.backgroundColor = isDark ? '#09090d' : '#f8fafc';

    localStorage.setItem('borda-global-zoom', globalZoom.toString());
  }, [globalZoom, isDark]);

  const isMasterAdmin = useMemo(() => {
    const userEmail = user?.email?.toLowerCase() || authProfile?.email?.toLowerCase();
    return userEmail === 'gabrielxp45@gmail.com';
  }, [user?.email, authProfile?.email]);

  // Mapeamento de rotas para a chave de permissão
  const pathToKey: Record<string, keyof typeof permissions.routes> = useMemo(() => ({
    '/': 'dashboard',
    '/gabi': 'dashboard',
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
    <div className={`flex h-full ${isDark ? 'bg-[#09090d] text-zinc-100' : 'bg-slate-50 text-slate-900'} overflow-hidden transition-colors duration-300`}>
      {/* Sidebar Desktop Otimizada via Subcomponente Memorizado */}
      <DesktopSidebar
        settings={settings}
        isDark={isDark}
        visibleNavItems={visibleNavItems}
        location={location}
        signOut={signOut}
        primaryStyle={primaryStyle}
      />

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
            {hasUnsyncedData && (
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(true)}
                className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-2xl px-3 py-1.5 hover:bg-amber-500/35 transition-all cursor-pointer animate-pulse shrink-0"
                title="Voce tem dados nao sincronizados localmente! Clique para sincronizar."
              >
                <CloudLightning className="h-3.5 w-3.5" />
                <span className="text-[10px] font-black uppercase tracking-wider hidden md:inline">
                  Sincronizar
                </span>
              </button>
            )}
            <ProfileSwitcher />

            {/* Controle de Zoom Global (Útil para Monitores Pequenos / Notebooks) */}
            <div className={`hidden sm:flex items-center gap-1 bg-slate-200/60 dark:bg-white/5 border ${isDark ? 'border-white/10' : 'border-slate-300'} rounded-2xl p-1 shrink-0`}>
              <button
                type="button"
                onClick={() => setGlobalZoom(prev => Math.max(75, prev - 5))}
                disabled={globalZoom <= 75}
                title="Diminuir escala da página"
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white disabled:opacity-30 active:scale-95 transition-all cursor-pointer"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] font-black tracking-tighter px-1 min-w-[32px] text-center text-slate-700 dark:text-zinc-300">
                {globalZoom}%
              </span>
              <button
                type="button"
                onClick={() => setGlobalZoom(prev => Math.min(105, prev + 5))}
                disabled={globalZoom >= 105}
                title="Aumentar escala da página"
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white disabled:opacity-30 active:scale-95 transition-all cursor-pointer"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
            
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

      {/* Modal de Sincronizacao de Dados Locais */}
      <LocalSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSuccess={() => setHasUnsyncedData(false)}
      />
    </div>
  );
};

// Componente do Modal de Sincronizacao de Dados
interface LocalSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const LocalSyncModal: React.FC<LocalSyncModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [syncing, setSyncing] = useState(false);
  const [itemsToSync, setItemsToSync] = useState<{ finCount: number; movCount: number }>({ finCount: 0, movCount: 0 });

  useEffect(() => {
    if (isOpen) {
      const finRaw = localStorage.getItem('borda_financial_transactions');
      const hasMigratedFin = localStorage.getItem('borda_fin_migrated_to_cloud') === 'true';
      const finList = finRaw && !hasMigratedFin ? JSON.parse(finRaw) : [];

      const movRaw = localStorage.getItem('borda_stock_movements');
      const hasMigratedMov = localStorage.getItem('borda_stock_movements_migrated') === 'true';
      const movList = movRaw && !hasMigratedMov ? JSON.parse(movRaw) : [];

      setItemsToSync({
        finCount: Array.isArray(finList) ? finList.length : 0,
        movCount: Array.isArray(movList) ? movList.length : 0
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (!userId) {
        toast.error("Por favor, faca login para sincronizar seus dados.");
        return;
      }

      // 1. Sincronizar transacoes financeiras
      const finRaw = localStorage.getItem('borda_financial_transactions');
      const hasMigratedFin = localStorage.getItem('borda_fin_migrated_to_cloud') === 'true';
      if (finRaw && !hasMigratedFin) {
        const txs = JSON.parse(finRaw);
        if (Array.isArray(txs) && txs.length > 0) {
          const payload = txs.map((tx: any) => ({
            id: tx.id || `fin_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            user_id: userId,
            type: tx.type,
            category: tx.category,
            amount: Number(tx.amount) || 0,
            description: tx.description || '',
            date: tx.date || new Date().toISOString(),
            created_at: tx.created_at || new Date().toISOString()
          }));

          const { error } = await supabase.from('financial_transactions').upsert(payload);
          if (error) throw error;
        }
        localStorage.setItem('borda_fin_migrated_to_cloud', 'true');
      }

      // 2. Sincronizar movimentacoes de estoque
      const movRaw = localStorage.getItem('borda_stock_movements');
      const hasMigratedMov = localStorage.getItem('borda_stock_movements_migrated') === 'true';
      if (movRaw && !hasMigratedMov) {
        const moves = JSON.parse(movRaw);
        if (Array.isArray(moves) && moves.length > 0) {
          const payload = moves.map((m: any) => ({
            id: m.id || `mov_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            user_id: userId,
            item_id: m.item_id,
            item_name: m.item_name || 'Insumo',
            type: m.type,
            quantity: Number(m.quantity) || 0,
            reason: m.reason || '',
            date: m.date || new Date().toISOString(),
            created_at: m.created_at || new Date().toISOString()
          }));

          const { error } = await supabase.from('stock_movements').upsert(payload);
          if (error) throw error;
        }
        localStorage.setItem('borda_stock_movements_migrated', 'true');
      }

      toast.success("Dados sincronizados com a nuvem com sucesso!");
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro na sincronizacao: " + (err.message || 'Falha de rede'));
    } finally {
      setSyncing(false);
    }
  };

  const hasItems = itemsToSync.finCount > 0 || itemsToSync.movCount > 0;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#12121a] p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <CloudLightning className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-wider">
              Sincronizar Dados Locais
            </h3>
            <p className="text-[10px] text-zinc-400">
              Detectamos informacoes salvas apenas neste aparelho.
            </p>
          </div>
        </div>

        <div className="space-y-3 bg-white/5 border border-white/5 rounded-2xl p-4">
          <p className="text-xs text-zinc-300">
            Para garantir que as alteracoes feitas no trabalho fiquem disponiveis em casa e no celular, envie-as para o servidor:
          </p>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Lancamentos Financeiros:</span>
              <span className={`font-bold ${itemsToSync.finCount > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                {itemsToSync.finCount} itens locais
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Historico de Estoque:</span>
              <span className={`font-bold ${itemsToSync.movCount > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                {itemsToSync.movCount} itens locais
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-zinc-300 transition-all cursor-pointer"
          >
            Fechar
          </button>
          {hasItems && (
            <button
              type="button"
              disabled={syncing}
              onClick={handleSync}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black transition-all shadow-lg shadow-amber-500/20 cursor-pointer flex items-center gap-1.5"
            >
              {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
              <Cloud className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
