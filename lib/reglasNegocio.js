/**
 * Reglas de negocio para horas extra y alimentación.
 *
 * Esta es la ÚNICA lógica aprobada por la usuaria (ver documento
 * "logica-propuesta-v1.md" en el proyecto de Claude). No se debe cambiar
 * ningún número ni regla aquí sin confirmar antes con ella.
 *
 * ------------------------------------------------------------------
 * RESUMEN DE LAS REGLAS (español, tal como se validaron):
 *
 * ENTRE SEMANA (lunes a viernes):
 *   - Hora de salida normal: 3:00 p.m.
 *   - Si Asiste = "No": no hay horas extra ni alimentación.
 *   - Si Asiste = "Sí" y NO hay hora de salida real registrada: se asume
 *     que cumple la programación general hasta las 6:00 p.m. (3 horas extra).
 *   - Si Asiste = "Sí" y SÍ hay hora de salida real: horas extra = hora
 *     real menos 3:00 p.m.
 *   - Alimentación: se otorga cuando las horas extra son 2:00 o más.
 *
 * SÁBADO, DOMINGO Y FESTIVO (el domingo se confirmó el 2026-10-24 y los
 * festivos el 2026-11-03; los tres usan exactamente la misma regla):
 *   - No es día normal de trabajo: todo lo trabajado ese día es "extra".
 *   - Turno típico: 6:00 a.m. a 2:00 p.m.
 *   - La alimentación NO depende de la cantidad de horas trabajadas, sino
 *     de si la persona sigue presente cuando llega la comida (aprox.
 *     12:30 p.m.). Si su hora efectiva de salida es ANTES de las
 *     12:30 p.m., no se cuenta alimentación; si es igual o después, sí se
 *     cuenta. Por eso quien sale a las 12:00 no lleva almuerzo.
 *   - Los festivos se reconocen solos con el calendario oficial colombiano
 *     (ver lib/festivosColombia.js), incluida la Ley Emiliani que corre
 *     varios festivos al lunes siguiente. No hay que cargarlos a mano.
 * ------------------------------------------------------------------
 */
const { esFestivo, nombreDelFestivo } = require('./festivosColombia');

// ---- Constantes de negocio (fáciles de encontrar y ajustar si cambian) ----
const HORA_SALIDA_NORMAL_SEMANA = '15:00'; // 3:00 p.m.
const HORA_ASUMIDA_FIN_SEMANA_SIN_DATO = '18:00'; // 6:00 p.m.
const MINUTOS_MINIMOS_PARA_ALIMENTACION_SEMANA = 2 * 60; // 2 horas

// Hora de entrada del personal. Ninguna hora de SALIDA puede ser anterior a
// esta: nadie puede salir antes de haber entrado (confirmado con la usuaria
// el 2026-11-08, porque estaban registrando salidas como "01:00").
// No hay tope superior: sí pueden quedarse hasta tarde.
const HORA_ENTRADA = '06:00';

// Estas tres aplican a sábado, domingo y festivo (misma regla).
const HORA_INICIO_SABADO = '06:00';
const HORA_ASUMIDA_FIN_SABADO_SIN_DATO = '14:00'; // 2:00 p.m. (turno típico)
const HORA_LIMITE_ALIMENTACION_SABADO = '12:30'; // llega la comida

// NOTA (2026-11-03): antes existía aquí una constante AREAS_PERMITIDAS que
// limitaba la herramienta a Producción y Logística. Se eliminó porque la
// usuaria confirmó que TODO el personal del listado maestro entra en la
// programación, sin importar el área.

// Bodegas válidas para el campo "Bodega" del registro diario (destino de
// entrega de la alimentación). Confirmado con la usuaria el 2026-09-29.
const BODEGAS_VALIDAS = ['Bodega 222', 'Bodega 224', 'Bodega 230'];

// ---------------------------------------------------------------------

/** Convierte "HH:MM" (24 horas) a minutos desde medianoche. Lanza error si el formato no es válido. */
function horaAMinutos(horaTexto) {
  const coincide = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec((horaTexto || '').trim());
  if (!coincide) {
    throw new Error(`Formato de hora inválido: "${horaTexto}". Se espera "HH:MM" en formato 24 horas.`);
  }
  const horas = parseInt(coincide[1], 10);
  const minutos = parseInt(coincide[2], 10);
  return horas * 60 + minutos;
}

/** Da formato "Xh Ym" a una cantidad de minutos (puede ser negativa). */
function formatearDuracion(minutosTotales) {
  const signo = minutosTotales < 0 ? '-' : '';
  const abs = Math.abs(minutosTotales);
  const horas = Math.floor(abs / 60);
  const minutos = abs % 60;
  return `${signo}${horas}h ${minutos}m`;
}

/**
 * Devuelve 0=domingo, 1=lunes, ..., 6=sábado para una fecha "YYYY-MM-DD".
 * Se calcula sin usar Date() para evitar problemas de huso horario.
 */
function diaDeSemana(fechaISO) {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec((fechaISO || '').trim());
  if (!coincide) {
    throw new Error(`Formato de fecha inválido: "${fechaISO}". Se espera "YYYY-MM-DD".`);
  }
  const anio = parseInt(coincide[1], 10);
  const mes = parseInt(coincide[2], 10);
  const dia = parseInt(coincide[3], 10);
  // Congruencia de Zeller (evita problemas de zona horaria de Date()).
  const m = mes < 3 ? mes + 12 : mes;
  const a = mes < 3 ? anio - 1 : anio;
  const k = a % 100;
  const j = Math.floor(a / 100);
  const h = (dia + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
  // h: 0=sábado, 1=domingo, 2=lunes, ... -> lo convertimos a 0=domingo..6=sábado
  return (h + 6) % 7;
}

/**
 * Valida que una hora de salida registrada tenga sentido.
 *
 * Regla confirmada con la usuaria el 2026-11-08: la jornada entra a las
 * 6:00 a.m., así que una salida anterior a esa hora es imposible — estaban
 * llegando registros como "01:00" que después tocaba corregir a mano. No hay
 * tope por arriba: sí se pueden quedar hasta tarde.
 *
 * Se usa igual en la pantalla de Registro (autoservicio) y al editar desde el
 * Panel de Administrador, para que no entren datos malos por ningún lado.
 *
 * @returns {{valida: boolean, motivo: string|null}}
 */
function validarHoraSalida(horaTexto) {
  const texto = (horaTexto || '').trim();
  if (!texto) {
    // Vacío es válido: significa "jornada completa", no es un error.
    return { valida: true, motivo: null };
  }

  let minutos;
  try {
    minutos = horaAMinutos(texto);
  } catch (error) {
    return {
      valida: false,
      motivo: 'La hora de salida no es válida. Escríbela en formato HH:MM de 24 horas, por ejemplo 16:30.',
    };
  }

  if (minutos < horaAMinutos(HORA_ENTRADA)) {
    return {
      valida: false,
      motivo:
        `La hora de salida (${texto}) es anterior a la hora de entrada (${HORA_ENTRADA}). ` +
        'Revisa el dato: no se puede salir antes de entrar. Si trabajas en formato 24 horas, ' +
        'recuerda que la tarde se escribe 13:00, 14:00, y así sucesivamente.',
    };
  }

  return { valida: true, motivo: null };
}

/**
 * Calcula las horas extra y el derecho a alimentación de una persona para un día.
 *
 * @param {Object} datos
 * @param {string} datos.fecha - "YYYY-MM-DD"
 * @param {string} datos.asiste - "Si" o "No" (no sensible a mayúsculas/tildes)
 * @param {string|null} datos.horaSalidaReal - "HH:MM" 24h, o null/"" si no aplica
 * @returns {{
 *   diaTipo: 'entre_semana'|'sabado'|'domingo',
 *   horaSalidaProgramada: string|null,
 *   horaEfectiva: string|null,
 *   minutosExtra: number|null,
 *   horasExtraTexto: string|null,
 *   tieneAlimentacion: boolean,
 *   requiereRevisionManual: boolean,
 *   motivoRevision: string|null
 * }}
 */
function calcularHorasYAlimentacion({ fecha, asiste, horaSalidaReal }) {
  const asisteNormalizado = (asiste || '').trim().toLowerCase();
  const siAsiste = asisteNormalizado === 'si' || asisteNormalizado === 'sí';

  const diaNumero = diaDeSemana(fecha);
  const esSabado = diaNumero === 6;
  const esDomingo = diaNumero === 0;
  const diaFestivo = esFestivo(fecha);

  const resultadoBase = {
    diaTipo: diaFestivo ? 'festivo' : esDomingo ? 'domingo' : esSabado ? 'sabado' : 'entre_semana',
    // Nombre del festivo cuando aplica (ej. "Día de Todos los Santos"),
    // para poder mostrarlo en pantalla y que se entienda por qué se calculó
    // con la regla de fin de semana y no con la de entre semana.
    nombreFestivo: diaFestivo ? nombreDelFestivo(fecha) : null,
    horaSalidaProgramada: null,
    horaEfectiva: null,
    minutosExtra: null,
    horasExtraTexto: null,
    tieneAlimentacion: false,
    requiereRevisionManual: false,
    motivoRevision: null,
  };

  // Si no asiste, no hay horas extra ni alimentación (pero no es un error).
  if (!siAsiste) {
    return resultadoBase;
  }

  // Sábado, domingo y festivo comparten exactamente la misma regla.
  if (esSabado || esDomingo || diaFestivo) {
    const nombreDia = diaFestivo ? 'festivo' : esDomingo ? 'domingo' : 'sábado';
    resultadoBase.horaSalidaProgramada = HORA_ASUMIDA_FIN_SABADO_SIN_DATO;

    let horaEfectivaTexto = horaSalidaReal && horaSalidaReal.trim() ? horaSalidaReal.trim() : HORA_ASUMIDA_FIN_SABADO_SIN_DATO;

    let minutosEfectivos;
    try {
      minutosEfectivos = horaAMinutos(horaEfectivaTexto);
    } catch (error) {
      return {
        ...resultadoBase,
        requiereRevisionManual: true,
        motivoRevision: `No se pudo interpretar la hora de salida real ("${horaSalidaReal}"). ${error.message}`,
      };
    }

    const minutosInicio = horaAMinutos(HORA_INICIO_SABADO);
    const minutosExtra = minutosEfectivos - minutosInicio;

    if (minutosExtra < 0) {
      return {
        ...resultadoBase,
        requiereRevisionManual: true,
        motivoRevision: `La hora de salida real (${horaEfectivaTexto}) es anterior al inicio del turno de ${nombreDia} (${HORA_INICIO_SABADO}).`,
      };
    }

    const minutosLimiteAlimentacion = horaAMinutos(HORA_LIMITE_ALIMENTACION_SABADO);
    const tieneAlimentacion = minutosEfectivos >= minutosLimiteAlimentacion;

    return {
      ...resultadoBase,
      horaEfectiva: horaEfectivaTexto,
      minutosExtra,
      horasExtraTexto: formatearDuracion(minutosExtra),
      tieneAlimentacion,
    };
  }

  // Entre semana (lunes a viernes)
  resultadoBase.horaSalidaProgramada = HORA_ASUMIDA_FIN_SEMANA_SIN_DATO;

  let horaEfectivaTexto = horaSalidaReal && horaSalidaReal.trim() ? horaSalidaReal.trim() : HORA_ASUMIDA_FIN_SEMANA_SIN_DATO;

  let minutosEfectivos;
  try {
    minutosEfectivos = horaAMinutos(horaEfectivaTexto);
  } catch (error) {
    return {
      ...resultadoBase,
      requiereRevisionManual: true,
      motivoRevision: `No se pudo interpretar la hora de salida real ("${horaSalidaReal}"). ${error.message}`,
    };
  }

  const minutosSalidaNormal = horaAMinutos(HORA_SALIDA_NORMAL_SEMANA);
  const minutosExtra = minutosEfectivos - minutosSalidaNormal;

  if (minutosExtra < 0) {
    return {
      ...resultadoBase,
      requiereRevisionManual: true,
      motivoRevision: `La hora de salida real (${horaEfectivaTexto}) es anterior a la hora normal de salida (${HORA_SALIDA_NORMAL_SEMANA}).`,
    };
  }

  const tieneAlimentacion = minutosExtra >= MINUTOS_MINIMOS_PARA_ALIMENTACION_SEMANA;

  return {
    ...resultadoBase,
    horaEfectiva: horaEfectivaTexto,
    minutosExtra,
    horasExtraTexto: formatearDuracion(minutosExtra),
    tieneAlimentacion,
  };
}

module.exports = {
  calcularHorasYAlimentacion,
  validarHoraSalida,
  horaAMinutos,
  formatearDuracion,
  diaDeSemana,
  // Constantes exportadas por si la interfaz necesita mostrarlas
  HORA_SALIDA_NORMAL_SEMANA,
  HORA_ASUMIDA_FIN_SEMANA_SIN_DATO,
  MINUTOS_MINIMOS_PARA_ALIMENTACION_SEMANA,
  HORA_ENTRADA,
  HORA_INICIO_SABADO,
  HORA_ASUMIDA_FIN_SABADO_SIN_DATO,
  HORA_LIMITE_ALIMENTACION_SABADO,
  BODEGAS_VALIDAS,
};
