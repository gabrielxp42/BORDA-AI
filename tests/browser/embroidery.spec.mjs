import {test,expect} from '@playwright/test';
import path from 'node:path';
const fixture=name=>path.resolve('tests/fixtures/embroidery',name);
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
test('matrix creation starts empty, preserves decimal geometry, sends exact values, then clears stale data',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Cadastrar Nova Matriz'}).click();
  const form=page.locator('form');
  const pending=form.getByPlaceholder('Pendente');
  expect(await pending.count()).toBe(4);
  for(const input of await pending.all())await expect(input).toHaveValue('');
  await expect(form.locator('button[type=submit]')).toBeDisabled();
  await page.getByLabel('Cliente de teste').selectOption('test-client');
  await page.getByLabel('Selecionar matriz DST ou EMB').setInputFiles(fixture('LIDER 007.DST'));
  await expect(page.getByText('Dados extraídos e conferidos')).toBeVisible();
  await expect(pending.nth(0)).toHaveValue('5973');await expect(pending.nth(1)).toHaveValue('5');
  await expect(pending.nth(2)).toHaveValue('55.6');await expect(pending.nth(3)).toHaveValue('78.4');
  await page.locator('summary').click();
  await expect(page.getByText('Movimentos decodificados do DST',{exact:true})).toBeVisible();
  await page.screenshot({path:'.tmp/embroidery-browser/matrix-007.png',fullPage:true});
  await form.locator('button[type=submit]').click();
  await expect.poll(()=>page.evaluate(()=>window.__writes.filter(w=>w.table==='matrix_versions').length)).toBe(1);
  const payload=await page.evaluate(()=>window.__writes.find(w=>w.table==='matrix_versions').payload);
  expect(payload).toMatchObject({stitch_count:5973,color_count:5,width_mm:55.6,height_mm:78.4,file_format:'dst'});
  expect(JSON.parse(payload.notes).embroideryAnalysis.sources.heightMm).toContain('Movimentos');
  await page.getByRole('button',{name:'Cadastrar Nova Matriz'}).click();
  for(const input of await pending.all())await expect(input).toHaveValue('');
  await page.getByLabel('Selecionar matriz DST ou EMB').setInputFiles({name:'invalid.emb',mimeType:'application/octet-stream',buffer:Buffer.from('invalid')});
  await expect(page.getByText('Não foi possível validar a matriz',{exact:true})).toBeVisible();
  await expect(form.locator('button[type=submit]')).toBeDisabled();
  for(const input of await pending.all())await expect(input).toHaveValue('');
  expect(errors).toEqual([]);
});
test('EMB save uses full internal precision, input stays read-only',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Cadastrar Nova Matriz'}).click();
  await page.getByLabel('Cliente de teste').selectOption('test-client');
  await page.getByLabel('Selecionar matriz DST ou EMB').setInputFiles(fixture('LIDER020.EMB'));
  await expect(page.getByText('Dados extraídos e conferidos')).toBeVisible();
  const pending=page.locator('form').getByPlaceholder('Pendente');
  await expect(pending.nth(0)).toHaveValue('12564');await expect(pending.nth(0)).toHaveAttribute('readonly','');
  await page.locator('form button[type=submit]').click();
  await expect.poll(()=>page.evaluate(()=>window.__writes.filter(w=>w.table==='matrix_versions').length)).toBe(1);
  const payload=await page.evaluate(()=>window.__writes.find(w=>w.table==='matrix_versions').payload);
  expect(payload.width_mm).toBeCloseTo(14485/180,10);expect(payload.height_mm).toBeCloseTo(12865/180,10);
});
test('order batch keeps each file paired with metadata and rejects invalid batch atomically',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?order');
  await page.getByRole('button',{name:'🧮 Orçamento Completo'}).click();
  await page.getByLabel('Cliente de teste').selectOption('test-client');
  const input=page.getByLabel('Selecionar matriz DST ou EMB');
  await input.setInputFiles([fixture('LIDER 007.DST'),fixture('LIDER020.EMB'),fixture('LIDER016manga.EMB')]);
  await expect(page.getByText('Carrinho do Pedido (3 Matrizes)')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody')).toContainText('LIDER 007');
  await expect(page.locator('tbody')).toContainText('LIDER020');
  await expect(page.locator('tbody')).toContainText('LIDER016manga');
  await expect(page.locator('tbody tr').nth(0)).toContainText('5.973');
  await expect(page.locator('tbody tr').nth(1)).toContainText('12.564');
  await expect(page.locator('tbody tr').nth(2)).toContainText('5.504');
  await page.getByRole('button',{name:'ADICIONAR OUTRA MATRIZ'}).click();
  await input.setInputFiles([{name:'valid.dst',mimeType:'application/octet-stream',buffer:await import('node:fs').then(m=>m.readFileSync(fixture('LIDER020.DST')))},{name:'bad.emb',mimeType:'application/octet-stream',buffer:Buffer.from('bad')}]);
  await expect(page.getByText('Não foi possível validar a matriz',{exact:true})).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('button',{name:'2. Fechamento'})).toBeDisabled();
  await input.setInputFiles(fixture('LIDER020.DST'));
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.screenshot({path:'.tmp/embroidery-browser/order-batch.png',fullPage:true});
  // Select an earlier item: persistence must still keep all four pairs intact.
  await page.locator('tbody tr').first().click();
  await page.getByRole('button',{name:'2. Fechamento'}).click();
  for (const toggle of await page.getByRole('switch').all()) {
    if (await toggle.getAttribute('aria-checked') === 'true') await toggle.click();
  }
  await page.getByRole('button',{name:'Confirmar & Registrar Pedido'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__writes.filter(w=>w.table==='matrix_versions').length)).toBe(4);
  const versions=await page.evaluate(()=>window.__writes.filter(w=>w.table==='matrix_versions').map(w=>w.payload));
  expect(versions.map(v=>[v.file_name,v.stitch_count,v.color_count])).toEqual([
    ['LIDER 007.DST',5973,5],['LIDER020.EMB',12564,2],['LIDER016manga.EMB',5504,2],['LIDER020.DST',12564,2],
  ]);
  expect(versions[0].width_mm).toBe(55.6);
  expect(versions[1].width_mm).toBeCloseTo(14485/180,10);
  expect(versions[2].width_mm).toBeCloseTo(12716/180,10);
  expect(versions[3].width_mm).toBe(80.4);
  await expect.poll(()=>page.evaluate(()=>window.__writes.filter(w=>w.table==='order_items').length)).toBe(1);
  const orderItems=await page.evaluate(()=>window.__writes.find(w=>w.table==='order_items').payload);
  expect(orderItems).toHaveLength(4);
  expect(new Set(orderItems.map(i=>i.matrix_id)).size).toBe(4);
  expect(errors).toEqual([]);
});

test('pending read clears prior values and blocks saving until the new file finishes',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Cadastrar Nova Matriz'}).click();
  const input=page.getByLabel('Selecionar matriz DST ou EMB');
  await input.setInputFiles(fixture('LIDER 007.DST'));
  await expect(page.getByText('Dados extraídos e conferidos')).toBeVisible();
  await page.evaluate(()=>{
    const read=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=function(){return new Promise(resolve=>{window.__finishRead=()=>resolve(read.call(this));});};
  });
  await input.setInputFiles(fixture('LIDER020.EMB'));
  await expect(page.getByText('Validando a matriz…')).toBeVisible();
  for(const field of await page.locator('form').getByPlaceholder('Pendente').all())await expect(field).toHaveValue('');
  await expect(page.locator('form button[type=submit]')).toBeDisabled();
  await page.evaluate(()=>window.__finishRead());
  await expect(page.getByText('Dados extraídos e conferidos')).toBeVisible();
  await expect(page.locator('form').getByPlaceholder('Pendente').first()).toHaveValue('12564');
});
