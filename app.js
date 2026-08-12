'use strict';

let D = [];
let P = {};
let C = {};
let L = [];
let R = [];
let metadata = {};

async function init() {
  try {
    const response = await fetch('data/offices.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`No se pudo cargar la base de datos (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload.offices) || payload.offices.length === 0) throw new Error('La base de datos está vacía');

    D = payload.offices;
    metadata = payload.metadata || {};
    D.forEach((item) => {
      const provincia = item.provincia.trim();
      const ciudad = item.ciudad.trim();
      const oficina = {
        e: item.establecimiento.trim(),
        d: item.direccion.trim(),
        t: item.transportadora.trim(),
      };
      P[provincia] = P[provincia] || {};
      P[provincia][ciudad] = P[provincia][ciudad] || [];
      P[provincia][ciudad].push(oficina);
      C[ciudad] = C[ciudad] || new Set();
      C[ciudad].add(provincia);
    });

    L = Array.from(new Set(D.map((item) => item.ciudad.trim()))).sort((a, b) => a.localeCompare(b, 'es'));
    popProv();
    popCities();
    upDebug();
    attach();
    setEnabled(true);
    render([]);
  } catch (error) {
    err(`Error: ${error.message}`);
    document.getElementById('resultsCount').textContent = 'No se pudieron cargar las oficinas';
    document.getElementById('resultsGrid').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Intenta recargar la página</div></div>';
  }
}

function setEnabled(enabled) {
  ['provinciaSelect', 'buscarCiudadInput', 'ciudadSelect', 'filtroOficinaInput', 'limpiarBtn', 'copiarTodasBtn', 'autoTestBtn']
    .forEach((id) => { document.getElementById(id).disabled = !enabled; });
}

function popProv() {
  const select = document.getElementById('provinciaSelect');
  select.innerHTML = '<option value="">Todas las provincias</option>';
  Object.keys(P).sort((a, b) => a.localeCompare(b, 'es')).forEach((provincia) => {
    const option = document.createElement('option');
    option.value = provincia;
    option.textContent = provincia;
    select.appendChild(option);
  });
}

function popCities(provincia = '', texto = '') {
  const select = document.getElementById('ciudadSelect');
  const previa = select.value;
  select.innerHTML = '<option value="">Selecciona una ciudad</option>';
  let ciudades = [...L];
  if (provincia) ciudades = ciudades.filter((ciudad) => C[ciudad].has(provincia));
  if (texto) {
    const consulta = normalize(texto);
    ciudades = ciudades.filter((ciudad) => normalize(ciudad).includes(consulta));
  }
  ciudades.forEach((ciudad) => {
    const option = document.createElement('option');
    option.value = ciudad;
    option.textContent = ciudad;
    select.appendChild(option);
  });
  if (ciudades.includes(previa)) select.value = previa;
}

function getOfi(ciudad, provincia = '') {
  if (!ciudad) return [];
  const provincias = provincia ? [provincia] : Array.from(C[ciudad] || []);
  const oficinas = [];
  provincias.forEach((item) => {
    if (P[item] && P[item][ciudad]) {
      P[item][ciudad].forEach((oficina) => oficinas.push({ ...oficina, p: item, c: ciudad }));
    }
  });
  return oficinas;
}

function render(oficinas) {
  R = oficinas;
  document.getElementById('resultsCount').textContent = `${oficinas.length} oficina${oficinas.length !== 1 ? 's' : ''} encontrada${oficinas.length !== 1 ? 's' : ''}`;
  const grid = document.getElementById('resultsGrid');
  if (oficinas.length === 0) {
    const hayCiudad = Boolean(document.getElementById('ciudadSelect').value);
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${hayCiudad ? '🔍' : '📍'}</div><div class="empty-state-text">${hayCiudad ? 'No se encontraron oficinas' : 'Selecciona una ciudad para ver las oficinas disponibles'}</div></div>`;
    return;
  }
  grid.innerHTML = oficinas.map((oficina, index) => `<div class="office-card"><div class="office-name">${esc(oficina.e)}</div><div class="office-address">${esc(oficina.d)}</div><div class="office-meta">${esc(oficina.c)} — ${esc(oficina.p)}</div><div class="office-carrier">Transportadora: ${esc(oficina.t)}</div><button class="copy-btn" onclick="copyOffice(${index})">📋 Copiar</button></div>`).join('');
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    alert(successMessage);
  } catch (_) {
    alert('No se pudo copiar automáticamente. Revisa los permisos del navegador.');
  }
}

function copyOffice(index) {
  const oficina = R[index];
  const text = `RETIRA EN CS. ${oficina.t.toUpperCase()} ${oficina.e} ${oficina.d}\n${oficina.c}, ${oficina.p}`;
  copyText(text, '✓ Copiado');
}

function copyAll() {
  if (R.length === 0) return alert('No hay oficinas');
  const text = R.map((oficina) => `RETIRA EN CS. ${oficina.t.toUpperCase()} ${oficina.e} ${oficina.d}\n${oficina.c}, ${oficina.p}\n`).join('\n');
  copyText(text, `✓ ${R.length} direcciones copiadas`);
}

function clearAll() {
  document.getElementById('provinciaSelect').value = '';
  document.getElementById('buscarCiudadInput').value = '';
  document.getElementById('ciudadSelect').value = '';
  document.getElementById('filtroOficinaInput').value = '';
  popCities();
  render([]);
}

function test() {
  try {
    const ciudad = L[0] || 'Guayaquil';
    const oficinas = getOfi(ciudad);
    const carriers = Array.from(new Set(D.map((item) => item.transportadora))).join(', ');
    document.getElementById('debugContent').innerHTML = `<div class="status-ok">✓ Test OK</div><p>Ciudad: ${esc(ciudad)}</p><p>Oficinas: ${oficinas.length}</p><p>Transportadoras: ${esc(carriers)}</p>`;
  } catch (error) {
    err(`Test falló: ${error.message}`);
  }
}

function upDebug() {
  const counts = metadata.byCarrier || {};
  const carriers = Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(' | ');
  const updated = metadata.generatedAt ? new Date(metadata.generatedAt).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : 'sin fecha';
  document.getElementById('debugContent').innerHTML = `<div class="status-ok">✓ OK</div><p>Provincias: ${Object.keys(P).length} | Ciudades: ${L.length} | Oficinas: ${D.length}</p><p>${esc(carriers)}</p><p>Datos sincronizados: ${esc(updated)}</p>`;
}

function err(message) {
  document.getElementById('debugContent').innerHTML = `<div class="status-error">✕ ${esc(message)}</div>`;
}

function esc(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

function normalize(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function attach() {
  document.getElementById('provinciaSelect').addEventListener('change', () => {
    const provincia = document.getElementById('provinciaSelect').value;
    popCities(provincia, document.getElementById('buscarCiudadInput').value);
    const ciudad = document.getElementById('ciudadSelect').value;
    if (ciudad) filter(getOfi(ciudad, provincia));
    else render([]);
  });
  document.getElementById('buscarCiudadInput').addEventListener('input', () => popCities(document.getElementById('provinciaSelect').value, document.getElementById('buscarCiudadInput').value));
  document.getElementById('ciudadSelect').addEventListener('change', () => {
    const ciudad = document.getElementById('ciudadSelect').value;
    if (!ciudad) return render([]);
    const provincias = Array.from(C[ciudad] || []);
    if (provincias.length === 1 && !document.getElementById('provinciaSelect').value) document.getElementById('provinciaSelect').value = provincias[0];
    filter(getOfi(ciudad, document.getElementById('provinciaSelect').value));
  });
  document.getElementById('filtroOficinaInput').addEventListener('input', () => {
    const ciudad = document.getElementById('ciudadSelect').value;
    if (ciudad) filter(getOfi(ciudad, document.getElementById('provinciaSelect').value));
  });
  document.getElementById('limpiarBtn').addEventListener('click', clearAll);
  document.getElementById('copiarTodasBtn').addEventListener('click', copyAll);
  document.getElementById('autoTestBtn').addEventListener('click', test);
}

function filter(oficinas) {
  const query = normalize(document.getElementById('filtroOficinaInput').value);
  render(query ? oficinas.filter((oficina) => [oficina.e, oficina.d, oficina.p, oficina.t].some((value) => normalize(value).includes(query))) : oficinas);
}

window.copyOffice = copyOffice;
document.addEventListener('DOMContentLoaded', init);
