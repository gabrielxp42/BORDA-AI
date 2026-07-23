export interface PaymentHistoryEntry {
  status: 'pending' | 'half_paid' | 'paid';
  amount: number;
  method: string;
  timestamp: string;
}

export interface PaymentMetadata {
  depositAmount?: number;
  paymentMethod?: string;
  paidAt?: string;
  isQuickEntry?: boolean;
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
 * Serializes payment metadata and appends/updates it in the notes string.
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
  customDeposit?: number
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
    timestamp: new Date().toISOString()
  });

  const updated: PaymentMetadata = {
    ...existingMetadata,
    paymentMethod: method,
    history
  };

  if (newStatus === 'half_paid') {
    updated.depositAmount = customDeposit !== undefined ? customDeposit : totalAmount / 2;
  } else if (newStatus === 'paid') {
    updated.paidAt = new Date().toISOString();
  } else if (newStatus === 'pending') {
    updated.depositAmount = 0;
    updated.paidAt = undefined;
  }

  return updated;
}
