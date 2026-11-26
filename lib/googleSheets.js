/**
 * Conexión a Google Sheets usando una cuenta de servicio.
 *
 * IMPORTANTE sobre seguridad:
 * - Las credenciales SIEMPRE se leen de variables de entorno (nunca están
 *   escritas en este archivo ni en ningún otro archivo del proyecto).
 * - Este módulo solo se debe usar del lado del servidor (dentro de
 *   pages/api/*), nunca importado desde código que corra en el navegador.
 *
 * Variables de entorno requeridas (ver .env.example y README.md):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *   SHEET_ID_MAESTRO, TAB_MAESTRO
 *   SHEET_ID_REGISTRO, TAB_REGISTRO
 */

const { google } = require('googleapis');

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error(
      'Faltan las variables de entorno GOOGLE_SERVICE_ACCOUNT_EMAIL o ' +
        'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY. Revisa el archivo .env.local ' +
        '(o las variables de entorno en Vercel) según el README.'
    );
  }

  // Cuando la llave se pega en una variable de entorno, los saltos de línea
  // suelen quedar como el texto literal "\n" en vez de un salto real.
  // Esta línea los convierte de vuelta a saltos de línea reales.
  privateKey = privateKey.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Lee un rango de una hoja y lo devuelve como arreglo de objetos,
 * usando la primera fila como nombres de columna.
 *
 * Ejemplo: leerHojaComoObjetos(sheetId, "Control personal") devuelve
 * [{ Cedula: "123", "Nombre Operario": "...", Area: "PRODUCCION" }, ...]
 */
async function leerHojaComoObjetos(sheetId, nombrePestana) {
  const sheets = getSheetsClient();
  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: nombrePestana,
  });

  const filas = respuesta.data.values || [];
  if (filas.length === 0) return [];

  const encabezados = filas[0].map((h) => (h || '').trim());
  const datos = filas.slice(1).map((fila, indice) => {
    const objeto = {};
    encabezados.forEach((encabezado, i) => {
      objeto[encabezado] = (fila[i] || '').toString().trim();
    });
    // Número de fila real en la hoja (1 = encabezados, por eso +2), útil para
    // poder actualizar una celda puntual de esta fila más adelante.
    objeto._fila = indice + 2;
    return objeto;
  });

  return datos;
}

/** Lee el listado maestro de personal completo. */
async function leerMaestro() {
  const sheetId = process.env.SHEET_ID_MAESTRO;
  const tab = process.env.TAB_MAESTRO;
  if (!sheetId || !tab) {
    throw new Error('Faltan SHEET_ID_MAESTRO o TAB_MAESTRO en las variables de entorno.');
  }
  return leerHojaComoObjetos(sheetId, tab);
}

/** Lee todos los registros diarios (de todas las fechas). */
async function leerRegistros() {
  const sheetId = process.env.SHEET_ID_REGISTRO;
  const tab = process.env.TAB_REGISTRO;
  if (!sheetId || !tab) {
    throw new Error('Faltan SHEET_ID_REGISTRO o TAB_REGISTRO en las variables de entorno.');
  }
  return leerHojaComoObjetos(sheetId, tab);
}

/**
 * Nombre de la pestaña con el personal del turno sabatino. Vive en el mismo
 * archivo del registro diario. Se puede cambiar con la variable de entorno
 * TAB_TURNO_SABADO, pero por defecto basta con crear una pestaña con este
 * nombre exacto: así no hay que tocar la configuración de Vercel.
 */
const TAB_TURNO_SABADO_POR_DEFECTO = 'Turno_Sabado';

/**
 * Lee las cédulas del personal que trabaja los sábados por turno fijo
 * (confirmado con la usuaria el 2026-11-08). Esa gente no se registra porque
 * ya sabe que le toca venir, así que la herramienta las cuenta sola.
 *
 * Si la pestaña todavía no existe, devuelve una lista vacía en vez de fallar:
 * así la herramienta sigue funcionando igual que antes mientras se crea.
 *
 * Acepta que la columna de la cédula se llame "Cedula", "CEDULA" o similar;
 * si no encuentra ninguna, toma el primer valor de cada fila.
 */
async function leerTurnoSabado() {
  const sheetId = process.env.SHEET_ID_REGISTRO;
  const tab = process.env.TAB_TURNO_SABADO || TAB_TURNO_SABADO_POR_DEFECTO;
  if (!sheetId) return [];

  let filas;
  try {
    filas = await leerHojaComoObjetos(sheetId, tab);
  } catch (error) {
    // La pestaña no existe todavía: no es un error, simplemente no hay turno.
    return [];
  }

  return filas
    .map((fila) => {
      const clave = Object.keys(fila).find((k) => k.toLowerCase().replace(/[^a-z]/g, '') === 'cedula');
      const valor = clave ? fila[clave] : Object.values(fila)[0];
      return normalizarCedula(valor);
    })
    .filter(Boolean);
}

/**
 * Agrega una fila nueva al final de la hoja de registro diario.
 * `valoresEnOrden` debe tener el mismo orden que las columnas de la hoja
 * (Cedula, Nombre, Fecha, Asiste, Motivo, Bodega, Area, Hora_salida_real,
 * Timestamp).
 *
 * Importante: se usa valueInputOption "RAW" (no "USER_ENTERED") para que
 * Google Sheets guarde la fecha y la cédula exactamente como texto, sin
 * intentar convertirlas a un formato de fecha/número propio — de lo
 * contrario, comparar fechas más adelante (duplicados, filtros por día)
 * podría fallar por diferencias de formato.
 */
async function agregarRegistro(valoresEnOrden) {
  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID_REGISTRO;
  const tab = process.env.TAB_REGISTRO;
  if (!sheetId || !tab) {
    throw new Error('Faltan SHEET_ID_REGISTRO o TAB_REGISTRO en las variables de entorno.');
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: tab,
    valueInputOption: 'RAW',
    requestBody: {
      values: [valoresEnOrden],
    },
  });
}

/**
 * Actualiza la columna "Asistio_Real" (columna J) de una fila puntual del
 * registro diario — usado cuando un administrador confirma, después del
 * día, si la persona realmente hizo las horas extra que había programado.
 * `fila` es el número real de fila en la hoja (viene de `_fila`, que
 * agrega leerHojaComoObjetos).
 */
async function actualizarAsistenciaReal(fila, valor) {
  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID_REGISTRO;
  const tab = process.env.TAB_REGISTRO;
  if (!sheetId || !tab) {
    throw new Error('Faltan SHEET_ID_REGISTRO o TAB_REGISTRO en las variables de entorno.');
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tab}!J${fila}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[valor]] },
  });
}

/**
 * Marca la asistencia real de VARIAS filas de una sola vez (columna J).
 * Se usa al cerrar la jornada en la pantalla de Confirmar asistencia: todos
 * los que quedaron sin confirmar se marcan como "No" en una sola llamada,
 * en vez de una por persona.
 */
async function actualizarAsistenciaRealVarias(filas, valor) {
  if (!filas || filas.length === 0) return 0;

  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID_REGISTRO;
  const tab = process.env.TAB_REGISTRO;
  if (!sheetId || !tab) {
    throw new Error('Faltan SHEET_ID_REGISTRO o TAB_REGISTRO en las variables de entorno.');
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: filas.map((fila) => ({ range: `${tab}!J${fila}`, values: [[valor]] })),
    },
  });

  return filas.length;
}

/**
 * Corrige, desde el panel de Administrador, los datos de un registro ya
 * existente (Bodega, Asiste, Motivo, Hora_salida_real) — por ejemplo si la
 * persona se equivocó al registrarse o cambió de plan después. Esta
 * corrección NUNCA se hace desde la pantalla de Registro (autoservicio);
 * solo un administrador puede editar un registro ya guardado.
 *
 * Como la herramienta no tiene usuarios con login, se guarda el nombre que
 * escribió quien edita (columna "Editado_Por", K) junto con la fecha/hora
 * del cambio (columna "Fecha_Edicion", L), para poder saber después quién
 * hizo el ajuste.
 *
 * `fila` es el número real de fila en la hoja (viene de `_fila`, que
 * agrega leerHojaComoObjetos).
 */
async function actualizarRegistroAdmin(
  fila,
  { fecha, asiste, motivo, bodega, horaSalidaReal, editadoPor, fechaEdicion }
) {
  const sheets = getSheetsClient();
  const sheetId = process.env.SHEET_ID_REGISTRO;
  const tab = process.env.TAB_REGISTRO;
  if (!sheetId || !tab) {
    throw new Error('Faltan SHEET_ID_REGISTRO o TAB_REGISTRO en las variables de entorno.');
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        // La Fecha (columna C) se puede corregir desde el 2026-11-26: la gente
        // manda la programación del sábado el viernes y la guarda con la fecha
        // equivocada.
        { range: `${tab}!C${fila}`, values: [[fecha]] },
        { range: `${tab}!D${fila}`, values: [[asiste]] },
        { range: `${tab}!E${fila}`, values: [[motivo || '']] },
        { range: `${tab}!F${fila}`, values: [[bodega]] },
        { range: `${tab}!H${fila}`, values: [[horaSalidaReal || '']] },
        { range: `${tab}!K${fila}`, values: [[editadoPor]] },
        { range: `${tab}!L${fila}`, values: [[fechaEdicion]] },
      ],
    },
  });
}

/** Deja solo los dígitos de un número de cédula (ignora puntos, espacios, guiones). */
function normalizarCedula(cedula) {
  return (cedula || '').toString().replace(/\D/g, '');
}

/**
 * Busca una persona por cédula en el listado maestro.
 *
 * Desde el 2026-11-03 TODO el personal del maestro puede programarse, sin
 * importar el área (Calidad, Mantenimiento, Conductor, Fríos...). Antes solo
 * se aceptaba Producción y Logística.
 *
 * Devuelve siempre un objeto con `encontrada` (bool):
 * - Si no existe en el maestro: { encontrada: false, motivo }.
 * - Si existe: { encontrada: true, enAlcance: true, nombre, area }.
 *   `enAlcance` se mantiene por compatibilidad con las pantallas que ya lo
 *   consultan; hoy siempre es true cuando la persona está en el maestro.
 */
async function buscarPersonaPorCedula(cedulaBuscada) {
  const cedulaNormalizada = normalizarCedula(cedulaBuscada);
  if (!cedulaNormalizada) {
    return { encontrada: false, motivo: 'Escribe tu número de cédula.' };
  }

  const personal = await leerMaestro();
  const persona = personal.find((p) => normalizarCedula(p.Cedula) === cedulaNormalizada);

  if (!persona) {
    return {
      encontrada: false,
      motivo: 'No se encontró esa cédula en el listado maestro de personal. Verifica que esté bien escrita.',
    };
  }

  const area = (persona.AREA || '').toUpperCase().trim();
  const nombre = persona['NOMBRE OPERARIO'] || '';

  return { encontrada: true, enAlcance: true, nombre, area };
}

/** True si ya existe un registro para esa cédula en esa fecha exacta ("YYYY-MM-DD"). */
async function existeRegistroParaFecha(cedulaBuscada, fecha) {
  const cedulaNormalizada = normalizarCedula(cedulaBuscada);
  const fechaBuscada = (fecha || '').trim();
  const registros = await leerRegistros();
  return registros.some(
    (r) => normalizarCedula(r.Cedula) === cedulaNormalizada && (r.Fecha || '').trim() === fechaBuscada
  );
}

module.exports = {
  leerMaestro,
  leerRegistros,
  leerTurnoSabado,
  agregarRegistro,
  leerHojaComoObjetos,
  normalizarCedula,
  buscarPersonaPorCedula,
  existeRegistroParaFecha,
  actualizarAsistenciaReal,
  actualizarAsistenciaRealVarias,
  actualizarRegistroAdmin,
};
