const test = require('node:test');
const assert = require('node:assert/strict');
const { construirRespuesta } = require('../resumenAdministrador');

// 2026-09-14 es lunes (ver reglasNegocio.test.js).
const FECHA = '2026-09-14';

const maestroCompleto = [
  { Cedula: '1', 'NOMBRE OPERARIO': 'Ana Producción', AREA: 'PRODUCCION' },
  { Cedula: '2', 'NOMBRE OPERARIO': 'Beto Producción', AREA: 'PRODUCCION' },
  { Cedula: '3', 'NOMBRE OPERARIO': 'Carla Logística', AREA: 'LOGISTICA' },
  { Cedula: '4', 'NOMBRE OPERARIO': 'Dora Mantenimiento', AREA: 'MANTENIMIENTO' },
  { Cedula: '5', 'NOMBRE OPERARIO': 'Eva Producción', AREA: 'PRODUCCION' },
  { Cedula: '6', 'NOMBRE OPERARIO': 'Fabio Producción', AREA: 'PRODUCCION' },
];

const registros = [
  // Ana: asiste, sin hora real -> se asume 6pm, 3h extra, con alimentación.
  { Cedula: '1', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 222', Hora_salida_real: '' },
  // Beto: no asiste -> programado, sin horas ni alimentación.
  { Cedula: '2', Fecha: FECHA, Asiste: 'No', Motivo: 'Cita médica', Bodega: '', Hora_salida_real: '' },
  // Carla (Logística): asiste, sale a las 16:00 -> 1h extra, sin alimentación.
  { Cedula: '3', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 224', Hora_salida_real: '16:00' },
  // Eva: DOS registros el mismo día -> duplicado.
  { Cedula: '5', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 230', Hora_salida_real: '17:00' },
  { Cedula: '5', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 230', Hora_salida_real: '18:00' },
  // Dora (Mantenimiento): fuera del alcance general de la herramienta.
  { Cedula: '4', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 222', Hora_salida_real: '' },
  // Cédula que no existe en el maestro.
  { Cedula: '999', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 222', Hora_salida_real: '' },
  // Registro de otro día: no debe contarse para nada.
  { Cedula: '6', Fecha: '2026-09-15', Asiste: 'Si', Motivo: '', Bodega: 'Bodega 222', Hora_salida_real: '' },
];

test('PRODUCCION: totales, programados, faltante, duplicado y fuera de alcance', () => {
  const r = construirRespuesta({ fecha: FECHA, areaSeleccionada: 'PRODUCCION', maestroCompleto, registros });

  assert.equal(r.totalDebiaProgramarse, 4); // Ana, Beto, Eva, Fabio
  assert.equal(r.totalFaltantes, 1); // Fabio (registro suyo es de otro día)
  assert.equal(r.faltantes[0].nombre, 'Fabio Producción');

  assert.equal(r.totalDuplicados, 1); // Eva
  assert.equal(r.duplicados[0].cantidadRegistros, 2);

  // Programados = Ana + Beto (Eva es duplicado, no cuenta en la lista de "programados" calculados)
  assert.equal(r.programados.length, 2);
  assert.equal(r.totalProgramados, 3); // 2 programados + 1 duplicado (sí avisó, aunque esté duplicado)

  const ana = r.programados.find((p) => p.cedula === '1');
  assert.equal(ana.calculo.minutosExtra, 180);
  assert.equal(ana.calculo.tieneAlimentacion, true);

  const beto = r.programados.find((p) => p.cedula === '2');
  assert.equal(beto.calculo, null); // Asiste=No -> no se calcula nada

  assert.equal(r.totalAlimentaciones, 1); // solo Ana
  assert.deepEqual(r.alimentacionPorBodega, { 'Bodega 222': 1 });

  // Carla (Logística) y Dora (Mantenimiento) y la cédula 999 deben salir como inconsistencias.
  assert.equal(r.fueraDeAlcance.length, 3);
  const motivos = r.fueraDeAlcance.map((f) => f.motivo).join(' | ');
  assert.match(motivos, /no del área que seleccionaste/);
  assert.match(motivos, /fuera del alcance de esta herramienta/);
  assert.match(motivos, /No existe en el listado maestro/);
});

test('AMBAS: Carla (Logística) ya no es "fuera de alcance", cuenta en su propio resumen', () => {
  const r = construirRespuesta({ fecha: FECHA, areaSeleccionada: 'AMBAS', maestroCompleto, registros });

  assert.equal(r.totalDebiaProgramarse, 5); // Ana, Beto, Carla, Eva, Fabio
  // Ahora solo quedan como fuera de alcance: Dora (Mantenimiento) y la cédula 999.
  assert.equal(r.fueraDeAlcance.length, 2);

  assert.ok(r.porArea, 'debe incluir desglose por área cuando se selecciona AMBAS');
  assert.equal(r.porArea.PRODUCCION.totalDebiaProgramarse, 4);
  assert.equal(r.porArea.LOGISTICA.totalDebiaProgramarse, 1);

  const carla = r.porArea.LOGISTICA.programados.find((p) => p.cedula === '3');
  assert.equal(carla.calculo.minutosExtra, 60);
  assert.equal(carla.calculo.tieneAlimentacion, false);
});

test('LOGISTICA sola: no incluye porArea, y Ana/Beto/Eva quedan fuera del área seleccionada', () => {
  const r = construirRespuesta({ fecha: FECHA, areaSeleccionada: 'LOGISTICA', maestroCompleto, registros });

  assert.equal(r.totalDebiaProgramarse, 1); // solo Carla
  assert.equal(r.porArea, undefined);
  assert.equal(r.programados.length, 1);
  assert.equal(r.programados[0].nombre, 'Carla Logística');
});

test('área inválida lanza un error claro', () => {
  assert.throws(
    () => construirRespuesta({ fecha: FECHA, areaSeleccionada: 'OTRA', maestroCompleto, registros }),
    /Área inválida/
  );
});
