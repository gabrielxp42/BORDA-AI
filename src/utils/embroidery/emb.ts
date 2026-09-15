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
    if (!p || typeof p.value !== 'number' || !Number.isFinite(p.value)) return null;
    if (integer && !Number.isInteger(p.value)) return null;
    return p.value;
  };

  const units = byName('unit conversion info');
  let mmPerUnit = 0.1;
  let inchesPerUnit = 0.1 / 25.4;
  if (units?.type === 65 && units.bytes?.length === 16) {
    const uv = dataView(units.bytes);
    const m = uv.getFloat64(0, true), inch = uv.getFloat64(8, true);
    if (Number.isFinite(m) && m > 0 && m <= 10) mmPerUnit = m;
    if (Number.isFinite(inch) && inch > 0) inchesPerUnit = inch;
  }

  const stitches = numeric('number of stitches', true);
  requireData(stitches !== null && stitches > 0, 'EMB: quantidade de pontos inválida ou não encontrada.');

  let colors = numeric('number of colours', true);

  const rawWidth = numeric('design width');
  const rawHeight = numeric('design height');
  requireData(rawWidth !== null && rawWidth > 0 && rawHeight !== null && rawHeight > 0, 'EMB: dimensões do bordado inválidas ou não encontradas.');

  const intendedVersion = versionInfo(byName('intended version')?.bytes);
  const creatorVersion = versionInfo(byName('actual creator version')?.bytes);

  const threads = byName('threads');
  let rows: string[][] = [];
  if (typeof threads?.value === 'string') {
    rows = threads.value.trim().split(/\r?\n/).filter(Boolean).map(row => row.split('\t'));
  }

  // Se 'number of colours' não estiver presente ou for <= 0, infere da tabela de linhas ou paradas
  if (!colors || colors <= 0) {
    colors = rows.length > 0 ? rows.length : ((numeric('number of colour changes', true) ?? 0) + 1);
  }
  if (!colors || colors <= 0) colors = 1;

  let threadStitches = 0;
  if (rows.length > 0) {
    threadStitches = rows.reduce((sum, row) => {
      const pts = Number(row[3]);
      return sum + (Number.isFinite(pts) ? pts : 0);
    }, 0);
  }

  const stops = numeric('number of stops', true) ?? rows.length;
  const colorChanges = numeric('number of colour changes', true) ?? (colors > 0 ? colors - 1 : 0);
  const trims = numeric('number of trims', true) ?? 0;

  const source = (name: string) => {
    const p = byName(name);
    return p ? `Propriedade EMB “${name}” (ID ${p.id})` : `Propriedade Wilcom`;
  };

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
    stitches, colors, widthMm: rawWidth * mmPerUnit, heightMm: rawHeight * mmPerUnit, previewBytes,
    sources: {stitches: source('number of stitches'), colors: source('number of colours'), widthMm: `${source('design width')} × unidade interna`, heightMm: `${source('design height')} × unidade interna`},
    diagnostics: {oleVersion: ole.version, streams: ole.streams.map(s => ({path: s.path, size: s.content.length, signature: hex(s.content.subarray(0, 16))})),
      sections: sections.map(s => ({...s, properties: s.properties.map(serialize)})), intendedVersion, creatorVersion, mmPerUnit, inchesPerUnit,
      threadStitches, stops, trims, colorChanges, notes},
  };
}
