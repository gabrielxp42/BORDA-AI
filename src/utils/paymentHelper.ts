import { format } from 'date-fns';

export interface PaymentHistoryEntry {
  status: 'pending' | 'half_paid' | 'paid';
  amount: number;
  method: string;
  note?: string;
  timestamp: string;
}

export interface PaymentMetadata {
  depositAmount?: number;
  paymentMethod?: string;
  paymentNote?: string;
  paidAt?: string;
  /** Quem deu a baixa no sistema (perfil ativo no momento do registro). */
  paidByOperator?: string;
  /** Quando a baixa foi registrada no sistema — pode diferir de paidAt. */
  registeredAt?: string;
  isQuickEntry?: boolean;
  isPrivate?: boolean;
  attachmentUrls?: string[];
  history?: PaymentHistoryEntry[];
  /** Momento em que o pedido entrou na fila "Entregue" — base do arquivamento automático. */
  deliveredAt?: string;
  /** Acordo de parcelamento que cobre este pedido. Enquanto existir, o pedido
   *  não deve ser cobrado separadamente — quem representa a dívida é a parcela. */
  agreementId?: string;
  agreementCreatedAt?: string;
}

const METADATA_REGEX = /<!--PAYMENT_METADATA:([\s\S]*?)-->/;

/**
 * Parses payment metadata from the notes string.
 */
export function parsePaymentMetadata(notes: string | null | undefined): {
  cleanNotes: string;
  metadata: PaymentMetadata;
} {
  if (!notes) {
    return { cleanNotes: '', metadata: {} };
  }

  const match = notes.match(METADATA_REGEX);
  if (match) {
    try {
      const metadata = JSON.parse(match[1]) as PaymentMetadata;
      const cleanNotes = notes.replace(METADATA_REGEX, '').trim();
      return { cleanNotes, metadata };
    } catch (e) {
      console.error("Error parsing payment metadata:", e);
    }
  }

  return { cleanNotes: notes, metadata: {} };
}

/**
 * Serializes metadata back into the notes string using an HTML comment.
 */
export function serializePaymentMetadata(
  cleanNotes: string | null | undefined,
  metadata: PaymentMetadata
): string {
  const noteStr = (cleanNotes || '').trim();
  const metaStr = `<!--PAYMENT_METADATA:${JSON.stringify(metadata)}-->`;
  return noteStr ? `${noteStr}\n\n${metaStr}` : metaStr;
}

/**
 * Helper to generate initial metadata or update existing metadata.
 */
export function updatePaymentMetadata(
  existingMetadata: PaymentMetadata,
  newStatus: 'pending' | 'half_paid' | 'paid',
  totalAmount: number,
  method: string,
  customDeposit?: number,
  paymentNote?: string
): PaymentMetadata {
  const history = [...(existingMetadata.history || [])];
  
  // Calculate amount paid in this transition
  let amount = 0;
  if (newStatus === 'paid') {
    amount = totalAmount - (existingMetadata.depositAmount || 0);
  } else if (newStatus === 'half_paid') {
    amount = customDeposit !== undefined ? customDeposit : totalAmount / 2;
  }

  history.push({
    status: newStatus,
    amount,
    method,
    note: paymentNote,
    timestamp: new Date().toISOString()
  });

  const updated: PaymentMetadata = {
    ...existingMetadata,
    paymentMethod: method,
    paymentNote: paymentNote !== undefined ? paymentNote : existingMetadata.paymentNote,
    history
  };

  if (newStatus === 'half_paid') {
    updated.depositAmount = customDeposit !== undefined ? customDeposit : totalAmount / 2;
  } else if (newStatus === 'paid') {
    updated.paidAt = new Date().toISOString();
  } else if (newStatus === 'pending') {
    updated.depositAmount = 0;
    updated.paidAt = undefined;
    updated.paymentNote = undefined;
  }

  return updated;
}

/**
 * Formata nomes amigáveis para os métodos de pagamento.
 */
export function formatPaymentMethodName(method?: string): string {
  if (!method) return '';
  const m = method.toLowerCase();
  if (m === 'pix') return 'PIX';
  if (m === 'credit_card' || m === 'cartao' || m === 'cartão') return 'Cartão';
  if (m === 'cash' || m === 'dinheiro') return 'Dinheiro';
  if (m === 'transfer' || m === 'transferencia' || m === 'transferência') return 'Transferência';
  if (m === 'check' || m === 'cheque') return 'Cheque';
  return method;
}

/**
 * Retorna os detalhes formatados de pagamento para os cards de pedidos em toda a aplicação.
 */
export function formatOrderPaymentBadgeDetails(
  paymentStatus: string | undefined,
  totalAmount: number,
  notes: string | null | undefined,
  paymentMethodDb?: string,
  canViewPrices: boolean = true
): {
  status: 'pending' | 'half_paid' | 'paid';
  shortLabel: string;
  badgeSubtext: string;
  fullLabel: string;
  methodLabel: string;
  paymentNote?: string;
  paidDateStr?: string;
  depositVal?: number;
  remainingVal?: number;
} {
  const { metadata } = parsePaymentMetadata(notes);
  const method = paymentMethodDb || metadata.paymentMethod || '';
  const methodLabel = formatPaymentMethodName(method);
  const paymentNote = metadata.paymentNote || '';

  const paidDateStr = metadata.paidAt
    ? format(new Date(metadata.paidAt), "dd/MM 'às' HH:mm")
    : null;

  if (paymentStatus === 'paid') {
    const methodSuffix = methodLabel ? ` • ${methodLabel}` : '';
    const noteSuffix = paymentNote ? ` ("${paymentNote}")` : '';
    return {
      status: 'paid',
      shortLabel: '✓ Pago 100%',
      badgeSubtext: paidDateStr ? `Pago em ${paidDateStr}${noteSuffix}` : noteSuffix,
      fullLabel: `✓ Pago 100%${methodSuffix}${paidDateStr ? ` (${paidDateStr})` : ''}${noteSuffix}`,
      methodLabel,
      paymentNote,
      paidDateStr: paidDateStr || undefined
    };
  }

  if (paymentStatus === 'half_paid') {
    const depositVal = metadata.depositAmount || totalAmount / 2;
    const remainingVal = Math.max(0, totalAmount - depositVal);
    const methodSuffix = methodLabel ? ` • ${methodLabel}` : '';
    const noteSuffix = paymentNote ? ` ("${paymentNote}")` : '';
    const depositFormatted = canViewPrices ? `R$ ${depositVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ ***';
    const remainingFormatted = canViewPrices ? `R$ ${remainingVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ ***';

    const isExactFifty = Math.abs(depositVal - totalAmount / 2) < 0.05;
    const labelTitle = isExactFifty ? '🟡 Sinal (50%)' : `🟡 Sinal (${depositFormatted})`;

    return {
      status: 'half_paid',
      shortLabel: labelTitle,
      badgeSubtext: `Entrada ${depositFormatted} (Falta ${remainingFormatted})${noteSuffix}`,
      fullLabel: `${labelTitle}${methodSuffix} • Resta ${remainingFormatted}${noteSuffix}`,
      methodLabel,
      paymentNote,
      depositVal: canViewPrices ? depositVal : 0,
      remainingVal: canViewPrices ? remainingVal : 0
    };
  }

  return {
    status: 'pending',
    shortLabel: '⏳ Aguardando',
    badgeSubtext: 'Pendente de pagamento',
    fullLabel: '⏳ Aguardando Pagamento',
    methodLabel: '',
    paymentNote: ''
  };
}

export interface DueDateAlertInfo {
  isOverdue: boolean;
  isToday: boolean;
  isUrgent: boolean;
  daysDiff: number;
  formattedDate: string;
  label: string;
  badgeClass: string;
}

/**
 * Retorna status e alerta do prazo de entrega de um pedido.
 */
export function getDueDateAlertInfo(dueDate?: string, status?: string): DueDateAlertInfo | null {
  if (!dueDate) return null;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = dueDate.split('-').map(Number);
    const due = new Date(year, month - 1, day);
    due.setHours(0, 0, 0, 0);

    const diffMs = due.getTime() - today.getTime();
    const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    const formattedDate = format(due, 'dd/MM/yyyy');
    const st = (status || '').toLowerCase();
    const isFinished = st === 'concluido' || st === 'completed' || st === 'entregue' || st === 'delivered' || st === 'pronto' || st === 'cancelado';

    if (isFinished) {
      return {
        isOverdue: false,
        isToday: false,
        isUrgent: false,
        daysDiff,
        formattedDate,
        label: `Entrega: ${formattedDate}`,
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
      };
    }

    if (daysDiff < 0) {
      const daysLate = Math.abs(daysDiff);
      return {
        isOverdue: true,
        isToday: false,
        isUrgent: true,
        daysDiff,
        formattedDate,
        label: `🚨 ATRASADO (${daysLate}d atrás - ${formattedDate})`,
        badgeClass: 'bg-rose-500/20 text-rose-500 dark:text-rose-400 border-rose-500/40 animate-pulse font-black'
      };
    }

    if (daysDiff === 0) {
      return {
        isOverdue: false,
        isToday: true,
        isUrgent: true,
        daysDiff,
        formattedDate,
        label: `⏰ VENCE HOJE (${formattedDate})`,
        badgeClass: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 animate-pulse font-black'
      };
    }

    if (daysDiff <= 2) {
      return {
        isOverdue: false,
        isToday: false,
        isUrgent: true,
        daysDiff,
        formattedDate,
        label: `⏳ Entrega em ${daysDiff}d (${formattedDate})`,
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-bold'
      };
    }

    return {
      isOverdue: false,
      isToday: false,
      isUrgent: false,
      daysDiff,
      formattedDate,
      label: `📅 Entrega: ${formattedDate}`,
      badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-bold'
    };
  } catch (err) {
    return null;
  }
}

/**
 * Verifica se uma transação financeira veio/representa um pedido já existente.
 */
export function isOrderLinkedTx(t: any, orderIdsSet?: Set<string>): boolean {
  if (!t) return false;

  // Extrai todos os IDs de pedidos potencialmente vinculados a esta transação
  const linkedIds: string[] = [];
  if (t.order_id) linkedIds.push(t.order_id);

  if (t.notes) {
    try {
      let meta: any = null;
      if (typeof t.notes === 'string' && t.notes.includes('{')) {
        meta = JSON.parse(t.notes);
      } else if (typeof t.notes === 'object') {
        meta = t.notes;
      }

      if (meta) {
        if (Array.isArray(meta.associatedOrderIds)) linkedIds.push(...meta.associatedOrderIds);
        if (Array.isArray(meta.orderIds)) linkedIds.push(...meta.orderIds);
        if (meta.orderId) linkedIds.push(meta.orderId);
      }
    } catch (e) {}
  }

  // Se a transação não está vinculada a nenhum pedido, ela é uma Entrada Futura / Receita Direta avulsa
  if (linkedIds.length === 0) return false;

  // Se orderIdsSet for fornecido, só considera vinculada se ALGUM dos pedidos vinculados JÁ estiver no conjunto de pedidos pagos exibidos
  if (orderIdsSet) {
    return linkedIds.some(id => orderIdsSet.has(id));
  }

  return true;
}

