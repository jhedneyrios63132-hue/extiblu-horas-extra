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
const { calcularHorasYAlimentacion, diaDeSemana } = require('./reglasNegocio');

/**
 * Hora a la que sale el personal del turno sabatino fijo. Sale antes de que
 * llegue la comida (12:30), así que no lleva almuerzo.
 */
const HORA_SALIDA_TURNO_SABADO = '12:00';

/**
 * Entrada de una persona del turno sabatino que NO se registró.
 *
 * Confirmado con la usuaria el 2026-11-08: esta gente trabaja los sábados
 * por turno fijo y no manda registro porque ya sabe que le toca venir. Antes
 * aparecían como faltantes, lo cual era falso.
 *
 * Sus horas NO cuentan como extra —es su jornada normal— así que van en cero
 * y no suman en los reportes ni en la trazabilidad. Y no llevan almuerzo,
 * porque salen a las 12:00, antes de que llegue la comida.
 */
function construirEntradaTurnoSabado(cedula, nombre, area) {
  return {
    cedula,
    nombre,
    area,
    bodega: '',
    asiste: 'Si',
    motivo: '',
    horaSalidaReal: '',
    esTurnoSabado: true,
    calculo: {
      diaTipo: 'sabado',
      nombreFestivo: null,
      horaSalidaProgramada: HORA_SALIDA_TURNO_SABADO,
      horaEfectiva: HORA_SALIDA_TURNO_SABADO,
      minutosExtra: 0,
      horasExtraTexto: '0h 0m',
      tieneAlimentacion: false,
      requiereRevisionManual: false,
      motivoRevision: null,
    },
    asistioReal: '',
  };
}

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
 * Normaliza el filtro de áreas, que desde el 2026-11-08 puede traer VARIAS
 * (la usuaria normalmente marca Producción y Logística juntas).
 *
 * Acepta un arreglo de áreas, una sola área como texto, o 'TODAS'.
 * Devuelve un arreglo de áreas en mayúsculas, o `null` cuando significa
 * "todo el personal del maestro".
 */
function normalizarAreasFiltro(areas) {
  if (!areas) return null;
  const lista = Array.isArray(areas) ? areas : [areas];
  const limpias = lista.map((a) => (a || '').toString().toUpperCase().trim()).filter(Boolean);
  if (limpias.length === 0 || limpias.includes(TODAS_LAS_AREAS)) return null;
  return limpias;
}

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
 * `areasFiltro` puede ser un arreglo de áreas del maestro (desde el
 * 2026-11-08 se pueden marcar varias a la vez), el nombre de una sola, o
 * 'TODAS' para incluir a todo el personal. Nadie del maestro queda fuera del
 * alcance de la herramienta: el filtro solo decide a quién se le exige estar
 * programado.
 */
function construirResumen(areasFiltro, maestroCompleto, registrosDelDia, opciones = {}) {
  const { fecha = null, cedulasTurnoSabado = [] } = opciones;

  // El turno sabatino solo aplica los sábados (confirmado el 2026-11-08).
  let esSabado = false;
  try {
    esSabado = fecha ? diaDeSemana(fecha) === 6 : false;
  } catch (error) {
    esSabado = false;
  }
  const turnoSabado = new Set((cedulasTurnoSabado || []).map(normalizarCedula));

  const areas = normalizarAreasFiltro(areasFiltro);
  const personalEnAlcance =
    areas === null ? maestroCompleto.slice() : maestroCompleto.filter((p) => areas.includes(areaDe(p)));
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
      // Si es sábado y la persona es del turno fijo, no es una faltante:
      // se cuenta sola como programada hasta las 12:00, sin almuerzo.
      if (esSabado && turnoSabado.has(ced)) {
        programados.push(construirEntradaTurnoSabado(ced, nombre, area));
        return;
      }
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
 * Resumen de planeación: cuánta gente viene ese día, separada por área
 * (pedido de la usuaria el 2026-11-26: los totales de arriba solo hablaban
 * de alimentación, pero también necesita saber cuánta gente llega).
 *
 * Cuenta a todo el que SÍ viene: el personal de las áreas marcadas y también
 * el apoyo de otras áreas, porque para planear da igual de dónde vengan.
 * Quien avisó que no viene no se cuenta. Dentro de cada área se muestra a
 * qué hora sale la gente, porque es lo que hace falta para planear el día.
 *
 * Los duplicados se reportan aparte: como no se sabe cuál de sus registros
 * es el bueno, no se cuentan, pero se avisa cuántos hay para que el total
 * no parezca más exacto de lo que es.
 */
function construirQuienesVienen(programados, apoyoOtrasAreas, duplicados) {
  const vienen = programados
    .concat(apoyoOtrasAreas || [])
    .filter((p) => p.calculo && !p.calculo.requiereRevisionManual);

  const porArea = {};
  vienen.forEach((p) => {
    const area = p.area || '(sin área)';
    if (!porArea[area]) porArea[area] = { total: 0, porHora: {} };
    porArea[area].total += 1;
    const hora = (p.calculo.horaEfectiva || 'sin hora').trim();
    porArea[area].porHora[hora] = (porArea[area].porHora[hora] || 0) + 1;
  });

  return {
    total: vienen.length,
    porArea: Object.keys(porArea)
      .sort()
      .map((area) => ({
        area,
        total: porArea[area].total,
        // Horas ordenadas de la más temprana a la más tarde.
        porHora: Object.keys(porArea[area].porHora)
          .sort()
          .map((hora) => ({ hora, total: porArea[area].porHora[hora] })),
      })),
    pendientesPorRevisar: (duplicados || []).length,
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
 * Arma la respuesta completa.
 *
 * `areasSeleccionadas` puede traer varias áreas a la vez (2026-11-08).
 * Cuando hay más de una seleccionada —o cuando están todas— se incluye
 * además el desglose separado por cada una de esas áreas.
 */
function construirRespuesta({
  fecha,
  areasSeleccionadas,
  bodegaSeleccionada,
  maestroCompleto,
  registros,
  cedulasTurnoSabado = [],
}) {
  const areas = areasDisponibles(maestroCompleto);
  const seleccionadas = normalizarAreasFiltro(areasSeleccionadas);

  if (seleccionadas) {
    const invalida = seleccionadas.find((a) => !areas.includes(a));
    if (invalida) {
      throw new Error(`Área inválida: "${invalida}" no existe en el listado maestro.`);
    }
  }

  // Las áreas que realmente se están mirando (todas, si no se filtró).
  const areasEnUso = seleccionadas || areas;
  const bodega = bodegaSeleccionada || TODAS_LAS_BODEGAS;

  const registrosDelDia = registros.filter((r) => (r.Fecha || '').trim() === (fecha || '').trim());
  const opcionesTurno = { fecha, cedulasTurnoSabado };
  const resumen = filtrarPorBodega(
    construirResumen(seleccionadas, maestroCompleto, registrosDelDia, opcionesTurno),
    bodega
  );
  const fueraDeAlcance = calcularFueraDeAlcance(maestroCompleto, registrosDelDia);

  const respuesta = {
    fecha,
    quienesVienen: construirQuienesVienen(resumen.programados, resumen.apoyoOtrasAreas, resumen.duplicados),
    areas: areasEnUso,
    todasLasAreas: seleccionadas === null,
    bodega,
    areasDisponibles: areas,
    ...resumen,
    fueraDeAlcance,
  };

  // Desglose por área solo cuando se está mirando más de una.
  if (areasEnUso.length > 1) {
    respuesta.porArea = {};
    areasEnUso.forEach((nombreArea) => {
      respuesta.porArea[nombreArea] = filtrarPorBodega(
        construirResumen([nombreArea], maestroCompleto, registrosDelDia, opcionesTurno),
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
  construirQuienesVienen,
  areasDisponibles,
  normalizarAreasFiltro,
  TODAS_LAS_AREAS,
  TODAS_LAS_BODEGAS,
};
