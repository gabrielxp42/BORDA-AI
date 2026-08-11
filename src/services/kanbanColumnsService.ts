import { supabase } from '@/integrations/supabase/client';

/**
 * Configuração das filas do Kanban de produção.
 *
 * O `id` é o valor gravado em `orders.status` e NUNCA muda — só o `title` é
 * editável pelo usuário. Assim renomear uma fila não quebra os pedidos existentes.
 *
 * Persistência: `company_settings.kanban_columns` (jsonb) para valer em todos os
 * dispositivos, com espelho em localStorage para funcionar offline e enquanto a
 * coluna não existir no banco (ver supabase/kanban_columns.sql).
 */

export interface KanbanColumnConfig {
  id: string;
  title: string;
  color: string;
  /** Filas de encerramento sáem do quadro depois de ARCHIVE_AFTER_DAYS dias. */
  archivable?: boolean;
}

export const DEFAULT_KANBAN_COLUMNS: KanbanColumnConfig[] = [
  { id: 'pending', title: 'Pendente', color: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' },
  { id: 'design', title: 'Pronto para Produção', color: 'border-blue-500/30 text-blue-400 bg-blue-500/10' },
  { id: 'embroidering', title: 'Na Máquina', color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' },
  { id: 'finishing', title: 'Acabamento', color: 'border-purple-500/30 text-purple-400 bg-purple-500/10' },
  { id: 'completed', title: 'Pronto p/ Retirada', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
  { id: 'delivered', title: 'Entregue / Concluído', color: 'border-teal-500/30 text-teal-400 bg-teal-500/10', archivable: true },
];

/** Pedidos entregues somem do quadro depois deste tempo (continuam no banco). */
export const ARCHIVE_AFTER_DAYS = 2;

const LS_KEY = 'borda_kanban_columns';

/** Mescla o que veio salvo com os padrões, para novas filas aparecerem sozinhas. */
const mergeWithDefaults = (saved: Partial<KanbanColumnConfig>[]): KanbanColumnConfig[] => {
  const byId = new Map(saved.filter(c => c?.id).map(c => [c.id as string, c]));
  const merged = DEFAULT_KANBAN_COLUMNS.map(def => {
    const hit = byId.get(def.id);
    return hit ? { ...def, title: hit.title || def.title } : def;
  });
  // Preserva a ordem salva pelo usuário, com filas novas no fim
  const order = saved.map(c => c.id).filter(Boolean) as string[];
  return merged.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
};

const readLocal = (): KanbanColumnConfig[] | null => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? mergeWithDefaults(parsed) : null;
  } catch {
    return null;
  }
};

/**
 * Carrega as filas. Nunca lança: se a nuvem falhar (ou a coluna ainda não
 * existir no banco), cai no cache local e depois nos padrões.
 */
export async function loadKanbanColumns(): Promise<KanbanColumnConfig[]> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (userId) {
      const { data, error } = await supabase
        .from('company_settings')
        .select('kanban_columns')
        .eq('id', userId)
        .maybeSingle();

      if (!error && (data as any)?.kanban_columns) {
        const cloud = (data as any).kanban_columns;
        const parsed = typeof cloud === 'string' ? JSON.parse(cloud) : cloud;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = mergeWithDefaults(parsed);
          localStorage.setItem(LS_KEY, JSON.stringify(merged));
          return merged;
        }
      }
    }
  } catch (err) {
    console.warn('[Kanban] Não foi possível ler as filas da nuvem, usando cache local:', err);
  }

  return readLocal() || DEFAULT_KANBAN_COLUMNS;
}

/**
 * Salva as filas na nuvem e no cache local.
 * Retorna false se só deu para salvar localmente (ex.: coluna ainda não migrada).
 */
export async function saveKanbanColumns(columns: KanbanColumnConfig[]): Promise<boolean> {
  localStorage.setItem(LS_KEY, JSON.stringify(columns));

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return false;

    const { error } = await supabase
      .from('company_settings')
      .upsert({
        id: userId,
        kanban_columns: columns,
        updated_at: new Date().toISOString(),
      } as any);

    if (error) {
      console.warn('[Kanban] Falha ao salvar filas na nuvem:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Kanban] Erro de rede ao salvar filas:', err);
    return false;
  }
}

/** True se o pedido entregue já passou da janela de arquivamento. */
export function isArchived(deliveredAt?: string): boolean {
  if (!deliveredAt) return false;
  const ts = new Date(deliveredAt).getTime();
  if (isNaN(ts)) return false;
  return Date.now() - ts > ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
