import { supabase } from '@/integrations/supabase/client';

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
const ensureUUID = (str?: string) => (str && isUUID(str)) ? str : crypto.randomUUID();

/**
 * Sincroniza dados retidos no localStorage para o Supabase.
 * Função pura — sem hooks React, sem dependências circulares.
 * Pode ser chamada de qualquer useEffect ou handler.
 */
export async function syncLocalToCloud(silent = true): Promise<number> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return 0;

    let count = 0;

    // 1. Insumos de Estoque
    const stockRaw = localStorage.getItem('borda_stock_items');
    if (stockRaw) {
      try {
        const items = JSON.parse(stockRaw);
        if (Array.isArray(items) && items.length > 0) {
          const payload = items.map((item: any) => ({
            id: item.id || `stk_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            user_id: userId,
            name: item.name,
            category: item.category || 'geral',
            unit: item.unit || 'unidade',
            quantity: Number(item.quantity) || 0,
            min_quantity: Number(item.min_quantity) || 0,
            cost_price: Number(item.cost_price) || 0,
            color_code: item.color_code || null,
            location: item.location || null,
            notes: item.notes || null,
            created_at: item.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));
          const { error } = await supabase.from('stock_items').upsert(payload, { onConflict: 'id' });
          if (!error) {
            count += payload.length;
            localStorage.removeItem('borda_stock_items');
          }
        }
      } catch { /* segue */ }
    }

    // 2. Movimentações/Baixas de Estoque
    const movRaw = localStorage.getItem('borda_stock_movements');
    if (movRaw) {
      try {
        const moves = JSON.parse(movRaw);
        if (Array.isArray(moves) && moves.length > 0) {
          const payload = moves.map((m: any) => ({
            id: m.id || `mov_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            user_id: userId,
            item_id: m.item_id,
            item_name: m.item_name || 'Insumo',
            type: m.type,
            quantity: Number(m.quantity) || 0,
            reason: m.reason || '',
            date: m.date || m.created_at || new Date().toISOString(),
            created_at: m.created_at || new Date().toISOString(),
          }));
          const { error } = await supabase.from('stock_movements').upsert(payload, { onConflict: 'id' });
          if (!error) {
            count += payload.length;
            localStorage.removeItem('borda_stock_movements');
            localStorage.removeItem('borda_stock_movements_migrated');
          }
        }
      } catch { /* segue */ }
    }

    // 3. Transações Financeiras (garante ID no formato UUID v4)
    const finRaw = localStorage.getItem('borda_financial_transactions');
    if (finRaw) {
      try {
        const txs = JSON.parse(finRaw);
        if (Array.isArray(txs) && txs.length > 0) {
          const payload = txs.map((t: any) => ({
            id: ensureUUID(t.id),
            user_id: userId,
            type: t.type,
            amount: Number(t.amount) || 0,
            description: t.description || '',
            category: t.category || 'Geral',
            payment_method: t.payment_method || 'other',
            date: t.date || t.created_at || new Date().toISOString(),
            status: t.status || 'paid',
            created_at: t.created_at || new Date().toISOString(),
          }));
          const { error } = await supabase.from('financial_transactions').upsert(payload, { onConflict: 'id' });
          if (!error) {
            count += payload.length;
            localStorage.removeItem('borda_financial_transactions');
            localStorage.removeItem('borda_fin_migrated_to_cloud');
          } else {
            console.warn('Erro upsert financial_transactions:', error.message);
          }
        }
      } catch { /* segue */ }
    }

    if (count > 0 && !silent) {
      const { toast } = await import('sonner');
      toast.success(`☁️ ${count} registro(s) sincronizados com a nuvem!`);
    }

    return count;
  } catch {
    return 0;
  }
}
