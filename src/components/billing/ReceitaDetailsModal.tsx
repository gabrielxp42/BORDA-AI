import React, { useState, useMemo } from 'react';
import { X, Receipt, Trash2, Search, RotateCcw, ArrowDownLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { classifyIncome } from '@/utils/incomeKind';
import { formatCurrency } from '@/utils/currencyFormatter';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReceitaDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalRevenue: number;
  paidTotal: number;
  pendingTotal: number;
  avgTicket: number;
  topClient: { name: string; totalAmount: number } | null;
  incomeEntries: any[];
  onRefreshData: () => void;
}

export const ReceitaDetailsModal: React.FC<ReceitaDetailsModalProps> = ({
  isOpen, 
  onClose, 
  totalRevenue, 
  paidTotal, 
  pendingTotal, 
  incomeEntries, 
  onRefreshData
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<string>>(new Set());

  // Excluir lançamento de receita manual (financial_transactions)
  const handleDeleteTx = async (id: string, entry?: any) => {
    if (!id) return;
    if (!window.confirm('Deseja realmente remover esta entrada manual do caixa? O valor será debitado do faturamento total.')) return;
    
    // 0ms Latência Otimista: remove o item da lista visual instantaneamente!
    setOptimisticDeletedIds(prev => new Set(prev).add(id));
    setIsProcessing(id);
    const toastId = toast.loading('Debitando e removendo receita do caixa...');

    try {
      // Se houver pedidos vinculados ao lançamento manual, desfaz a tag de acordo nos pedidos
      const txObj = entry?.originalTx;
      let assocIds: string[] = [];
      if (txObj) {
        if (txObj.order_id) assocIds.push(txObj.order_id);
        try {
          if (txObj.notes && typeof txObj.notes === 'string' && txObj.notes.includes('{')) {
            const meta = JSON.parse(txObj.notes);
            if (Array.isArray(meta.associatedOrderIds)) assocIds.push(...meta.associatedOrderIds);
          }
        } catch (e) {}
      }

      if (assocIds.length > 0) {
        for (const ordId of assocIds) {
          const { data: ord } = await supabase.from('orders').select('notes').eq('id', ordId).maybeSingle();
          if (ord?.notes) {
            const cleanedNotes = ord.notes
              .replace(/\[ACORDO COMERCIAL[^\]]*\]/gi, '')
              .replace(/\[ACORDO_ATIVO[^\]]*\]/gi, '')
              .trim();
            await supabase.from('orders').update({ notes: cleanedNotes }).eq('id', ordId);
          }
        }
      }

      const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
      if (error) throw error;
      
      toast.success('Receita manual removida e debitada do faturamento com sucesso.', { id: toastId });
      window.dispatchEvent(new CustomEvent('borda_orders_changed'));
      onRefreshData();
    } catch (err: any) {
      console.error('Erro ao remover receita:', err);
      // Em caso de falha, restaura o item na lista visual
      setOptimisticDeletedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error('Erro ao remover receita: ' + (err.message || ''), { id: toastId });
    } finally {
      setIsProcessing(null);
    }
  };

  // Estornar baixa de Pedido (Reverter para Pendente / A Receber)
  const handleEstornarOrder = async (order: any) => {
    if (!order?.id) return;
    const orderNum = order.order_number || order.id.slice(0, 4);
    if (!window.confirm(`Deseja estornar a baixa do Pedido #${orderNum}? O valor será debitado das receitas e o pedido retornará para "A Receber".`)) return;

    // 0ms Latência Otimista: esconde visualmente a baixa da lista de receitas
    const targetKey = order.id;
    setOptimisticDeletedIds(prev => new Set(prev).add(targetKey));
    setIsProcessing(targetKey);
    const toastId = toast.loading(`Estornando baixa do Pedido #${orderNum}...`);

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: 'pending',
          payment_method: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;

      toast.success(`Baixa do Pedido #${orderNum} estornada! Ele voltou para a lista de A Receber.`, { id: toastId });
      window.dispatchEvent(new CustomEvent('borda_orders_changed'));
      onRefreshData();
    } catch (err: any) {
      console.error('Erro ao estornar baixa do pedido:', err);
      setOptimisticDeletedIds(prev => {
        const next = new Set(prev);
        next.delete(targetKey);
        return next;
      });
      toast.error('Erro ao estornar baixa: ' + (err.message || ''), { id: toastId });
    } finally {
      setIsProcessing(null);
    }
  };

  // Itens visíveis filtrando os removidos otimisticamente (0ms)
  const visibleIncomes = useMemo(() => {
    return incomeEntries.filter(entry => {
      const key = entry.isOrder ? entry.originalOrder?.id : entry.originalTx?.id;
      if (key && optimisticDeletedIds.has(key)) return false;
      if (entry.id && optimisticDeletedIds.has(entry.id)) return false;
      return true;
    });
  }, [incomeEntries, optimisticDeletedIds]);

  // Recalculo dos totais em tempo real com base nos itens visíveis
  const displayPaidTotal = useMemo(() => {
    return visibleIncomes.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  }, [visibleIncomes]);

  const displayTotalRevenue = displayPaidTotal;

  const filteredIncomes = useMemo(() => visibleIncomes.filter(entry => 
    (entry.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (entry.paymentMethod || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (entry.profileName || '').toLowerCase().includes(searchTerm.toLowerCase())
  ), [visibleIncomes, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 dark:bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#0c0c14] border border-emerald-300 dark:border-emerald-500/30 rounded-3xl w-full max-w-2xl p-5 sm:p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] text-slate-900 dark:text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 text-[10px] font-black uppercase tracking-wider mb-1">
              <Receipt className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Extrato Inteligente de Entradas
            </span>
            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              Detalhes das Receitas do Caixa
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-2xl transition-colors text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resumo Rápido */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-white/5 border border-emerald-200 dark:border-white/10">
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold block uppercase tracking-wider">Total Líquido Recebido</span>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{formatCurrency(displayPaidTotal)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-white/5 border border-amber-200 dark:border-white/10">
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold block uppercase tracking-wider">Faturas Pendentes</span>
            <p className="text-xl font-black text-amber-700 dark:text-amber-400 mt-1">{formatCurrency(pendingTotal)}</p>
          </div>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-zinc-500" />
          <input 
            type="text" 
            placeholder="Buscar por cliente, pedido, método ou operador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
          />
        </div>

        {/* Lista de Receitas */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
          {filteredIncomes.length === 0 ? (
            <div className="text-center py-10 text-slate-400 dark:text-zinc-500 text-xs">
              <p>Nenhuma entrada encontrada neste filtro.</p>
            </div>
          ) : (
            filteredIncomes.map(entry => {
              const tipo = classifyIncome(entry as any);
              const isEntryBusy = isProcessing === (entry.isOrder ? entry.originalOrder?.id : entry.originalTx?.id);

              return (
                <div 
                  key={entry.id} 
                  className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs transition-all gap-3 ${tipo.rowClass}`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-2 flex-wrap">
                      <span className="truncate">{entry.title}</span>
                      {/* Cada tipo de entrada tem rótulo e cor próprios */}
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${tipo.badgeClass}`}>
                        {tipo.emoji} {tipo.label}
                      </span>
                    </p>
                    {/* Explica em palavras o que aquele valor representa */}
                    <p className="text-[10px] text-slate-600 dark:text-zinc-300 font-semibold">
                      {tipo.explanation}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 flex flex-wrap items-center gap-2">
                      <span>💳 {entry.paymentMethod}</span>
                      <span>•</span>
                      <span>📅 {format(entry.date, 'dd/MM/yyyy HH:mm')}</span>
                      <span>•</span>
                      <span>👤 {entry.profileName}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <p className={`font-black text-sm ${tipo.amountClass}`}>
                      + {formatCurrency(entry.amount)}
                    </p>
                    
                    {entry.isOrder ? (
                      <button 
                        type="button"
                        disabled={isEntryBusy}
                        onClick={() => handleEstornarOrder(entry.originalOrder)} 
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-600 text-amber-800 dark:text-amber-300 hover:text-white border border-amber-300 dark:border-amber-500/40 text-[10px] font-black flex items-center gap-1 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        title="Estornar baixa deste pedido (Reverter para 'A Receber')"
                      >
                        {isEntryBusy ? <Loader2 className="h-3 w-3 animate-spin text-amber-500" /> : <RotateCcw className="h-3 w-3" />}
                        <span>{isEntryBusy ? 'Estornando...' : 'Estornar'}</span>
                      </button>
                    ) : (
                      <button 
                        type="button"
                        disabled={isEntryBusy}
                        onClick={() => handleDeleteTx(entry.originalTx?.id, entry)} 
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
                        title="Excluir lançamento manual de receita"
                      >
                        {isEntryBusy ? <Loader2 className="h-4 w-4 animate-spin text-rose-500" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider">Total Acumulado de Receitas</span>
          <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(displayTotalRevenue)}</span>
        </div>
      </div>
    </div>
  );
};
