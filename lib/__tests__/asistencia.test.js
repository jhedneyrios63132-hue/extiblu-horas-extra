const test = require('node:test');
const assert = require('node:assert/strict');
const { construirAsistencia, clasificarEscaneo, buscarPorNombre } = require('../asistencia');

const FECHA = '2026-09-14';

const maestro = [
  { Cedula: '1', 'NOMBRE OPERARIO': 'ANA MARIA GOMEZ', AREA: 'PRODUCCION' },
  { Cedula: '2', 'NOMBRE OPERARIO': 'CARLOS RUIZ', AREA: 'PRODUCCION' },
  { Cedula: '3', 'NOMBRE OPERARIO': 'DIANA TORRES', AREA: 'LOGISTICA' },
  { Cedula: '4', 'NOMBRE OPERARIO': 'JORGE MEDINA', AREA: 'MANTENIMIENTO' },
  { Cedula: '5', 'NOMBRE OPERARIO': 'SIN PROGRAMAR PEREZ', AREA: 'PRODUCCION' },
];

const registros = [
  // Pendiente por confirmar.
  { Cedula: '1', Fecha: FECHA, Asiste: 'Si', Bodega: 'Bodega 224', Asistio_Real: '' },
  // Ya confirmado como asistido.
  { Cedula: '2', Fecha: FECHA, Asiste: 'Si', Bodega: 'Bodega 224', Asistio_Real: 'Si' },
  // Marcado como que no asistió.
  { Cedula: '3', Fecha: FECHA, Asiste: 'Si', Bodega: 'Bodega 222', Asistio_Real: 'No' },
  // Avisó que no venía: no entra a la lista por confirmar.
  { Cedula: '4', Fecha: FECHA, Asiste: 'No', Motivo: 'Permiso', Bodega: '', Asistio_Real: '' },
  // Registro de otro día: no debe aparecer.
  { Cedula: '5', Fecha: '2026-09-15', Asiste: 'Si', Bodega: 'Bodega 230', Asistio_Real: '' },
];

test('separa a las personas del día en pendientes, confirmados, no asistieron y avisaron', () => {
  const a = construirAsistencia(FECHA, maestro, registros);

  assert.equal(a.totalProgramados, 3); // Ana, Carlos y Diana (Jorge avisó que no)
  assert.deepEqual(a.pendientes.map((p) => p.nombre), ['ANA MARIA GOMEZ']);
  assert.deepEqual(a.confirmados.map((p) => p.nombre), ['CARLOS RUIZ']);
  assert.deepEqual(a.noAsistieron.map((p) => p.nombre), ['DIANA TORRES']);
  assert.deepEqual(a.avisaronQueNo.map((p) => p.nombre), ['JORGE MEDINA']);

  // El nombre y el área se toman del maestro, no de la copia del registro.
  assert.equal(a.pendientes[0].area, 'PRODUCCION');
  assert.equal(a.pendientes[0].bodega, 'Bodega 224');
});

test('escanear a alguien pendiente lo confirma', () => {
  const a = construirAsistencia(FECHA, maestro, registros);
  const r = clasificarEscaneo('1', a, maestro);
  assert.equal(r.tipo, 'pendiente');
  assert.equal(r.persona.nombre, 'ANA MARIA GOMEZ');
});

test('escanear dos veces a la misma persona avisa en vez de repetir', () => {
  const a = construirAsistencia(FECHA, maestro, registros);
  const r = clasificarEscaneo('2', a, maestro);
  assert.equal(r.tipo, 'ya_confirmado');
  assert.match(r.mensaje, /ya se le había confirmado/i);
});

test('escanear a alguien marcado como "no asistió" permite corregirlo', () => {
  const a = construirAsistencia(FECHA, maestro, registros);
  const r = clasificarEscaneo('3', a, maestro);
  assert.equal(r.tipo, 'estaba_como_no');
});

test('quien avisó que no venía pero se presentó se puede marcar asistido', () => {
  const a = construirAsistencia(FECHA, maestro, registros);
  const r = clasificarEscaneo('4', a, maestro);
  assert.equal(r.tipo, 'aviso_que_no_venia');
  assert.equal(r.persona.nombre, 'JORGE MEDINA');
});

test('quien asistió sin estar programado se identifica y pide la Bodega', () => {
  const a = construirAsistencia(FECHA, maestro, registros);
  const r = clasificarEscaneo('5', a, maestro);
  assert.equal(r.tipo, 'sin_programar');
  assert.equal(r.persona.nombre, 'SIN PROGRAMAR PEREZ');
  assert.match(r.mensaje, /Bodega/);
});

test('una cédula que no existe en el maestro nunca se asume', () => {
  const a = construirAsistencia(FECHA, maestro, registros);
  const r = clasificarEscaneo('999999', a, maestro);
  assert.equal(r.tipo, 'desconocida');
  assert.equal(r.persona, null);
});

test('la cédula se compara sin puntos ni espacios', () => {
  const a = construirAsistencia(FECHA, maestro, registros);
  assert.equal(clasificarEscaneo(' 1 ', a, maestro).tipo, 'pendiente');
});

test('la búsqueda por nombre ignora tildes y mayúsculas', () => {
  const lista = [
    { cedula: '1', nombre: 'ANA MARÍA GÓMEZ' },
    { cedula: '2', nombre: 'CARLOS RUIZ' },
  ];
  assert.deepEqual(buscarPorNombre('maria', lista).map((p) => p.cedula), ['1']);
  assert.deepEqual(buscarPorNombre('GOMEZ', lista).map((p) => p.cedula), ['1']);
  // Con una sola letra no busca, para no listar a todo el mundo.
  assert.deepEqual(buscarPorNombre('a', lista), []);
});
