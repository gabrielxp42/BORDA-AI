// Bounded MS-CFB reader. Every sector/directory walk has a visited set and a
// file-derived limit; malformed chains cannot hang the browser.
export const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
const END = 0xfffffffe;
const FREE = 0xffffffff;
export function requireData(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function dataView(data: Uint8Array) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}
export function hex(data: Uint8Array) {
  return Array.from(data, b => b.toString(16).padStart(2, '0')).join('');
}
export interface OleStream { name: string; path: string; content: Uint8Array }
export function readOle(data: Uint8Array): { version: number; streams: OleStream[] } {
  requireData(data.length >= 512 && data.length <= MAX_FILE_BYTES && OLE_SIGNATURE.every((b, i) => data[i] === b), 'Container EMB inválido.');
  const h = dataView(data);
  const version = h.getUint16(26, true);
  const shift = h.getUint16(30, true);
  requireData(h.getUint16(28, true) === 0xfffe && ((version === 3 && shift === 9) || (version === 4 && shift === 12)) && h.getUint16(32, true) === 6 && h.getUint32(56, true) === 4096, 'Estrutura OLE não reconhecida.');
  const sectorSize = 2 ** shift;
  requireData(data.length % sectorSize === 0, 'EMB truncado: setor incompleto.');
  const sectorCount = data.length / sectorSize - 1;
  const sector = (id: number) => {
    requireData(Number.isInteger(id) && id >= 0 && id < sectorCount, 'EMB: setor fora do arquivo.');
    return data.subarray((id + 1) * sectorSize, (id + 2) * sectorSize);
  };
  const used = new Set<number>();
  const claim = (id: number) => {
    requireData(!used.has(id), 'EMB: setores sobrepostos ou ciclo.');
    used.add(id);
    return sector(id);
  };
  const fatIds: number[] = [];
  for (let i = 0; i < 109; i++) {
    const id = h.getUint32(76 + i * 4, true);
    if (id !== FREE) fatIds.push(id);
  }
  const difatCount = h.getUint32(72, true);
  requireData(difatCount <= sectorCount, 'EMB: DIFAT inválida.');
  let difat = h.getUint32(68, true);
  for (let i = 0; i < difatCount; i++) {
    const v = dataView(claim(difat));
    for (let j = 0; j < sectorSize / 4 - 1; j++) {
      const id = v.getUint32(j * 4, true);
      if (id !== FREE) fatIds.push(id);
    }
    difat = v.getUint32(sectorSize - 4, true);
  }
  requireData((difat === END || (difatCount === 0 && difat === FREE)) && fatIds.length === h.getUint32(44, true) && fatIds.length <= sectorCount, 'EMB: tamanho de FAT inválido.');
  const fat: number[] = [];
  for (const id of fatIds) {
    const v = dataView(claim(id));
    for (let j = 0; j < sectorSize; j += 4) fat.push(v.getUint32(j, true));
  }
  const readChain = (start: number, size?: number) => {
    if (size === 0) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let id = start;
    while (id !== END) {
      requireData(chunks.length < sectorCount && id < fat.length, 'EMB: cadeia de setores inválida.');
      chunks.push(claim(id));
      id = fat[id];
    }
    const total = chunks.length * sectorSize;
    requireData(size === undefined || (size > total - sectorSize && size <= total), 'EMB: tamanho do stream inconsistente.');
    const result = new Uint8Array(size ?? total);
    chunks.forEach((c, i) => result.set(c.subarray(0, Math.min(sectorSize, result.length - i * sectorSize)), i * sectorSize));
    return result;
  };
  const directory = readChain(h.getUint32(48, true));
  requireData(directory.length >= 128, 'EMB: diretório ausente.');
  const dv = dataView(directory);
  const entries = Array.from({ length: directory.length / 128 }, (_, i) => {
    const o = i * 128;
    const type = directory[o + 66];
    const nameSize = dv.getUint16(o + 64, true);
    requireData(type === 0 || ([1, 2, 5].includes(type) && nameSize >= 2 && nameSize <= 64 && nameSize % 2 === 0 && dv.getUint16(o + nameSize - 2, true) === 0), 'EMB: entrada de diretório inválida.');
    const size = dv.getUint32(o + 120, true) + (version === 4 ? dv.getUint32(o + 124, true) * 2 ** 32 : 0);
    requireData(size <= MAX_FILE_BYTES, 'EMB: stream excede o limite de tamanho.');
    return { type, size, name: type ? new TextDecoder('utf-16le').decode(directory.subarray(o, o + nameSize - 2)) : '', start: dv.getUint32(o + 116, true), left: dv.getUint32(o + 68, true), right: dv.getUint32(o + 72, true), child: dv.getUint32(o + 76, true) };
  });
  requireData(entries[0].type === 5, 'EMB: raiz OLE ausente.');
  const miniFatCount = h.getUint32(64, true);
  requireData(miniFatCount <= sectorCount, 'EMB: MiniFAT inválida.');
  const miniFatBytes = readChain(h.getUint32(60, true), miniFatCount * sectorSize);
  const miniFat = dataView(miniFatBytes);
  const miniStream = readChain(entries[0].start, entries[0].size);
  const miniUsed = new Set<number>();
  const readMini = (start: number, size: number) => {
    const result = new Uint8Array(size);
    let id = start;
    for (let o = 0; o < size; o += 64) {
      requireData(id < miniFatBytes.length / 4 && (id + 1) * 64 <= miniStream.length && !miniUsed.has(id), 'EMB: cadeia de minissetores inválida.');
      miniUsed.add(id);
      result.set(miniStream.subarray(id * 64, id * 64 + Math.min(64, size - o)), o);
      id = miniFat.getUint32(id * 4, true);
    }
    requireData(size === 0 || id === END, 'EMB: tamanho de ministream inconsistente.');
    return result;
  };
  const streams: OleStream[] = [];
  const visited = new Set<number>([0]);
  const pending = [{id: entries[0].child, parent: entries[0].name}];
  const paths = new Set<string>();
  while (pending.length) {
    const {id, parent} = pending.pop()!;
    if (id === FREE) continue;
    requireData(id < entries.length && !visited.has(id), 'EMB: ciclo no diretório.');
    visited.add(id);
    const e = entries[id];
    requireData(e.type === 1 || e.type === 2, 'EMB: entrada OLE inválida.');
    const path = `${parent}/${e.name}`;
    requireData(!paths.has(path.toLowerCase()), 'EMB: stream duplicado.');
    paths.add(path.toLowerCase());
    pending.push({id: e.left, parent}, {id: e.right, parent});
    if (e.type === 1) pending.push({id: e.child, parent: path});
    else streams.push({name: e.name, path, content: e.size < 4096 ? readMini(e.start, e.size) : readChain(e.start, e.size)});
  }
  return {version, streams};
}
