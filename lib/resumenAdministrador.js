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
function construirRespuesta({ fecha, areaSeleccionada, maestroCompleto, registros }) {
  const areasFiltro = OPCIONES_AREA[areaSeleccionada];
  if (!areasFiltro) {
    throw new Error('Área inválida: debe ser PRODUCCION, LOGISTICA o AMBAS.');
  }

  const registrosDelDia = registros.filter((r) => (r.Fecha || '').trim() === (fecha || '').trim());
  const resumen = construirResumen(areasFiltro, maestroCompleto, registrosDelDia);
  const fueraDeAlcance = calcularFueraDeAlcance(maestroCompleto, registrosDelDia, areasFiltro);

  const respuesta = { fecha, area: areaSeleccionada, ...resumen, fueraDeAlcance };

  if (areaSeleccionada === 'AMBAS') {
    respuesta.porArea = {
      PRODUCCION: construirResumen(['PRODUCCION'], maestroCompleto, registrosDelDia),
      LOGISTICA: construirResumen(['LOGISTICA'], maestroCompleto, registrosDelDia),
    };
  }

  return respuesta;
}

module.exports = {
  construirResumen,
  calcularFueraDeAlcance,
  construirRespuesta,
  OPCIONES_AREA,
};
