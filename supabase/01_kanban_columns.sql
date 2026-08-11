-- ============================================================
-- 01 — Filas do Kanban editáveis e sincronizadas entre aparelhos
-- Rode no SQL Editor do Supabase.
-- Seguro para rodar mais de uma vez.
-- ============================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS kanban_columns jsonb;

COMMENT ON COLUMN public.company_settings.kanban_columns IS
  'Configuração das filas do Kanban: [{id, title, color, archivable}]. O id espelha orders.status e nunca muda.';

-- Enquanto esta coluna não existir, o app continua funcionando: ele cai no
-- cache do localStorage e nos nomes padrão (ver src/services/kanbanColumnsService.ts).
