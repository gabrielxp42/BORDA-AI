import React, { useState, useMemo } from 'react';
import { X, Clock, Send, CheckCircle2, Search, Filter, AlertCircle, Building, User } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '@/utils/currencyFormatter';
import { PaymentStatusModal } from '@/components/orders/PaymentStatusModal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReceberDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingOrders: any[];
  canSeeFinancials?: boolean;
  onSelectClientForZap: (clientData: any) => void;
  onRefreshData: () => void;
}

export const ReceberDetailsModal: React.FC<ReceberDetailsModalProps> = ({
  isOpen,
  onClose,
  pendingOrders,
  canSeeFinancials = true,
  onSelectClientForZap,
  onRefreshData
}) => {
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'current' | 'last_month' | 'older'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrderForStatusModal, setSelectedOrderForStatusModal] = useState<any | null>(null);

  const now = new Date();
  const currentMonthStr = format(now, 'MM/yyyy');
  const lastMonthStr = format(subMonths(now, 1), 'MM/yyyy');

  // Breakdown calculations
  const breakdown = useMemo(() => {
    let currentPending = 0;
    let currentCount = 0;
    let lastMonthPending = 0;
    let lastMonthCount = 0;
    let olderPending = 0;
    let olderCount = 0;
    let grandPending = 0;

    pendingOrders.forEach(o => {
      const created = new Date(o.created_at || Date.now());
      const monthStr = format(created, 'MM/yyyy');
      const total = Number(o.total_amount || 0);
      const pendingVal = o.payment_status === 'half_paid' ? total * 0.5 : total;

      grandPending += pendingVal;

      if (monthStr === currentMonthStr) {
        currentPending += pendingVal;
        currentCount++;
      } else if (monthStr === lastMonthStr) {
        lastMonthPending += pendingVal;
        lastMonthCount++;
      } else {
        olderPending += pendingVal;
        olderCount++;
      }
    });

    return {
      grandPending,
      currentPending,
      currentCount,
      lastMonthPending,
      lastMonthCount,
      olderPending,
      olderCount
    };
  }, [pendingOrders, currentMonthStr, lastMonthStr]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return pendingOrders.filter(o => {
      const created = new Date(o.created_at || Date.now());
      const monthStr = format(created, 'MM/yyyy');

      if (filterPeriod === 'current' && monthStr !== currentMonthStr) return false;
      if (filterPeriod === 'last_month' && monthStr !== lastMonthStr) return false;
      if (filterPeriod === 'older' && (monthStr === currentMonthStr || monthStr === lastMonthStr)) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const clientName = (o.clients?.name || '').toLowerCase();
        const orderNum = String(o.order_number || o.id);
        return clientName.includes(term) || orderNum.includes(term);
      }

      return true;
    });
  }, [pendingOrders, filterPeriod, searchTerm, currentMonthStr, lastMonthStr]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
        <div className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-amber-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
          
          {/* Modal Header */}
          <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-amber-950/30 via-zinc-900 to-zinc-950">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider mb-1">
                <Clock className="h-3.5 w-3.5" /> Faturas Pendentes A Receber
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Detalhamento Inteligente de Saldos
              </h2>
            </div>

            <button
              onClick={onClose}
              className="h-9 w-9 rounded-2xl bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Top 3 Summary Pills */}
          <div className="p-6 bg-white/[0.02] border-b border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setFilterPeriod(filterPeriod === 'current' ? 'all' : 'current')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterPeriod === 'current'
                  ? 'bg-emerald-500/20 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                  : 'bg-white/5 border-white/10 hover:border-emerald-500/30'
              }`}
            >
              <span className="text-[10px] font-black uppercase text-emerald-400 block">📅 Este Mês</span>
              <p className="text-lg font-black text-white mt-0.5">{formatCurrency(breakdown.currentPending, canSeeFinancials)}</p>
              <p className="text-[10px] text-zinc-400">{breakdown.currentCount} fatura(s)</p>
            </button>

            <button
              onClick={() => setFilterPeriod(filterPeriod === 'last_month' ? 'all' : 'last_month')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterPeriod === 'last_month'
                  ? 'bg-amber-500/20 border-amber-500/50 shadow-lg shadow-amber-500/10'
                  : 'bg-white/5 border-white/10 hover:border-amber-500/30'
              }`}
            >
              <span className="text-[10px] font-black uppercase text-amber-400 block">⏳ Mês Passado</span>
              <p className="text-lg font-black text-amber-300 mt-0.5">{formatCurrency(breakdown.lastMonthPending, canSeeFinancials)}</p>
              <p className="text-[10px] text-amber-400/80">{breakdown.lastMonthCount} fatura(s) em atraso</p>
            </button>

            <button
              onClick={() => setFilterPeriod(filterPeriod === 'older' ? 'all' : 'older')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterPeriod === 'older'
                  ? 'bg-rose-500/20 border-rose-500/50 shadow-lg shadow-rose-500/10'
                  : 'bg-white/5 border-white/10 hover:border-rose-500/30'
              }`}
            >
              <span className="text-[10px] font-black uppercase text-rose-400 block">🏛️ Histórico Antigo</span>
              <p className="text-lg font-black text-rose-300 mt-0.5">{formatCurrency(breakdown.olderPending, canSeeFinancials)}</p>
              <p className="text-[10px] text-rose-400/80">{breakdown.olderCount} fatura(s) antigas</p>
            </button>
          </div>

          {/* Filter Controls & Search */}
          <div className="p-4 bg-zinc-900/50 border-b border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
              {[
                { id: 'all', label: `Todas (${pendingOrders.length})` },
                { id: 'current', label: `Deste Mês (${breakdown.currentCount})` },
                { id: 'last_month', label: `Mês Passado (${breakdown.lastMonthCount})` },
                { id: 'older', label: `Antigas (${breakdown.olderCount})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterPeriod(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    filterPeriod === tab.id
                      ? 'bg-amber-500 text-black font-black shadow-md'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar cliente ou pedido..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* List of Orders / Debts */}
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto opacity-80" />
                <p className="text-sm font-bold text-white">Nenhuma fatura encontrada neste filtro!</p>
                <p className="text-xs text-zinc-500">Todas as cobranças selecionadas estão em dia.</p>
              </div>
            ) : (
              filteredOrders.map(o => {
                const totalVal = Number(o.total_amount || 0);
                const isHalf = o.payment_status === 'half_paid';
                const pendingVal = isHalf ? totalVal * 0.5 : totalVal;
                const createdDate = o.created_at ? format(new Date(o.created_at), 'dd/MM/yyyy') : '-';

                return (
                  <div key={o.id} className="p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm">
                          #{o.order_number || o.id.slice(0, 6)} - {o.clients?.name || 'Cliente Geral'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          isHalf 
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {isHalf ? '⚡ Sinal 50%' : '⏳ 100% Pendente'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
                        <span>Data Entrada: <strong className="text-zinc-200">{createdDate}</strong></span>
                        {o.due_date && <span>Entrega: <strong className="text-amber-400">{format(new Date(o.due_date), 'dd/MM/yyyy')}</strong></span>}
                        {o.clients?.phone && <span>Tel: <strong className="text-zinc-300">{o.clients.phone}</strong></span>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-white/5">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-zinc-400 font-bold block">A Receber</span>
                        <span className="text-lg font-black text-amber-400">{formatCurrency(pendingVal, canSeeFinancials)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectClientForZap({
                            id: o.clients?.id || o.id,
                            name: o.clients?.name || 'Cliente Geral',
                            phone: o.clients?.phone || '',
                            orderCount: 1,
                            totalAmount: totalVal,
                            paidAmount: isHalf ? totalVal * 0.5 : 0,
                            pendingAmount: pendingVal,
                            orders: [o]
                          })}
                          className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Enviar Fatura via WhatsApp"
                        >
                          <Send className="h-3.5 w-3.5 text-emerald-400" /> Cobrar Zap
                        </button>

                        <button
                          onClick={() => setSelectedOrderForStatusModal(o)}
                          className="px-3 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Atualizar Pagamento & Forma de Pagamento"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-purple-400" /> Dar Baixa
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-between text-xs text-zinc-400">
            <span>Total acumulado exibido: <strong className="text-amber-400 font-black">{formatCurrency(breakdown.grandPending, canSeeFinancials)}</strong></span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* Modal Reutilizável de Status de Pagamento (Forma de Pagamento, Valor & Recibo WhatsApp) */}
      <PaymentStatusModal
        isOpen={!!selectedOrderForStatusModal}
        onClose={() => setSelectedOrderForStatusModal(null)}
        order={selectedOrderForStatusModal}
        onStatusUpdated={() => {
          onRefreshData();
          setSelectedOrderForStatusModal(null);
        }}
      />
    </>
  );
};
