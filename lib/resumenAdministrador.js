/**
 * Lógica de cruce entre el listado maestro y los registros de un día,
 * para la pantalla de Administrador. Separada en su propio módulo (sin
 * tocar Google Sheets) para poder probarla con datos de ejemplo.
 *
 * Reglas ya confirmadas con la usuaria:
 * - "Programado" = tiene al menos un registro ese día (Asiste Sí o No).
 *   "Faltante" = no tiene ningún registro ese día.
 * - Un duplicado (2+ registros de la misma cédula el mismo día) cuenta
 *   como programado, pero NO se calculan automáticamente sus horas
 *   extra/alimentación hasta que alguien lo revise.
 * - Un registro con cédula fuera del maestro, de un área fuera del
 *   alcance de la herramienta, o fuera del área seleccionada, se reporta
 *   como inconsistencia aparte, nunca se ignora en silencio.
 */
const { calcularHorasYAlimentacion, AREAS_PERMITIDAS } = require('./reglasNegocio');

/** Deja solo los dígitos de una cédula (debe coincidir con lib/googleSheets.js). */
function normalizarCedula(cedula) {
  return (cedula || '').toString().replace(/\D/g, '');
}

const OPCIONES_AREA = {
  PRODUCCION: ['PRODUCCION'],
  LOGISTICA: ['LOGISTICA'],
  AMBAS: ['PRODUCCION', 'LOGISTICA'],
};

/** Valor del filtro de Bodega que significa "no filtrar". */
const TODAS_LAS_BODEGAS = 'TODAS';

/** Arma el resumen completo (totales, programados, faltantes, duplicados...) para un conjunto de áreas. */
function construirResumen(areasFiltro, maestroCompleto, registrosDelDia) {
  const personalEnAlcance = maestroCompleto.filter((p) =>
    areasFiltro.includes((p.AREA || '').toUpperCase().trim())
  );
  const cedulasEnAlcance = new Set(personalEnAlcance.map((p) => normalizarCedula(p.Cedula)));

  const registrosPorCedula = {};
  registrosDelDia.forEach((r) => {
    const ced = normalizarCedula(r.Cedula);
    if (!cedulasEnAlcance.has(ced)) return;
    if (!registrosPorCedula[ced]) registrosPorCedula[ced] = [];
    registrosPorCedula[ced].push(r);
  });

  const programados = [];
  const duplicados = [];
  const faltantes = [];

  personalEnAlcance.forEach((persona) => {
    const ced = normalizarCedula(persona.Cedula);
    const nombre = persona['NOMBRE OPERARIO'] || '';
    const area = (persona.AREA || '').toUpperCase().trim();
    const registros = registrosPorCedula[ced] || [];

    if (registros.length === 0) {
      faltantes.push({ cedula: ced, nombre, area });
      return;
    }

    if (registros.length > 1) {
      duplicados.push({ cedula: ced, nombre, area, cantidadRegistros: registros.length });
      return;
    }

    const registro = registros[0];
    const asisteTexto = (registro.Asiste || '').trim();
    const siAsiste = asisteTexto.toLowerCase().startsWith('s');

    let calculo = null;
    if (siAsiste) {
      calculo = calcularHorasYAlimentacion({
        fecha: registro.Fecha,
        asiste: registro.Asiste,
        horaSalidaReal: registro.Hora_salida_real,
      });
    }

    programados.push({
      cedula: ced,
      nombre,
      area,
      bodega: registro.Bodega || '',
      asiste: asisteTexto,
      motivo: registro.Motivo || '',
      horaSalidaReal: registro.Hora_salida_real || '',
      calculo,
      // '' = sin confirmar todavía; 'Si' / 'No' = ya lo confirmó un administrador.
      asistioReal: (registro.Asistio_Real || '').trim(),
    });
  });

  const alimentacionPorBodega = {};
  programados.forEach((p) => {
    if (p.calculo && p.calculo.tieneAlimentacion) {
      alimentacionPorBodega[p.bodega] = (alimentacionPorBodega[p.bodega] || 0) + 1;
    }
  });
  const totalAlimentaciones = Object.values(alimentacionPorBodega).reduce((a, b) => a + b, 0);
  const revisionManual = programados.filter((p) => p.calculo && p.calculo.requiereRevisionManual);

  return {
    totalDebiaProgramarse: personalEnAlcance.length,
    totalProgramados: programados.length + duplicados.length,
    totalFaltantes: faltantes.length,
    totalDuplicados: duplicados.length,
    totalAlimentaciones,
    alimentacionPorBodega,
    programados,
    faltantes,
    duplicados,
    revisionManual,
  };
}

/**
 * Limita un resumen a una sola Bodega (confirmado con la usuaria el 2026-10-24).
 *
 * Solo se filtran las cosas que SÍ dependen de la Bodega: la tabla de
 * programados, las alimentaciones y los casos de revisión manual. Los
 * faltantes NO se filtran porque son personas que todavía no tienen ningún
 * registro ese día y, por lo tanto, todavía no tienen Bodega asignada; lo
 * mismo con los totales del día (debía programarse, programados, duplicados),
 * que siguen siendo del área completa. La interfaz avisa de esto en pantalla.
 */
function filtrarPorBodega(resumen, bodega) {
  if (!bodega || bodega === TODAS_LAS_BODEGAS) return resumen;

  const programados = resumen.programados.filter((p) => (p.bodega || '').trim() === bodega);

  const alimentacionPorBodega = {};
  programados.forEach((p) => {
    if (p.calculo && p.calculo.tieneAlimentacion) {
      alimentacionPorBodega[p.bodega] = (alimentacionPorBodega[p.bodega] || 0) + 1;
    }
  });

  return {
    ...resumen,
    programados,
    alimentacionPorBodega,
    totalAlimentaciones: Object.values(alimentacionPorBodega).reduce((a, b) => a + b, 0),
    revisionManual: programados.filter((p) => p.calculo && p.calculo.requiereRevisionManual),
    // Cuántos de los programados del día pertenecen a esta Bodega (los
    // totales de arriba siguen siendo del área completa, a propósito).
    totalProgramadosEnBodega: programados.length,
  };
}

/** Registros del día que no corresponden al maestro, a Producción/Logística en general, o al área seleccionada. */
function calcularFueraDeAlcance(maestroCompleto, registrosDelDia, areasFiltro) {
  const cedulasMaestro = new Map();
  maestroCompleto.forEach((p) => cedulasMaestro.set(normalizarCedula(p.Cedula), p));

  return registrosDelDia
    .map((r) => {
      const ced = normalizarCedula(r.Cedula);
      const persona = cedulasMaestro.get(ced);

      if (!persona) {
        return { cedula: ced, nombre: r.Nombre || '', motivo: 'No existe en el listado maestro.' };
      }

      const area = (persona.AREA || '').toUpperCase().trim();
      if (!AREAS_PERMITIDAS.includes(area)) {
        return {
          cedula: ced,
          nombre: persona['NOMBRE OPERARIO'] || '',
          motivo: `Es de un área fuera del alcance de esta herramienta (${area || 'sin área'}).`,
        };
      }

      if (!areasFiltro.includes(area)) {
        return {
          cedula: ced,
          nombre: persona['NOMBRE OPERARIO'] || '',
          motivo: `Es de ${area}, no del área que seleccionaste.`,
        };
      }

      return null;
    })
    .filter(Boolean);
}

/** Arma la respuesta completa (incluyendo el desglose por área cuando se selecciona "AMBAS"). */
function construirRespuesta({ fecha, areaSeleccionada, bodegaSeleccionada, maestroCompleto, registros }) {
  const areasFiltro = OPCIONES_AREA[areaSeleccionada];
  if (!areasFiltro) {
    throw new Error('Área inválida: debe ser PRODUCCION, LOGISTICA o AMBAS.');
  }

  const bodega = bodegaSeleccionada || TODAS_LAS_BODEGAS;

  const registrosDelDia = registros.filter((r) => (r.Fecha || '').trim() === (fecha || '').trim());
  const resumen = filtrarPorBodega(construirResumen(areasFiltro, maestroCompleto, registrosDelDia), bodega);
  const fueraDeAlcance = calcularFueraDeAlcance(maestroCompleto, registrosDelDia, areasFiltro);

  const respuesta = { fecha, area: areaSeleccionada, bodega, ...resumen, fueraDeAlcance };

  if (areaSeleccionada === 'AMBAS') {
    respuesta.porArea = {
      PRODUCCION: filtrarPorBodega(construirResumen(['PRODUCCION'], maestroCompleto, registrosDelDia), bodega),
      LOGISTICA: filtrarPorBodega(construirResumen(['LOGISTICA'], maestroCompleto, registrosDelDia), bodega),
    };
  }

  return respuesta;
}

module.exports = {
  construirResumen,
  calcularFueraDeAlcance,
  construirRespuesta,
  filtrarPorBodega,
  OPCIONES_AREA,
  TODAS_LAS_BODEGAS,
};
