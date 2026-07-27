import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Brain, AlertTriangle, Clock, Users, Send,
  ChevronRight, CheckCircle2, Zap, Activity, Gauge,
  AlertCircle, Package, MessageCircle, RefreshCw, Wrench,
  ShieldAlert, Timer
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { sendEvolutionText } from '@/services/whatsappService';
import { toast } from 'sonner';

interface GabiAlert {
  id: string;
  type: 'orcamento_pendente' | 'cliente_inativo' | 'pedido_atrasado' | 'producao';
  icon: React.ReactNode;
  title: string;
  description: string;
  severity: 'warning' | 'danger' | 'info';
  actionLabel?: string;
  actionPhone?: string;
  actionMessage?: string;
  orderId?: number;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export const GabiHeroWidget: React.FC = () => {
  const { settings } = useCompanySettings();
  const { role } = useProfile();
  const navigate = useNavigate();
  const pc = settings.primaryColor || '#ef4444';
  const isChefe = role !== 'producao';

  const [alerts, setAlerts] = useState<GabiAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [prodCount, setProdCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadChefeAlerts = useCallback(async () => {
    setLoading(true);
    const newAlerts: GabiAlert[] = [];

    try {
      // 1. Orçamentos pendentes (>2 dias)
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
      const { data: pendingQuotes } = await supabase
        .from('orders')
        .select('id, order_number, client_id, created_at, clients(name, phone)')
        .eq('status', 'orcamento')
        .lt('created_at', twoDaysAgo)
        .limit(5);

      pendingQuotes?.forEach((o: any) => {
        const d = daysAgo(o.created_at);
        newAlerts.push({
          id: `orc_${o.id}`,
          type: 'orcamento_pendente',
          icon: <Clock className="h-5 w-5" />,
          title: `Orçamento #${o.order_number || o.id} pendente há ${d} dias`,
          description: `Cliente: ${o.clients?.name || 'Sem nome'}. Aguardando aprovação.`,
          severity: d > 5 ? 'danger' : 'warning',
          actionLabel: 'Enviar Lembrete WhatsApp',
          actionPhone: o.clients?.phone,
          actionMessage: `Olá ${o.clients?.name || ''}! Seu orçamento #${o.order_number || o.id} da ${settings.systemName} está pronto para aprovação. Podemos prosseguir? 😊`,
          orderId: o.id,
        });
      });

      // 2. Pedidos atrasados (>7 dias, não concluídos)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: lateOrders } = await supabase
        .from('orders')
        .select('id, order_number, client_id, status, created_at, clients(name, phone)')
        .not('status', 'in', '("concluido","cancelado","orcamento")')
        .lt('created_at', sevenDaysAgo)
        .limit(5);

      lateOrders?.forEach((o: any) => {
        const d = daysAgo(o.created_at);
        newAlerts.push({
          id: `late_${o.id}`,
          type: 'pedido_atrasado',
          icon: <AlertTriangle className="h-5 w-5" />,
          title: `Pedido #${o.order_number || o.id} há ${d} dias em "${o.status}"`,
          description: `Cliente: ${o.clients?.name || 'N/A'}. Verifique o andamento.`,
          severity: 'danger',
          actionLabel: 'Ver Pedido',
          orderId: o.id,
        });
      });

      // 3. Clientes inativos (>30 dias sem pedido)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: allClients } = await supabase
        .from('clients')
        .select('id, name, phone, created_at')
        .limit(100);

      if (allClients && allClients.length > 0) {
        const { data: recentOrders } = await supabase
          .from('orders')
          .select('client_id')
          .gt('created_at', thirtyDaysAgo);

        const activeClientIds = new Set((recentOrders || []).map((o: any) => o.client_id));
        const inactiveClients = allClients.filter(
          (c: any) => !activeClientIds.has(c.id) && daysAgo(c.created_at) > 30
        );

        inactiveClients.slice(0, 3).forEach((c: any) => {
          newAlerts.push({
            id: `inactive_${c.id}`,
            type: 'cliente_inativo',
            icon: <Users className="h-5 w-5" />,
            title: `${c.name} está inativo há +30 dias`,
            description: 'Nenhum pedido recente. Reative o contato!',
            severity: 'info',
            actionLabel: 'Enviar WhatsApp',
            actionPhone: c.phone,
            actionMessage: `Olá ${c.name}! Aqui é a ${settings.systemName} 🧵. Sentimos sua falta! Temos condições especiais essa semana. Vamos conversar?`,
          });
        });
      }
    } catch (err) {
      console.error('[Gabi] Erro ao carregar alertas:', err);
    }

    setAlerts(newAlerts);
    setLoading(false);
  }, [settings.systemName]);

  const loadOperadorData = useCallback(async () => {
    setLoading(true);
    try {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'producao');
      setProdCount(count || 0);
    } catch (err) {
      console.error('[Gabi] Erro modo produção:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isChefe) loadChefeAlerts();
    else loadOperadorData();
  }, [isChefe, loadChefeAlerts, loadOperadorData, refreshKey]);

  const handleWhatsAppAction = async (alert: GabiAlert) => {
    if (!alert.actionPhone || !alert.actionMessage) {
      if (alert.orderId) navigate('/pedidos');
      return;
    }
    setSendingId(alert.id);
    try {
      await sendEvolutionText(alert.actionPhone, alert.actionMessage);
      toast.success('Mensagem enviada via WhatsApp!');
    } catch (err: any) {
      toast.error(`Falha no envio: ${err.message}`);
    }
    setSendingId(null);
  };

  const handleOperadorReport = async (type: 'agulha' | 'peca') => {
    const alertMembers = (settings.teamMembers || []).filter(m => m.receiveAlerts);
    if (alertMembers.length === 0) {
      toast.error('Nenhum membro da equipe configurado para receber alertas. Configure em Perfil > Equipe.');
      return;
    }
    const msg = type === 'agulha'
      ? `🔴 ALERTA PRODUÇÃO — Agulha quebrada reportada pelo operador às ${new Date().toLocaleTimeString('pt-BR')}. Verificar máquina.`
      : `🟡 ALERTA PRODUÇÃO — Peça danificada reportada pelo operador às ${new Date().toLocaleTimeString('pt-BR')}. Verificar peça.`;

    setSendingId(type);
    let sent = 0;
    for (const m of alertMembers) {
      try {
        await sendEvolutionText(m.phone, msg);
        sent++;
      } catch { /* continue */ }
    }
    if (sent > 0) toast.success(`Alerta enviado para ${sent} membro(s) da equipe!`);
    else toast.error('Não foi possível enviar alertas.');
    setSendingId(null);
  };

  const severityColors = {
    warning: { bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.25)', text: '#eab308' },
    danger: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', text: '#ef4444' },
    info: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)', text: '#3b82f6' },
  };

  return (
    <div className="relative group" style={{ '--gabi-accent': pc } as React.CSSProperties}>
      {/* Animated gradient border */}
      <div
        className="absolute -inset-[1px] rounded-3xl opacity-60 group-hover:opacity-100 transition-opacity duration-700"
        style={{
          background: `linear-gradient(135deg, ${pc}, #8b5cf6, ${pc}, #06b6d4)`,
          backgroundSize: '300% 300%',
          animation: 'gabiGradient 6s ease infinite',
        }}
      />

      <div className="relative backdrop-blur-xl bg-zinc-900/90 rounded-3xl border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center gap-4">
          {/* Gabi Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="h-12 w-12 rounded-2xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${pc}33, #8b5cf633)`,
                boxShadow: `0 0 20px ${pc}44, 0 0 40px #8b5cf622`,
              }}
            >
              <Brain className="h-6 w-6 text-purple-300" style={{ animation: 'gabiPulse 3s ease-in-out infinite' }} />
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-zinc-900"
              style={{ backgroundColor: '#22c55e', animation: 'gabiPulse 2s ease-in-out infinite' }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-bold text-lg tracking-tight">GABI</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                IA
              </span>
            </div>
            <p className="text-zinc-400 text-sm truncate">
              {getGreeting()}, {settings.systemName}!{' '}
              {isChefe ? '📊 Veja seus alertas.' : '🏭 Modo Produção ativo.'}
            </p>
          </div>

          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition-all"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-5 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-3">
              <Sparkles className="h-5 w-5 text-purple-400 animate-pulse" />
              <span className="text-zinc-400 text-sm">Gabi está analisando...</span>
            </div>
          ) : isChefe ? (
            /* ─── CHEFE MODE ─── */
            alerts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-400" />
                <p className="text-white font-semibold">Tudo em dia!</p>
                <p className="text-zinc-500 text-sm mt-1">Nenhum alerta pendente. Bom trabalho! 🎉</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {alerts.map(alert => {
                  const colors = severityColors[alert.severity];
                  return (
                    <div
                      key={alert.id}
                      className="rounded-2xl p-3.5 transition-all duration-300 hover:scale-[1.01]"
                      style={{
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span style={{ color: colors.text }} className="mt-0.5 flex-shrink-0">
                          {alert.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold leading-tight">{alert.title}</p>
                          <p className="text-zinc-400 text-xs mt-1">{alert.description}</p>
                        </div>
                      </div>
                      {alert.actionLabel && (
                        <button
                          onClick={() => handleWhatsAppAction(alert)}
                          disabled={sendingId === alert.id}
                          className="mt-2.5 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 hover:brightness-110 disabled:opacity-50"
                          style={{
                            backgroundColor: alert.actionPhone ? '#25d36633' : `${pc}33`,
                            color: alert.actionPhone ? '#25d366' : pc,
                            border: `1px solid ${alert.actionPhone ? '#25d36644' : pc + '44'}`,
                          }}
                        >
                          {sendingId === alert.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : alert.actionPhone ? (
                            <MessageCircle className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          {sendingId === alert.id ? 'Enviando...' : alert.actionLabel}
                        </button>
                      )}
                    </div>
                  );
                })}
                <p className="text-center text-zinc-600 text-[11px] pt-1">
                  {alerts.length} alerta{alerts.length !== 1 ? 's' : ''} identificado{alerts.length !== 1 ? 's' : ''} pela Gabi
                </p>
              </div>
            )
          ) : (
            /* ─── OPERADOR / PRODUÇÃO MODE ─── */
            <div className="space-y-3">
              {/* Production stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                  <Gauge className="h-6 w-6 mx-auto mb-2 text-cyan-400" />
                  <p className="text-2xl font-bold text-white">{settings.machineSpeedSpm || 800}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">SPM Velocidade</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                  <Package className="h-6 w-6 mx-auto mb-2" style={{ color: pc }} />
                  <p className="text-2xl font-bold text-white">{prodCount}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">Em Produção</p>
                </div>
              </div>

              {/* Quick report buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => handleOperadorReport('agulha')}
                  disabled={sendingId === 'agulha'}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all text-left"
                >
                  <ShieldAlert className="h-5 w-5 text-red-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-red-300 text-sm font-semibold">Reportar Agulha Quebrada</p>
                    <p className="text-zinc-500 text-[11px]">Envia alerta WhatsApp para o gerente</p>
                  </div>
                  {sendingId === 'agulha' ? <RefreshCw className="h-4 w-4 text-red-400 animate-spin" /> : <Send className="h-4 w-4 text-red-400" />}
                </button>

                <button
                  onClick={() => handleOperadorReport('peca')}
                  disabled={sendingId === 'peca'}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 transition-all text-left"
                >
                  <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-yellow-300 text-sm font-semibold">Reportar Peça Danificada</p>
                    <p className="text-zinc-500 text-[11px]">Envia alerta WhatsApp para o gerente</p>
                  </div>
                  {sendingId === 'peca' ? <RefreshCw className="h-4 w-4 text-yellow-400 animate-spin" /> : <Send className="h-4 w-4 text-yellow-400" />}
                </button>
              </div>

              <button
                onClick={() => navigate('/pedidos')}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-all hover:brightness-110"
                style={{ backgroundColor: `${pc}22`, color: pc, border: `1px solid ${pc}33` }}
              >
                <Activity className="h-4 w-4" />
                Ver Kanban de Produção
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes gabiGradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes gabiPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
};
