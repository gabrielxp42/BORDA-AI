// Quanto de fato entrou em caixa por pedido, honrando desconto a vista e sinal.
// Caso-guia: video do Ramon em 09/10/2026 — ele quitou um pedido com R$ 130 de
// desconto e o caixa continuou mostrando o valor cheio.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Compila o util de verdade em vez de extrair trechos com regex: assim o teste
// exercita exatamente o codigo que vai para producao.
const entrada = fileURLToPath(new URL('../src/utils/paymentHelper.ts', import.meta.url));
// Emite dentro do projeto: de fora, o node nao resolveria os imports do
// proprio util (date-fns) contra o node_modules daqui.
const base = fileURLToPath(new URL('../node_modules/.cache/', import.meta.url));
mkdirSync(base, { recursive: true });
const saida = mkdtempSync(join(base, 'paymenthelper-'));
try {
  execFileSync(
    'npx',
    ['tsc', entrada, '--outDir', saida, '--module', 'esnext', '--target', 'es2020', '--skipLibCheck'],
    { stdio: 'pipe', shell: process.platform === 'win32' }
  );
} catch {
  // Compilado isolado, o tsc nao resolve os imports do projeto (date-fns) e sai
  // com erro — mas emite o JS do mesmo jeito, que e o que o teste precisa.
}
if (!existsSync(join(saida, 'paymentHelper.js'))) {
  throw new Error('tsc nao emitiu paymentHelper.js');
}
const { getOrderReceivedValue, getOrderNetValue, getDiscountAmount } =
  await import(pathToFileURL(join(saida, 'paymentHelper.js')).href);

const notas = (meta) =>
  meta ? `obs do pedido<!--PAYMENT_METADATA:${JSON.stringify(meta)}-->` : 'obs do pedido';

let n = 0;
const checa = (real, esperado, msg) => { assert.equal(real, esperado, msg); n++; };

// --- O caso do video: pedido de 1000, desconto de 130, quitado ---
const comDesconto = { total_amount: 1000, payment_status: 'paid', notes: notas({ discountAmount: 130 }) };
checa(getOrderReceivedValue(comDesconto), 870, 'pago com desconto entra liquido no caixa');
checa(getOrderNetValue(comDesconto), 870, 'valor liquido do pedido');
checa(getDiscountAmount(comDesconto), 130, 'desconto lido do metadata');

// --- Sem desconto nada muda ---
const semDesconto = { total_amount: 1000, payment_status: 'paid', notes: notas({}) };
checa(getOrderReceivedValue(semDesconto), 1000, 'pago sem desconto');
checa(getOrderNetValue(semDesconto), 1000, 'liquido sem desconto');

// --- Sinal continua valendo o sinal, nao o total ---
checa(
  getOrderReceivedValue({ total_amount: 1000, payment_status: 'half_paid', notes: notas({ depositAmount: 400 }) }),
  400, 'sinal registrado'
);
checa(
  getOrderReceivedValue({ total_amount: 1000, payment_status: 'half_paid', notes: notas({}) }),
  500, 'sinal sem registro cai para metade'
);

// --- Pendente nao entrou nada ---
checa(getOrderReceivedValue({ total_amount: 1000, payment_status: 'pending', notes: notas({}) }), 0, 'pendente');

// --- Bordas ---
checa(
  getOrderReceivedValue({ total_amount: 100, payment_status: 'paid', notes: notas({ discountAmount: 500 }) }),
  0, 'desconto maior que o total nao vira negativo'
);
checa(getDiscountAmount({ total_amount: 100, payment_status: 'paid', notes: notas({ discountAmount: -5 }) }), 0, 'desconto negativo ignorado');
checa(getDiscountAmount({ total_amount: 100, payment_status: 'paid', notes: 'sem metadata' }), 0, 'sem metadata');
checa(getOrderReceivedValue({ total_amount: null, payment_status: 'paid', notes: null }), 0, 'pedido sem valor');
checa(getOrderReceivedValue({ total_amount: '1000', payment_status: 'paid', notes: notas({ discountAmount: 130 }) }), 870, 'total como texto');

console.log(`valor-recebido: ${n}/${n} casos OK`);
