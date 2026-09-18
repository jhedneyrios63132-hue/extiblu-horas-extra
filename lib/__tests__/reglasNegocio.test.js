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

test('domingo: no hay regla definida -> siempre se marca para revisión manual, nunca se asume', () => {
  const r = calcularHorasYAlimentacion({ fecha: '2026-09-20', asiste: 'Si', horaSalidaReal: '' });
  assert.equal(r.requiereRevisionManual, true);
  assert.match(r.motivoRevision, /domingo/);
});
