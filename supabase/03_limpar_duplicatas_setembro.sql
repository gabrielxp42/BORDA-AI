-- ============================================================
-- 03 — Limpeza das duplicatas que inflam o caixa
--
-- Diagnóstico feito em 03/09/2026 no banco de produção:
--   20 grupos duplicados · 28 registros sobrando · R$ 22.445,27 inflados
--
-- Exemplos encontrados:
--   "energia elétrica ateliê"      R$ 620,00  — 4x no mesmo dia
--   "manutenção preventiva tajima" R$ 480,00  — 4x no mesmo dia
--   "linhas poliéster & agulhas"   R$ 350,00  — 4x no mesmo dia
--   "polo nf 1470"                 R$ 10.250,00 — 2x
--   "parcela 1/1 - acordo marcel"  R$ 1.971,40  — 2x
--
-- Critério: mesmo usuário, tipo, descrição, valor e DIA.
-- Mantém sempre o registro mais ANTIGO e remove as cópias.
--
-- ⚠️ Rode os passos NA ORDEM. O passo 1 não altera nada.
-- ============================================================


-- ------------------------------------------------------------
-- PASSO 1 — CONFERIR (não apaga nada)
-- Olhe a lista e confirme que são mesmo duplicatas.
-- ------------------------------------------------------------
SELECT
  description                     AS descricao,
  type                            AS tipo,
  amount                          AS valor,
  date::date                      AS dia,
  COUNT(*)                        AS vezes,
  COUNT(*) - 1                    AS serao_removidas,
  (COUNT(*) - 1) * amount         AS valor_a_corrigir
FROM financial_transactions
GROUP BY description, type, amount, date::date
HAVING COUNT(*) > 1
ORDER BY valor_a_corrigir DESC;


-- ------------------------------------------------------------
-- PASSO 2 — REMOVER
-- Descomente o bloco (tire /* e */) e execute.
-- Cria um backup completo da tabela antes de apagar.
-- ------------------------------------------------------------
/*
BEGIN;

CREATE TABLE IF NOT EXISTS financial_transactions_backup_20260903 AS
  SELECT * FROM financial_transactions;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, type, lower(trim(description)), amount, date::date
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM financial_transactions
)
DELETE FROM financial_transactions ft
USING ranked r
WHERE ft.id = r.id
  AND r.rn > 1;

-- Confira antes de confirmar:
--   SELECT COUNT(*) FROM financial_transactions;                      -- deve cair 28
--   SELECT COUNT(*) FROM financial_transactions_backup_20260903;      -- total anterior
COMMIT;
-- Se algo parecer errado antes do COMMIT: ROLLBACK;
*/


-- ------------------------------------------------------------
-- PASSO 3 — TRAVA CONTRA NOVAS DUPLICATAS
--
-- Importante: uma duplicata foi criada em 31/08, DEPOIS das correções de
-- código. Isso indica que algo ainda insere duas vezes — provavelmente clique
-- duplo ou reenvio. Este índice bloqueia no banco, que é a única camada que
-- não depende do front se comportar.
--
-- Rode só DEPOIS do passo 2 (com duplicatas existentes ele falha).
-- ------------------------------------------------------------
/*
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_sem_duplicata
  ON financial_transactions (
    user_id, type, lower(trim(description)), amount, (date::date)
  );
*/


-- ------------------------------------------------------------
-- DESFAZER (se precisar voltar atrás depois do COMMIT)
-- ------------------------------------------------------------
/*
BEGIN;
  DROP INDEX IF EXISTS financial_transactions_sem_duplicata;
  DELETE FROM financial_transactions;
  INSERT INTO financial_transactions
    SELECT * FROM financial_transactions_backup_20260903;
COMMIT;
*/
