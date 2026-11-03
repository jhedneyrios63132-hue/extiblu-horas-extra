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
 * - ALCANCE (cambiado el 2026-11-03): entra TODO el personal del listado
 *   maestro, sin importar el área (Calidad, Mantenimiento, Conductor,
 *   Fríos...). Antes solo contaban Producción y Logística.
 * - APOYO DE OTRAS ÁREAS (2026-11-03): cuando se filtra un área y ese día
 *   hay gente de otra área registrada, NO es un error — muchas veces van a
 *   apoyar. Se muestran aparte en "apoyo de otras áreas" y su alimentación
 *   SÍ se suma al total a pedir, porque igual van a comer ese día.
 * - La única inconsistencia que queda es una cédula que no existe en el
 *   listado maestro; esa sí se reporta aparte y nunca se ignora.
 */
const { calcularHorasYAlimentacion } = require('./reglasNegocio');

/** Deja solo los dígitos de una cédula (debe coincidir con lib/googleSheets.js). */
function normalizarCedula(cedula) {
  return (cedula || '').toString().replace(/\D/g, '');
}

/** Valor del filtro de Área que significa "todo el personal del maestro". */
const TODAS_LAS_AREAS = 'TODAS';

/** Lee el área de una fila del maestro, normalizada. */
function areaDe(personaMaestro) {
  return (personaMaestro.AREA || '').toUpperCase().trim();
}

/**
 * Lista de áreas que existen realmente en el maestro, ordenadas alfabéticamente.
 * Con esto el selector de la pantalla se arma solo: si mañana aparece un área
 * nueva en la hoja, sale en el filtro sin tocar el código.
 */
function areasDisponibles(maestroCompleto) {
  const areas = new Set();
  maestroCompleto.forEach((p) => {
    const area = areaDe(p);
    if (area) areas.add(area);
  });
  return Array.from(areas).sort();
}

/** Valor del filtro de Bodega que significa "no filtrar". */
const TODAS_LAS_BODEGAS = 'TODAS';

/**
 * Arma la fila de una persona programada a partir de su registro del día:
 * horas extra, alimentación y confirmación de asistencia. Se usa igual para
 * el personal del área seleccionada y para el apoyo de otras áreas.
 */
function construirEntrada(cedula, nombre, area, registro) {
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

  return {
    cedula,
    nombre,
    area,
    bodega: registro.Bodega || '',
    asiste: asisteTexto,
    motivo: registro.Motivo || '',
    horaSalidaReal: registro.Hora_salida_real || '',
    calculo,
    // '' = sin confirmar todavía; 'Si' / 'No' = ya lo confirmó un administrador.
    asistioReal: (registro.Asistio_Real || '').trim(),
  };
}

/**
 * Arma el resumen completo (totales, programados, faltantes, duplicados,
 * apoyo de otras áreas...) para un área.
 *
 * `areaFiltro` es el nombre de un área del maestro, o 'TODAS' para incluir a
 * todo el personal. Nadie del maestro queda fuera del alcance de la
 * herramienta: el filtro solo decide a quién se le exige estar programado.
 */
function construirResumen(areaFiltro, maestroCompleto, registrosDelDia) {
  const todasLasAreas = !areaFiltro || areaFiltro === TODAS_LAS_AREAS;
  const personalEnAlcance = todasLasAreas
    ? maestroCompleto.slice()
    : maestroCompleto.filter((p) => areaDe(p) === areaFiltro);
  const cedulasEnAlcance = new Set(personalEnAlcance.map((p) => normalizarCedula(p.Cedula)));

  // Todo el maestro, para poder reconocer a quien apoya desde otra área.
  const maestroPorCedula = new Map();
  maestroCompleto.forEach((p) => maestroPorCedula.set(normalizarCedula(p.Cedula), p));

  const registrosPorCedula = {};
  const registrosDeApoyo = {};
  registrosDelDia.forEach((r) => {
    const ced = normalizarCedula(r.Cedula);
    if (cedulasEnAlcance.has(ced)) {
      if (!registrosPorCedula[ced]) registrosPorCedula[ced] = [];
      registrosPorCedula[ced].push(r);
    } else if (maestroPorCedula.has(ced)) {
      // Está en el maestro pero es de otra área: viene a apoyar, no es error.
      if (!registrosDeApoyo[ced]) registrosDeApoyo[ced] = [];
      registrosDeApoyo[ced].push(r);
    }
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

    programados.push(construirEntrada(ced, nombre, area, registros[0]));
  });

  // Gente de otras áreas que vino a apoyar: se lista aparte, sin tratarla
  // como error, y su alimentación sí cuenta para el total a pedir.
  const apoyoOtrasAreas = [];
  Object.keys(registrosDeApoyo).forEach((ced) => {
    const persona = maestroPorCedula.get(ced);
    const registros = registrosDeApoyo[ced];
    if (registros.length > 1) {
      duplicados.push({
        cedula: ced,
        nombre: persona['NOMBRE OPERARIO'] || '',
        area: areaDe(persona),
        cantidadRegistros: registros.length,
        esApoyo: true,
      });
      return;
    }
    apoyoOtrasAreas.push(
      construirEntrada(ced, persona['NOMBRE OPERARIO'] || '', areaDe(persona), registros[0])
    );
  });

  // El total de alimentaciones incluye a los de apoyo (confirmado con la
  // usuaria el 2026-11-03): igual van a comer ese día.
  const conDerechoAComida = programados.concat(apoyoOtrasAreas);
  const alimentacionPorBodega = {};
  conDerechoAComida.forEach((p) => {
    if (p.calculo && p.calculo.tieneAlimentacion) {
      alimentacionPorBodega[p.bodega] = (alimentacionPorBodega[p.bodega] || 0) + 1;
    }
  });
  const totalAlimentaciones = Object.values(alimentacionPorBodega).reduce((a, b) => a + b, 0);
  const revisionManual = conDerechoAComida.filter((p) => p.calculo && p.calculo.requiereRevisionManual);

  return {
    apoyoOtrasAreas,
    totalApoyoOtrasAreas: apoyoOtrasAreas.length,
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

  const deLaBodega = (p) => (p.bodega || '').trim() === bodega;
  const programados = resumen.programados.filter(deLaBodega);
  const apoyoOtrasAreas = resumen.apoyoOtrasAreas.filter(deLaBodega);

  const alimentacionPorBodega = {};
  programados.concat(apoyoOtrasAreas).forEach((p) => {
    if (p.calculo && p.calculo.tieneAlimentacion) {
      alimentacionPorBodega[p.bodega] = (alimentacionPorBodega[p.bodega] || 0) + 1;
    }
  });

  return {
    ...resumen,
    programados,
    apoyoOtrasAreas,
    totalApoyoOtrasAreas: apoyoOtrasAreas.length,
    alimentacionPorBodega,
    totalAlimentaciones: Object.values(alimentacionPorBodega).reduce((a, b) => a + b, 0),
    revisionManual: programados
      .concat(apoyoOtrasAreas)
      .filter((p) => p.calculo && p.calculo.requiereRevisionManual),
    // Cuántos de los programados del día pertenecen a esta Bodega (los
    // totales de arriba siguen siendo del área completa, a propósito).
    totalProgramadosEnBodega: programados.length,
  };
}

/**
 * Registros del día cuya cédula NO existe en el listado maestro.
 *
 * Desde el 2026-11-03 esta es la única inconsistencia de este tipo: estar en
 * otra área ya no es un error (eso se reporta como "apoyo de otras áreas"),
 * porque todo el personal del maestro entra en la programación.
 */
function calcularFueraDeAlcance(maestroCompleto, registrosDelDia) {
  const cedulasMaestro = new Set(maestroCompleto.map((p) => normalizarCedula(p.Cedula)));

  return registrosDelDia
    .filter((r) => !cedulasMaestro.has(normalizarCedula(r.Cedula)))
    .map((r) => ({
      cedula: normalizarCedula(r.Cedula),
      nombre: r.Nombre || '',
      motivo: 'No existe en el listado maestro.',
    }));
}

/**
 * Arma la respuesta completa. Cuando se selecciona "TODAS" incluye además el
 * desglose separado por cada área que exista en el maestro.
 */
function construirRespuesta({ fecha, areaSeleccionada, bodegaSeleccionada, maestroCompleto, registros }) {
  const areas = areasDisponibles(maestroCompleto);
  const area = (areaSeleccionada || TODAS_LAS_AREAS).toUpperCase().trim();

  if (area !== TODAS_LAS_AREAS && !areas.includes(area)) {
    throw new Error(`Área inválida: "${area}" no existe en el listado maestro.`);
  }

  const bodega = bodegaSeleccionada || TODAS_LAS_BODEGAS;

  const registrosDelDia = registros.filter((r) => (r.Fecha || '').trim() === (fecha || '').trim());
  const resumen = filtrarPorBodega(construirResumen(area, maestroCompleto, registrosDelDia), bodega);
  const fueraDeAlcance = calcularFueraDeAlcance(maestroCompleto, registrosDelDia);

  const respuesta = { fecha, area, bodega, areasDisponibles: areas, ...resumen, fueraDeAlcance };

  if (area === TODAS_LAS_AREAS) {
    respuesta.porArea = {};
    areas.forEach((nombreArea) => {
      respuesta.porArea[nombreArea] = filtrarPorBodega(
        construirResumen(nombreArea, maestroCompleto, registrosDelDia),
        bodega
      );
    });
  }

  return respuesta;
}

module.exports = {
  construirResumen,
  calcularFueraDeAlcance,
  construirRespuesta,
  filtrarPorBodega,
  areasDisponibles,
  TODAS_LAS_AREAS,
  TODAS_LAS_BODEGAS,
};
