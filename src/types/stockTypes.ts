export type StockCategory = 'linhas' | 'entretelas' | 'pecas' | 'agulhas' | 'embalagens' | 'outros';

export interface StockItem {
  id: string;
  name: string;
  category: StockCategory;
  unit: string; // e.g., 'cone', 'metro', 'rolo', 'unidade', 'caixa', 'pacote'
  quantity: number;
  min_quantity: number;
  cost_price?: number;
  color_code?: string; // para linhas (ex: 2004 Lumina)
  location?: string; // armário 1, prateleira B
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type MovementType = 'in' | 'out';

export interface StockMovement {
  id: string;
  item_id: string;
  item_name?: string;
  type: MovementType;
  quantity: number;
  reason: string;
  user_name?: string;
  date: string;
  created_at: string;
}

export type FinancialTransactionType = 'income' | 'expense';

export interface FinancialTransaction {
  id: string;
  type: FinancialTransactionType;
  amount: number;
  description: string;
  category: string; // e.g., 'Compra de Linha', 'Venda Avulsa', 'Manutenção', 'Conta de Luz', 'Outros'
  payment_method: 'pix' | 'cash' | 'credit_card' | 'transfer' | 'other';
  date: string;
  expense_type?: 'fixed' | 'variable';
  due_date?: string;
  status?: 'pending' | 'paid' | 'overdue';
  order_id?: string;
  notes?: string;
  created_by_profile?: string;
  created_at: string;
}
