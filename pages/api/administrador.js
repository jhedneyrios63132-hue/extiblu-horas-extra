/**
 * Resumen para la pantalla de Administrador: cruza el listado maestro con
 * los registros de un día. La lógica de cruce vive en
 * lib/resumenAdministrador.js (con pruebas propias); aquí solo se leen
 * los datos de Google Sheets y se valida la entrada.
 *
 * GET /api/administrador?fecha=YYYY-MM-DD&area=PRODUCCION|LOGISTICA|AMBAS
 */
const { leerMaestro, leerRegistros } = require('../../lib/googleSheets');
const { construirRespuesta } = require('../../lib/resumenAdministrador');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { fecha, area } = req.query;

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una fecha válida.' });
    }

    const areaSeleccionada = (area || '').toUpperCase().trim();

    const [maestroCompleto, registros] = await Promise.all([leerMaestro(), leerRegistros()]);

    const respuesta = construirRespuesta({ fecha, areaSeleccionada, maestroCompleto, registros });

    return res.status(200).json({ ok: true, ...respuesta });
  } catch (error) {
    if (error.message.includes('Área inválida')) {
      return res.status(400).json({ ok: false, error: 'Selecciona un área válida (Producción, Logística o Ambas).' });
    }
    return res.status(500).json({ ok: false, error: error.message });
  }
}
