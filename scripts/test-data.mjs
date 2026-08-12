import { readFile } from 'node:fs/promises';

const payload = JSON.parse(await readFile(new URL('../data/offices.json', import.meta.url), 'utf8'));
const requiredFields = ['provincia', 'ciudad', 'establecimiento', 'direccion', 'transportadora'];
if (!Array.isArray(payload.offices) || payload.offices.length < 600) throw new Error('La base de datos no contiene suficientes oficinas');
for (const [index, office] of payload.offices.entries()) {
  for (const field of requiredFields) {
    if (typeof office[field] !== 'string' || !office[field].trim()) throw new Error(`Registro ${index + 1} sin ${field}`);
  }
}
const carriers = new Set(payload.offices.map((office) => office.transportadora));
for (const expected of ['Servientrega', 'LaarCourier', 'Urbano']) {
  if (!carriers.has(expected)) throw new Error(`Falta la transportadora ${expected}`);
}
const ids = payload.offices.map((office) => [office.transportadora, office.provincia, office.ciudad, office.direccion].join('|').toLocaleUpperCase('es'));
if (new Set(ids).size !== ids.length) throw new Error('Hay oficinas duplicadas');
console.log(`OK: ${payload.offices.length} oficinas, ${carriers.size} transportadoras`);
