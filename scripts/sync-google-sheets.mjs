import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SPREADSHEET_ID = '1Ayu_vTj8a5WELVuxZPQ9q5sTTtu10yFa';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?gid=336887803#gid=336887803`;
const SHEETS = ['SERVIENTREGA', 'LAARCOURIER', 'URBANO'];
const PROVINCES = {
  AZUAY: 'Azuay', BOLIVAR: 'Bolívar', CANAR: 'Cañar', CARCHI: 'Carchi', CHIMBORAZO: 'Chimborazo',
  COTOPAXI: 'Cotopaxi', 'EL ORO': 'El Oro', ESMERALDAS: 'Esmeraldas', GALAPAGOS: 'Galápagos',
  GUAYAS: 'Guayas', IMBABURA: 'Imbabura', LOJA: 'Loja', 'LOS RIOS': 'Los Ríos', MANABI: 'Manabí',
  'MORONA SANTIAGO': 'Morona Santiago', NAPO: 'Napo', ORELLANA: 'Orellana', PASTAZA: 'Pastaza',
  PICHINCHA: 'Pichincha', 'SANTA ELENA': 'Santa Elena', 'SANTO DOMINGO': 'Santo Domingo de los Tsáchilas',
  'SANTO DOMINGO DE LOS TSACHILAS': 'Santo Domingo de los Tsáchilas', SUCUMBIOS: 'Sucumbíos',
  TUNGURAHUA: 'Tungurahua', ZAMORA: 'Zamora Chinchipe', 'ZAMORA CHINCHIPE': 'Zamora Chinchipe',
};
const CITY_ALIASES = {
  LIBERTAD: 'La Libertad',
  ORELLANA: 'El Coca',
};
const CITY_PROVINCE_OVERRIDES = {
  AMBATO: 'Tungurahua', BABAHOYO: 'Los Ríos', CUENCA: 'Azuay', GUAYAQUIL: 'Guayas', IBARRA: 'Imbabura',
  LATACUNGA: 'Cotopaxi', LOJA: 'Loja', MACHALA: 'El Oro', MANTA: 'Manabí', PORTOVIEJO: 'Manabí',
  LIBERTAD: 'Santa Elena', ORELLANA: 'Orellana', QUEVEDO: 'Los Ríos', QUITO: 'Pichincha', RIOBAMBA: 'Chimborazo',
  'SANTO DOMINGO': 'Santo Domingo de los Tsáchilas',
};

function clean(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim();
}

function key(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function titleCase(value) {
  return clean(value).toLocaleLowerCase('es').replace(/(^|[\s(/-])([a-záéíóúüñ])/giu, (_, prefix, letter) => prefix + letter.toLocaleUpperCase('es'));
}

function canonicalProvince(value) {
  return PROVINCES[key(value)] || titleCase(value);
}

function canonicalCity(value, cityMap = new Map()) {
  return CITY_ALIASES[key(value)] || cityMap.get(key(value)) || titleCase(value);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

async function fetchSheet(sheet) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  const response = await fetch(url, { headers: { 'user-agent': 'servientregaec-sync/1.0.3' } });
  if (!response.ok) throw new Error(`Google Sheets devolvió ${response.status} para ${sheet}`);
  return parseCsv(await response.text());
}

function findHeader(rows, requiredHeader) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => key(cell) === key(requiredHeader)));
  if (headerIndex < 0) throw new Error(`No se encontró la columna ${requiredHeader}`);
  return { headerIndex, headers: rows[headerIndex].map(key) };
}

function column(headers, candidates) {
  for (const candidate of candidates) {
    const index = headers.indexOf(key(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

function officeNameFromCode(code, city, fallback) {
  let parts = clean(code).split('_').filter(Boolean);
  if (parts.length && key(parts[0]) === key(city)) parts = parts.slice(1);
  return parts.length ? titleCase(parts.join(' ')) : fallback;
}

function cleanAddress(value) {
  return clean(value).replace(/^OFICINA\s+(?:SE|SERVIENTREGA|LAAR|URBANO)\s*-\s*/i, '');
}

function parseServientrega(rows) {
  const { headerIndex, headers } = findHeader(rows, 'Dirección');
  const cityIndex = column(headers, ['Nombre (Ciudad)']);
  const provinceIndex = column(headers, ['Departamento (Provincia)']);
  const addressIndex = column(headers, ['Dirección']);
  const codeIndex = column(headers, ['NOMBRE DE CS']);
  if ([cityIndex, provinceIndex, addressIndex].includes(-1)) throw new Error('Columnas incompletas en SERVIENTREGA');
  return rows.slice(headerIndex + 1).map((row) => {
    const cityRaw = clean(row[cityIndex]);
    const address = cleanAddress(row[addressIndex]);
    if (!cityRaw || !address) return null;
    const city = titleCase(cityRaw);
    return {
      provincia: canonicalProvince(row[provinceIndex]),
      ciudad: city,
      establecimiento: officeNameFromCode(row[codeIndex], cityRaw, 'Centro de Servicio Servientrega'),
      direccion: address,
      transportadora: 'Servientrega',
    };
  }).filter(Boolean);
}

function parseLaar(rows, cityMap) {
  const { headerIndex, headers } = findHeader(rows, 'Dirección');
  const firstIndex = column(headers, ['Nombre (Ciudad)']);
  const secondIndex = column(headers, ['Departamento (Provincia)']);
  const addressIndex = column(headers, ['Dirección']);
  if ([firstIndex, secondIndex, addressIndex].includes(-1)) throw new Error('Columnas incompletas en LAARCOURIER');
  return rows.slice(headerIndex + 1).map((row) => {
    const first = clean(row[firstIndex]);
    const second = clean(row[secondIndex]);
    const firstIsProvince = Boolean(PROVINCES[key(first)]);
    const provinceRaw = firstIsProvince ? first : second;
    const cityRaw = firstIsProvince ? second : first;
    const address = cleanAddress(row[addressIndex]);
    if (!cityRaw || !provinceRaw || !address) return null;
    return {
      provincia: canonicalProvince(provinceRaw),
      ciudad: canonicalCity(cityRaw, cityMap),
      establecimiento: 'Centro de Servicio LaarCourier',
      direccion: address,
      transportadora: 'LaarCourier',
    };
  }).filter(Boolean);
}

function parseUrbano(rows, cityProvinceMap, cityMap) {
  const { headerIndex, headers } = findHeader(rows, 'Dirección');
  const cityIndex = column(headers, ['Nombre (Ciudad)']);
  const locationIndex = column(headers, ['UBICACIÓN']);
  const addressIndex = column(headers, ['Dirección']);
  if ([cityIndex, addressIndex].includes(-1)) throw new Error('Columnas incompletas en URBANO');
  const missing = new Set();
  const offices = rows.slice(headerIndex + 1).map((row) => {
    const cityRaw = clean(row[cityIndex]);
    const address = cleanAddress(row[addressIndex]);
    if (!cityRaw || !address) return null;
    const province = cityProvinceMap.get(key(cityRaw)) || CITY_PROVINCE_OVERRIDES[key(cityRaw)];
    if (!province) {
      missing.add(cityRaw);
      return null;
    }
    const location = clean(row[locationIndex]);
    return {
      provincia: province,
      ciudad: canonicalCity(cityRaw, cityMap),
      establecimiento: location && key(location) !== key(cityRaw) ? titleCase(location) : 'Centro de Servicio Urbano',
      direccion: address,
      transportadora: 'Urbano',
    };
  }).filter(Boolean);
  if (missing.size) throw new Error(`Ciudades de URBANO sin provincia: ${Array.from(missing).join(', ')}`);
  return offices;
}

function dedupeAndSort(offices) {
  const unique = new Map();
  offices.forEach((office) => {
    const id = [office.transportadora, office.provincia, office.ciudad, office.direccion].map(key).join('|');
    if (!unique.has(id)) unique.set(id, office);
  });
  return Array.from(unique.values()).sort((a, b) =>
    a.provincia.localeCompare(b.provincia, 'es') || a.ciudad.localeCompare(b.ciudad, 'es') || a.transportadora.localeCompare(b.transportadora, 'es') || a.establecimiento.localeCompare(b.establecimiento, 'es'));
}

function validate(offices) {
  if (offices.length < 600) throw new Error(`La sincronización produjo muy pocas oficinas (${offices.length})`);
  const required = ['provincia', 'ciudad', 'establecimiento', 'direccion', 'transportadora'];
  offices.forEach((office, index) => {
    required.forEach((field) => {
      if (!clean(office[field])) throw new Error(`Oficina ${index + 1} sin ${field}`);
    });
  });
  for (const carrier of ['Servientrega', 'LaarCourier', 'Urbano']) {
    if (!offices.some((office) => office.transportadora === carrier)) throw new Error(`No se obtuvieron oficinas de ${carrier}`);
  }
}

const rawSheets = Object.fromEntries(await Promise.all(SHEETS.map(async (sheet) => [sheet, await fetchSheet(sheet)])));
const servientrega = parseServientrega(rawSheets.SERVIENTREGA);
const cityMap = new Map(servientrega.map((office) => [key(office.ciudad), office.ciudad]));
const cityProvinceMap = new Map(servientrega.map((office) => [key(office.ciudad), office.provincia]));
const laar = parseLaar(rawSheets.LAARCOURIER, cityMap);
laar.forEach((office) => cityMap.set(key(office.ciudad), office.ciudad));
laar.forEach((office) => cityProvinceMap.set(key(office.ciudad), office.provincia));
const urbano = parseUrbano(rawSheets.URBANO, cityProvinceMap, cityMap);
const offices = dedupeAndSort([...servientrega, ...laar, ...urbano]);
validate(offices);

const byCarrier = Object.fromEntries(['Servientrega', 'LaarCourier', 'Urbano'].map((carrier) => [carrier, offices.filter((office) => office.transportadora === carrier).length]));
const payload = {
  metadata: {
    version: '1.0.3',
    generatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    sheets: SHEETS,
    total: offices.length,
    byCarrier,
  },
  offices,
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, '..', 'data');
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'offices.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Sincronizadas ${offices.length} oficinas: ${Object.entries(byCarrier).map(([name, count]) => `${name}=${count}`).join(', ')}`);
