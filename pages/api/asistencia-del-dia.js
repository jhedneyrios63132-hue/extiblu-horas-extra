/**
 * Estado de la confirmación de asistencia de un día, para la pantalla
 * "Confirmar asistencia": quiénes faltan por confirmar, quiénes ya se
 * confirmaron, quiénes quedaron como no asistidos y quiénes habían avisado
 * que no venían.
 *
 * GET /api/asistencia-del-dia?fecha=YYYY-MM-DD
 */
const { leerMaestro, leerRegistros } = require('../../lib/googleSheets');
const { construirAsistencia } = require('../../lib/asistencia');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { fecha } = req.query;
    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una fecha válida.' });
    }

    const [maestroCompleto, registros] = await Promise.all([leerMaestro(), leerRegistros()]);
    const asistencia = construirAsistencia(fecha, maestroCompleto, registros);

    // El maestro se envía reducido (solo lo necesario para buscar por nombre
    // o cédula a alguien que asistió sin estar programado).
    const personal = maestroCompleto.map((p) => ({
      cedula: (p.Cedula || '').toString().replace(/\D/g, ''),
      nombre: p['NOMBRE OPERARIO'] || '',
      area: (p.AREA || '').toUpperCase().trim(),
    }));

    return res.status(200).json({ ok: true, ...asistencia, personal });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
