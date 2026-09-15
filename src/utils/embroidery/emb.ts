import {unzlibSync} from 'fflate';
import {dataView, hex, readOle, requireData} from './ole';
import {readPropertySet, type OleProperty} from './properties';

const DDD_FORMAT_ID = '162de1d8201299865a719181895c1b63';
function versionInfo(bytes?: Uint8Array) {
  if (!bytes) return null;
  const v = dataView(bytes);
  let offset = 0, nodes = 0;
  const read = (depth: number): {id: number; type: number; value: unknown} => {
    requireData(depth <= 12 && ++nodes <= 1024 && offset + 12 <= bytes.length, 'EMB: versão estruturada inválida.');
    const id = v.getUint32(offset, true), type = v.getUint16(offset + 6, true), count = v.getUint32(offset + 8, true);
    offset += 12;
    requireData(count <= 4096, 'EMB: versão excede os limites.');
    let value: unknown;
    if (type === 6) value = Array.from({length: count}, () => read(depth + 1));
    else {
      const size = count * (type === 5 ? 2 : 4);
      requireData([1, 2, 5].includes(type) && offset + size <= bytes.length, 'EMB: tipo de versão não reconhecido.');
      value = type === 5 ? new TextDecoder('utf-16le').decode(bytes.subarray(offset, offset + size)).replace(/\0+$/, '')
        : Array.from({length: count}, (_, i) => v.getInt32(offset + i * 4, true));
      offset += size;
    }
    return {id, type, value};
  };
  const tree = read(0);
  requireData(offset === bytes.length, 'EMB: versão com dados excedentes.');
  return tree;
}

export function readEmb(data: Uint8Array) {
  const ole = readOle(data);
  const candidates = ole.streams.filter(s => s.name === '\x05WilcomDesignInformationDDD');
  requireData(candidates.length === 1, 'Não foi possível validar os metadados deste EMB: propriedades Wilcom ausentes ou ambíguas.');
  const sections = readPropertySet(candidates[0].content);
  const section = sections.find(s => s.formatId === DDD_FORMAT_ID);
  requireData(section, 'EMB: esquema de propriedades Wilcom não reconhecido.');
  const byName = (name: string) => section.properties.find(p => p.name === name);
  const numeric = (name: string, integer = false) => {
    const p = byName(name);
    requireData(p && (integer ? p.type === 3 || p.type === 19 : [3, 5, 19].includes(p.type!)) && typeof p.value === 'number' && Number.isFinite(p.value) && (!integer || Number.isInteger(p.value)), `EMB: propriedade "${name}" ausente ou inválida.`);
    return p.value;
  };
  const units = byName('unit conversion info');
  requireData(units?.type === 65 && units.bytes?.length === 16, 'EMB: unidade de medida não comprovada.');
  const uv = dataView(units.bytes);
  const mmPerUnit = uv.getFloat64(0, true), inchesPerUnit = uv.getFloat64(8, true);
  requireData(Number.isFinite(mmPerUnit) && mmPerUnit > 0 && mmPerUnit <= 10 && Number.isFinite(inchesPerUnit) && inchesPerUnit > 0 && Math.abs(mmPerUnit / inchesPerUnit - 25.4) < 1e-7, 'EMB: fatores de unidade inconsistentes.');
  const stitches = numeric('number of stitches', true), colors = numeric('number of colours', true);
  const width = numeric('design width'), height = numeric('design height');
  requireData(Math.abs(numeric('design left') + numeric('design right') - width) < 1e-6 && Math.abs(numeric('design up') + numeric('design down') - height) < 1e-6, 'EMB: dimensões divergem dos limites internos.');
  const intendedVersion = versionInfo(byName('intended version')?.bytes);
  const creatorVersion = versionInfo(byName('actual creator version')?.bytes);
  requireData(intendedVersion && creatorVersion, 'EMB: identificação de versão ausente.');
  const threads = byName('threads');
  requireData(typeof threads?.value === 'string', 'EMB: tabela de linhas ausente.');
  const rows = threads.value.trim().split(/\r?\n/).filter(Boolean).map(row => row.split('\t'));
  requireData(rows.length === colors && rows.every((row, i) => row.length >= 10 && Number(row[0]) === i + 1 && /^\d+$/.test(row[3])), 'EMB: cores divergem da tabela de linhas.');
  const threadStitches = rows.reduce((sum, row) => sum + Number(row[3]), 0);
  const stops = numeric('number of stops', true);
  // Per-thread totals omit control records. Do not equate the difference to
  // stops: LIDER 007 has five stops but a difference of two records.
  requireData(threadStitches > 0 && threadStitches <= stitches, 'EMB: tabela de linhas excede o total de pontos.');
  const source = (name: string) => `Propriedade EMB “${name}” (ID ${byName(name)!.id})`;
  let previewBytes: Uint8Array | undefined;
  const preview = ole.streams.find(s => s.name === 'TRUEVIEW_ICON')?.content;
  const notes: string[] = [];
  if (preview) {
    try {
      requireData(preview.length > 6, 'Preview truncado.');
      const size = dataView(preview).getUint32(0, true);
      requireData(size > 0 && size <= 8 * 1024 * 1024, 'Preview excede o limite.');
      const decoded = unzlibSync(preview.subarray(4), {out: new Uint8Array(size)});
      requireData(decoded.length === size && decoded[0] === 0xff && decoded[1] === 0xd8 && decoded[size - 2] === 0xff && decoded[size - 1] === 0xd9, 'Preview JPEG inválido.');
      previewBytes = decoded;
    } catch { notes.push('Miniatura indisponível; metadados independentes da imagem.'); }
  }
  const serialize = (p: OleProperty) => ({...p, bytes: p.bytes ? hex(p.bytes) : undefined});
  return {
    stitches, colors, widthMm: width * mmPerUnit, heightMm: height * mmPerUnit, previewBytes,
    sources: {stitches: source('number of stitches'), colors: source('number of colours'), widthMm: `${source('design width')} × unidade interna`, heightMm: `${source('design height')} × unidade interna`},
    diagnostics: {oleVersion: ole.version, streams: ole.streams.map(s => ({path: s.path, size: s.content.length, signature: hex(s.content.subarray(0, 16))})),
      sections: sections.map(s => ({...s, properties: s.properties.map(serialize)})), intendedVersion, creatorVersion, mmPerUnit, inchesPerUnit,
      threadStitches, stops, trims: numeric('number of trims', true), colorChanges: numeric('number of colour changes', true), notes},
  };
}
