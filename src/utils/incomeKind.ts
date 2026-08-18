/**
 * Classificação visual das entradas de caixa.
 *
 * O PROBLEMA QUE ISSO RESOLVE
 * No extrato, todo valor aparecia verde e parecido. Um SINAL de 50% ficava com
 * a mesma cara de uma quitação total, então o usuário olhava a linha e não
 * sabia dizer o que aquele dinheiro representava — nem quanto ainda faltava.
 *
 * Aqui cada entrada ganha um tipo, um rótulo e uma cor próprios.
 */

export type IncomeKind = 'sinal' | 'quitacao' | 'parcela' | 'manual';

export interface IncomeKindInfo {
  kind: IncomeKind;
  /** Rótulo curto do badge, ex.: "Sinal 50%". */
  label: string;
  /** Frase explicando o que é aquele valor. */
  explanation: string;
  /** Classes do badge. */
  badgeClass: string;
  /** Classes da linha inteira. */
  rowClass: string;
  /** Cor do valor. */
  amountClass: string;
  emoji: string;
}

const ESTILOS: Record<IncomeKind, Omit<IncomeKindInfo, 'kind' | 'label' | 'explanation'>> = {
  sinal: {
    badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
    rowClass: 'bg-amber-500/[0.06] hover:bg-amber-500/[0.11] border-amber-500/25',
    amountClass: 'text-amber-400',
    emoji: '⚡',
  },
  quitacao: {
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
    rowClass: 'bg-emerald-500/[0.05] hover:bg-emerald-500/[0.10] border-emerald-500/25',
    amountClass: 'text-emerald-400',
    emoji: '✅',
  },
  parcela: {
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40',
    rowClass: 'bg-indigo-500/[0.06] hover:bg-indigo-500/[0.11] border-indigo-500/25',
    amountClass: 'text-indigo-300',
    emoji: '📆',
  },
  manual: {
    badgeClass: 'bg-sky-500/20 text-sky-300 border border-sky-500/40',
    rowClass: 'bg-sky-500/[0.05] hover:bg-sky-500/[0.10] border-sky-500/25',
    amountClass: 'text-sky-300',
    emoji: '✍️',
  },
};

const dinheiro = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export interface ClassifyInput {
  isOrder?: boolean;
  /** payment_status do pedido, quando for pedido. */
  orderStatus?: string;
  isInstallment?: boolean;
  installmentLabel?: string;
  category?: string;
  /** Valor efetivamente recebido nesta entrada. */
  amount: number;
  /** Valor cheio do pedido, para calcular o que ainda falta num sinal. */
  orderTotal?: number;
}

/** Descobre o que é aquele valor e como mostrá-lo. */
export function classifyIncome(e: ClassifyInput): IncomeKindInfo {
  // Parcela de acordo
  if (e.isInstallment) {
    return {
      kind: 'parcela',
      label: e.installmentLabel || 'Parcela de acordo',
      explanation: 'Parcela de um acordo de parcelamento',
      ...ESTILOS.parcela,
    };
  }

  // Sinal de pedido (pagamento parcial)
  const ehSinalPorStatus = e.isOrder && e.orderStatus === 'half_paid';
  const ehSinalPorCategoria = ['Sinal de Pedido', 'Entrada Acordo'].includes(e.category || '');

  if (ehSinalPorStatus || ehSinalPorCategoria) {
    const falta = e.orderTotal ? Math.max(0, e.orderTotal - e.amount) : 0;
    return {
      kind: 'sinal',
      label: ehSinalPorStatus ? 'Sinal (parcial)' : 'Entrada / Sinal',
      explanation: falta > 0
        ? `Pagamento parcial — ainda faltam ${dinheiro(falta)}`
        : 'Entrada paga na abertura do pedido',
      ...ESTILOS.sinal,
    };
  }

  // Quitação total do pedido
  if (e.isOrder) {
    return {
      kind: 'quitacao',
      label: 'Quitação total',
      explanation: 'Pedido pago integralmente',
      ...ESTILOS.quitacao,
    };
  }

  // Lançamento avulso digitado à mão
  return {
    kind: 'manual',
    label: 'Lançamento manual',
    explanation: e.category ? `Entrada avulsa — ${e.category}` : 'Entrada avulsa registrada no caixa',
    ...ESTILOS.manual,
  };
}
