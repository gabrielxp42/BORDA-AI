-- ============================================================
-- 02 — Limpeza de despesas/contas fixas duplicadas
-- Rode no SQL Editor do Supabase.
--
-- ⚠️ LEIA ANTES DE RODAR
-- O passo 1 é só CONSULTA (não apaga nada). Rode ele primeiro,
-- confira na tela se as linhas listadas são mesmo duplicatas,
-- e só então rode o passo 2.
--
-- Critério de duplicata: mesmo usuário, mesmo tipo, mesmo valor,
-- mesma descrição e mesmo DIA. Mantém sempre o registro mais
-- ANTIGO (o original) e remove as cópias criadas depois.
-- ============================================================


-- ------------------------------------------------------------
-- PASSO 1 — CONFERIR (não apaga nada)
-- ------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    user_id,
    type,
    description,
    amount,
    date,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, type, lower(trim(description)), amount, date::date
      ORDER BY created_at ASC, id ASC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY user_id, type, lower(trim(description)), amount, date::date
    ) AS total_no_grupo
  FROM public.financial_transactions
)
SELECT
  description,
  amount,
  date::date AS dia,
  total_no_grupo,
  total_no_grupo - 1 AS serao_removidas,
  MIN(created_at) FILTER (WHERE rn = 1) AS original_mantido
FROM ranked
WHERE total_no_grupo > 1
GROUP BY description, amount, date::date, total_no_grupo
ORDER BY serao_removidas DESC, description;


-- ------------------------------------------------------------
-- PASSO 2 — REMOVER as duplicatas
-- Descomente o bloco abaixo (tire o /* e o */) e rode.
-- ------------------------------------------------------------
/*
BEGIN;

-- Backup da tabela antes de apagar (fica salvo no banco).
CREATE TABLE IF NOT EXISTS public.financial_transactions_backup_dedup AS
  SELECT * FROM public.financial_transactions;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, type, lower(trim(description)), amount, date::date
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.financial_transactions
)
DELETE FROM public.financial_transactions ft
USING ranked r
WHERE ft.id = r.id
  AND r.rn > 1;

-- Confira o resultado antes de confirmar:
--   SELECT count(*) FROM public.financial_transactions;
-- Se estiver certo:  COMMIT;
-- Se algo deu errado: ROLLBACK;

COMMIT;
*/


-- ------------------------------------------------------------
-- PASSO 3 — Trava para não duplicar de novo
-- Impede que o mesmo lançamento entre duas vezes no mesmo dia.
-- Rode só DEPOIS de limpar as duplicatas do passo 2.
-- ------------------------------------------------------------
/*
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_sem_duplicata
  ON public.financial_transactions (
    user_id, type, lower(trim(description)), amount, (date::date)
  );
*/
