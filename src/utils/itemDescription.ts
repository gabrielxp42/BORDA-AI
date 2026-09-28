/**
 * Pontos e cores de um item de bordado não têm coluna própria em `order_items`:
 * eles são gravados dentro da descrição, no formato
 * `Bordado: NOME (5.973 pts, 4 cores)` (veja buildItemDesc no SmartCalculatorWorkflow).
 *
 * Ao reabrir um pedido para edição a gente precisa ler esses números de volta.
 * Sem isso os itens voltavam com 0 pontos e a validação de salvamento barrava
 * o pedido inteiro, obrigando o usuário a redigitar matriz por matriz.
 *
 * Descrições reais do banco trazem casos que precisam ser tolerados:
 *   "Bordado: MATRIZ SIMPLES (5.145 pts, 1 cores)"
 *   "MATRIZ SIMPLES (5.145 pts, 1 cores)"            — sem o prefixo
 *   "Bordado: Entrada: SACOLA (0 pts, 1 cores)"      — serviço, zero pontos
 *   "Entrada: PEDIDO"                                — sem sufixo nenhum
 *   "Bordado: BRASIL padrao  (3.746 pts, 4 cores)"   — espaço duplo
 *   "Bordado: MATRIZ SIMPLES (5.145 pts, 1 cores) (1 pts, 1 cores)"
 *       — sufixo duplicado, resultado de uma edição salva com o estado zerado.
 *         O valor verdadeiro é o primeiro; o último é o lixo da regressão.
 */

export interface DescricaoItem {
  /** Nome da matriz, sem o prefixo "Bordado:" e sem sufixo de pontos/cores. */
  name: string;
  /** 0 quando a descrição não carrega pontos (serviços, DTF, taxas). */
  stitchCount: number;
  /** 1 como piso, para não zerar o cálculo de tempo. */
  colorCount: number;
}

// Aceita "5.973 pts, 4 cores" e variações: pts/pontos/ponto/p e cores/cor/c.
const SUFIXO = /\s*\(\s*([\d.,]+)\s*(?:pts|pontos|ponto|p)\s*,\s*(\d+)\s*(?:cores|cor|c)\s*\)\s*$/i;

/** "5.973" (pt-BR) e "5973" viram 5973. "0" vira 0. */
const paraNumero = (texto: string): number => {
  const n = parseInt(texto.replace(/[.,]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function parseItemDescription(description?: string | null): DescricaoItem {
  const bruto = (description || '').replace(/<!--[\s\S]*?-->/g, '').trim();

  if (!bruto || bruto.includes('PAYMENT_METADATA') || bruto.startsWith('{')) {
    return { name: '', stitchCount: 0, colorCount: 1 };
  }

  // Descasca todos os sufixos empilhados, guardando cada um na ordem.
  const encontrados: Array<{ pontos: number; cores: number }> = [];
  let restante = bruto;
  for (let i = 0; i < 5; i++) {
    const match = restante.match(SUFIXO);
    if (!match) break;
    encontrados.unshift({
      pontos: paraNumero(match[1]),
      cores: Math.max(1, parseInt(match[2], 10) || 1),
    });
    restante = restante.slice(0, match.index).trim();
  }

  const name = restante.replace(/^bordado:\s*/i, '').replace(/\s{2,}/g, ' ').trim();

  // O primeiro sufixo é o original; qualquer outro veio de re-salvamento zerado.
  const original = encontrados[0];
  if (!original) {
    return { name, stitchCount: 0, colorCount: 1 };
  }

  return { name, stitchCount: original.pontos, colorCount: original.cores };
}
