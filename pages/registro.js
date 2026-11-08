/**
 * Pantalla de Registro — cada persona registra su propia programación de
 * horas extra para un día. Pensada para abrirse fácil desde el celular.
 *
 * Flujo:
 * 1. La persona escribe su cédula -> se busca en el maestro y se confirma
 *    su nombre (evita errores de digitación y personas fuera de alcance).
 * 2. Elige la fecha, la Bodega, y si va a asistir o no.
 * 3. Si no asiste: debe indicar el motivo.
 *    Si asiste: puede indicar una hora de salida real, solo si va a salir
 *    antes de lo normal (si lo deja vacío, se asume la jornada completa).
 * 4. Al enviar, el servidor valida todo de nuevo (nunca se confía solo en
 *    lo que valida el navegador) y evita registros duplicados del mismo
 *    día para la misma persona.
 */
import { useEffect, useState } from 'react';
import EncabezadoGlovanze from '../components/EncabezadoGlovanze';
import { validarHoraSalida } from '../lib/reglasNegocio';

const BODEGAS = ['Bodega 222', 'Bodega 224', 'Bodega 230'];

function hoyISO() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export default function Registro() {
  const [cedula, setCedula] = useState('');
  const [estadoPersona, setEstadoPersona] = useState('vacio'); // vacio | buscando | valida | invalida
  const [persona, setPersona] = useState(null); // { nombre, area }
  const [mensajePersona, setMensajePersona] = useState('');

  const [fecha, setFecha] = useState(hoyISO());
  const [bodega, setBodega] = useState('');
  const [asiste, setAsiste] = useState(''); // 'Si' | 'No'
  const [motivo, setMotivo] = useState('');
  const [horaSalidaReal, setHoraSalidaReal] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // { ok, mensaje }

  // Busca la persona en el maestro, con una pequeña espera para no llamar
  // al servidor con cada tecla que se escribe.
  useEffect(() => {
    const soloDigitos = cedula.replace(/\D/g, '');
    if (!soloDigitos) {
      setEstadoPersona('vacio');
      setPersona(null);
      setMensajePersona('');
      return;
    }

    setEstadoPersona('buscando');
    const temporizador = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/buscar-persona?cedula=${encodeURIComponent(soloDigitos)}`);
        const datos = await resp.json();

        if (!datos.encontrada || !datos.enAlcance) {
          setEstadoPersona('invalida');
          setPersona(null);
          setMensajePersona(datos.motivo || 'No se pudo validar la cédula.');
          return;
        }

        setEstadoPersona('valida');
        setPersona({ nombre: datos.nombre, area: datos.area });
        setMensajePersona('');
      } catch (error) {
        setEstadoPersona('invalida');
        setPersona(null);
        setMensajePersona('No se pudo consultar el listado maestro. Intenta de nuevo.');
      }
    }, 500);

    return () => clearTimeout(temporizador);
  }, [cedula]);

  // La hora de salida no puede ser anterior a la hora de entrada: se avisa
  // aquí mismo y no se deja enviar (confirmado con la usuaria el 2026-11-08).
  const revisionHora = asiste === 'Si' ? validarHoraSalida(horaSalidaReal) : { valida: true, motivo: null };

  const formularioCompleto =
    estadoPersona === 'valida' &&
    fecha &&
    bodega &&
    (asiste === 'Si' || asiste === 'No') &&
    (asiste !== 'No' || motivo.trim()) &&
    revisionHora.valida;

  async function enviar(e) {
    e.preventDefault();
    if (!formularioCompleto || enviando) return;

    setEnviando(true);
    setResultado(null);
    try {
      const resp = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cedula,
          fecha,
          bodega,
          asiste,
          motivo,
          horaSalidaReal,
        }),
      });
      const datos = await resp.json();

      if (!resp.ok || !datos.ok) {
        setResultado({ ok: false, mensaje: datos.error || 'No se pudo guardar el registro.' });
      } else {
        setResultado({
          ok: true,
          mensaje: `Registro guardado para ${datos.nombre} — ${fecha}.`,
        });
      }
    } catch (error) {
      setResultado({ ok: false, mensaje: 'No se pudo guardar el registro. Revisa tu conexión e intenta de nuevo.' });
    } finally {
      setEnviando(false);
    }
  }

  function registrarOtra() {
    setCedula('');
    setEstadoPersona('vacio');
    setPersona(null);
    setMensajePersona('');
    setFecha(hoyISO());
    setBodega('');
    setAsiste('');
    setMotivo('');
    setHoraSalidaReal('');
    setResultado(null);
  }

  // ---- Pantalla de éxito ----
  if (resultado && resultado.ok) {
    return (
      <>
      <EncabezadoGlovanze />
      <main style={estilos.contenedor}>
        <h1 style={estilos.titulo}>Programaciones Extiblu</h1>
        <div style={{ ...estilos.aviso, ...estilos.avisoExito }}>✅ {resultado.mensaje}</div>
        <button style={estilos.boton} onClick={registrarOtra}>
          Registrar otra persona
        </button>
      </main>
      </>
    );
  }

  return (
    <>
    <EncabezadoGlovanze />
    <main style={estilos.contenedor}>
      <h1 style={estilos.titulo}>Programaciones Extiblu</h1>
      <p style={estilos.subtitulo}>Registro de horas extra</p>

      <form onSubmit={enviar}>
        <label style={estilos.etiqueta}>Cédula</label>
        <input
          style={estilos.input}
          type="tel"
          inputMode="numeric"
          placeholder="Escribe tu número de cédula"
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
        />
        {estadoPersona === 'buscando' && <div style={estilos.avisoNeutro}>Buscando...</div>}
        {estadoPersona === 'valida' && persona && (
          <div style={{ ...estilos.aviso, ...estilos.avisoExito }}>
            ✅ {persona.nombre} — {persona.area}
          </div>
        )}
        {estadoPersona === 'invalida' && (
          <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {mensajePersona}</div>
        )}

        <label style={estilos.etiqueta}>Fecha</label>
        <input
          style={estilos.input}
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />

        <label style={estilos.etiqueta}>Bodega</label>
        <select style={estilos.input} value={bodega} onChange={(e) => setBodega(e.target.value)}>
          <option value="">Selecciona...</option>
          {BODEGAS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <label style={estilos.etiqueta}>¿Vas a hacer horas extra este día?</label>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => setAsiste('Si')}
            style={asiste === 'Si' ? estilos.botonOpcionActivo : estilos.botonOpcion}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => setAsiste('No')}
            style={asiste === 'No' ? estilos.botonOpcionActivo : estilos.botonOpcion}
          >
            No
          </button>
        </div>

        {asiste === 'No' && (
          <>
            <label style={estilos.etiqueta}>Motivo</label>
            <input
              style={estilos.input}
              type="text"
              placeholder="¿Por qué no vas a asistir?"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </>
        )}

        {asiste === 'Si' && (
          <>
            <label style={estilos.etiqueta}>Hora de salida (solo si vas a salir antes de lo normal)</label>
            <input
              style={estilos.input}
              type="time"
              value={horaSalidaReal}
              onChange={(e) => setHoraSalidaReal(e.target.value)}
            />
            {!revisionHora.valida ? (
              <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {revisionHora.motivo}</div>
            ) : (
              <p style={estilos.ayuda}>
                Déjalo vacío si vas a cumplir la jornada extra completa (hasta las 6:00 p.m. entre semana, o
                hasta las 2:00 p.m. el sábado).
              </p>
            )}
          </>
        )}

        {resultado && !resultado.ok && (
          <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {resultado.mensaje}</div>
        )}

        <button
          type="submit"
          disabled={!formularioCompleto || enviando}
          style={{
            ...estilos.boton,
            ...(!formularioCompleto || enviando ? estilos.botonDeshabilitado : {}),
          }}
        >
          {enviando ? 'Guardando...' : 'Guardar registro'}
        </button>
      </form>
    </main>
    </>
  );
}

const estilos = {
  contenedor: {
    fontFamily: 'system-ui, sans-serif',
    padding: 24,
    maxWidth: 480,
    margin: '0 auto',
  },
  titulo: { fontSize: 20, marginBottom: 0 },
  subtitulo: { color: '#555', marginTop: 4, marginBottom: 24 },
  etiqueta: { display: 'block', fontWeight: 600, marginTop: 16, marginBottom: 6 },
  input: {
    width: '100%',
    padding: 12,
    fontSize: 16,
    borderRadius: 8,
    border: '1px solid #ccc',
    boxSizing: 'border-box',
  },
  ayuda: { color: '#666', fontSize: 13, marginTop: 6 },
  aviso: { padding: 10, borderRadius: 8, marginTop: 8, fontSize: 14 },
  avisoExito: { background: '#e6f4ea', color: '#1e7e34' },
  avisoError: { background: '#fdecea', color: '#b3261e' },
  avisoNeutro: { color: '#666', fontSize: 14, marginTop: 8 },
  boton: {
    width: '100%',
    padding: 14,
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    background: '#1a73e8',
    border: 'none',
    borderRadius: 8,
    marginTop: 24,
    cursor: 'pointer',
  },
  botonDeshabilitado: { background: '#a9c3ec', cursor: 'not-allowed' },
  botonOpcion: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    borderRadius: 8,
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
  },
  botonOpcionActivo: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    borderRadius: 8,
    border: '1px solid #1a73e8',
    background: '#e8f0fe',
    color: '#1a73e8',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
