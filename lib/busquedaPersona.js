/**
 * Buscador de una persona dentro de un día concreto.
 *
 * Responde la pregunta que la usuaria hacía a mano (2026-11-08): "¿esta
 * persona dijo que iba a venir hoy?". Se busca por cédula o por nombre y se
 * devuelve su estado de ese día, sin tener que recorrer las listas a ojo.
 *
 * Confirmado con la usuaria: el buscador encuentra a CUALQUIER persona del
 * listado maestro, incluso si es de un área que no está marcada en el
 * filtro; en ese caso se avisa de qué área es, pero igual se muestra el dato.
 *
 * Lógica pura (no toca Google Sheets) para poder probarla.
 */
const { calcularHorasYAlimentacion } = require('./reglasNegocio');
const { normalizarTexto } = require('./asistencia');

/** Deja solo los dígitos de una cédula (debe coincidir con lib/googleSheets.js). */
function normalizarCedula(cedula) {
  return (cedula || '').toString().replace(/\D/g, '');
}

/**
 * Busca personas por cédula o por nombre y devuelve su situación en la fecha.
 *
 * @param {string} texto - cédula completa o parcial, o parte del nombre
 * @param {Array} maestroCompleto - filas del listado maestro
 * @param {Array} registrosDelDia - registros ya filtrados por la fecha
 * @param {Array|null} areasSeleccionadas - áreas marcadas en el filtro, o null si están todas
 * @param {number} limite - máximo de resultados
 */
function buscarPersonasEnElDia(texto, maestroCompleto, registrosDelDia, areasSeleccionadas, limite = 10) {
  const buscado = (texto || '').toString().trim();
  if (buscado.length < 2) return [];

  const soloDigitos = normalizarCedula(buscado);
  const buscaPorCedula = soloDigitos.length >= 2 && /^[\d\s.\-]+$/.test(buscado);
  const textoNormalizado = normalizarTexto(buscado);

  const coincide = (persona) => {
    if (buscaPorCedula) return normalizarCedula(persona.Cedula).includes(soloDigitos);
    return normalizarTexto(persona['NOMBRE OPERARIO'] || '').includes(textoNormalizado);
  };

  // Los registros del día, agrupados por cédula.
  const registrosPorCedula = {};
  registrosDelDia.forEach((r) => {
    const ced = normalizarCedula(r.Cedula);
    if (!registrosPorCedula[ced]) registrosPorCedula[ced] = [];
    registrosPorCedula[ced].push(r);
  });

  return maestroCompleto
    .filter(coincide)
    .slice(0, limite)
    .map((persona) => {
      const cedula = normalizarCedula(persona.Cedula);
      const area = (persona.AREA || '').toUpperCase().trim();
      const registros = registrosPorCedula[cedula] || [];

      const base = {
        cedula,
        nombre: persona['NOMBRE OPERARIO'] || '',
        area,
        // Si es de un área que no está marcada, se muestra igual pero avisando.
        enAreasSeleccionadas: areasSeleccionadas === null || areasSeleccionadas.includes(area),
      };

      if (registros.length === 0) {
        return { ...base, estado: 'faltante', mensaje: 'No está programada este día.' };
      }

      if (registros.length > 1) {
        return {
          ...base,
          estado: 'duplicado',
          cantidadRegistros: registros.length,
          mensaje: `Tiene ${registros.length} registros este día; hay que revisar cuál es el correcto.`,
        };
      }

      const registro = registros[0];
      const asisteTexto = (registro.Asiste || '').trim();
      const siAsiste = asisteTexto.toLowerCase().startsWith('s');

      if (!siAsiste) {
        return {
          ...base,
          estado: 'no_viene',
          motivo: registro.Motivo || '',
          mensaje: registro.Motivo
            ? `Avisó que NO viene. Motivo: ${registro.Motivo}`
            : 'Avisó que NO viene (sin motivo registrado).',
        };
      }

      const calculo = calcularHorasYAlimentacion({
        fecha: registro.Fecha,
        asiste: registro.Asiste,
        horaSalidaReal: registro.Hora_salida_real,
      });

      return {
        ...base,
        estado: 'viene',
        bodega: registro.Bodega || '',
        horaSalidaReal: registro.Hora_salida_real || '',
        calculo,
        asistioReal: (registro.Asistio_Real || '').trim(),
        mensaje: `Sí viene. ${registro.Bodega || 'Sin bodega'}, sale ${calculo.horaEfectiva || 'sin hora'}.`,
      };
    });
}

module.exports = { buscarPersonasEnElDia };
