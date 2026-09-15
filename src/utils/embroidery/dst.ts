import {requireData} from './ole';

export function readDst(data: Uint8Array) {
  requireData(data.length >= 515, 'DST truncado: cabeçalho ou comandos ausentes.');
  const headerText = new TextDecoder('ascii').decode(data.subarray(0, 512));
  const header: Record<string, number | null> = {};
  for (const key of ['ST', 'CO', '+X', '-X', '+Y', '-Y']) {
    const fields = headerText.split(/[\r\n]/).filter(line => line.startsWith(`${key}:`));
    const value = fields.length === 1 ? fields[0].slice(3).trim() : '';
    header[key] = /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  }
  const counts = { normal: 0, jumps: 0, colorChanges: 0, sequinMode: 0, sequinEject: 0, end: 0, total: 0 };
  let x = 0, y = 0, minX = 0, maxX = 0, minY = 0, maxY = 0;
  let sequin = false, endOffset = -1, jumpRun = 0, trimCandidates = 0;
  const finishJumps = () => { if (jumpRun >= 3) trimCandidates++; jumpRun = 0; };
  for (let offset = 512; offset + 2 < data.length; offset += 3) {
    const a = data[offset], b = data[offset + 1], c = data[offset + 2];
    requireData((c & 3) === 3, `DST: comando inválido na posição ${offset}.`);
    counts.total++;
    if ((c & 0xf3) === 0xf3) { counts.end++; endOffset = offset; finishJumps(); break; }
    // Balanced ternary displacements, in tenths of a millimetre.
    const dx = (a & 1 ? 1 : 0) - (a & 2 ? 1 : 0) + (a & 4 ? 9 : 0) - (a & 8 ? 9 : 0)
      + (b & 1 ? 3 : 0) - (b & 2 ? 3 : 0) + (b & 4 ? 27 : 0) - (b & 8 ? 27 : 0) + (c & 4 ? 81 : 0) - (c & 8 ? 81 : 0);
    const dy = (a & 128 ? 1 : 0) - (a & 64 ? 1 : 0) + (a & 32 ? 9 : 0) - (a & 16 ? 9 : 0)
      + (b & 128 ? 3 : 0) - (b & 64 ? 3 : 0) + (b & 32 ? 27 : 0) - (b & 16 ? 27 : 0) + (c & 32 ? 81 : 0) - (c & 16 ? 81 : 0);
    if ((c & 0xc3) === 0xc3) { counts.colorChanges++; finishJumps(); }
    else if ((c & 0x43) === 0x43) { counts.sequinMode++; sequin = !sequin; finishJumps(); }
    else if ((c & 0x83) === 0x83) {
      if (sequin) { counts.sequinEject++; finishJumps(); } else { counts.jumps++; jumpRun++; }
    } else { counts.normal++; finishJumps(); }
    x += dx; y += dy;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  requireData(endOffset >= 0, 'DST truncado: comando final ausente.');
  requireData(counts.normal + counts.sequinEject > 0, 'DST sem pontos de bordado.');
  requireData(data.subarray(endOffset + 3).every(b => b === 0 || b === 0x1a || b === 0x20), 'DST: dados inesperados após o comando final.');
  const widthMm = (maxX - minX) / 10, heightMm = (maxY - minY) / 10;
  const extent = (positive: string, negative: string) => header[positive] !== null && header[negative] !== null ? (header[positive]! + header[negative]!) / 10 : null;
  const declaredWidthMm = extent('+X', '-X'), declaredHeightMm = extent('+Y', '-Y');
  const consistent = {
    // Observed Wilcom ST includes END; some other writers exclude END.
    stitches: header.ST === counts.total || header.ST === counts.total - 1,
    colors: header.CO === counts.colorChanges,
    width: header['+X'] === maxX && header['-X'] === -minX,
    height: header['+Y'] === maxY && header['-Y'] === -minY,
  };
  return {
    stitches: consistent.stitches ? header.ST! : counts.total,
    colors: counts.colorChanges + 1, widthMm, heightMm,
    sources: {
      stitches: consistent.stitches ? 'Cabeçalho DST ST, conferido com os comandos' : 'Comandos DST, incluindo o comando final',
      colors: consistent.colors ? 'Cabeçalho DST CO + etapa inicial, conferido com os comandos' : 'Etapas de cor dos comandos DST',
      widthMm: consistent.width ? 'Cabeçalho DST, conferido com os movimentos' : 'Movimentos decodificados do DST',
      heightMm: consistent.height ? 'Cabeçalho DST, conferido com os movimentos' : 'Movimentos decodificados do DST',
    },
    diagnostics: {headerText, header, counts, endOffset, extents: {minX, maxX, minY, maxY}, declaredWidthMm, declaredHeightMm, consistent, trimCandidates, trims: null, stops: null,
      notes: ['DST registra etapas de cor; não identifica cores únicas. Stops e trims não têm comandos exclusivos; sequências de saltos são apenas candidatos a corte.']},
  };
}
