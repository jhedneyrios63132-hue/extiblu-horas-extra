const test = require('node:test');
const assert = require('node:assert/strict');
const { construirRespuesta, areasDisponibles } = require('../resumenAdministrador');

// 2026-09-14 es lunes y no es festivo (ver reglasNegocio.test.js).
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
  { Cedula: '2', Fecha: FECHA, Asiste: 'No', Motivo: 'Permiso', Bodega: '', Hora_salida_real: '' },
  // Carla (Logística): asiste, sale a las 16:00 -> 1h extra, sin alimentación.
  { Cedula: '3', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 224', Hora_salida_real: '16:00' },
  // Eva: DOS registros el mismo día -> duplicado.
  { Cedula: '5', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 230', Hora_salida_real: '17:00' },
  { Cedula: '5', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 230', Hora_salida_real: '18:00' },
  // Dora (Mantenimiento): desde el 2026-11-03 también entra en la programación.
  { Cedula: '4', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 222', Hora_salida_real: '' },
  // Cédula que no existe en el maestro: esta sí sigue siendo un error.
  { Cedula: '999', Fecha: FECHA, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 222', Hora_salida_real: '' },
  // Registro de otro día: no debe contarse para nada.
  { Cedula: '6', Fecha: '2026-09-15', Asiste: 'Si', Motivo: '', Bodega: 'Bodega 222', Hora_salida_real: '' },
];

test('las áreas del selector se leen del maestro, ordenadas', () => {
  assert.deepEqual(areasDisponibles(maestroCompleto), ['LOGISTICA', 'MANTENIMIENTO', 'PRODUCCION']);
});

test('TODAS: entra todo el personal del maestro, incluido Mantenimiento', () => {
  const r = construirRespuesta({ fecha: FECHA, areasSeleccionadas: ['TODAS'], maestroCompleto, registros });

  assert.equal(r.totalDebiaProgramarse, 6); // las 6 personas del maestro
  assert.equal(r.totalApoyoOtrasAreas, 0); // con TODAS nadie es "de otra área"

  // Dora (Mantenimiento) ahora es una programada normal, ya no una inconsistencia.
  const dora = r.programados.find((p) => p.cedula === '4');
  assert.equal(dora.area, 'MANTENIMIENTO');
  assert.equal(dora.calculo.tieneAlimentacion, true);

  // Solo queda como error la cédula que no existe en el maestro.
  assert.equal(r.fueraDeAlcance.length, 1);
  assert.equal(r.fueraDeAlcance[0].cedula, '999');
  assert.match(r.fueraDeAlcance[0].motivo, /No existe en el listado maestro/);

  // Faltante: solo Fabio (su registro es de otro día).
  assert.equal(r.totalFaltantes, 1);
  assert.equal(r.faltantes[0].nombre, 'Fabio Producción');

  // Desglose por cada área del maestro.
  assert.deepEqual(Object.keys(r.porArea).sort(), ['LOGISTICA', 'MANTENIMIENTO', 'PRODUCCION']);
  assert.equal(r.porArea.MANTENIMIENTO.totalDebiaProgramarse, 1);
});

test('PRODUCCION: los de otra área NO son error, salen como apoyo y SÍ suman alimentación', () => {
  const r = construirRespuesta({ fecha: FECHA, areasSeleccionadas: ['PRODUCCION'], maestroCompleto, registros });

  // Solo se le exige estar programado al personal de Producción.
  assert.equal(r.totalDebiaProgramarse, 4); // Ana, Beto, Eva, Fabio
  assert.equal(r.totalFaltantes, 1);
  assert.equal(r.faltantes[0].nombre, 'Fabio Producción');

  // Carla (Logística) y Dora (Mantenimiento) vinieron a apoyar: no son error.
  assert.equal(r.totalApoyoOtrasAreas, 2);
  const nombresApoyo = r.apoyoOtrasAreas.map((p) => p.nombre).sort();
  assert.deepEqual(nombresApoyo, ['Carla Logística', 'Dora Mantenimiento']);

  // La única inconsistencia sigue siendo la cédula inexistente.
  assert.equal(r.fueraDeAlcance.length, 1);
  assert.equal(r.fueraDeAlcance[0].cedula, '999');

  // Alimentación: Ana (3h) + Dora (3h, apoyo) = 2. Carla solo hizo 1h.
  assert.equal(r.totalAlimentaciones, 2);
  assert.deepEqual(r.alimentacionPorBodega, { 'Bodega 222': 2 });

  // Sin desglose por área cuando se filtra un área puntual.
  assert.equal(r.porArea, undefined);
});

test('LOGISTICA: Producción y Mantenimiento pasan a ser el apoyo', () => {
  const r = construirRespuesta({ fecha: FECHA, areasSeleccionadas: ['LOGISTICA'], maestroCompleto, registros });

  assert.equal(r.totalDebiaProgramarse, 1); // solo Carla
  assert.equal(r.programados.length, 1);
  assert.equal(r.programados[0].nombre, 'Carla Logística');
  assert.equal(r.totalFaltantes, 0);

  // Ana, Beto y Dora aparecen como apoyo; Eva es duplicado.
  const nombresApoyo = r.apoyoOtrasAreas.map((p) => p.nombre).sort();
  assert.deepEqual(nombresApoyo, ['Ana Producción', 'Beto Producción', 'Dora Mantenimiento']);
  assert.equal(r.totalDuplicados, 1); // Eva, aunque sea de otra área
});

test('área que no existe en el maestro lanza un error claro', () => {
  assert.throws(
    () => construirRespuesta({ fecha: FECHA, areasSeleccionadas: ['VENTAS'], maestroCompleto, registros }),
    /Área inválida/
  );
});

// ---- Filtro por Bodega (confirmado con la usuaria el 2026-10-24) ----

test('filtro por Bodega: limita programados y apoyo, pero NO los faltantes', () => {
  const r = construirRespuesta({
    fecha: FECHA,
    areasSeleccionadas: ['PRODUCCION'],
    bodegaSeleccionada: 'Bodega 222',
    maestroCompleto,
    registros,
  });

  assert.equal(r.bodega, 'Bodega 222');

  // De Producción, en la 222, solo Ana (Beto no tiene bodega).
  assert.equal(r.programados.length, 1);
  assert.equal(r.programados[0].nombre, 'Ana Producción');

  // Del apoyo, en la 222, solo Dora (Carla está en la 224).
  assert.equal(r.totalApoyoOtrasAreas, 1);
  assert.equal(r.apoyoOtrasAreas[0].nombre, 'Dora Mantenimiento');

  // Alimentaciones de esa Bodega, incluyendo el apoyo.
  assert.equal(r.totalAlimentaciones, 2);
  assert.deepEqual(r.alimentacionPorBodega, { 'Bodega 222': 2 });

  // Los faltantes NO se filtran: Fabio sigue apareciendo aunque no tenga bodega.
  assert.equal(r.totalFaltantes, 1);
  assert.equal(r.faltantes[0].nombre, 'Fabio Producción');

  // Los totales del día siguen siendo del área completa, a propósito.
  assert.equal(r.totalDebiaProgramarse, 4);
});

test('sin filtro de Bodega ("TODAS") el resumen no se recorta', () => {
  const sinFiltro = construirRespuesta({ fecha: FECHA, areasSeleccionadas: ['TODAS'], maestroCompleto, registros });
  assert.equal(sinFiltro.bodega, 'TODAS');
  assert.equal(sinFiltro.totalProgramadosEnBodega, undefined);
  // Ana (3h) y Dora (3h) llevan comida; Carla solo hizo 1h.
  assert.equal(sinFiltro.totalAlimentaciones, 2);
});

// ---- Festivos (confirmado con la usuaria el 2026-11-03) ----

test('en un festivo se aplica la regla de sábado a todo el resumen', () => {
  // Lunes 2 de noviembre de 2026: festivo (Todos los Santos trasladado).
  const FESTIVO = '2026-11-02';
  const registrosFestivo = [
    // Sin hora de salida -> turno 6am-2pm, 8h extra, con almuerzo.
    { Cedula: '1', Fecha: FESTIVO, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 222', Hora_salida_real: '' },
    // Sale a las 12:00 -> 6h extra pero SIN almuerzo.
    { Cedula: '2', Fecha: FESTIVO, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 222', Hora_salida_real: '12:00' },
  ];

  const r = construirRespuesta({
    fecha: FESTIVO,
    areasSeleccionadas: ['PRODUCCION'],
    maestroCompleto,
    registros: registrosFestivo,
  });

  const ana = r.programados.find((p) => p.cedula === '1');
  assert.equal(ana.calculo.diaTipo, 'festivo');
  assert.equal(ana.calculo.nombreFestivo, 'Día de Todos los Santos');
  assert.equal(ana.calculo.minutosExtra, 8 * 60);
  assert.equal(ana.calculo.tieneAlimentacion, true);

  const beto = r.programados.find((p) => p.cedula === '2');
  assert.equal(beto.calculo.minutosExtra, 6 * 60);
  assert.equal(beto.calculo.tieneAlimentacion, false);

  // Solo se pide 1 almuerzo, no 2.
  assert.equal(r.totalAlimentaciones, 1);
});

// ---- Varias áreas a la vez (confirmado el 2026-11-08) ----
// Es el caso real de la usuaria: solo programa Producción y Logística.

test('PRODUCCION + LOGISTICA juntas: se exige a las dos y Mantenimiento queda como apoyo', () => {
  const r = construirRespuesta({
    fecha: FECHA,
    areasSeleccionadas: ['PRODUCCION', 'LOGISTICA'],
    maestroCompleto,
    registros,
  });

  assert.deepEqual(r.areas, ['PRODUCCION', 'LOGISTICA']);
  assert.equal(r.todasLasAreas, false);

  // Debía programarse: las 4 de Producción + Carla de Logística = 5.
  assert.equal(r.totalDebiaProgramarse, 5);

  // Carla ya no es apoyo: ahora es personal del filtro.
  const nombresProgramados = r.programados.map((p) => p.nombre).sort();
  assert.ok(nombresProgramados.includes('Carla Logística'));

  // Dora (Mantenimiento) sigue siendo apoyo, y su comida sigue sumando.
  assert.equal(r.totalApoyoOtrasAreas, 1);
  assert.equal(r.apoyoOtrasAreas[0].nombre, 'Dora Mantenimiento');
  assert.equal(r.totalAlimentaciones, 2); // Ana (3h) + Dora (3h, apoyo)

  // Faltantes: solo Fabio, de Producción.
  assert.equal(r.totalFaltantes, 1);
  assert.equal(r.faltantes[0].nombre, 'Fabio Producción');
});

test('con varias áreas marcadas se incluye el desglose de cada una', () => {
  const r = construirRespuesta({
    fecha: FECHA,
    areasSeleccionadas: ['PRODUCCION', 'LOGISTICA'],
    maestroCompleto,
    registros,
  });

  assert.deepEqual(Object.keys(r.porArea).sort(), ['LOGISTICA', 'PRODUCCION']);
  assert.equal(r.porArea.PRODUCCION.totalDebiaProgramarse, 4);
  assert.equal(r.porArea.LOGISTICA.totalDebiaProgramarse, 1);
  // Mantenimiento no aparece porque no está marcada.
  assert.equal(r.porArea.MANTENIMIENTO, undefined);
});

test('con una sola área marcada no se muestra desglose, porque sobra', () => {
  const r = construirRespuesta({
    fecha: FECHA,
    areasSeleccionadas: ['PRODUCCION'],
    maestroCompleto,
    registros,
  });
  assert.equal(r.porArea, undefined);
});

test('no marcar ninguna área equivale a todas', () => {
  const r = construirRespuesta({ fecha: FECHA, areasSeleccionadas: [], maestroCompleto, registros });
  assert.equal(r.todasLasAreas, true);
  assert.equal(r.totalDebiaProgramarse, 6);
});

test('si una de las áreas marcadas no existe, el error dice cuál', () => {
  assert.throws(
    () =>
      construirRespuesta({
        fecha: FECHA,
        areasSeleccionadas: ['PRODUCCION', 'VENTAS'],
        maestroCompleto,
        registros,
      }),
    /VENTAS/
  );
});

// ---- Turno sabatino fijo (confirmado el 2026-11-08) ----
// Hay personal que trabaja los sábados por turno y NO manda registro, porque
// ya sabe que le toca venir. Antes salían como faltantes, lo cual era falso.

const SABADO = '2026-09-19'; // sábado (ver reglasNegocio.test.js)
const LUNES = '2026-09-14';

test('sábado: el personal del turno se cuenta solo como programado, sin ser faltante', () => {
  const r = construirRespuesta({
    fecha: SABADO,
    areasSeleccionadas: ['PRODUCCION'],
    maestroCompleto,
    registros: [], // nadie mandó registro
    cedulasTurnoSabado: ['1', '2'], // Ana y Beto son del turno
  });

  const nombres = r.programados.map((p) => p.nombre).sort();
  assert.deepEqual(nombres, ['Ana Producción', 'Beto Producción']);

  // Ya no aparecen como faltantes: solo Eva y Fabio, que no son del turno.
  const faltantes = r.faltantes.map((p) => p.nombre).sort();
  assert.deepEqual(faltantes, ['Eva Producción', 'Fabio Producción']);
});

test('el turno sale a las 12:00, sin almuerzo y sin horas extra', () => {
  const r = construirRespuesta({
    fecha: SABADO,
    areasSeleccionadas: ['PRODUCCION'],
    maestroCompleto,
    registros: [],
    cedulasTurnoSabado: ['1'],
  });

  const ana = r.programados.find((p) => p.cedula === '1');
  assert.equal(ana.esTurnoSabado, true);
  assert.equal(ana.calculo.horaEfectiva, '12:00');
  assert.equal(ana.calculo.tieneAlimentacion, false);
  // Es su jornada normal: no son horas extra.
  assert.equal(ana.calculo.minutosExtra, 0);
  assert.equal(r.totalAlimentaciones, 0);
});

test('el turno NO aplica entre semana: ahí sí siguen siendo faltantes', () => {
  const r = construirRespuesta({
    fecha: LUNES,
    areasSeleccionadas: ['PRODUCCION'],
    maestroCompleto,
    registros: [],
    cedulasTurnoSabado: ['1', '2'],
  });

  const faltantes = r.faltantes.map((p) => p.nombre).sort();
  assert.deepEqual(faltantes, ['Ana Producción', 'Beto Producción', 'Eva Producción', 'Fabio Producción']);
  assert.equal(r.programados.length, 0);
});

test('si alguien del turno SÍ registra horas extra, manda su registro', () => {
  const r = construirRespuesta({
    fecha: SABADO,
    areasSeleccionadas: ['PRODUCCION'],
    maestroCompleto,
    // Ana se quedó hasta las 2pm y lo registró.
    registros: [
      { Cedula: '1', Fecha: SABADO, Asiste: 'Si', Motivo: '', Bodega: 'Bodega 224', Hora_salida_real: '14:00' },
    ],
    cedulasTurnoSabado: ['1'],
  });

  const ana = r.programados.find((p) => p.cedula === '1');
  assert.equal(ana.esTurnoSabado, undefined); // se trató como registro normal
  assert.equal(ana.calculo.horaEfectiva, '14:00');
  assert.equal(ana.calculo.minutosExtra, 8 * 60); // 6am a 2pm
  assert.equal(ana.calculo.tieneAlimentacion, true); // salió después de las 12:30
});

test('sin lista de turno todo sigue funcionando como antes', () => {
  const r = construirRespuesta({
    fecha: SABADO,
    areasSeleccionadas: ['PRODUCCION'],
    maestroCompleto,
    registros: [],
  });
  assert.equal(r.programados.length, 0);
  assert.equal(r.totalFaltantes, 4);
});
