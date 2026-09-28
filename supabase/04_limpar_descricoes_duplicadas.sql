-- Limpeza das descricoes de order_items corrompidas pela regressao da edicao
-- de pedidos (corrigida no commit 490223f).
--
-- Sintoma: pontos e cores moram dentro da descricao
-- ("Bordado: NOME (5.145 pts, 1 cores)"), mas o prefill da edicao descartava
-- esses numeros. Ao re-salvar, um sufixo falso era anexado:
--   "Bordado: MATRIZ SIMPLES (5.145 pts, 1 cores) (1 pts, 1 cores)"
-- Alguns itens acumularam tres sufixos e/ou "Bordado: Bordado:".
--
-- Executado em 28/09/2026. Alcance: 125 linhas em 81 pedidos.
-- Resultado: 123 alteradas, 2 preservadas (falsos positivos, ver abaixo),
--            0 precos e 0 quantidades tocados.

-- 1) Backup (ja executado)
create table if not exists order_items_backup_desc_20260928 as
select id, order_id, description, quantity, unit_price, total_price, now() as backup_em
from order_items
where description ~* '\)\s*\(\s*[\d.,]+\s*(pts|pontos|ponto|p)\s*,\s*\d+\s*(cores|cor|c)\s*\)\s*$';

insert into order_items_backup_desc_20260928 (id, order_id, description, quantity, unit_price, total_price, backup_em)
select oi.id, oi.order_id, oi.description, oi.quantity, oi.unit_price, oi.total_price, now()
from order_items oi
where oi.description ~* '^\s*(bordado:\s*){2,}'
  and not exists (select 1 from order_items_backup_desc_20260928 b where b.id = oi.id);

-- 2) Limpeza (ja executada)
-- Mantem o PRIMEIRO sufixo (o valor real) e descarta o resto; colapsa
-- prefixos "Bordado:" repetidos. Nao toca em preco nem quantidade.
update order_items oi
set description = regexp_replace(
      regexp_replace(
        oi.description,
        '^(.*?\(\s*[\d.,]+\s*(?:pts|pontos|ponto|p)\s*,\s*\d+\s*(?:cores|cor|c)\s*\)).*$',
        '\1'
      ),
      '^\s*(?:[Bb]ordado:\s*)+',
      'Bordado: '
    )
where exists (select 1 from order_items_backup_desc_20260928 b where b.id = oi.id);

-- 3) Verificacao
select count(*) as linhas_no_backup,
       count(*) filter (where oi.description is distinct from b.description) as alteradas,
       count(*) filter (where oi.unit_price is distinct from b.unit_price
                           or oi.total_price is distinct from b.total_price
                           or oi.quantity  is distinct from b.quantity) as precos_ou_qtd_mexidos
from order_items_backup_desc_20260928 b
join order_items oi on oi.id = b.id;

-- Duas linhas continuam casando com o regex de deteccao e isso esta CORRETO:
-- o nome delas tem parenteses de verdade, entao "(COSTAS) (6.410 pts, 1 cores)"
-- parece dois sufixos mas nao e. O update as deixou intactas de proposito.
--   "Bordado: PROFESSOR (COSTAS) (6.410 pts, 1 cores)"   -- pedido #60
--   "Bordado: MARIA FLOR (DTF) (1 pts, 1 cores)"         -- pedido #202

-- 4) ROLLBACK, se precisar desfazer
-- update order_items oi
-- set description = b.description
-- from order_items_backup_desc_20260928 b
-- where b.id = oi.id;

-- 5) Descartar o backup so depois de validado em uso
-- drop table order_items_backup_desc_20260928;
