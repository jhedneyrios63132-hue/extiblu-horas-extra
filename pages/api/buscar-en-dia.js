/**
 * Busca una persona (por cédula o por nombre) y responde qué registró ese
 * día: si viene, si avisó que no viene y por qué, su bodega y su hora.
 *
 * Es para no tener que recorrer las listas a ojo buscando a alguien puntual
 * (pedido de la usuaria el 2026-11-08).
 *
 * GET /api/buscar-en-dia?fecha=YYYY-MM-DD&q=texto&areas=PRODUCCION,LOGISTICA
 *
 * `areas` es opcional: solo sirve para avisar si la persona encontrada
 * pertenece a un área que no está marcada en el filtro. La búsqueda siempre
 * recorre TODO el listado maestro.
 */
const { leerMaestro, leerRegistros } = require('../../lib/googleSheets');
const { buscarPersonasEnElDia } = require('../../lib/busquedaPersona');
const { normalizarAreasFiltro } = require('../../lib/resumenAdministrador');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { fecha, q, areas } = req.query;

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una fecha válida.' });
    }

    const texto = (q || '').toString().trim();
    if (texto.length < 2) {
      return res.status(200).json({ ok: true, resultados: [] });
    }

    const areasSeleccionadas = normalizarAreasFiltro(
      (areas || '').toString().split(',').map((a) => a.trim()).filter(Boolean)
    );

    const [maestroCompleto, registros] = await Promise.all([leerMaestro(), leerRegistros()]);
    const registrosDelDia = registros.filter((r) => (r.Fecha || '').trim() === fecha.trim());

    const resultados = buscarPersonasEnElDia(texto, maestroCompleto, registrosDelDia, areasSeleccionadas);

    return res.status(200).json({ ok: true, resultados });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
