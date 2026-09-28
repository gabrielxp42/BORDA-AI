// Casos tirados das descricoes reais em order_items (producao).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O util e TS puro sem imports: transpila o suficiente removendo tipos.
const src = readFileSync(new URL('../src/utils/itemDescription.ts', import.meta.url), 'utf8');
const js = src
  .replace(/export interface [\s\S]*?\n}\n/g, '')
  .replace(/: Array<\{ pontos: number; cores: number \}>/g, '')
  .replace(/\?: string \| null/g, '')
  .replace(/: DescricaoItem/g, '')
  .replace(/: string\)/g, ')')
  .replace(/: number =>/g, ' =>')
  .replace(/export function/g, 'function');
const { parseItemDescription } = await import(
  'data:text/javascript,' + encodeURIComponent(js + '\nexport { parseItemDescription };')
);

const casos = [
  ['Bordado: MATRIZ SIMPLES (5.145 pts, 1 cores)', 'MATRIZ SIMPLES', 5145, 1],
  ['MATRIZ SIMPLES (5.145 pts, 1 cores)', 'MATRIZ SIMPLES', 5145, 1],
  ['Bordado: BRASIL padrao  (3.746 pts, 4 cores)', 'BRASIL padrao', 3746, 4],
  ['Bordado: VIL193 - STELLA MATER (16.426 pts, 7 cores)', 'VIL193 - STELLA MATER', 16426, 7],
  ['Bordado: Entrada: SACOLA (0 pts, 1 cores)', 'Entrada: SACOLA', 0, 1],
  ['Entrada: PEDIDO', 'Entrada: PEDIDO', 0, 1],
  ['Bordado: Escudo Esportivo em Relevo 3D (45.000 pts, 6 cores)', 'Escudo Esportivo em Relevo 3D', 45000, 6],
  // sufixo duplicado pela regressao: vale o primeiro, o "(1 pts...)" e lixo
  ['Bordado: MATRIZ SIMPLES (5.145 pts, 1 cores) (1 pts, 1 cores)', 'MATRIZ SIMPLES', 5145, 1],
  ['', '', 0, 1],
  [null, '', 0, 1],
];

let ok = 0;
for (const [entrada, nome, pts, cores] of casos) {
  const r = parseItemDescription(entrada);
  assert.equal(r.name, nome, `nome de ${JSON.stringify(entrada)}`);
  assert.equal(r.stitchCount, pts, `pontos de ${JSON.stringify(entrada)}`);
  assert.equal(r.colorCount, cores, `cores de ${JSON.stringify(entrada)}`);
  ok++;
}
console.log(`item-description: ${ok}/${casos.length} casos OK`);
