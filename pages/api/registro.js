/**
 * Guarda un registro diario de programación de horas extra.
 *
 * POST /api/registro
 * body: { cedula, fecha ("YYYY-MM-DD"), bodega, asiste ("Si"|"No"), motivo, horaSalidaReal ("HH:MM"|"") }
 *
 * Reglas que se validan aquí (todas ya confirmadas con la usuaria):
 * - La cédula debe existir en el maestro y pertenecer a Producción o Logística.
 * - La Bodega debe ser una de las opciones válidas.
 * - Si Asiste = "No", el Motivo es obligatorio.
 * - Si Asiste = "Si", la hora de salida real es opcional (solo si sale antes
 *   de lo normal); si se llena, debe tener formato HH:MM.
 * - No se permite un segundo registro de la misma persona el mismo día
 *   (se avisa que ya existe, en vez de crear un duplicado).
 */
const { buscarPersonaPorCedula, existeRegistroParaFecha, agregarRegistro, normalizarCedula } = require('../../lib/googleSheets');
const { BODEGAS_VALIDAS } = require('../../lib/reglasNegocio');

function horaValida(hora) {
  return /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test((hora || '').trim());
}

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { cedula, fecha, bodega, asiste, motivo, horaSalidaReal } = req.body || {};

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'La fecha no es válida.' });
    }
    if (!BODEGAS_VALIDAS.includes(bodega)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una Bodega válida.' });
    }
    const asisteNormalizado = asiste === 'Si' ? 'Si' : asiste === 'No' ? 'No' : null;
    if (!asisteNormalizado) {
      return res.status(400).json({ ok: false, error: 'Indica si vas a asistir o no.' });
    }
    if (asisteNormalizado === 'No' && !(motivo || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Si no vas a asistir, debes indicar el motivo.' });
    }
    if (asisteNormalizado === 'Si' && horaSalidaReal && !horaValida(horaSalidaReal)) {
      return res.status(400).json({ ok: false, error: 'La hora de salida no es válida.' });
    }

    const persona = await buscarPersonaPorCedula(cedula);
    if (!persona.encontrada || !persona.enAlcance) {
      return res.status(400).json({ ok: false, error: persona.motivo });
    }

    const yaExiste = await existeRegistroParaFecha(cedula, fecha);
    if (yaExiste) {
      return res.status(409).json({
        ok: false,
        error: 'Ya existe un registro tuyo para esta fecha. Si necesitas corregirlo, avisa a tu responsable — no se puede registrar dos veces el mismo día.',
      });
    }

    const timestamp = new Date().toISOString();

    await agregarRegistro([
      normalizarCedula(cedula),
      fecha,
      asisteNormalizado,
      asisteNormalizado === 'No' ? (motivo || '').trim() : '',
      bodega,
      persona.area,
      asisteNormalizado === 'Si' && horaSalidaReal ? horaSalidaReal.trim() : '',
      timestamp,
    ]);

    return res.status(200).json({ ok: true, nombre: persona.nombre });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
