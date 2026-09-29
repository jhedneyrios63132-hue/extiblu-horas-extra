/**
 * Endpoint de PRUEBA para verificar que la conexión a Google Sheets funciona.
 *
 * Una vez configuradas las variables de entorno (ver README.md), abre en el
 * navegador:  http://localhost:3000/api/prueba-maestro
 * (o la URL de Vercel una vez desplegado) + "/api/prueba-maestro"
 *
 * Debe devolver el total de personas en el maestro y las primeras 3 filas,
 * para confirmar que se está leyendo la hoja correcta.
 *
 * Este endpoint es solo para pruebas iniciales; no se deja expuesto tal
 * cual en la versión final (se reemplaza por los endpoints reales de la
 * pantalla de administrador).
 */
const { leerMaestro } = require('../../lib/googleSheets');

export default async function handler(req, res) {
  try {
    const personal = await leerMaestro();

    const areasPermitidas = ['PRODUCCION', 'LOGISTICA'];
    const relevantes = personal.filter((p) =>
      areasPermitidas.includes((p.AREA || '').toUpperCase().trim())
    );

    res.status(200).json({
      ok: true,
      totalFilasEnMaestro: personal.length,
      totalProduccionOLogistica: relevantes.length,
      muestra: personal.slice(0, 3),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      ayuda:
        'Revisa que las variables de entorno estén bien configuradas (.env.local) ' +
        'y que la hoja maestra esté compartida con el correo de la cuenta de servicio. ' +
        'Ver README.md.',
    });
  }
}
