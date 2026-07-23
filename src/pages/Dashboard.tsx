import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers, Calculator, ShoppingBag, Users, ArrowUpRight,
  Sparkles, Package, CheckCircle2, Clock, Cpu
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '../contexts/CompanySettingsContext';

export const Dashboard: React.FC = () => {
  const { settings } = useCompanySettings();
  const pc = settings.primaryColor;

  const [counts, setCounts] = useState({
    matrices: 0,
    clients: 0,
    pendingOrders: 0,
    doneOrders: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [matricesRes, clientsRes, pendingRes, doneRes] = await Promise.all([
        supabase.from('matrices').select('id', { count: 'exact', head: true }),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }).neq('payment_status', 'paid'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid'),
      ]);
      setCounts({
        matrices: matricesRes.count || 0,
        clients: clientsRes.count || 0,
        pendingOrders: pendingRes.count || 0,
        doneOrders: doneRes.count || 0,
      });
      setLoading(false);
    };
    load();
  }, []);

  const stats = [
    {
      title: 'Matrizes na Biblioteca',
      value: loading ? '—' : counts.matrices.toString(),
      sub: 'Arquivos cadastrados',
      icon: Layers,
      color: pc,
    },
    {
      title: 'Clientes Cadastrados',
      value: loading ? '—' : counts.clients.toString(),
      sub: 'Na base de dados',
      icon: Users,
      color: '#06b6d4',
    },
    {
      title: 'Pedidos em Aberto',
      value: loading ? '—' : counts.pendingOrders.toString(),
      sub: 'Aguardando pagamento',
      icon: Clock,
      color: '#f59e0b',
    },
    {
      title: 'Pedidos Concluídos',
      value: loading ? '—' : counts.doneOrders.toString(),
      sub: 'Pagos e encerrados',
      icon: CheckCircle2,
      color: '#10b981',
    },
  ];

  const quickActions = [
    {
      label: 'Fazer Orçamento',
      desc: 'Calcule o preço por pontos e adicionais da peça',
      to: '/calculadora',
      icon: Calculator,
    },
    {
      label: 'Pedidos & Produção',
      desc: 'Acompanhe a fila e o kanban de produção',
      to: '/pedidos',
      icon: ShoppingBag,
    },
    {
      label: 'Biblioteca de Matrizes',
      desc: 'Gerencie e visualize o acervo de bordados',
      to: '/matrizes',
      icon: Layers,
    },
    {
      label: 'Clientes',
      desc: 'Base de clientes, histórico e recorrência',
      to: '/clientes',
      icon: Users,
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Banner de boas-vindas */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 border shadow-2xl"
        style={{
          background: `linear-gradient(135deg, ${pc}30 0%, ${pc}10 50%, rgba(0,0,0,0.6) 100%)`,
          borderColor: `${pc}40`
        }}
      >
        {/* Padrão de fundo sutil */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, ${pc} 0, ${pc} 1px, transparent 0, transparent 50%)`,
            backgroundSize: '20px 20px'
          }}
        />
        <div className="relative z-10 space-y-2">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest"
            style={{ backgroundColor: `${pc}25`, borderColor: `${pc}40`, color: pc }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Gestão Inteligente de Bordados
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Bem-vindo ao <span style={{ color: pc }}>{settings.systemName}</span>
          </h2>
          <p className="text-sm text-zinc-400 max-w-xl">
            Orçamentador automático por pontos, acervo inteligente de matrizes Wilcom e controle de produção em um só lugar.
          </p>
        </div>
      </div>

      {/* KPIs operacionais (sem dados financeiros) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={i}
              className="glass-panel p-4 rounded-3xl border border-white/10 hover:border-white/20 transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 leading-tight">{s.title}</span>
                <div
                  className="h-7 w-7 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${s.color}20` }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
                </div>
              </div>
              <p className="text-2xl font-black text-white leading-none">{s.value}</p>
              <p className="text-[10px] text-zinc-500 mt-1 font-medium">{s.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Ações Rápidas */}
      <div>
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 px-1">
          Acesso Rápido
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickActions.map((a, i) => {
            const Icon = a.icon;
            return (
              <Link
                key={i}
                to={a.to}
                className="glass-panel p-5 rounded-3xl border border-white/10 hover:border-white/25 transition-all group flex items-center gap-4"
              >
                <div
                  className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${pc}20` }}
                >
                  <Icon className="h-5 w-5" style={{ color: pc }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">{a.label}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{a.desc}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-zinc-600 group-hover:text-white transition-colors shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>

    </div>
  );
};
