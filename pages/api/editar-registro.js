/**
 * Corrige un registro YA existente (Bodega, Asiste/Motivo, Hora de salida
 * real) — solo desde el panel de Administrador. La persona misma nunca
 * puede editar su registro desde /registro, solo un administrador desde
 * aquí.
 *
 * Como la herramienta no tiene usuarios con login, quien edita debe
 * escribir su nombre (editadoPor); se guarda junto con la fecha/hora del
 * cambio, para poder revisar después quién hizo el ajuste.
 *
 * POST /api/editar-registro
 * body: {
 *   cedula, fecha ("YYYY-MM-DD"), bodega, asiste ("Si"|"No"), motivo,
 *   horaSalidaReal ("HH:MM"|""), editadoPor
 * }
 */
const { leerRegistros, normalizarCedula, actualizarRegistroAdmin } = require('../../lib/googleSheets');
const { BODEGAS_VALIDAS } = require('../../lib/reglasNegocio');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

function horaValida(hora) {
  return /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test((hora || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { cedula, fecha, bodega, asiste, motivo, horaSalidaReal, editadoPor } = req.body || {};

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida.' });
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
    if (asisteNormalizado === 'Si' && horaSalidaReal && !horaValida(horaSalidaReal)) {
      return res.status(400).json({ ok: false, error: 'La hora de salida no es válida.' });
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

    await actualizarRegistroAdmin(coincidencias[0]._fila, {
      asiste: asisteNormalizado,
      motivo: asisteNormalizado === 'No' ? (motivo || '').trim() : '',
      bodega,
      horaSalidaReal: asisteNormalizado === 'Si' && horaSalidaReal ? horaSalidaReal.trim() : '',
      editadoPor: editadoPor.trim(),
      fechaEdicion: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
