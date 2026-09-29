const test = require('node:test');
const assert = require('node:assert/strict');
const { construirTrazabilidad } = require('../trazabilidad');

// 2026-09-14 lunes, 2026-09-15 martes, 2026-09-16 miércoles, 2026-09-17
// jueves (todos entre semana), 2026-09-20 domingo.

const registros = [
  // 3h programadas (sin hora real, se asume 6pm), confirmada como asistida.
  { Cedula: '1', Fecha: '2026-09-14', Asiste: 'Si', Hora_salida_real: '', Asistio_Real: 'Si' },
  // 1h programada (sale a las 16:00), confirmada como NO asistida.
  { Cedula: '1', Fecha: '2026-09-15', Asiste: 'Si', Hora_salida_real: '16:00', Asistio_Real: 'No' },
  // 2h programadas (sale a las 17:00), SIN CONFIRMAR todavía.
  { Cedula: '1', Fecha: '2026-09-16', Asiste: 'Si', Hora_salida_real: '17:00', Asistio_Real: '' },
  // Ese día avisó que no iba a hacer horas extra: no debe contarse para nada.
  { Cedula: '1', Fecha: '2026-09-17', Asiste: 'No', Hora_salida_real: '', Asistio_Real: '' },
  // Domingo: no hay regla, debe excluirse del cálculo y listarse aparte.
  { Cedula: '1', Fecha: '2026-09-20', Asiste: 'Si', Hora_salida_real: '', Asistio_Real: '' },
  // Registro de otra persona: no debe mezclarse.
  { Cedula: '2', Fecha: '2026-09-14', Asiste: 'Si', Hora_salida_real: '', Asistio_Real: 'Si' },
];

test('suma horas programadas y asistidas, tratando "sin confirmar" como no asistido', () => {
  const r = construirTrazabilidad('1', registros);

  // Programadas: 3h + 1h + 2h = 6h. Asistidas: solo las 3h confirmadas "Sí".
  assert.equal(r.minutosProgramados, 360);
  assert.equal(r.minutosAsistidos, 180);
  assert.equal(r.totalHorasProgramadasTexto, '6h 0m');
  assert.equal(r.totalHorasAsistidasTexto, '3h 0m');
  assert.equal(r.porcentajeCumplimiento, 50);

  assert.equal(r.detalle.length, 3); // no incluye el "No" del jueves ni el domingo
  assert.equal(r.totalPendientesPorConfirmar, 1); // el día 16

  assert.equal(r.sinCalcular.length, 1);
  assert.match(r.sinCalcular[0].motivo, /domingo/);
});

test('persona sin ningún día programado -> porcentaje null, no explota', () => {
  const r = construirTrazabilidad('999', registros);
  assert.equal(r.minutosProgramados, 0);
  assert.equal(r.porcentajeCumplimiento, null);
  assert.deepEqual(r.detalle, []);
});
