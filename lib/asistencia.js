/**
 * Lógica de la pantalla "Confirmar asistencia" (escaneo de cédulas).
 *
 * Idea de uso, confirmada con la usuaria el 2026-11-03: al final de la
 * jornada alguien va escaneando (o escribiendo) la cédula de cada persona
 * que sí se quedó. Cada confirmación desaparece de la lista, así que lo que
 * queda al final son justamente los que NO asistieron.
 *
 * Reglas:
 * - A la lista por confirmar solo entran los que estaban programados ese día
 *   con Asiste = "Sí" y que todavía no tienen confirmación.
 * - Quien avisó que NO iba (Asiste = "No") no aparece en la lista, pero si
 *   aparece y lo escanean, igual se le puede confirmar la asistencia.
 * - Quien asistió sin estar programado se le crea el registro del día y se
 *   marca como asistido (necesita Bodega).
 * - Una cédula que no existe en el listado maestro nunca se asume: se avisa.
 *
 * Este módulo es lógica pura (no toca Google Sheets) para poder probarlo.
 */

/** Deja solo los dígitos de una cédula (debe coincidir con lib/googleSheets.js). */
function normalizarCedula(cedula) {
  return (cedula || '').toString().replace(/\D/g, '');
}

/** Quita tildes y pasa a mayúsculas, para poder buscar por nombre sin pelear con los acentos. */
function normalizarTexto(texto) {
  return (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function siDice(valor) {
  return (valor || '').trim().toLowerCase().startsWith('s');
}

/**
 * Arma el estado de la confirmación de asistencia de un día.
 *
 * Devuelve las personas separadas en: pendientes por confirmar, ya
 * confirmadas como asistidas, marcadas como no asistidas, y las que habían
 * avisado que no venían.
 */
function construirAsistencia(fecha, maestroCompleto, registros) {
  const fechaBuscada = (fecha || '').trim();
  const maestroPorCedula = new Map();
  maestroCompleto.forEach((p) => maestroPorCedula.set(normalizarCedula(p.Cedula), p));

  const pendientes = [];
  const confirmados = [];
  const noAsistieron = [];
  const avisaronQueNo = [];

  registros
    .filter((r) => (r.Fecha || '').trim() === fechaBuscada)
    .forEach((r) => {
      const cedula = normalizarCedula(r.Cedula);
      const persona = maestroPorCedula.get(cedula);
      const entrada = {
        cedula,
        nombre: persona ? persona['NOMBRE OPERARIO'] || '' : r.Nombre || '',
        area: persona ? (persona.AREA || '').toUpperCase().trim() : '',
        bodega: r.Bodega || '',
        enMaestro: Boolean(persona),
      };

      if (!siDice(r.Asiste)) {
        avisaronQueNo.push({ ...entrada, motivo: r.Motivo || '' });
        return;
      }

      const asistioReal = (r.Asistio_Real || '').trim();
      if (!asistioReal) pendientes.push(entrada);
      else if (siDice(asistioReal)) confirmados.push(entrada);
      else noAsistieron.push(entrada);
    });

  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre);
  pendientes.sort(porNombre);
  confirmados.sort(porNombre);
  noAsistieron.sort(porNombre);
  avisaronQueNo.sort(porNombre);

  return {
    fecha: fechaBuscada,
    pendientes,
    confirmados,
    noAsistieron,
    avisaronQueNo,
    totalProgramados: pendientes.length + confirmados.length + noAsistieron.length,
    totalPendientes: pendientes.length,
    totalConfirmados: confirmados.length,
    totalNoAsistieron: noAsistieron.length,
  };
}

/**
 * Decide qué hacer con una cédula escaneada, según el estado del día.
 *
 * Devuelve { tipo, persona, mensaje } donde tipo es uno de:
 * - 'pendiente'          -> estaba por confirmar: se marca asistido.
 * - 'ya_confirmado'      -> ya lo habían escaneado antes.
 * - 'estaba_como_no'     -> estaba marcado como que no asistió; se corrige.
 * - 'aviso_que_no_venia' -> había dicho que no venía pero llegó.
 * - 'sin_programar'      -> está en el maestro pero no tenía registro ese día.
 * - 'desconocida'        -> no existe en el listado maestro.
 */
function clasificarEscaneo(cedulaEscaneada, asistencia, maestroCompleto) {
  const cedula = normalizarCedula(cedulaEscaneada);
  if (!cedula) {
    return { tipo: 'desconocida', persona: null, mensaje: 'Escribe un número de cédula.' };
  }

  const buscarEn = (lista) => lista.find((p) => p.cedula === cedula);

  const pendiente = buscarEn(asistencia.pendientes);
  if (pendiente) {
    return { tipo: 'pendiente', persona: pendiente, mensaje: `✅ ${pendiente.nombre} — asistencia confirmada.` };
  }

  const confirmado = buscarEn(asistencia.confirmados);
  if (confirmado) {
    return {
      tipo: 'ya_confirmado',
      persona: confirmado,
      mensaje: `⚠️ A ${confirmado.nombre} ya se le había confirmado la asistencia.`,
    };
  }

  const marcadoNo = buscarEn(asistencia.noAsistieron);
  if (marcadoNo) {
    return {
      tipo: 'estaba_como_no',
      persona: marcadoNo,
      mensaje: `${marcadoNo.nombre} estaba marcado como que NO asistió. Se corrige a asistió.`,
    };
  }

  const avisoQueNo = buscarEn(asistencia.avisaronQueNo);
  if (avisoQueNo) {
    return {
      tipo: 'aviso_que_no_venia',
      persona: avisoQueNo,
      mensaje: `${avisoQueNo.nombre} había avisado que no venía, pero se presentó. Se marca como asistido.`,
    };
  }

  const enMaestro = maestroCompleto.find((p) => normalizarCedula(p.Cedula) === cedula);
  if (!enMaestro) {
    return {
      tipo: 'desconocida',
      persona: null,
      mensaje: `La cédula ${cedula} no existe en el listado maestro. Verifica que esté bien escrita.`,
    };
  }

  return {
    tipo: 'sin_programar',
    persona: {
      cedula,
      nombre: enMaestro['NOMBRE OPERARIO'] || '',
      area: (enMaestro.AREA || '').toUpperCase().trim(),
      bodega: '',
      enMaestro: true,
    },
    mensaje: `${enMaestro['NOMBRE OPERARIO'] || ''} asistió sin estar programado. Indica la Bodega para registrarlo.`,
  };
}

/**
 * Busca personas por nombre dentro de una lista (para quien no trae la
 * cédula a mano). Devuelve como máximo `limite` coincidencias.
 */
function buscarPorNombre(texto, lista, limite = 8) {
  const buscado = normalizarTexto(texto);
  if (buscado.length < 2) return [];
  return lista.filter((p) => normalizarTexto(p.nombre).includes(buscado)).slice(0, limite);
}

module.exports = {
  construirAsistencia,
  clasificarEscaneo,
  buscarPorNombre,
  normalizarTexto,
};
