import React, { useMemo, useState } from 'react';
import {
  X, FileDown, Search, ArrowUpRight, ArrowDownRight,
  CalendarRange, Wallet, TrendingUp, TrendingDown
} from 'lucide-react';
import {
  format, startOfDay, endOfDay, subDays,
  startOfMonth, endOfMonth, subMonths, isWithinInterval
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { FinancialTransaction } from '@/types/stockTypes';
import { printFinancialReportPDF, FinancialMovement } from '@/services/financialReportPdf';
import { parseLocalDate } from '@/utils/dateHelper';

/** Entrada consolidada de caixa vinda da página de Faturamento (pedidos pagos + receitas manuais). */
export interface ReportIncomeEntry {
  id: string;
  date: Date;
  title: string;
  isOrder: boolean;
  paymentMethod?: string;
  profileName?: string;
  amount: number;
}

interface FinancialReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  incomeEntries: ReportIncomeEntry[];
  transactions: FinancialTransaction[];
  companyName?: string;
  companyColor?: string;
}

type PresetId = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';
type TypeFilter = 'all' | 'income' | 'expense';

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: 'last7', label: 'Últimos 7 dias' },
  { id: 'thisMonth', label: 'Este mês' },
  { id: 'lastMonth', label: 'Mês passado' },
  { id: 'custom', label: 'Personalizado' },
];

const toInput = (d: Date) => format(d, 'yyyy-MM-dd');

const resolvePreset = (preset: PresetId, from: string, to: string) => {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'last7':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case 'thisMonth':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    case 'custom':
    default:
      return {
        start: startOfDay(new Date(`${from}T12:00:00`)),
        end: endOfDay(new Date(`${to}T12:00:00`)),
      };
  }
};

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão',
  transfer: 'Transferência',
  other: 'Outro',
};

export const FinancialReportModal: React.FC<FinancialReportModalProps> = ({
  isOpen,
  onClose,
  incomeEntries,
  transactions,
  companyName,
  companyColor,
}) => {
  const [preset, setPreset] = useState<PresetId>('thisMonth');
  const [customFrom, setCustomFrom] = useState<string>(toInput(startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState<string>(toInput(new Date()));
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const { start, end } = useMemo(
    () => resolvePreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const periodLabel = useMemo(() => {
    const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd');
    return sameDay
      ? format(start, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
      : `${format(start, 'dd/MM/yyyy')} a ${format(end, 'dd/MM/yyyy')}`;
  }, [start, end]);

  /** Unifica entradas (pedidos + manuais) e saídas (despesas) numa única linha do tempo. */
  const movements = useMemo<FinancialMovement[]>(() => {
    const ins: FinancialMovement[] = incomeEntries.map(e => ({
      id: e.id,
      date: e.date.toISOString(),
      type: 'income',
      title: e.title,
      category: e.isOrder ? 'Pedido / Bordado' : 'Receita Avulsa',
      method: e.paymentMethod || '-',
      who: e.profileName,
      source: e.isOrder ? 'pedido' : 'manual',
      amount: Number(e.amount || 0),
    }));

    // Saídas: apenas o que efetivamente saiu do caixa (contas ainda a vencer ficam fora).
    const outs: FinancialMovement[] = transactions
      .filter(t => t.type === 'expense' && t.status !== 'pending')
      .map(t => ({
        id: `tx-${t.id}`,
        date: t.date || t.created_at,
        type: 'expense',
        title: t.description || 'Despesa',
        category: t.category || (t.expense_type === 'fixed' ? 'Gasto Fixo' : 'Gasto Variável'),
        method: METHOD_LABELS[t.payment_method] || t.payment_method || '-',
        who: t.created_by_profile || 'Caixa',
        source: 'manual',
        amount: Number(t.amount || 0),
      }));

    return [...ins, ...outs];
  }, [incomeEntries, transactions]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return movements
      .filter(m => {
        const d = parseLocalDate(m.date) || new Date(m.date);
        if (isNaN(d.getTime())) return false;
        if (!isWithinInterval(d, { start, end })) return false;
        if (typeFilter !== 'all' && m.type !== typeFilter) return false;
        if (!term) return true;
        return [m.title, m.category, m.method, m.who]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(term));
      })
      .sort((a, b) => (parseLocalDate(b.date)?.getTime() ?? 0) - (parseLocalDate(a.date)?.getTime() ?? 0));
  }, [movements, start, end, typeFilter, search]);

  const totals = useMemo(() => {
    const inSum = filtered.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0);
    const outSum = filtered.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
    return { inSum, outSum, balance: inSum - outSum };
  }, [filtered]);

  /** Agrupa por dia para leitura tipo extrato bancário. */
  const grouped = useMemo(() => {
    const map: Record<string, FinancialMovement[]> = {};
    filtered.forEach(m => {
      const k = format(parseLocalDate(m.date) || new Date(m.date), 'yyyy-MM-dd');
      (map[k] ||= []).push(m);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  if (!isOpen) return null;

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error('Nenhum lançamento no período selecionado para exportar.');
      return;
    }
    const chips: string[] = [];
    if (typeFilter === 'income') chips.push('Somente entradas');
    if (typeFilter === 'expense') chips.push('Somente saídas');
    if (search.trim()) chips.push(`Busca: "${search.trim()}"`);

    printFinancialReportPDF({
      periodLabel,
      movements: filtered,
      companyName,
      companyColor,
      filterLabel: chips.join(' • ') || undefined,
    });
    toast.success('Relatório gerado! Escolha "Salvar como PDF" na janela de impressão.');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c0c14] text-slate-900 dark:text-zinc-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header de Alto Padrão com Contraste Perfeito */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-gradient-to-r dark:from-purple-950/80 dark:via-zinc-900 dark:to-black">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center justify-center font-black shadow-lg shadow-purple-500/10 shrink-0">
              <CalendarRange className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-black text-base sm:text-lg tracking-tight">
                Relatório Financeiro
              </h2>
              <p className="text-slate-500 dark:text-zinc-400 text-xs mt-0.5">
                Entradas e saídas por período — pedidos, insumos e lançamentos manuais
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-white/10 dark:hover:bg-rose-600/80 dark:text-white border border-slate-300 dark:border-white/10 shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
            title="Fechar Relatório"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filtros */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-white/10 space-y-3.5 bg-slate-50/80 dark:bg-black/30">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all cursor-pointer ${
                  preset === p.id
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 border border-purple-500'
                    : 'bg-white dark:bg-white/5 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-1">De</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full bg-white dark:bg-black/50 border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-1">Até</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full bg-white dark:bg-black/50 border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-purple-400"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar por descrição, cliente, categoria ou forma de pagamento..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-slate-900 dark:text-zinc-200 outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex gap-2">
              {([
                { id: 'all', label: 'Tudo' },
                { id: 'income', label: 'Entradas' },
                { id: 'expense', label: 'Saídas' },
              ] as Array<{ id: TypeFilter; label: string }>).map(f => (
                <button
                  key={f.id}
                  onClick={() => setTypeFilter(f.id)}
                  className={`px-3.5 py-2 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer ${
                    typeFilter === f.id
                      ? 'bg-purple-600 text-white shadow-md border border-purple-500'
                      : 'bg-white dark:bg-white/5 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/10'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Totais */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <TrendingUp className="h-3 w-3" /> Entradas
              </span>
              <p className="text-sm sm:text-lg font-black text-emerald-700 dark:text-emerald-400 mt-0.5">{brl(totals.inSum)}</p>
            </div>
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5">
              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
                <TrendingDown className="h-3 w-3" /> Saídas
              </span>
              <p className="text-sm sm:text-lg font-black text-rose-700 dark:text-rose-400 mt-0.5">{brl(totals.outSum)}</p>
            </div>
            <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 dark:bg-purple-950/20 px-3.5 py-2.5">
              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300">
                <Wallet className="h-3 w-3" /> Saldo
              </span>
              <p className={`text-sm sm:text-lg font-black mt-0.5 ${totals.balance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                {brl(totals.balance)}
              </p>
            </div>
          </div>
        </div>

        {/* Lista agrupada por dia */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
          {grouped.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-slate-700 dark:text-zinc-400 text-sm font-semibold">Nenhum lançamento encontrado neste período.</p>
              <p className="text-slate-500 dark:text-zinc-500 text-xs mt-1">Ajuste as datas ou limpe a busca.</p>
            </div>
          ) : (
            grouped.map(([day, items]) => {
              const dIn = items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);
              const dOut = items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0);
              const dBal = dIn - dOut;
              return (
                <div key={day} className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/[0.02]">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                    <span className="text-xs font-black text-slate-900 dark:text-white capitalize">
                      {format(new Date(`${day}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </span>
                    <span className="flex items-center gap-3 text-[10px] font-black">
                      <span className="text-emerald-600 dark:text-emerald-400">+{brl(dIn)}</span>
                      <span className="text-rose-600 dark:text-rose-400">-{brl(dOut)}</span>
                      <span className={dBal >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>= {brl(dBal)}</span>
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-white/5">
                    {items.map(m => (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <div className={`h-8 w-8 shrink-0 rounded-xl flex items-center justify-center border ${
                          m.type === 'income'
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400'
                        }`}>
                          {m.type === 'income' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">{m.title}</p>
                          <p className="text-[10px] text-slate-500 dark:text-zinc-500 truncate">
                            {format(parseLocalDate(m.date) || new Date(m.date), 'HH:mm')} • {m.category}
                            {m.method && m.method !== '-' ? ` • ${m.method}` : ''}
                            {m.who ? ` • ${m.who}` : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                          m.source === 'pedido'
                            ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25'
                            : 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25'
                        }`}>
                          {m.source}
                        </span>
                        <span className={`shrink-0 text-xs font-black tabular-nums ${
                          m.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {m.type === 'income' ? '+' : '-'} {brl(m.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-slate-600 dark:text-zinc-400 font-semibold">
            {filtered.length} lançamento(s) • {periodLabel}
          </p>
          <button
            onClick={handleExport}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-500 hover:brightness-110 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-500/25 active:scale-95 transition-all cursor-pointer"
          >
            <FileDown className="h-4 w-4" /> Exportar Relatório em PDF
          </button>
        </div>
      </div>
    </div>
  );
};
