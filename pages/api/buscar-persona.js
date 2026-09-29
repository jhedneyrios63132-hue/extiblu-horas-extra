/**
 * Busca una persona por cédula en el listado maestro, para que el
 * formulario de Registro pueda confirmar el nombre antes de guardar nada.
 *
 * GET /api/buscar-persona?cedula=1036929918
 */
const { buscarPersonaPorCedula } = require('../../lib/googleSheets');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { cedula } = req.query;
    const resultado = await buscarPersonaPorCedula(cedula);
    return res.status(200).json({ ok: true, ...resultado });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
