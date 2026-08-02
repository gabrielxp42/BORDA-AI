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
  isQuickEntry?: boolean;
  isPrivate?: boolean;
  attachmentUrls?: string[];
  history?: PaymentHistoryEntry[];
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
  return method;
}

/**
 * Retorna os detalhes formatados de pagamento para os cards de pedidos em toda a aplicação.
 */
export function formatOrderPaymentBadgeDetails(
  paymentStatus: string | undefined,
  totalAmount: number,
  notes: string | null | undefined,
  paymentMethodDb?: string
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
      shortLabel: `✓ Pago 100%${methodSuffix}`,
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
    return {
      status: 'half_paid',
      shortLabel: `⚡ Sinal 50%${methodSuffix}`,
      badgeSubtext: `Sinal R$ ${depositVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${noteSuffix}`,
      fullLabel: `⚡ Sinal 50%${methodSuffix} (Restam R$ ${remainingVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})${noteSuffix}`,
      methodLabel,
      paymentNote,
      depositVal,
      remainingVal
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
