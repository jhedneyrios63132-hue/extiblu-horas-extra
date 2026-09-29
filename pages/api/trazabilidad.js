/**
 * Trazabilidad de una persona: horas extra programadas vs. asistidas
 * (confirmadas por un administrador), con el % de cumplimiento.
 *
 * GET /api/trazabilidad?cedula=1234567
 */
const { leerMaestro, leerRegistros, normalizarCedula } = require('../../lib/googleSheets');
const { construirTrazabilidad } = require('../../lib/trazabilidad');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { cedula } = req.query;
    const cedulaNormalizada = normalizarCedula(cedula);
    if (!cedulaNormalizada) {
      return res.status(400).json({ ok: false, error: 'Escribe un número de cédula.' });
    }

    const [maestro, registros] = await Promise.all([leerMaestro(), leerRegistros()]);
    const persona = maestro.find((p) => normalizarCedula(p.Cedula) === cedulaNormalizada);

    if (!persona) {
      return res.status(404).json({ ok: false, error: 'No se encontró esa cédula en el listado maestro.' });
    }

    const resultado = construirTrazabilidad(cedula, registros);

    return res.status(200).json({
      ok: true,
      cedula: cedulaNormalizada,
      nombre: persona['NOMBRE OPERARIO'] || '',
      area: (persona.AREA || '').toUpperCase().trim(),
      ...resultado,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
