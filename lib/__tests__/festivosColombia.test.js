const test = require('node:test');
const assert = require('node:assert/strict');
const { esFestivo, nombreDelFestivo, festivosDelAnio, domingoDePascua } = require('../festivosColombia');

// Calendario oficial de Colombia 2026, verificado contra fuentes públicas
// el 2026-11-03. Son los 18 festivos del año.
const FESTIVOS_2026 = {
  '2026-01-01': 'Año Nuevo',
  '2026-01-12': 'Reyes Magos',
  '2026-03-23': 'Día de San José',
  '2026-04-02': 'Jueves Santo',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajo',
  '2026-05-18': 'Ascensión del Señor',
  '2026-06-08': 'Corpus Christi',
  '2026-06-15': 'Sagrado Corazón',
  '2026-06-29': 'San Pedro y San Pablo',
  '2026-07-20': 'Día de la Independencia',
  '2026-08-07': 'Batalla de Boyacá',
  '2026-08-17': 'Asunción de la Virgen',
  '2026-10-12': 'Día de la Raza',
  '2026-11-02': 'Día de Todos los Santos',
  '2026-11-16': 'Independencia de Cartagena',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad',
};

test('el calendario calculado de 2026 coincide exactamente con el oficial (18 festivos)', () => {
  const calculados = festivosDelAnio(2026);
  assert.equal(Object.keys(calculados).length, 18);
  assert.deepEqual(calculados, FESTIVOS_2026);
});

test('Pascua 2026 fue el 5 de abril', () => {
  assert.deepEqual(domingoDePascua(2026), { mes: 4, dia: 5 });
});

test('el caso que reportó la usuaria: lunes 2 de noviembre de 2026 SÍ es festivo', () => {
  assert.equal(esFestivo('2026-11-02'), true);
  assert.equal(nombreDelFestivo('2026-11-02'), 'Día de Todos los Santos');
  // El 1 de noviembre cayó domingo, por eso el festivo se corrió al lunes.
  assert.equal(esFestivo('2026-11-01'), false);
});

test('un lunes cualquiera que no es festivo no se marca como festivo', () => {
  assert.equal(esFestivo('2026-11-09'), false);
  assert.equal(nombreDelFestivo('2026-11-09'), null);
});

test('la Ley Emiliani no mueve un festivo que ya cae lunes', () => {
  // 29 de junio de 2026 cae lunes: se queda en su fecha.
  assert.equal(esFestivo('2026-06-29'), true);
  // 12 de octubre de 2026 también cae lunes.
  assert.equal(esFestivo('2026-10-12'), true);
});

test('funciona en otros años sin tocar el código (2027)', () => {
  // Pascua 2027: 28 de marzo. Jueves y Viernes Santo el 25 y 26 de marzo.
  assert.deepEqual(domingoDePascua(2027), { mes: 3, dia: 28 });
  assert.equal(esFestivo('2027-03-25'), true);
  assert.equal(esFestivo('2027-03-26'), true);
  // Fechas fijas de siempre.
  assert.equal(esFestivo('2027-01-01'), true);
  assert.equal(esFestivo('2027-12-25'), true);
  // Un año normal tiene 18 festivos.
  assert.equal(Object.keys(festivosDelAnio(2027)).length, 18);
});

test('una fecha con formato inválido no revienta, simplemente no es festivo', () => {
  assert.equal(esFestivo(''), false);
  assert.equal(esFestivo('no es fecha'), false);
  assert.equal(esFestivo(null), false);
});
