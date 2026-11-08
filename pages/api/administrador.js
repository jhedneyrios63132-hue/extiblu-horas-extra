/**
 * Resumen para la pantalla de Administrador: cruza el listado maestro con
 * los registros de un día. La lógica de cruce vive en
 * lib/resumenAdministrador.js (con pruebas propias); aquí solo se leen
 * los datos de Google Sheets y se valida la entrada.
 *
 * GET /api/administrador?fecha=YYYY-MM-DD
 *                        &areas=PRODUCCION,LOGISTICA   (o TODAS, o vacío)
 *                        &bodega=TODAS|Bodega 222|Bodega 224|Bodega 230
 *
 * Desde el 2026-11-08 se pueden pedir VARIAS áreas a la vez, separadas por
 * comas: la usuaria normalmente mira Producción y Logística juntas. Las
 * áreas pueden ser cualquiera de las que existan en el listado maestro. La
 * respuesta incluye `areasDisponibles` para que la pantalla arme su selector
 * sola.
 */
const { leerMaestro, leerRegistros, leerTurnoSabado } = require('../../lib/googleSheets');
const { construirRespuesta, TODAS_LAS_BODEGAS } = require('../../lib/resumenAdministrador');
const { BODEGAS_VALIDAS } = require('../../lib/reglasNegocio');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { fecha, areas, bodega } = req.query;

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una fecha válida.' });
    }

    // Si no vienen áreas, equivale a "todo el personal del maestro".
    const areasSeleccionadas = (areas || '')
      .toString()
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    // El filtro de Bodega es opcional; si no viene, equivale a "todas".
    const bodegaSeleccionada = (bodega || '').trim() || TODAS_LAS_BODEGAS;
    if (bodegaSeleccionada !== TODAS_LAS_BODEGAS && !BODEGAS_VALIDAS.includes(bodegaSeleccionada)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una Bodega válida.' });
    }

    const [maestroCompleto, registros, cedulasTurnoSabado] = await Promise.all([
      leerMaestro(),
      leerRegistros(),
      leerTurnoSabado(),
    ]);

    const respuesta = construirRespuesta({
      fecha,
      areasSeleccionadas,
      bodegaSeleccionada,
      maestroCompleto,
      registros,
      cedulasTurnoSabado,
    });

    return res.status(200).json({ ok: true, ...respuesta });
  } catch (error) {
    if (error.message.includes('Área inválida')) {
      return res.status(400).json({ ok: false, error: 'Selecciona un área que exista en el listado maestro.' });
    }
    return res.status(500).json({ ok: false, error: error.message });
  }
}
