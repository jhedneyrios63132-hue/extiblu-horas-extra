/**
 * Cierra la confirmación de asistencia de un día: marca como "No asistió"
 * a todas las personas que quedaron sin confirmar.
 *
 * Es una acción explícita (confirmado con la usuaria el 2026-11-03): nada se
 * marca solo mientras se escanea. El administrador decide cuándo cerrar, y
 * la pantalla le muestra antes a cuántas personas va a afectar.
 *
 * Para que no se marque a nadie por error, el cliente manda la lista de
 * cédulas que ve en pantalla y aquí solo se tocan las que de verdad siguen
 * pendientes en la hoja en este momento.
 *
 * POST /api/cerrar-asistencia
 * body: { fecha ("YYYY-MM-DD"), cedulas: ["123", ...] }
 */
const {
  leerMaestro,
  leerRegistros,
  leerTurnoSabado,
  normalizarCedula,
  actualizarAsistenciaRealVarias,
} = require('../../lib/googleSheets');
const { construirAsistencia } = require('../../lib/asistencia');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { fecha, cedulas } = req.body || {};

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida.' });
    }
    if (!Array.isArray(cedulas) || cedulas.length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay personas pendientes por marcar.' });
    }

    const pedidas = new Set(cedulas.map(normalizarCedula));

    const [maestroCompleto, registros, cedulasTurnoSabado] = await Promise.all([
      leerMaestro(),
      leerRegistros(),
      leerTurnoSabado(),
    ]);
    const asistencia = construirAsistencia(fecha, maestroCompleto, registros, cedulasTurnoSabado);

    // Solo se marcan las que siguen pendientes de verdad y además venían en
    // la lista que el administrador tenía en pantalla.
    const aMarcar = asistencia.pendientes.filter((p) => pedidas.has(p.cedula));
    if (aMarcar.length === 0) {
      return res.status(200).json({ ok: true, marcadas: 0, nombres: [] });
    }

    const cedulasAMarcar = new Set(aMarcar.map((p) => p.cedula));
    const filas = registros
      .filter(
        (r) =>
          (r.Fecha || '').trim() === fecha.trim() &&
          cedulasAMarcar.has(normalizarCedula(r.Cedula)) &&
          !(r.Asistio_Real || '').trim()
      )
      .map((r) => r._fila);

    await actualizarAsistenciaRealVarias(filas, 'No');

    return res.status(200).json({
      ok: true,
      marcadas: filas.length,
      nombres: aMarcar.map((p) => p.nombre),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
