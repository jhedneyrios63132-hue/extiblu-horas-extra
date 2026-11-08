const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularHorasYAlimentacion, diaDeSemana } = require('../reglasNegocio');

// 2026-09-14 es lunes, 2026-09-19 es sábado, 2026-09-20 es domingo
// (verificado también por diaDeSemana más abajo).

test('diaDeSemana identifica correctamente lunes, sábado y domingo', () => {
  assert.equal(diaDeSemana('2026-09-14'), 1); // lunes
  assert.equal(diaDeSemana('2026-09-19'), 6); // sábado
  assert.equal(diaDeSemana('2026-09-20'), 0); // domingo
});

test('entre semana: Asiste=No -> sin horas extra ni alimentación', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-14', asiste: 'No', horaSalidaReal: '' });
  assert.equal(r.diaTipo, 'entre_semana');
  assert.equal(r.minutosExtra, null);
  assert.equal(r.tieneAlimentacion, false);
  assert.equal(r.requiereRevisionManual, false);
});

test('entre semana: Asiste=Si sin hora real -> se asume hasta las 6pm, 3h extra, con alimentación', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-14', asiste: 'Si', horaSalidaReal: '' });
  assert.equal(r.horaEfectiva, '18:00');
  assert.equal(r.minutosExtra, 180);
  assert.equal(r.horasExtraTexto, '3h 0m');
  assert.equal(r.tieneAlimentacion, true);
});

test('entre semana: sale a las 16:30 (1h30 extra) -> NO alcanza alimentación', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-14', asiste: 'Si', horaSalidaReal: '16:30' });
  assert.equal(r.minutosExtra, 90);
  assert.equal(r.horasExtraTexto, '1h 30m');
  assert.equal(r.tieneAlimentacion, false);
});

test('entre semana: sale exactamente a las 17:00 (2h extra) -> SÍ alcanza alimentación (umbral inclusivo)', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-14', asiste: 'Si', horaSalidaReal: '17:00' });
  assert.equal(r.minutosExtra, 120);
  assert.equal(r.tieneAlimentacion, true);
});

test('entre semana: hora real anterior a la salida normal -> se marca para revisión, no se asume', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-14', asiste: 'Si', horaSalidaReal: '13:00' });
  assert.equal(r.requiereRevisionManual, true);
  assert.match(r.motivoRevision, /anterior a la hora normal/);
});

test('entre semana: hora real con formato inválido -> se marca para revisión, no se asume', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-14', asiste: 'Si', horaSalidaReal: 'hasta tarde' });
  assert.equal(r.requiereRevisionManual, true);
  assert.match(r.motivoRevision, /No se pudo interpretar/);
});

test('sábado: sin hora real -> se asume hasta las 2:00pm, alimentación SÍ (llega después de las 12:30)', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-19', asiste: 'Si', horaSalidaReal: '' });
  assert.equal(r.diaTipo, 'sabado');
  assert.equal(r.horaEfectiva, '14:00');
  assert.equal(r.minutosExtra, 8 * 60); // 6am a 2pm
  assert.equal(r.tieneAlimentacion, true);
});

test('sábado: sale a las 12:00 (antes de las 12:30) -> NO tiene alimentación aunque trabajó 6 horas', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-19', asiste: 'Si', horaSalidaReal: '12:00' });
  assert.equal(r.minutosExtra, 6 * 60);
  assert.equal(r.tieneAlimentacion, false);
});

test('sábado: sale exactamente a las 12:30 -> SÍ tiene alimentación (umbral inclusivo)', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-19', asiste: 'Si', horaSalidaReal: '12:30' });
  assert.equal(r.tieneAlimentacion, true);
});

test('sábado: Asiste=No -> sin horas extra ni alimentación', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-19', asiste: 'No', horaSalidaReal: '' });
  assert.equal(r.minutosExtra, null);
  assert.equal(r.tieneAlimentacion, false);
});

// Domingo: desde el 2026-10-24 se calcula igual que el sábado (confirmado
// por la usuaria). Antes se marcaba para revisión manual.
test('domingo: sin hora real -> se asume hasta las 2:00pm, igual que el sábado, y SÍ cuenta', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-20', asiste: 'Si', horaSalidaReal: '' });
  assert.equal(r.diaTipo, 'domingo');
  assert.equal(r.requiereRevisionManual, false);
  assert.equal(r.horaEfectiva, '14:00');
  assert.equal(r.minutosExtra, 8 * 60); // 6am a 2pm
  assert.equal(r.tieneAlimentacion, true);
});

test('domingo: sale a las 12:00 (antes de las 12:30) -> cuenta horas pero NO alimentación', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-20', asiste: 'Si', horaSalidaReal: '12:00' });
  assert.equal(r.requiereRevisionManual, false);
  assert.equal(r.minutosExtra, 6 * 60);
  assert.equal(r.tieneAlimentacion, false);
});

test('domingo: Asiste=No -> sin horas extra ni alimentación', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-20', asiste: 'No', horaSalidaReal: '' });
  assert.equal(r.minutosExtra, null);
  assert.equal(r.tieneAlimentacion, false);
  assert.equal(r.requiereRevisionManual, false);
});

// ---- Festivos (confirmado con la usuaria el 2026-11-03) ----
// El lunes 2 de noviembre de 2026 fue festivo (Todos los Santos trasladado):
// antes se contaba como día normal de entre semana, ese fue el error que reportó.

test('festivo en lunes: se calcula con la regla de sábado, no como día normal', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-11-02', asiste: 'Si', horaSalidaReal: '' });
  assert.equal(r.diaTipo, 'festivo');
  assert.equal(r.nombreFestivo, 'Día de Todos los Santos');
  // Regla de sábado: 6am a 2pm = 8h, no las 3h de un día entre semana.
  assert.equal(r.horaEfectiva, '14:00');
  assert.equal(r.minutosExtra, 8 * 60);
  assert.equal(r.tieneAlimentacion, true);
});

test('festivo: quien sale a las 12:00 NO lleva almuerzo', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-11-02', asiste: 'Si', horaSalidaReal: '12:00' });
  assert.equal(r.minutosExtra, 6 * 60);
  assert.equal(r.tieneAlimentacion, false);
});

test('festivo: quien sale a las 12:30 SÍ lleva almuerzo', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-11-02', asiste: 'Si', horaSalidaReal: '12:30' });
  assert.equal(r.tieneAlimentacion, true);
});

test('un lunes normal (no festivo) sigue usando la regla de entre semana', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-11-09', asiste: 'Si', horaSalidaReal: '' });
  assert.equal(r.diaTipo, 'entre_semana');
  assert.equal(r.nombreFestivo, null);
  assert.equal(r.minutosExtra, 3 * 60); // 3pm a 6pm
});

// ---- Restricción de la hora de salida (confirmado el 2026-11-08) ----
// La jornada entra a las 6:00 a.m., así que una salida anterior es imposible.
// Estaban llegando registros como "01:00" que tocaba corregir a mano.

const { validarHoraSalida } = require('../reglasNegocio');

test('bloquea una salida a la 1 de la mañana, que fue el caso reportado', () => {
  const r = validarHoraSalida('01:00');
  assert.equal(r.valida, false);
  assert.match(r.motivo, /anterior a la hora de entrada/);
});

test('bloquea cualquier hora antes de las 6:00 a.m.', () => {
  assert.equal(validarHoraSalida('00:00').valida, false);
  assert.equal(validarHoraSalida('05:59').valida, false);
});

test('acepta desde las 6:00 a.m. en adelante, sin tope por arriba', () => {
  assert.equal(validarHoraSalida('06:00').valida, true);
  assert.equal(validarHoraSalida('16:30').valida, true);
  assert.equal(validarHoraSalida('20:00').valida, true);
  assert.equal(validarHoraSalida('23:59').valida, true);
});

test('dejar la hora vacía sigue siendo válido: significa jornada completa', () => {
  assert.equal(validarHoraSalida('').valida, true);
  assert.equal(validarHoraSalida(null).valida, true);
  assert.equal(validarHoraSalida('   ').valida, true);
});

test('una hora con formato imposible se rechaza con un mensaje claro', () => {
  assert.equal(validarHoraSalida('25:00').valida, false);
  assert.match(validarHoraSalida('abc').motivo, /formato HH:MM/);
});
