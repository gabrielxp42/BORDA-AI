// Quem pode abrir o Hub de Cobrancas.
// Os casos sao os perfis REAIS gravados em company_settings.custom_profiles
// (lidos do banco em 01/10/2026), nao exemplos inventados.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Extrai so a funcao do contexto (o arquivo e TSX e importa React).
const src = readFileSync(new URL('../src/contexts/ProfileContext.tsx', import.meta.url), 'utf8');
const m = src.match(/export const podeAcessarCobrancas[\s\S]*?\n};/);
if (!m) throw new Error('podeAcessarCobrancas nao encontrada em ProfileContext.tsx');
const js = m[0]
  .replace('export const', 'const')
  .replace(/\(p\?: ProfilePermissions \| null\): boolean =>/, '(p) =>');
const { podeAcessarCobrancas } = await import(
  'data:text/javascript,' + encodeURIComponent(js + '\nexport { podeAcessarCobrancas };')
);

const perfil = (canSeeFinancials, faturamento, cobrancas) => ({
  canSeeFinancials,
  routes: cobrancas === undefined ? { faturamento } : { faturamento, cobrancas },
});

const casos = [
  // nome,                   ve$,   faturamento, cobrancas,  esperado
  ['CHEFE',                  true,  true,        undefined,  true],
  ['FINANCEIRO ANA',         true,  true,        undefined,  true],
  ['GERENTE (fat. negado)',  true,  false,       undefined,  false],
  ['OPERADOR',               false, false,       undefined,  false],
  ['MESA MARCACAO',          false, false,       undefined,  false],
  ['ATENDIMENTO BALCAO',     false, false,       undefined,  false],
  ['design',                 false, false,       undefined,  false],
  // chave explicita manda em cima da heranca
  ['explicito true',         true,  false,       true,       true],
  ['explicito false',        true,  true,        false,      false],
  // ve$ false sempre barra, mesmo com cobrancas true
  ['ve$ false + cobrancas',  false, true,        true,       false],
];

let ok = 0;
for (const [nome, ve, fat, cob, esperado] of casos) {
  const r = podeAcessarCobrancas(perfil(ve, fat, cob));
  assert.equal(r, esperado, `${nome}: esperava ${esperado}, veio ${r}`);
  ok++;
}
assert.equal(podeAcessarCobrancas(null), false, 'null deve barrar');
assert.equal(podeAcessarCobrancas(undefined), false, 'undefined deve barrar');
assert.equal(podeAcessarCobrancas({}), false, 'objeto vazio deve barrar');
ok += 3;

console.log(`cobrancas-permission: ${ok}/${casos.length + 3} casos OK`);
