/**
 * Registra a alguien que asistió SIN estar programado ese día y lo deja ya
 * confirmado como asistido (confirmado con la usuaria el 2026-11-03).
 *
 * Crea la fila del día como si se hubiera registrado normalmente —con su
 * Bodega— y además le marca Asistio_Real = "Si", porque la persona ya está
 * ahí: por eso la estamos escaneando. Así cuenta para la alimentación y
 * para su trazabilidad igual que cualquier otro registro.
 *
 * POST /api/registrar-asistido
 * body: { cedula, fecha ("YYYY-MM-DD"), bodega }
 */
const {
  buscarPersonaPorCedula,
  existeRegistroParaFecha,
  agregarRegistro,
  leerRegistros,
  normalizarCedula,
  actualizarAsistenciaReal,
} = require('../../lib/googleSheets');
const { BODEGAS_VALIDAS } = require('../../lib/reglasNegocio');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { cedula, fecha, bodega } = req.body || {};

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida.' });
    }
    if (!BODEGAS_VALIDAS.includes(bodega)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una Bodega válida.' });
    }

    const persona = await buscarPersonaPorCedula(cedula);
    if (!persona.encontrada) {
      return res.status(404).json({ ok: false, error: persona.motivo });
    }

    // Si ya tenía registro ese día no se crea otro: eso sería un duplicado.
    // En ese caso se confirma el que ya existe.
    const yaExiste = await existeRegistroParaFecha(cedula, fecha);
    if (yaExiste) {
      return res.status(409).json({
        ok: false,
        error: 'Esa persona ya tiene un registro ese día; confírmale la asistencia desde la lista.',
      });
    }

    const cedulaNormalizada = normalizarCedula(cedula);

    // Mismo orden de columnas que la pantalla de Registro:
    // Cedula, Nombre, Fecha, Asiste, Motivo, Bodega, Area, Hora_salida_real, Timestamp.
    await agregarRegistro([
      cedulaNormalizada,
      persona.nombre,
      fecha,
      'Si',
      '',
      bodega,
      persona.area,
      '',
      new Date().toISOString(),
    ]);

    // Se vuelve a leer para ubicar la fila recién creada y marcarle la
    // asistencia confirmada (columna J).
    const registros = await leerRegistros();
    const creado = registros.find(
      (r) => normalizarCedula(r.Cedula) === cedulaNormalizada && (r.Fecha || '').trim() === fecha.trim()
    );
    if (creado) {
      await actualizarAsistenciaReal(creado._fila, 'Si');
    }

    return res.status(200).json({ ok: true, nombre: persona.nombre, area: persona.area });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
