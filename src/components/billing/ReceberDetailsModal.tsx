import React, { useState, useMemo, useEffect } from 'react';
import { X, Clock, Send, CheckCircle2, Search, Filter, AlertCircle, Building, User, Plus } from 'lucide-react';
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
  defaultFilter?: 'all' | 'production' | 'delivered';
  onOpenCreateReceivable?: () => void;
  pendingTransactions?: any[];
}

export const ReceberDetailsModal: React.FC<ReceberDetailsModalProps> = ({
  isOpen,
  onClose,
  pendingOrders,
  canSeeFinancials = true,
  onSelectClientForZap,
  onRefreshData,
  defaultFilter = 'all',
  onOpenCreateReceivable,
  pendingTransactions = []
}) => {
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'current' | 'last_month' | 'older'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [subFilter, setSubFilter] = useState<'all' | 'production' | 'delivered'>('all');
  const [selectedOrderForStatusModal, setSelectedOrderForStatusModal] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSubFilter(defaultFilter);
    }
  }, [isOpen, defaultFilter]);

  const now = new Date();
  const currentMonthStr = format(now, 'MM/yyyy');
  const lastMonthStr = format(subMonths(now, 1), 'MM/yyyy');

  // Breakdown calculations (Pedidos + Transações Manuais)
  const breakdown = useMemo(() => {
    let currentPending = 0;
    let currentCount = 0;
    let lastMonthPending = 0;
    let lastMonthCount = 0;
    let olderPending = 0;
    let olderCount = 0;
    let grandPending = 0;

    pendingOrders
      .filter(o => o.payment_status !== 'paid')
      .forEach(o => {
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

    pendingTransactions
      .filter(t => t.status !== 'paid')
      .forEach(t => {
        const created = new Date(t.due_date || t.date || Date.now());
        const monthStr = format(created, 'MM/yyyy');
        const val = Number(t.amount || 0);

        grandPending += val;

        if (monthStr === currentMonthStr) {
          currentPending += val;
          currentCount++;
        } else if (monthStr === lastMonthStr) {
          lastMonthPending += val;
          lastMonthCount++;
        } else {
          olderPending += val;
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
  }, [pendingOrders, pendingTransactions, currentMonthStr, lastMonthStr]);

  // Filtered orders & transactions list
  const filteredItems = useMemo(() => {
    const ordersFormatted = pendingOrders
      .filter(o => o.payment_status !== 'paid')
      .map(o => ({ ...o, isManualTx: false }));
    
    const txFormatted = pendingTransactions
      .filter(t => t.status !== 'paid')
      .map(t => {
      let metadata: any = {};
      try {
        if (t.notes && t.notes.startsWith('{')) {
          metadata = JSON.parse(t.notes);
        }
      } catch (e) {}

      const clientName = metadata.clientName || t.description || 'Entrada Futura';
      const statusStr = metadata.productionStatus === 'ja_entregue' ? 'entregue' : 'producao';

      return {
        id: t.id,
        isManualTx: true,
        order_number: undefined,
        created_at: t.due_date || t.date,
        due_date: t.due_date || t.date,
        total_amount: t.amount,
        payment_status: 'pending',
        status: statusStr,
        description: t.description,
        userNotes: metadata.userNotes,
        clients: { name: clientName, phone: '' },
        rawTx: t
      };
    });

    const combined = [...ordersFormatted, ...txFormatted];

    return combined.filter(item => {
      // Filtro de Status de Entrega
      if (subFilter === 'production' && item.status === 'entregue') return false;
      if (subFilter === 'delivered' && item.status !== 'entregue') return false;

      const created = new Date(item.created_at || Date.now());
      const monthStr = format(created, 'MM/yyyy');

      if (filterPeriod === 'current' && monthStr !== currentMonthStr) return false;
      if (filterPeriod === 'last_month' && monthStr !== lastMonthStr) return false;
      if (filterPeriod === 'older' && (monthStr === currentMonthStr || monthStr === lastMonthStr)) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const clientName = (item.clients?.name || item.description || '').toLowerCase();
        const orderNum = String(item.order_number || item.id);
        return clientName.includes(term) || orderNum.includes(term);
      }

      return true;
    });
  }, [pendingOrders, pendingTransactions, filterPeriod, subFilter, searchTerm, currentMonthStr, lastMonthStr]);

  const handleMarkTransactionPaid = async (txId: string) => {
    try {
      const { error } = await supabase
        .from('financial_transactions')
        .update({ status: 'paid' })
        .eq('id', txId);

      if (error) throw error;
      toast.success('Lançamento a receber marcado como quitado!');
      onRefreshData();
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao atualizar lançamento.');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
        <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-[#0d0d14] text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-amber-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
          
          {/* Modal Header */}
          <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-100/80 dark:bg-gradient-to-r dark:from-amber-950/40 dark:via-zinc-900 dark:to-zinc-950">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">FATURAS & PEDIDOS A RECEBER</h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Detalhamento inteligente de cobranças pendentes</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {onOpenCreateReceivable && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCreateReceivable();
                  }}
                  className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 text-black font-black text-xs flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">+ Cadastrar Entrada Futura</span>
                  <span className="sm:hidden">+ Nova Entrada</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Top 3 Summary Pills */}
          <div className="p-4 sm:p-6 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setFilterPeriod(filterPeriod === 'current' ? 'all' : 'current')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterPeriod === 'current'
                  ? 'bg-emerald-500/15 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                  : 'bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-white/10 hover:border-emerald-500/40'
              }`}
            >
              <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 block">📅 Este Mês</span>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{formatCurrency(breakdown.currentPending, canSeeFinancials)}</p>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400">{breakdown.currentCount} fatura(s)</p>
            </button>

            <button
              onClick={() => setFilterPeriod(filterPeriod === 'last_month' ? 'all' : 'last_month')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterPeriod === 'last_month'
                  ? 'bg-amber-500/15 border-amber-500/50 shadow-md shadow-amber-500/10'
                  : 'bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-white/10 hover:border-amber-500/40'
              }`}
            >
              <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 block">⏳ Mês Passado</span>
              <p className="text-lg font-black text-amber-700 dark:text-amber-300 mt-0.5">{formatCurrency(breakdown.lastMonthPending, canSeeFinancials)}</p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400/80">{breakdown.lastMonthCount} fatura(s) em atraso</p>
            </button>

            <button
              onClick={() => setFilterPeriod(filterPeriod === 'older' ? 'all' : 'older')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterPeriod === 'older'
                  ? 'bg-rose-500/15 border-rose-500/50 shadow-md shadow-rose-500/10'
                  : 'bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-white/10 hover:border-rose-500/40'
              }`}
            >
              <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 block">🏛️ Histórico Antigo</span>
              <p className="text-lg font-black text-rose-700 dark:text-rose-300 mt-0.5">{formatCurrency(breakdown.olderPending, canSeeFinancials)}</p>
              <p className="text-[10px] text-rose-600 dark:text-rose-400/80">{breakdown.olderCount} fatura(s) antigas</p>
            </button>
          </div>

          {/* Filter Controls & Search */}
          <div className="p-3.5 sm:p-4 bg-slate-100/70 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              <div className="flex items-center gap-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl p-1 shrink-0">
                {[
                  { id: 'all', label: '📂 Todos' },
                  { id: 'production', label: '⏳ Em Produção' },
                  { id: 'delivered', label: '📦 Entregues' },
                ].map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setSubFilter(sub.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      subFilter === sub.id
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-slate-300 dark:bg-white/10 hidden sm:block" />

              <div className="flex items-center gap-1 overflow-x-auto">
                {[
                  { id: 'all', label: `Histórico: Todos` },
                  { id: 'current', label: `Deste Mês` },
                  { id: 'last_month', label: `Mês Passado` },
                  { id: 'older', label: `Antigas` },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterPeriod(tab.id as any)}
                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                      filterPeriod === tab.id
                        ? 'bg-amber-500 text-black font-black shadow-md'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full sm:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white dark:bg-black/60 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* List of Orders / Debts */}
          <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-3">
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto opacity-80" />
                <p className="text-sm font-bold text-slate-900 dark:text-white">Nenhuma fatura encontrada neste filtro!</p>
                <p className="text-xs text-slate-500 dark:text-zinc-500">Todas as cobranças selecionadas estão em dia.</p>
              </div>
            ) : (
              filteredItems.map(o => {
                const totalVal = Number(o.total_amount || 0);
                const isHalf = o.payment_status === 'half_paid';
                const pendingVal = isHalf ? totalVal * 0.5 : totalVal;
                const createdDate = o.created_at ? format(new Date(o.created_at), 'dd/MM/yyyy') : '-';
                const isManual = o.isManualTx;

                return (
                  <div key={o.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/40 hover:bg-slate-100 dark:hover:bg-zinc-900/80 border border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-slate-900 dark:text-white text-sm">
                          {isManual ? `✨ ${o.description || 'Entrada Futura'}` : `#${o.order_number || o.id.slice(0, 4)} - ${o.clients?.name || 'Cliente Geral'}`}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          isHalf 
                            ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30' 
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                        }`}>
                          {isHalf ? '⚡ Sinal 50%' : '⏳ 100%'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          o.status === 'entregue'
                            ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/35'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35'
                        }`}>
                          {o.status === 'entregue' ? '📦 Entregue' : '⏳ Produção'}
                        </span>
                        {isManual && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                            📝 Avulso
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-zinc-400">
                        <span>Data Entrada: <strong className="text-slate-900 dark:text-zinc-200 font-bold">{createdDate}</strong></span>
                        {o.clients?.name && isManual && <span>Cliente: <strong className="text-slate-900 dark:text-zinc-300 font-bold">{o.clients.name}</strong></span>}
                        {o.clients?.phone && <span>Tel: <strong className="text-slate-900 dark:text-zinc-300 font-bold">{o.clients.phone}</strong></span>}
                        {!isManual && (
                          <div className="flex items-center gap-1">
                            <span>Vencimento Combinado:</span>
                            <input 
                              type="date"
                              value={o.due_date ? format(new Date(o.due_date), 'yyyy-MM-dd') : ''}
                              onChange={async (e) => {
                                const newDate = e.target.value;
                                try {
                                  const { error } = await supabase
                                    .from('orders')
                                    .update({ due_date: newDate ? new Date(newDate).toISOString() : null })
                                    .eq('id', o.id);
                                  if (error) throw error;
                                  toast.success('Data combinada atualizada!');
                                  onRefreshData();
                                } catch (err) {
                                  toast.error('Erro ao atualizar data combinada.');
                                }
                              }}
                              className="bg-white dark:bg-black/60 border border-slate-300 dark:border-white/10 rounded-lg px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-400 outline-none focus:border-amber-500 font-bold"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200 dark:border-white/5">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold block">A Receber</span>
                        <span className="text-lg font-black text-amber-600 dark:text-amber-400">{formatCurrency(pendingVal, canSeeFinancials)}</span>
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
                          className="px-3 py-2 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Enviar Fatura via WhatsApp"
                        >
                          <Send className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Cobrar Zap
                        </button>

                        <button
                          onClick={() => {
                            if (isManual) {
                              handleMarkTransactionPaid(o.id);
                            } else {
                              setSelectedOrderForStatusModal(o);
                            }
                          }}
                          className="px-3 py-2 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Atualizar Pagamento & Forma de Pagamento"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" /> Dar Baixa
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-black/60 flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
            <span>Total acumulado exibido: <strong className="text-amber-600 dark:text-amber-400 font-black">{formatCurrency(breakdown.grandPending, canSeeFinancials)}</strong></span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white font-bold transition-all cursor-pointer"
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
        isBaixaMode={true}
        defaultStatus="paid"
        onStatusUpdated={() => {
          onRefreshData();
          setSelectedOrderForStatusModal(null);
        }}
      />
    </>
  );
};
