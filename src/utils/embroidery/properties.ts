import {dataView, hex, requireData} from './ole';

export interface OleProperty {
  id: number; type: number | null; offset: number; name?: string;
  value?: number | string; bytes?: Uint8Array;
}
export interface PropertySection { formatId: string; offset: number; properties: OleProperty[] }
export function readPropertySet(data: Uint8Array): PropertySection[] {
  const v = dataView(data);
  const bounds = (o: number, n: number, end = data.length) => requireData(Number.isSafeInteger(o) && n >= 0 && o >= 0 && o + n <= end, 'EMB: propriedade fora dos limites.');
  bounds(0, 28);
  requireData(v.getUint16(0, true) === 0xfffe && v.getUint16(2, true) <= 1, 'EMB: PropertySet inválido.');
  const count = v.getUint32(24, true);
  requireData(count > 0 && count <= 2, 'EMB: número de seções inválido.');
  bounds(28, count * 20);
  const sections: PropertySection[] = [];
  const sectionRanges: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const start = v.getUint32(44 + i * 20, true);
    requireData(start >= 28 + count * 20, 'EMB: seção sobrepõe o cabeçalho.');
    bounds(start, 8);
    const size = v.getUint32(start, true);
    bounds(start, size);
    const end = start + size;
    requireData(!sectionRanges.some(([a,b]) => start < b && end > a), 'EMB: seções sobrepostas.');
    sectionRanges.push([start,end]);
    const n = v.getUint32(start + 4, true);
    requireData(n > 0 && n <= 4096, 'EMB: quantidade de propriedades inválida.');
    bounds(start + 8, n * 8, end);
    const ids = new Set<number>();
    const offsets = new Set<number>();
    const properties: OleProperty[] = [];
    for (let j = 0; j < n; j++) {
      const id = v.getUint32(start + 8 + j * 8, true);
      const offset = start + v.getUint32(start + 12 + j * 8, true);
      requireData(!ids.has(id) && !offsets.has(offset) && offset >= start + 8 + n * 8, 'EMB: tabela de propriedades inválida.');
      bounds(offset, 4, end);
      ids.add(id); offsets.add(offset);
      properties.push({id, offset, type: id === 0 ? null : v.getUint32(offset, true)});
    }
    const sorted = [...offsets].sort((a,b) => a-b);
    const limit = (o: number) => sorted[sorted.indexOf(o) + 1] ?? end;
    const cp = properties.find(p => p.id === 1);
    requireData(cp?.type === 2, 'EMB: codificação de propriedades ausente.');
    bounds(cp.offset, 6, limit(cp.offset));
    const codePage = v.getUint16(cp.offset + 4, true);
    const encoding = codePage === 1200 ? 'utf-16le' : codePage === 65001 ? 'utf-8' : codePage === 1252 ? 'windows-1252' : null;
    requireData(encoding, `EMB: codificação ${codePage} não reconhecida.`);
    const decode = (o: number, length: number, unicode: boolean, propEnd: number) => {
      requireData(length > 0, 'EMB: texto sem terminador.');
      const bytes = length * (unicode ? 2 : 1);
      bounds(o, bytes, propEnd);
      requireData(data[o + bytes - 1] === 0 && (!unicode || data[o + bytes - 2] === 0), 'EMB: texto truncado.');
      return new TextDecoder(unicode ? 'utf-16le' : encoding).decode(data.subarray(o, o + bytes - (unicode ? 2 : 1)));
    };
    for (const p of properties) {
      const o = p.offset, e = limit(o);
      if (p.type === 2) { bounds(o, 6, e); p.value = v.getInt16(o + 4, true); }
      else if (p.type === 3 || p.type === 19) { bounds(o, 8, e); p.value = p.type === 3 ? v.getInt32(o + 4, true) : v.getUint32(o + 4, true); }
      else if (p.type === 5) { bounds(o, 12, e); p.value = v.getFloat64(o + 4, true); requireData(Number.isFinite(p.value), 'EMB: número inválido.'); }
      else if (p.type === 30 || p.type === 31) { bounds(o, 8, e); p.value = decode(o + 8, v.getUint32(o + 4, true), p.type === 31 || codePage === 1200, e); }
      else if (p.type === 65) { bounds(o, 8, e); const length = v.getUint32(o + 4, true); bounds(o + 8, length, e); p.bytes = data.subarray(o + 8, o + 8 + length); }
    }
    const dictionary = properties.find(p => p.id === 0);
    if (dictionary) {
      let o = dictionary.offset;
      const e = limit(o);
      const entries = v.getUint32(o, true); o += 4;
      requireData(entries <= 4096, 'EMB: dicionário excessivo.');
      const names = new Map<number,string>();
      const seenNames = new Set<string>();
      for (let j = 0; j < entries; j++) {
        bounds(o, 8, e);
        const id = v.getUint32(o, true), length = v.getUint32(o + 4, true); o += 8;
        const name = decode(o, length, codePage === 1200, e).toLowerCase().trim();
        requireData(!names.has(id) && (!name || !seenNames.has(name)), 'EMB: dicionário ambíguo.');
        names.set(id, name); if (name) seenNames.add(name);
        o += length * (codePage === 1200 ? 2 : 1);
        if (codePage === 1200) o = Math.ceil(o / 4) * 4;
      }
      for (const p of properties) p.name = names.get(p.id);
    }
    sections.push({formatId: hex(data.subarray(28 + i * 20, 44 + i * 20)), offset: start, properties});
  }
  return sections;
}
