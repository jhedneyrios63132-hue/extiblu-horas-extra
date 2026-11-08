const test = require('node:test');
const assert = require('node:assert/strict');
const { buscarPersonasEnElDia } = require('../busquedaPersona');

// 2026-09-14 es lunes y no es festivo.
const FECHA = '2026-09-14';

const maestro = [
  { Cedula: '1012345678', 'NOMBRE OPERARIO': 'ANA MARÍA GÓMEZ', AREA: 'PRODUCCION' },
  { Cedula: '43567890', 'NOMBRE OPERARIO': 'CARLOS RUIZ', AREA: 'PRODUCCION' },
  { Cedula: '1098765432', 'NOMBRE OPERARIO': 'DIANA TORRES', AREA: 'LOGISTICA' },
  { Cedula: '52345678', 'NOMBRE OPERARIO': 'JORGE MEDINA', AREA: 'MANTENIMIENTO' },
  { Cedula: '60111222', 'NOMBRE OPERARIO': 'SARA DUPLICADA', AREA: 'PRODUCCION' },
];

const registrosDelDia = [
  { Cedula: '1012345678', Fecha: FECHA, Asiste: 'Si', Bodega: 'Bodega 224', Hora_salida_real: '', Asistio_Real: '' },
  { Cedula: '43567890', Fecha: FECHA, Asiste: 'No', Motivo: 'Permiso', Bodega: '', Hora_salida_real: '' },
  { Cedula: '52345678', Fecha: FECHA, Asiste: 'Si', Bodega: 'Bodega 222', Hora_salida_real: '', Asistio_Real: '' },
  { Cedula: '60111222', Fecha: FECHA, Asiste: 'Si', Bodega: 'Bodega 230', Hora_salida_real: '' },
  { Cedula: '60111222', Fecha: FECHA, Asiste: 'Si', Bodega: 'Bodega 230', Hora_salida_real: '17:00' },
];

const SELECCION = ['PRODUCCION', 'LOGISTICA'];

test('dice que una persona SÍ viene, con su bodega y su hora', () => {
  const r = buscarPersonasEnElDia('ana maria', maestro, registrosDelDia, SELECCION);
  assert.equal(r.length, 1);
  assert.equal(r[0].estado, 'viene');
  assert.equal(r[0].bodega, 'Bodega 224');
  assert.equal(r[0].calculo.horaEfectiva, '18:00');
  assert.match(r[0].mensaje, /Sí viene/);
});

test('busca por pedazos del nombre, así que puede devolver varias coincidencias', () => {
  // "ana" está dentro de ANA MARÍA y también dentro de DIANA.
  const r = buscarPersonasEnElDia('ana', maestro, registrosDelDia, SELECCION);
  const nombres = r.map((p) => p.nombre).sort();
  assert.deepEqual(nombres, ['ANA MARÍA GÓMEZ', 'DIANA TORRES']);
});

test('dice que una persona avisó que NO viene, con el motivo', () => {
  const r = buscarPersonasEnElDia('carlos', maestro, registrosDelDia, SELECCION);
  assert.equal(r[0].estado, 'no_viene');
  assert.equal(r[0].motivo, 'Permiso');
  assert.match(r[0].mensaje, /NO viene.*Permiso/);
});

test('dice cuando alguien no está programado ese día', () => {
  const r = buscarPersonasEnElDia('diana', maestro, registrosDelDia, SELECCION);
  assert.equal(r[0].estado, 'faltante');
  assert.match(r[0].mensaje, /No está programada/);
});

test('avisa cuando tiene registros duplicados', () => {
  const r = buscarPersonasEnElDia('sara', maestro, registrosDelDia, SELECCION);
  assert.equal(r[0].estado, 'duplicado');
  assert.equal(r[0].cantidadRegistros, 2);
});

test('encuentra a alguien de un área NO marcada, y lo señala', () => {
  // Jorge es de Mantenimiento, que no está en la selección.
  const r = buscarPersonasEnElDia('jorge', maestro, registrosDelDia, SELECCION);
  assert.equal(r.length, 1);
  assert.equal(r[0].area, 'MANTENIMIENTO');
  assert.equal(r[0].enAreasSeleccionadas, false);
  assert.equal(r[0].estado, 'viene'); // igual muestra el dato
});

test('con todas las áreas (null), nadie queda señalado como fuera del filtro', () => {
  const r = buscarPersonasEnElDia('jorge', maestro, registrosDelDia, null);
  assert.equal(r[0].enAreasSeleccionadas, true);
});

test('busca por cédula, completa o parcial', () => {
  const completa = buscarPersonasEnElDia('1012345678', maestro, registrosDelDia, SELECCION);
  assert.equal(completa[0].nombre, 'ANA MARÍA GÓMEZ');

  const parcial = buscarPersonasEnElDia('435678', maestro, registrosDelDia, SELECCION);
  assert.equal(parcial[0].nombre, 'CARLOS RUIZ');
});

test('la búsqueda por nombre ignora tildes y mayúsculas', () => {
  assert.equal(buscarPersonasEnElDia('MARIA', maestro, registrosDelDia, SELECCION).length, 1);
  assert.equal(buscarPersonasEnElDia('gomez', maestro, registrosDelDia, SELECCION).length, 1);
});

test('con menos de dos caracteres no busca, para no listar a todo el mundo', () => {
  assert.deepEqual(buscarPersonasEnElDia('a', maestro, registrosDelDia, SELECCION), []);
  assert.deepEqual(buscarPersonasEnElDia('', maestro, registrosDelDia, SELECCION), []);
});

test('si no hay coincidencias devuelve una lista vacía, sin romperse', () => {
  assert.deepEqual(buscarPersonasEnElDia('zzzz', maestro, registrosDelDia, SELECCION), []);
});
