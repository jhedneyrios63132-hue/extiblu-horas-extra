/**
 * Trazabilidad por persona: compara, para una cédula, el total de horas
 * extra que se le programaron contra el total que un administrador
 * confirmó que realmente asistió, y calcula el % de cumplimiento.
 *
 * Reglas confirmadas con la usuaria (2026-09-29):
 * - La confirmación es simple Sí/No por día (no horas parciales).
 * - Un día "sin confirmar todavía" cuenta como programado pero NO como
 *   asistido para el cálculo del % — así el porcentaje sube solo cuando
 *   alguien confirma explícitamente que sí asistió. Es una decisión de
 *   negocio de la usuaria, no una suposición de la herramienta.
 * - Un día donde no se pudo calcular la hora programada con seguridad
 *   (ej. domingo, sin regla definida) se excluye del cálculo y se lista
 *   aparte, igual que en el resto de la herramienta.
 */
const { calcularHorasYAlimentacion, formatearDuracion } = require('./reglasNegocio');

/** Deja solo los dígitos de una cédula (debe coincidir con lib/googleSheets.js). */
function normalizarCedula(cedula) {
  return (cedula || '').toString().replace(/\D/g, '');
}

/**
 * @param {string} cedulaBuscada
 * @param {Array} todosLosRegistros - todos los registros diarios (de leerRegistros()).
 */
function construirTrazabilidad(cedulaBuscada, todosLosRegistros) {
  const cedulaNormalizada = normalizarCedula(cedulaBuscada);
  const registrosDeLaPersona = todosLosRegistros.filter(
    (r) => normalizarCedula(r.Cedula) === cedulaNormalizada
  );

  let minutosProgramados = 0;
  let minutosAsistidos = 0;
  const detalle = [];
  const sinCalcular = [];

  registrosDeLaPersona.forEach((r) => {
    const asisteTexto = (r.Asiste || '').trim();
    const siAsiste = asisteTexto.toLowerCase().startsWith('s');
    if (!siAsiste) return; // ese día no se programó ninguna hora extra

    const calculo = calcularHorasYAlimentacion({
      fecha: r.Fecha,
      asiste: r.Asiste,
      horaSalidaReal: r.Hora_salida_real,
    });

    if (calculo.minutosExtra === null) {
      sinCalcular.push({ fecha: r.Fecha, motivo: calculo.motivoRevision });
      return;
    }

    const asistioReal = (r.Asistio_Real || '').trim();
    const siAsistioReal = asistioReal.toLowerCase().startsWith('s');

    minutosProgramados += calculo.minutosExtra;
    if (siAsistioReal) {
      minutosAsistidos += calculo.minutosExtra;
    }

    detalle.push({
      fecha: r.Fecha,
      minutosProgramados: calculo.minutosExtra,
      horasProgramadasTexto: calculo.horasExtraTexto,
      // null = sin confirmar todavía; 'Si' / 'No' = ya confirmado.
      asistioReal: asistioReal || null,
    });
  });

  const porcentajeCumplimiento =
    minutosProgramados > 0 ? Math.round((minutosAsistidos / minutosProgramados) * 1000) / 10 : null;

  detalle.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    minutosProgramados,
    minutosAsistidos,
    totalHorasProgramadasTexto: formatearDuracion(minutosProgramados),
    totalHorasAsistidasTexto: formatearDuracion(minutosAsistidos),
    porcentajeCumplimiento,
    totalPendientesPorConfirmar: detalle.filter((d) => d.asistioReal === null).length,
    detalle,
    sinCalcular,
  };
}

module.exports = { construirTrazabilidad };
