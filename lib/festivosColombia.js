/**
 * Días festivos de Colombia, calculados automáticamente para cualquier año.
 *
 * No es una lista fija escrita a mano: se calcula con las mismas reglas
 * oficiales, así que funciona igual en 2026, 2027 y los años siguientes sin
 * que nadie tenga que actualizar nada.
 *
 * Las reglas son tres:
 *
 * 1. Festivos de fecha fija (nunca se mueven):
 *    1 de enero, 1 de mayo, 20 de julio, 7 de agosto, 8 y 25 de diciembre.
 *
 * 2. Festivos que se trasladan al lunes siguiente (Ley Emiliani, Ley 51 de
 *    1983): Reyes Magos (6 ene), San José (19 mar), San Pedro y San Pablo
 *    (29 jun), Asunción (15 ago), Día de la Raza (12 oct), Todos los Santos
 *    (1 nov) e Independencia de Cartagena (11 nov). Si la fecha ya cae lunes,
 *    se queda donde está.
 *
 * 3. Festivos que dependen de la Pascua (Domingo de Resurrección):
 *    - Jueves Santo y Viernes Santo: NO se trasladan (Pascua − 3 y − 2 días).
 *    - Ascensión del Señor, Corpus Christi y Sagrado Corazón: sí se trasladan
 *      al lunes, lo que equivale a Pascua + 43, + 64 y + 71 días.
 *
 * Verificado contra el calendario oficial de 2026 (ver las pruebas en
 * lib/__tests__/festivosColombia.test.js): por ejemplo, el 1 de noviembre de
 * 2026 cayó domingo y el festivo se corrió al lunes 2 de noviembre.
 */

/**
 * Domingo de Pascua (Resurrección) de un año, con el algoritmo de Meeus/Butcher
 * para el calendario gregoriano. Devuelve { mes, dia } con mes 1-12.
 */
function domingoDePascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

/** Convierte una fecha a texto "AAAA-MM-DD". Se usa UTC para evitar líos de huso horario. */
function aTextoISO(fechaUTC) {
  const anio = fechaUTC.getUTCFullYear();
  const mes = String(fechaUTC.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fechaUTC.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Suma días a una fecha UTC y devuelve una fecha nueva. */
function sumarDias(fechaUTC, dias) {
  return new Date(fechaUTC.getTime() + dias * 24 * 60 * 60 * 1000);
}

/**
 * Corre una fecha al lunes siguiente si no cae lunes (Ley Emiliani).
 * Si ya es lunes, la deja igual.
 */
function trasladarAlLunes(fechaUTC) {
  const diaSemana = fechaUTC.getUTCDay(); // 0=domingo, 1=lunes, ... 6=sábado
  if (diaSemana === 1) return fechaUTC;
  const diasHastaLunes = (8 - diaSemana) % 7;
  return sumarDias(fechaUTC, diasHastaLunes);
}

function fechaUTC(anio, mes, dia) {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/**
 * Devuelve los festivos de un año como un objeto { "AAAA-MM-DD": "Nombre" }.
 * El resultado se guarda en memoria para no recalcularlo en cada consulta.
 */
const cacheporAnio = {};

function festivosDelAnio(anio) {
  if (cacheporAnio[anio]) return cacheporAnio[anio];

  const festivos = {};
  const agregar = (fecha, nombre) => {
    festivos[aTextoISO(fecha)] = nombre;
  };

  // 1. Fechas fijas
  agregar(fechaUTC(anio, 1, 1), 'Año Nuevo');
  agregar(fechaUTC(anio, 5, 1), 'Día del Trabajo');
  agregar(fechaUTC(anio, 7, 20), 'Día de la Independencia');
  agregar(fechaUTC(anio, 8, 7), 'Batalla de Boyacá');
  agregar(fechaUTC(anio, 12, 8), 'Inmaculada Concepción');
  agregar(fechaUTC(anio, 12, 25), 'Navidad');

  // 2. Trasladables al lunes (Ley Emiliani)
  const trasladables = [
    [1, 6, 'Reyes Magos'],
    [3, 19, 'Día de San José'],
    [6, 29, 'San Pedro y San Pablo'],
    [8, 15, 'Asunción de la Virgen'],
    [10, 12, 'Día de la Raza'],
    [11, 1, 'Día de Todos los Santos'],
    [11, 11, 'Independencia de Cartagena'],
  ];
  trasladables.forEach(([mes, dia, nombre]) => {
    agregar(trasladarAlLunes(fechaUTC(anio, mes, dia)), nombre);
  });

  // 3. Dependientes de la Pascua
  const pascua = domingoDePascua(anio);
  const domingoPascua = fechaUTC(anio, pascua.mes, pascua.dia);
  agregar(sumarDias(domingoPascua, -3), 'Jueves Santo');
  agregar(sumarDias(domingoPascua, -2), 'Viernes Santo');
  // Estos tres ya vienen trasladados al lunes en el desplazamiento.
  agregar(sumarDias(domingoPascua, 43), 'Ascensión del Señor');
  agregar(sumarDias(domingoPascua, 64), 'Corpus Christi');
  agregar(sumarDias(domingoPascua, 71), 'Sagrado Corazón');

  cacheporAnio[anio] = festivos;
  return festivos;
}

/** True si esa fecha "AAAA-MM-DD" es festivo en Colombia. */
function esFestivo(fechaISO) {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec((fechaISO || '').trim());
  if (!coincide) return false;
  const anio = parseInt(coincide[1], 10);
  return Boolean(festivosDelAnio(anio)[fechaISO.trim()]);
}

/** Nombre del festivo ("Navidad", ...) o null si ese día no es festivo. */
function nombreDelFestivo(fechaISO) {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec((fechaISO || '').trim());
  if (!coincide) return null;
  const anio = parseInt(coincide[1], 10);
  return festivosDelAnio(anio)[fechaISO.trim()] || null;
}

module.exports = {
  esFestivo,
  nombreDelFestivo,
  festivosDelAnio,
  domingoDePascua,
};
