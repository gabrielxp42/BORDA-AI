import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useUniversalCloudSync() {
  const [isSyncing, setIsSyncing] = useState(false);

  const syncAllLocalDataToCloud = async (silent = false): Promise<number> => {
    setIsSyncing(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return 0;

      let itemsSyncedCount = 0;

      // 1. Sincronizar Insumos do Estoque (borda_stock_items)
      const savedStockRaw = localStorage.getItem('borda_stock_items');
      if (savedStockRaw) {
        try {
          const stockItems = JSON.parse(savedStockRaw);
          if (Array.isArray(stockItems) && stockItems.length > 0) {
            const stockPayload = stockItems.map((item: any) => ({
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
              updated_at: new Date().toISOString()
            }));

            const { error } = await supabase.from('stock_items').upsert(stockPayload);
            if (!error) {
              itemsSyncedCount += stockPayload.length;
              localStorage.removeItem('borda_stock_items');
            }
          }
        } catch (e) {
          console.warn('Erro ao sincronizar stock_items:', e);
        }
      }

      // 2. Sincronizar Movimentações/Baixas do Estoque (borda_stock_movements)
      const savedMovRaw = localStorage.getItem('borda_stock_movements');
      if (savedMovRaw) {
        try {
          const movements = JSON.parse(savedMovRaw);
          if (Array.isArray(movements) && movements.length > 0) {
            const movPayload = movements.map((m: any) => ({
              id: m.id || `mov_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              user_id: userId,
              item_id: m.item_id,
              item_name: m.item_name || 'Insumo',
              type: m.type,
              quantity: Number(m.quantity) || 0,
              reason: m.reason || '',
              date: m.date || m.created_at || new Date().toISOString(),
              created_at: m.created_at || new Date().toISOString()
            }));

            const { error } = await supabase.from('stock_movements').upsert(movPayload);
            if (!error) {
              itemsSyncedCount += movPayload.length;
              localStorage.removeItem('borda_stock_movements');
              localStorage.removeItem('borda_stock_movements_migrated');
            }
          }
        } catch (e) {
          console.warn('Erro ao sincronizar stock_movements:', e);
        }
      }

      // 3. Sincronizar Transações Financeiras (borda_financial_transactions)
      const savedFinRaw = localStorage.getItem('borda_financial_transactions');
      if (savedFinRaw) {
        try {
          const txs = JSON.parse(savedFinRaw);
          if (Array.isArray(txs) && txs.length > 0) {
            const finPayload = txs.map((t: any) => ({
              id: t.id || `fin_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              user_id: userId,
              type: t.type,
              amount: Number(t.amount) || 0,
              description: t.description || '',
              category: t.category || 'Geral',
              payment_method: t.payment_method || 'other',
              date: t.date || t.created_at || new Date().toISOString(),
              expense_type: t.expense_type || null,
              due_date: t.due_date || null,
              status: t.status || 'paid',
              created_at: t.created_at || new Date().toISOString(),
              created_by_profile: t.created_by_profile || null
            }));

            const { error } = await supabase.from('financial_transactions').upsert(finPayload);
            if (!error) {
              itemsSyncedCount += finPayload.length;
              localStorage.removeItem('borda_financial_transactions');
              localStorage.removeItem('borda_fin_migrated_to_cloud');
            }
          }
        } catch (e) {
          console.warn('Erro ao sincronizar financial_transactions:', e);
        }
      }

      if (itemsSyncedCount > 0 && !silent) {
        toast.success(`☁️ ${itemsSyncedCount} registro(s) de estoque e caixa foram sincronizados com a nuvem e já aparecem nos seus outros dispositivos!`);
      }

      return itemsSyncedCount;
    } catch (err) {
      console.warn('Erro na sincronização universal:', err);
      return 0;
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Executa auto-sync silencioso na inicialização
    syncAllLocalDataToCloud(true);

    const handleOnline = () => {
      syncAllLocalDataToCloud(false);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return { syncAllLocalDataToCloud, isSyncing };
}
