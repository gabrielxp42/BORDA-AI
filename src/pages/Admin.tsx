import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, Users, TrendingUp, DollarSign, Server, Key, Save,
  CheckCircle2, AlertTriangle, RefreshCw, BarChart2, PieChart as PieChartIcon,
  Crown, UserCheck, Lock, Globe, TestTube, Sparkles, Activity
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { EvolutionServerConfigCard } from '@/components/whatsapp/EvolutionServerConfigCard';
import { toast } from 'sonner';

interface UserProfileData {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
  can_view_prices?: boolean;
}

export const Admin: React.FC = () => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'evolution'>('analytics');
  const [usersList, setUsersList] = useState<UserProfileData[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Verificação rigorosa se o usuário é o Admin Master do SaaS
  const userEmail = user?.email?.toLowerCase() || profile?.email?.toLowerCase();
  const isMasterAdmin = userEmail === 'gabrielxp45@gmail.com';

  useEffect(() => {
    if (isMasterAdmin) {
      fetchUsers();
    }
  }, [isMasterAdmin]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at, can_view_prices')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setUsersList((data as UserProfileData[]) || []);
    } catch (err: any) {
      console.error('Erro ao buscar lista de usuários:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      toast.success('Permissão do usuário atualizada!');
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      toast.error('Erro ao atualizar permissão: ' + err.message);
    }
  };

  const handleChangePriceVisibility = async (userId: string, canView: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ can_view_prices: canView })
        .eq('id', userId);

      if (error) throw error;
      toast.success(canView ? 'Usuário agora pode ver preços.' : 'Preços ocultados para o usuário.');
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, can_view_prices: canView } : u));
    } catch (err: any) {
      toast.error('Erro ao atualizar permissão: ' + err.message);
    }
  };

  // Se não for Admin, bloqueia a tela com aviso seguro
  if (!isMasterAdmin) {
    return (
      <div className="p-8 sm:p-12 text-center glass-panel rounded-3xl border border-rose-500/30 max-w-xl mx-auto space-y-4 my-12 animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-black text-white">Acesso Restrito ao Painel Master Admin</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Esta área é exclusiva para administradores da plataforma BORDA AI. Sua conta atual não possui privilégios de acesso.
        </p>
      </div>
    );
  }

  // Dados fictícios/analíticos para os gráficos de desempenho da plataforma
  const revenueChartData = [
    { month: 'Jan', receita: 4200, pedidos: 85, assinantes: 8 },
    { month: 'Fev', receita: 5800, pedidos: 110, assinantes: 12 },
    { month: 'Mar', receita: 7400, pedidos: 145, assinantes: 15 },
    { month: 'Abr', receita: 9100, pedidos: 180, assinantes: 19 },
    { month: 'Mai', receita: 11500, pedidos: 230, assinantes: 24 },
    { month: 'Jun', receita: 14200, pedidos: 290, assinantes: 31 },
    { month: 'Jul', receita: 18600, pedidos: 360, assinantes: 38 },
  ];

  const roleDistributionData = [
    { name: 'Administradores', value: usersList.filter(u => u.role === 'admin').length || 1, color: '#8b5cf6' },
    { name: 'Operadores', value: usersList.filter(u => u.role === 'operator').length || 2, color: '#f59e0b' },
    { name: 'Digitadores', value: usersList.filter(u => u.role === 'digitizer').length || 1, color: '#06b6d4' },
    { name: 'Vendedores', value: usersList.filter(u => u.role === 'seller').length || 1, color: '#10b981' },
  ];

  const orderStatusData = [
    { name: 'Pagos (100%)', value: 65, color: '#10b981' },
    { name: 'Sinal 50%', value: 25, color: '#3b82f6' },
    { name: 'Pendentes', value: 10, color: '#f43f5e' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold uppercase tracking-widest mb-2">
            <Crown className="h-3.5 w-3.5 text-amber-400" /> Painel Master Admin
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-purple-400" /> Administração da Plataforma
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Gestão global de usuários, métricas de assinantes e servidor da Evolution API.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 shadow-lg shadow-purple-500/10'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <BarChart2 className="h-4 w-4" /> Métricas & Assinantes
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'users'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 shadow-lg shadow-emerald-500/10'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="h-4 w-4" /> Gestão de Usuários
        </button>

        <button
          onClick={() => setActiveTab('evolution')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'evolution'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-lg shadow-indigo-500/10'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Server className="h-4 w-4" /> Servidor Evolution API
        </button>
      </div>

      {/* TAB 1: ANALYTICS & ASSINANTES */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">

          {/* Cards de Métricas Principais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="glass-panel p-5 rounded-3xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider">
                <span>Assinantes Ativos</span>
                <Users className="h-4 w-4 text-purple-400" />
              </div>
              <p className="text-2xl font-black text-white">{usersList.length || 38}</p>
              <p className="text-[10px] text-emerald-400 font-medium">+15.4% este mês</p>
            </div>

            <div className="glass-panel p-5 rounded-3xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider">
                <span>MRR Recorrente</span>
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-black text-white">R$ 18.600</p>
              <p className="text-[10px] text-emerald-400 font-medium">Faturamento mensal em crescimento</p>
            </div>

            <div className="glass-panel p-5 rounded-3xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider">
                <span>Pedidos Totais</span>
                <TrendingUp className="h-4 w-4 text-cyan-400" />
              </div>
              <p className="text-2xl font-black text-white">1.395</p>
              <p className="text-[10px] text-zinc-400 font-medium">Volume acumulado da plataforma</p>
            </div>

            <div className="glass-panel p-5 rounded-3xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider">
                <span>Uptime da API</span>
                <Activity className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-2xl font-black text-white">99.9%</p>
              <p className="text-[10px] text-emerald-400 font-medium">Evolution API v2 estável</p>
            </div>
          </div>

          {/* Gráfico 1: Evolução de Faturamento e Volume de Pedidos */}
          <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-400" /> Evolução de Receita & Crescimento de Pedidos
                </h3>
                <p className="text-xs text-zinc-400">Acompanhamento mensal da plataforma</p>
              </div>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData}>
                  <defs>
                    <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPedidos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="#a1a1aa" fontSize={11} />
                  <YAxis stroke="#a1a1aa" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#09090d',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '16px',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="receita" name="Receita (R$)" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorReceita)" />
                  <Area type="monotone" dataKey="pedidos" name="Total Pedidos" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorPedidos)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 2: Distribuição por Perfis + Status de Pedidos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-indigo-400" /> Distribuição de Usuários por Cargo
              </h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={roleDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {roleDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#09090d',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '16px',
                        color: '#fff',
                        fontSize: '12px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-emerald-400" /> Distribuição de Status de Pagamento
              </h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={orderStatusData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#a1a1aa" fontSize={10} />
                    <YAxis stroke="#a1a1aa" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#09090d',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '16px',
                        color: '#fff',
                        fontSize: '12px'
                      }}
                    />
                    <Bar dataKey="value" name="Percentual (%)" radius={[8, 8, 0, 0]}>
                      {orderStatusData.map((entry, index) => (
                        <Cell key={`cell-bar-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: GESTÃO DE USUÁRIOS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-400" /> Perfis Cadastrados no Sistema ({usersList.length})
            </h3>
            <button
              onClick={fetchUsers}
              className="text-xs font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} /> Atualizar Lista
            </button>
          </div>

          <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden divide-y divide-white/5">
            {loadingUsers ? (
              <div className="p-8 text-center text-zinc-500 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Carregando usuários...
              </div>
            ) : usersList.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-sm font-medium">
                Nenhum usuário cadastrado além do admin.
              </div>
            ) : (
              usersList.map((u) => {
                const isMaster = u.email?.toLowerCase() === 'gabrielxp45@gmail.com';
                return (
                  <div key={u.id} className="p-4 hover:bg-white/5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 font-bold text-xs ${
                        isMaster ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      }`}>
                        {isMaster ? <Crown className="h-5 w-5" /> : u.full_name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-white truncate">{u.full_name || 'Usuário'}</p>
                          {isMaster && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              Master Admin
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <select
                        value={u.role || 'admin'}
                        onChange={(e) => handleChangeRole(u.id, e.target.value)}
                        disabled={isMaster}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-purple-500 cursor-pointer disabled:opacity-50"
                      >
                        <option value="admin" className="bg-[#09090d]">Admin (Acesso Total)</option>
                        <option value="operator" className="bg-[#09090d]">Operador (Oficina)</option>
                        <option value="digitizer" className="bg-[#09090d]">Digitador / Programador</option>
                        <option value="seller" className="bg-[#09090d]">Vendedor / Balcão</option>
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: EVOLUTION API SERVER CONFIG */}
      {activeTab === 'evolution' && (
        <EvolutionServerConfigCard />
      )}

    </div>
  );
};

export default Admin;
