/**
 * Corrige un registro YA existente (Fecha, Bodega, Asiste/Motivo, Hora de
 * salida real) — solo desde el panel de Administrador. La persona misma
 * nunca puede editar su registro desde /registro, solo un administrador
 * desde aquí.
 *
 * La Fecha se puede corregir desde el 2026-11-26: la gente manda la
 * programación del sábado el viernes y la guarda con la fecha del viernes.
 * Al moverla se valida que la persona no tenga ya un registro en el día
 * destino, para no crear un duplicado.
 *
 * Como la herramienta no tiene usuarios con login, quien edita debe
 * escribir su nombre (editadoPor); se guarda junto con la fecha/hora del
 * cambio, para poder revisar después quién hizo el ajuste.
 *
 * POST /api/editar-registro
 * body: {
 *   cedula, fecha ("YYYY-MM-DD", la fecha ACTUAL del registro),
 *   fechaNueva ("YYYY-MM-DD", opcional: a dónde moverlo),
 *   bodega, asiste ("Si"|"No"), motivo,
 *   horaSalidaReal ("HH:MM"|""), editadoPor
 * }
 */
const { leerRegistros, normalizarCedula, actualizarRegistroAdmin } = require('../../lib/googleSheets');
const { BODEGAS_VALIDAS, validarHoraSalida } = require('../../lib/reglasNegocio');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { cedula, fecha, fechaNueva, bodega, asiste, motivo, horaSalidaReal, editadoPor } = req.body || {};

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida.' });
    }

    // Si no mandan fecha nueva, el registro se queda donde está.
    const fechaDestino = (fechaNueva || '').trim() || fecha.trim();
    if (!fechaValida(fechaDestino)) {
      return res.status(400).json({ ok: false, error: 'La fecha nueva no es válida.' });
    }
    if (!BODEGAS_VALIDAS.includes(bodega)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una Bodega válida.' });
    }
    const asisteNormalizado = asiste === 'Si' ? 'Si' : asiste === 'No' ? 'No' : null;
    if (!asisteNormalizado) {
      return res.status(400).json({ ok: false, error: 'Indica si asiste o no.' });
    }
    if (asisteNormalizado === 'No' && !(motivo || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Si no asiste, el motivo es obligatorio.' });
    }
    // La misma restricción que en Registro: ni el administrador puede guardar
    // una hora de salida anterior a la hora de entrada (confirmado 2026-11-08).
    if (asisteNormalizado === 'Si') {
      const revision = validarHoraSalida(horaSalidaReal);
      if (!revision.valida) {
        return res.status(400).json({ ok: false, error: revision.motivo });
      }
    }
    if (!(editadoPor || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Escribe tu nombre antes de guardar el cambio.' });
    }

    const cedulaNormalizada = normalizarCedula(cedula);
    const registros = await leerRegistros();
    const coincidencias = registros.filter(
      (r) => normalizarCedula(r.Cedula) === cedulaNormalizada && (r.Fecha || '').trim() === fecha.trim()
    );

    if (coincidencias.length === 0) {
      return res.status(404).json({ ok: false, error: 'No se encontró un registro de esa persona en esa fecha.' });
    }
    if (coincidencias.length > 1) {
      return res.status(409).json({
        ok: false,
        error: 'Hay registros duplicados ese día para esta persona; resuelve el duplicado antes de editarlo.',
      });
    }

    // Si se está moviendo de día, esa persona no puede tener ya un registro
    // en el día destino: sería un duplicado.
    if (fechaDestino !== fecha.trim()) {
      const yaExisteAlla = registros.some(
        (r) => normalizarCedula(r.Cedula) === cedulaNormalizada && (r.Fecha || '').trim() === fechaDestino
      );
      if (yaExisteAlla) {
        return res.status(409).json({
          ok: false,
          error: `Esa persona ya tiene un registro el ${fechaDestino}. Revisa ese día antes de mover este registro, o quedarían dos.`,
        });
      }
    }

    await actualizarRegistroAdmin(coincidencias[0]._fila, {
      fecha: fechaDestino,
      asiste: asisteNormalizado,
      motivo: asisteNormalizado === 'No' ? (motivo || '').trim() : '',
      bodega,
      horaSalidaReal: asisteNormalizado === 'Si' && horaSalidaReal ? horaSalidaReal.trim() : '',
      editadoPor: editadoPor.trim(),
      fechaEdicion: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, fecha: fechaDestino, seMovioDeDia: fechaDestino !== fecha.trim() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
