import React, { useState } from 'react';
import {
  X, CalendarClock, CheckCircle2, Clock, AlertTriangle,
  Pencil, Check, Package, User, Wallet, TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Agreement, InstallmentRow,
  updateInstallmentDueDate, settleInstallment,
} from '@/services/installmentService';
import { parseLocalDate, toLocalDateInput, diffInDays } from '@/utils/dateHelper';
import { formatPaymentMethodName } from '@/utils/paymentHelper';

interface AgreementDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreement: Agreement | null;
  onChanged?: () => void;
  canSeeFinancials?: boolean;
}

const brl = (v: number, pode = true) =>
  pode
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
    : 'R$ ***';

/** Situação da parcela em relação a hoje. */
function situacao(p: InstallmentRow) {
  if (p.status === 'paid') {
    return { label: 'Paga', cor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', Icone: CheckCircle2 };
  }
  const venc = parseLocalDate(p.due_date);
  if (!venc) return { label: 'Em aberto', cor: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30', Icone: Clock };

  const dias = diffInDays(venc, new Date());
  if (dias < 0) return { label: `Atrasada ${Math.abs(dias)}d`, cor: 'bg-rose-500/15 text-rose-400 border-rose-500/30', Icone: AlertTriangle };
  if (dias === 0) return { label: 'Vence hoje', cor: 'bg-amber-500/15 text-amber-400 border-amber-500/30', Icone: AlertTriangle };
  return { label: `Em ${dias}d`, cor: 'bg-sky-500/15 text-sky-300 border-sky-500/30', Icone: Clock };
}

export const AgreementDetailsModal: React.FC<AgreementDetailsModalProps> = ({
  isOpen, onClose, agreement, onChanged, canSeeFinancials = true,
}) => {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novaData, setNovaData] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (!isOpen || !agreement) return null;

  const a = agreement;
  const progresso = a.totalCount ? Math.round((a.paidCount / a.totalCount) * 100) : 0;

  const salvarData = async (parcela: InstallmentRow) => {
    if (!novaData) { setEditandoId(null); return; }
    setSalvando(true);
    try {
      await updateInstallmentDueDate(parcela.id, novaData);
      toast.success(
        `Parcela ${parcela.meta.installmentIndex}/${parcela.meta.totalInstallments} remarcada para ${format(parseLocalDate(novaData)!, 'dd/MM/yyyy')}.`
      );
      setEditandoId(null);
      onChanged?.();
    } catch (err: any) {
      toast.error('Não foi possível remarcar: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  const darBaixa = async (parcela: InstallmentRow) => {
    setSalvando(true);
    try {
      await settleInstallment(parcela.id, { method: parcela.payment_method });
      toast.success(`Parcela ${parcela.meta.installmentIndex}/${parcela.meta.totalInstallments} quitada!`);
      window.dispatchEvent(new CustomEvent('borda_orders_changed'));
      onChanged?.();
    } catch (err: any) {
      toast.error('Não foi possível dar baixa: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border border-white/10 bg-[#0d0d14] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

        <div className="flex items-start justify-between p-5 border-b border-white/10 bg-gradient-to-r from-indigo-900/30 via-purple-900/20 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <CalendarClock className="h-5 w-5 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-white font-black text-base sm:text-lg truncate">
                Acordo de Parcelamento
              </h2>
              <p className="text-zinc-400 text-xs flex items-center gap-1.5 truncate">
                <User className="h-3 w-3 shrink-0" /> {a.clientName}
                {a.associatedOrders && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <Package className="h-3 w-3 shrink-0" /> {a.associatedOrders}
                  </>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resumo */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-black/20 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Total
              </span>
              <p className="text-sm sm:text-base font-black text-white mt-0.5">{brl(a.total, canSeeFinancials)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Já pago
              </span>
              <p className="text-sm sm:text-base font-black text-emerald-400 mt-0.5">{brl(a.paidTotal, canSeeFinancials)}</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-amber-300">Falta pagar</span>
              <p className="text-sm sm:text-base font-black text-amber-400 mt-0.5">{brl(a.pendingTotal, canSeeFinancials)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Parcelas</span>
              <p className="text-sm sm:text-base font-black text-white mt-0.5">
                {a.paidCount}<span className="text-zinc-500">/{a.totalCount}</span>
              </p>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1">
              <span>Progresso do acordo</span>
              <span>{progresso}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>

          {a.nextDue && (
            <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/10 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold text-indigo-200">
                Próxima cobrança: parcela {a.nextDue.meta.installmentIndex}/{a.nextDue.meta.totalInstallments}
              </span>
              <span className="text-xs font-black text-white whitespace-nowrap">
                {brl(a.nextDue.amount, canSeeFinancials)}
                {a.nextDue.due_date && (
                  <span className="text-indigo-300 font-bold ml-2">
                    {format(parseLocalDate(a.nextDue.due_date)!, "dd 'de' MMM", { locale: ptBR })}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Parcelas */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-2">
          {a.installments.map(p => {
            const st = situacao(p);
            const editando = editandoId === p.id;
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 hover:bg-white/[0.06] transition-colors"
              >
                <div className={`h-9 w-9 shrink-0 rounded-xl border flex items-center justify-center ${st.cor}`}>
                  <st.Icone className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-zinc-100">
                    Parcela {p.meta.installmentIndex}/{p.meta.totalInstallments}
                  </p>
                  <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 flex-wrap">
                    {editando ? (
                      <span className="flex items-center gap-1">
                        <input
                          type="date"
                          autoFocus
                          value={novaData}
                          onChange={e => setNovaData(e.target.value)}
                          className="bg-black/50 border border-indigo-500/40 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-indigo-400"
                        />
                        <button
                          type="button"
                          disabled={salvando}
                          onClick={() => salvarData(p)}
                          className="p-1 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                          title="Salvar nova data"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoId(null)}
                          className="p-1 rounded-md bg-white/10 text-zinc-400 hover:text-white transition-colors"
                          title="Cancelar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      <>
                        <span>
                          Vence {p.due_date ? format(parseLocalDate(p.due_date)!, 'dd/MM/yyyy') : 'sem data'}
                        </span>
                        {p.status !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => { setEditandoId(p.id); setNovaData(toLocalDateInput(p.due_date)); }}
                            title="Remarcar vencimento"
                            className="p-0.5 rounded hover:bg-white/15 text-zinc-400 hover:text-white transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {p.payment_method && (
                          <>
                            <span className="text-zinc-700">•</span>
                            <span>{formatPaymentMethodName(p.payment_method)}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <span className={`shrink-0 text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${st.cor}`}>
                  {st.label}
                </span>

                <span className="shrink-0 text-sm font-black text-white tabular-nums w-24 text-right">
                  {brl(p.amount, canSeeFinancials)}
                </span>

                {p.status !== 'paid' && (
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => darBaixa(p)}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50"
                  >
                    Dar baixa
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3.5 border-t border-white/10 bg-white/5 text-[11px] text-zinc-400 font-semibold">
          {a.isSettled
            ? '✅ Acordo totalmente quitado.'
            : `${a.totalCount - a.paidCount} parcela(s) em aberto — ${brl(a.pendingTotal, canSeeFinancials)} a receber.`}
        </div>
      </div>
    </div>
  );
};
