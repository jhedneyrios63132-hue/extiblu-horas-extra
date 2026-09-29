/**
 * Confirma, después del día, si una persona realmente asistió a las horas
 * extra que había programado. Lo llena un administrador desde el panel de
 * Administrador (no la persona misma).
 *
 * POST /api/confirmar-asistencia
 * body: { cedula, fecha ("YYYY-MM-DD"), asistioReal: "Si" | "No" }
 */
const { leerRegistros, normalizarCedula, actualizarAsistenciaReal } = require('../../lib/googleSheets');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { cedula, fecha, asistioReal } = req.body || {};

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida.' });
    }
    if (asistioReal !== 'Si' && asistioReal !== 'No') {
      return res.status(400).json({ ok: false, error: 'El valor de asistencia debe ser "Si" o "No".' });
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
        error: 'Hay registros duplicados ese día para esta persona; resuelve el duplicado antes de confirmar asistencia.',
      });
    }

    await actualizarAsistenciaReal(coincidencias[0]._fila, asistioReal);

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
