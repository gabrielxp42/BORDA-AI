import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Brain, AlertTriangle, Clock, Users, Send,
  ChevronRight, CheckCircle2, Zap, Activity, Gauge,
  AlertCircle, Package, MessageCircle, RefreshCw, Wrench,
  ShieldAlert, Timer, Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { sendEvolutionText } from '@/services/whatsappService';
import { toast } from 'sonner';

interface GabiAlertItem {
  id: string;
  title: string;
  subtitle?: string;
  actionPhone?: string;
  actionMessage?: string;
  orderId?: number;
  orderUuid?: string;
}

interface GabiAlert {
  id: string;
  type: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  severity: 'warning' | 'danger' | 'info';
  items?: GabiAlertItem[];
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadChefeAlerts = useCallback(async () => {
    setLoading(true);
    const newAlerts: GabiAlert[] = [];

    try {
      const now = Date.now();

      // 1. Pedidos Sem Orçamento (Gargalo de Entrada)
      const { data: noQuoteOrders } = await supabase
        .from('orders')
        .select('id, order_number, client_id, notes, total_amount, created_at, clients(name, phone)')
        .eq('status', 'pending')
        .limit(20);

      const semOrcamento = (noQuoteOrders || []).filter((o: any) => o.total_amount === 0 || o.notes?.includes('"isQuickEntry":true'));
      
      if (semOrcamento.length > 0) {
        newAlerts.push({
          id: 'group_sem_orcamento',
          type: 'sem_orcamento',
          icon: <AlertCircle className="h-5 w-5" />,
          title: `${semOrcamento.length} pedido${semOrcamento.length > 1 ? 's' : ''} sem orçamento`,
          description: 'Aguardando definição de preço para iniciar.',
          severity: 'danger',
          items: semOrcamento.map((o: any) => ({
            id: `noq_${o.id}`,
            title: `Pedido #${o.order_number || o.id.slice(0,4)}`,
            subtitle: `${o.clients?.name || 'Cliente'} (${daysAgo(o.created_at)} dias)`,
            orderUuid: o.id,
          }))
        });
      }

      // 2. Aguardando Aprovação / Pagamento Inicial
      const { data: unpaidPending } = await supabase
        .from('orders')
        .select('id, order_number, client_id, total_amount, payment_status, created_at, clients(name, phone)')
        .eq('status', 'pending')
        .gt('total_amount', 0)
        .eq('payment_status', 'pending')
        .limit(20);

      const aguardandoPagto = (unpaidPending || []).filter((o: any) => daysAgo(o.created_at) >= 1);

      if (aguardandoPagto.length > 0) {
        newAlerts.push({
          id: 'group_aguardando_pagto',
          type: 'aguardando_pagto',
          icon: <Clock className="h-5 w-5" />,
          title: `${aguardandoPagto.length} aguardando pagamento/aprovação`,
          description: 'Já orçados, mas travados na entrada.',
          severity: 'warning',
          items: aguardandoPagto.map((o: any) => ({
            id: `up_${o.id}`,
            title: `Pedido #${o.order_number || o.id.slice(0,4)}`,
            subtitle: `${o.clients?.name || 'Cliente'} - R$ ${o.total_amount}`,
            actionPhone: o.clients?.phone,
            actionMessage: `Olá ${o.clients?.name || ''}! Seu orçamento #${o.order_number || o.id.slice(0,4)} da ${settings.systemName} está pronto. O valor ficou R$ ${o.total_amount}. Podemos prosseguir com o pagamento do sinal para liberar a produção? 😊`,
            orderUuid: o.id,
          }))
        });
      }

      // 3. Atrasos Severos de Produção (Gargalo na Máquina)
      const fiveDaysAgo = new Date(now - 5 * 86400000).toISOString();
      const { data: productionDelays } = await supabase
        .from('orders')
        .select('id, order_number, client_id, status, created_at, clients(name, phone)')
        .in('status', ['design', 'embroidering', 'finishing'])
        .lt('created_at', fiveDaysAgo)
        .limit(20);

      if (productionDelays && productionDelays.length > 0) {
        newAlerts.push({
          id: 'group_atrasos_producao',
          type: 'atraso_producao',
          icon: <AlertTriangle className="h-5 w-5" />,
          title: `${productionDelays.length} pedido${productionDelays.length > 1 ? 's' : ''} travado${productionDelays.length > 1 ? 's' : ''} na produção`,
          description: 'Na oficina há mais de 5 dias sem conclusão.',
          severity: 'danger',
          items: productionDelays.map((o: any) => ({
            id: `prod_${o.id}`,
            title: `Pedido #${o.order_number || o.id.slice(0,4)}`,
            subtitle: `Status: ${o.status} (${daysAgo(o.created_at)} dias)`,
            orderUuid: o.id,
          }))
        });
      }

      // 4. Prontos e Esquecidos (Gargalo de Saída)
      const threeDaysAgo = new Date(now - 3 * 86400000).toISOString();
      const { data: readyForgotten } = await supabase
        .from('orders')
        .select('id, order_number, client_id, status, created_at, clients(name, phone)')
        .eq('status', 'completed')
        .lt('created_at', threeDaysAgo)
        .limit(20);

      if (readyForgotten && readyForgotten.length > 0) {
        newAlerts.push({
          id: 'group_prontos_esquecidos',
          type: 'prontos_esquecidos',
          icon: <Package className="h-5 w-5" />,
          title: `${readyForgotten.length} pedido${readyForgotten.length > 1 ? 's' : ''} pronto${readyForgotten.length > 1 ? 's' : ''} esquecido${readyForgotten.length > 1 ? 's' : ''}`,
          description: 'Prontos para retirada há mais de 3 dias.',
          severity: 'warning',
          items: readyForgotten.map((o: any) => ({
            id: `ready_${o.id}`,
            title: `Pedido #${o.order_number || o.id.slice(0,4)}`,
            subtitle: `${o.clients?.name || 'Cliente'} (${daysAgo(o.created_at)} dias)`,
            actionPhone: o.clients?.phone,
            actionMessage: `Olá ${o.clients?.name || ''}! Seu pedido #${o.order_number || o.id.slice(0,4)} da ${settings.systemName} está prontinho te aguardando para retirada. Quando pretende passar aqui? 📦`,
            orderUuid: o.id,
          }))
        });
      }

      // 5. Entregues Não Quitados (Furo Financeiro)
      // We will look for orders that are 'completed' but still 'pending' or 'half_paid' payment.
      const { data: unpaidCompleted } = await supabase
        .from('orders')
        .select('id, order_number, client_id, total_amount, payment_status, created_at, clients(name, phone)')
        .eq('status', 'completed')
        .in('payment_status', ['pending', 'half_paid'])
        .limit(20);

      if (unpaidCompleted && unpaidCompleted.length > 0) {
        newAlerts.push({
          id: 'group_nao_quitados',
          type: 'nao_quitados',
          icon: <Zap className="h-5 w-5" />,
          title: `${unpaidCompleted.length} finalizado${unpaidCompleted.length > 1 ? 's' : ''} com pendência financeira`,
          description: 'Pedidos finalizados que ainda não foram totalmente pagos.',
          severity: 'danger',
          items: unpaidCompleted.map((o: any) => ({
            id: `debt_${o.id}`,
            title: `Pedido #${o.order_number || o.id.slice(0,4)}`,
            subtitle: `${o.clients?.name || 'Cliente'} - Pago: ${o.payment_status === 'half_paid' ? '50%' : '0%'}`,
            actionPhone: o.clients?.phone,
            actionMessage: `Olá ${o.clients?.name || ''}! Aqui é da ${settings.systemName}. Vimos que o pedido #${o.order_number || o.id.slice(0,4)} já está finalizado, mas consta um valor em aberto. Poderia verificar, por favor? 💳`,
            orderUuid: o.id,
          }))
        });
      }

      // 3. Clientes inativos (>30 dias sem pedido)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: allClients } = await supabase
        .from('clients')
        .select('id, name, phone, created_at')
        .limit(200);

      if (allClients && allClients.length > 0) {
        const { data: recentOrders } = await supabase
          .from('orders')
          .select('client_id')
          .gt('created_at', thirtyDaysAgo);

        const activeClientIds = new Set((recentOrders || []).map((o: any) => o.client_id));
        const inactiveClients = allClients.filter(
          (c: any) => !activeClientIds.has(c.id) && daysAgo(c.created_at) > 30
        );

        if (inactiveClients.length > 0) {
          const topInactive = inactiveClients.slice(0, 10);
          newAlerts.push({
            id: 'group_inativos',
            type: 'cliente_inativo',
            icon: <Users className="h-5 w-5" />,
            title: `${inactiveClients.length} cliente${inactiveClients.length > 1 ? 's' : ''} inativo${inactiveClients.length > 1 ? 's' : ''}`,
            description: 'Sem pedidos recentes há mais de 30 dias.',
            severity: 'info',
            items: topInactive.map((c: any) => ({
              id: `inactive_${c.id}`,
              title: c.name,
              subtitle: `Inativo há ${daysAgo(c.created_at)} dias`,
              actionPhone: c.phone,
              actionMessage: `Olá ${c.name}! Aqui é a ${settings.systemName} 🧵. Sentimos sua falta! Temos condições especiais essa semana. Vamos conversar?`
            }))
          });
        }
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

  const handleWhatsAppAction = async (item: GabiAlertItem) => {
    if (!item.actionPhone || !item.actionMessage) {
      if (item.orderUuid) navigate('/pedidos');
      return;
    }
    setSendingId(item.id);
    try {
      await sendEvolutionText(item.actionPhone, item.actionMessage);
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
                  const isExpanded = expandedGroups.has(alert.id);
                  const hasItems = alert.items && alert.items.length > 0;
                  
                  return (
                    <div
                      key={alert.id}
                      className={`rounded-2xl transition-all duration-300 ${!isExpanded ? 'hover:scale-[1.01]' : ''}`}
                      style={{
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      {/* Cabecalho clicavel */}
                      <div 
                        className={`p-3.5 flex items-center justify-between cursor-pointer`}
                        onClick={() => hasItems && toggleGroup(alert.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span style={{ color: colors.text }} className="flex-shrink-0">
                            {alert.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold leading-tight">{alert.title}</p>
                            <p className="text-zinc-400 text-[11px] mt-0.5">{alert.description}</p>
                          </div>
                        </div>
                        {hasItems && (
                          <ChevronRight className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        )}
                      </div>

                      {/* Itens expandidos */}
                      {isExpanded && hasItems && (
                        <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-white/10 mt-1">
                          {alert.items!.map(item => (
                            <div key={item.id} className="bg-black/20 rounded-xl p-2.5 flex items-center justify-between gap-2 border border-white/5">
                              <div className="min-w-0">
                                <p className="text-white text-[11px] font-semibold truncate">{item.title}</p>
                                {item.subtitle && <p className="text-zinc-400 text-[10px] truncate">{item.subtitle}</p>}
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {item.orderUuid && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate('/pedidos'); }}
                                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                                    title="Ver Pedido"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {item.actionPhone && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleWhatsAppAction(item); }}
                                    disabled={sendingId === item.id}
                                    className="px-2 py-1.5 rounded-lg bg-[#25d366]/20 hover:bg-[#25d366]/30 text-[#25d366] border border-[#25d366]/30 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-[10px] font-bold"
                                  >
                                    {sendingId === item.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
                                    Cobrar
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
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
