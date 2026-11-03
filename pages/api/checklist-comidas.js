/**
 * Lista de personas que tienen derecho a alimentación en una Bodega y
 * fecha específicas, para la pantalla de checklist de entrega de comidas.
 *
 * GET /api/checklist-comidas?fecha=YYYY-MM-DD&bodega=Bodega 222
 *
 * Se filtra por Bodega (no por Área) porque las comidas se entregan
 * físicamente en cada Bodega, sin importar si la persona es de Producción
 * o Logística (confirmado con la usuaria el 2026-09-29).
 */
const { leerMaestro, leerRegistros } = require('../../lib/googleSheets');
const { construirResumen, TODAS_LAS_AREAS } = require('../../lib/resumenAdministrador');
const { BODEGAS_VALIDAS } = require('../../lib/reglasNegocio');

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test((fecha || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { fecha, bodega } = req.query;

    if (!fechaValida(fecha)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una fecha válida.' });
    }
    if (!BODEGAS_VALIDAS.includes(bodega)) {
      return res.status(400).json({ ok: false, error: 'Selecciona una Bodega válida.' });
    }

    const [maestroCompleto, registros] = await Promise.all([leerMaestro(), leerRegistros()]);
    const registrosDelDia = registros.filter((r) => (r.Fecha || '').trim() === fecha.trim());

    // Se cruza con TODO el personal del maestro, sin filtrar por área: la
    // comida se entrega por Bodega y desde el 2026-11-03 entra todo el
    // personal, no solo Producción y Logística.
    const resumen = construirResumen(TODAS_LAS_AREAS, maestroCompleto, registrosDelDia);
    const deEstaBodega = resumen.programados.filter((p) => (p.bodega || '').trim() === bodega);

    const esperados = deEstaBodega
      .filter((p) => p.calculo && p.calculo.tieneAlimentacion && !p.calculo.requiereRevisionManual)
      .map((p) => ({ cedula: p.cedula, nombre: p.nombre, area: p.area, horaEfectiva: p.calculo.horaEfectiva }));

    const revisarManual = deEstaBodega
      .filter((p) => p.calculo && p.calculo.requiereRevisionManual)
      .map((p) => ({ cedula: p.cedula, nombre: p.nombre, area: p.area, motivo: p.calculo.motivoRevision }));

    return res.status(200).json({ ok: true, fecha, bodega, esperados, revisarManual });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
