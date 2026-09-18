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
  const datos = filas.slice(1).map((fila) => {
    const objeto = {};
    encabezados.forEach((encabezado, i) => {
      objeto[encabezado] = (fila[i] || '').toString().trim();
    });
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
 * Agrega una fila nueva al final de la hoja de registro diario.
 * `valoresEnOrden` debe tener el mismo orden que las columnas de la hoja
 * (Cedula, Fecha, Asiste, Motivo, Bodega, Area, Hora_salida_real, Timestamp).
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
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [valoresEnOrden],
    },
  });
}

module.exports = {
  leerMaestro,
  leerRegistros,
  agregarRegistro,
  leerHojaComoObjetos,
};
