/**
 * Confirmar asistencia — pantalla de escaneo.
 *
 * Al final de la jornada se va escribiendo (o escaneando) la cédula de cada
 * persona que sí se quedó. Cada confirmación desaparece de la lista, así que
 * lo que queda al final son los que NO asistieron. También se puede buscar
 * por nombre, por si alguien no trae la cédula a mano.
 *
 * Al terminar, el botón "Cerrar jornada" marca de una vez como "No asistió"
 * a todos los que quedaron pendientes — nunca se marca nada solo.
 */
import { useEffect, useRef, useState } from 'react';
import EncabezadoGlovanze from '../components/EncabezadoGlovanze';
import { clasificarEscaneo, buscarPorNombre } from '../lib/asistencia';

const BODEGAS = ['Bodega 222', 'Bodega 224', 'Bodega 230'];

function hoyISO() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export default function ConfirmarAsistencia() {
  const [fecha, setFecha] = useState(hoyISO());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const [entrada, setEntrada] = useState('');
  const [mensaje, setMensaje] = useState(null); // { tipo, texto }
  const [guardando, setGuardando] = useState(false);

  // Persona que asistió sin estar programada: hay que pedirle la Bodega
  // antes de crearle el registro.
  const [sinProgramar, setSinProgramar] = useState(null);
  const [bodegaNueva, setBodegaNueva] = useState(BODEGAS[0]);

  // Confirmación del cierre de jornada.
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);

  const campoRef = useRef(null);

  async function cargar(sinLimpiarMensaje) {
    setCargando(true);
    setError('');
    try {
      const resp = await fetch(`/api/asistencia-del-dia?fecha=${encodeURIComponent(fecha)}`);
      const json = await resp.json();
      if (!json.ok) {
        setError(json.error || 'No se pudo cargar la información.');
        setDatos(null);
      } else {
        setDatos(json);
      }
    } catch (e) {
      setError('No se pudo consultar el servidor. Intenta de nuevo.');
    } finally {
      setCargando(false);
      if (!sinLimpiarMensaje) setMensaje(null);
    }
  }

  useEffect(() => {
    setMensaje(null);
    setSinProgramar(null);
    setConfirmandoCierre(false);
    cargar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  useEffect(() => {
    if (datos && !cargando && !sinProgramar) campoRef.current?.focus();
  }, [datos, cargando, sinProgramar]);

  /** Marca a una persona como asistida (o corrige su marca) en la hoja. */
  async function confirmarPersona(cedula) {
    setGuardando(true);
    try {
      const resp = await fetch('/api/confirmar-asistencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, fecha, asistioReal: 'Si' }),
      });
      const json = await resp.json();
      if (!json.ok) {
        setMensaje({ tipo: 'error', texto: `⚠️ ${json.error || 'No se pudo guardar.'}` });
        return false;
      }
      await cargar(true);
      return true;
    } catch (e) {
      setMensaje({ tipo: 'error', texto: '⚠️ No se pudo guardar. Intenta de nuevo.' });
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function procesar(valor) {
    if (!datos) return;
    const resultado = clasificarEscaneo(valor, datos, datos.personal);

    if (resultado.tipo === 'desconocida') {
      setMensaje({ tipo: 'error', texto: `⚠️ ${resultado.mensaje}` });
      limpiarEntrada();
      return;
    }

    if (resultado.tipo === 'ya_confirmado') {
      setMensaje({ tipo: 'advertencia', texto: resultado.mensaje });
      limpiarEntrada();
      return;
    }

    if (resultado.tipo === 'sin_programar') {
      // Hay que pedir la Bodega antes de crearle el registro.
      setSinProgramar(resultado.persona);
      setBodegaNueva(BODEGAS[0]);
      setMensaje({ tipo: 'info', texto: resultado.mensaje });
      setEntrada('');
      return;
    }

    // pendiente, estaba_como_no, aviso_que_no_venia -> se confirma.
    const ok = await confirmarPersona(resultado.persona.cedula);
    if (ok) {
      setMensaje({
        tipo: resultado.tipo === 'pendiente' ? 'exito' : 'advertencia',
        texto: resultado.mensaje,
      });
    }
    limpiarEntrada();
  }

  function limpiarEntrada() {
    setEntrada('');
    campoRef.current?.focus();
  }

  async function registrarSinProgramar() {
    setGuardando(true);
    try {
      const resp = await fetch('/api/registrar-asistido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: sinProgramar.cedula, fecha, bodega: bodegaNueva }),
      });
      const json = await resp.json();
      if (!json.ok) {
        setMensaje({ tipo: 'error', texto: `⚠️ ${json.error || 'No se pudo registrar.'}` });
        return;
      }
      setMensaje({
        tipo: 'exito',
        texto: `✅ ${sinProgramar.nombre} quedó registrado en ${bodegaNueva} y confirmado como asistido.`,
      });
      setSinProgramar(null);
      await cargar(true);
      limpiarEntrada();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: '⚠️ No se pudo registrar. Intenta de nuevo.' });
    } finally {
      setGuardando(false);
    }
  }

  async function cerrarJornada() {
    setGuardando(true);
    try {
      const resp = await fetch('/api/cerrar-asistencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, cedulas: datos.pendientes.map((p) => p.cedula) }),
      });
      const json = await resp.json();
      if (!json.ok) {
        setMensaje({ tipo: 'error', texto: `⚠️ ${json.error || 'No se pudo cerrar la jornada.'}` });
        return;
      }
      setMensaje({
        tipo: 'exito',
        texto: `✅ Jornada cerrada: ${json.marcadas} persona(s) quedaron marcadas como que no asistieron.`,
      });
      setConfirmandoCierre(false);
      await cargar(true);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: '⚠️ No se pudo cerrar la jornada. Intenta de nuevo.' });
    } finally {
      setGuardando(false);
    }
  }

  const sugerencias =
    datos && entrada && !/^\d+$/.test(entrada.trim()) ? buscarPorNombre(entrada, datos.pendientes) : [];

  return (
    <>
      <EncabezadoGlovanze />
      <main style={estilos.contenedor}>
        <h1 style={estilos.titulo}>Programaciones Extiblu</h1>
        <p style={estilos.subtitulo}>
          Confirmar asistencia · <a href="/administrador">Ir al Panel de Administrador</a>
        </p>

        <label style={estilos.etiqueta}>Fecha</label>
        <input style={estilos.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

        {cargando && <p>Cargando...</p>}
        {error && <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {error}</div>}

        {datos && !cargando && (
          <>
            <div style={estilos.filaTarjetas}>
              <div style={{ ...estilos.tarjeta, borderTop: '4px solid #b3261e' }}>
                <div style={estilos.tarjetaValor}>{datos.totalPendientes}</div>
                <div style={estilos.tarjetaEtiqueta}>Faltan por confirmar</div>
              </div>
              <div style={{ ...estilos.tarjeta, borderTop: '4px solid #1e7e34' }}>
                <div style={estilos.tarjetaValor}>{datos.totalConfirmados}</div>
                <div style={estilos.tarjetaEtiqueta}>Asistieron</div>
              </div>
              <div style={estilos.tarjeta}>
                <div style={estilos.tarjetaValor}>{datos.totalNoAsistieron}</div>
                <div style={estilos.tarjetaEtiqueta}>No asistieron</div>
              </div>
            </div>

            {/* ---- Entrada principal: cédula o nombre ---- */}
            {sinProgramar ? (
              <div style={estilos.panelSinProgramar}>
                <strong>{sinProgramar.nombre}</strong> ({sinProgramar.area}) asistió sin estar programado.
                <label style={estilos.etiqueta}>¿En qué Bodega?</label>
                <select
                  style={estilos.input}
                  value={bodegaNueva}
                  onChange={(e) => setBodegaNueva(e.target.value)}
                >
                  {BODEGAS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button type="button" style={estilos.boton} disabled={guardando} onClick={registrarSinProgramar}>
                    {guardando ? 'Guardando...' : 'Registrar y confirmar'}
                  </button>
                  <button
                    type="button"
                    style={estilos.botonSecundario}
                    disabled={guardando}
                    onClick={() => {
                      setSinProgramar(null);
                      setMensaje(null);
                      limpiarEntrada();
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 style={estilos.h2}>Escanea o escribe la cédula</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    procesar(entrada);
                  }}
                  style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                >
                  <input
                    ref={campoRef}
                    style={{ ...estilos.input, flex: '1 1 240px', fontSize: 20, padding: 14 }}
                    type="text"
                    inputMode="text"
                    placeholder="Cédula, o parte del nombre"
                    value={entrada}
                    onChange={(e) => {
                      setEntrada(e.target.value);
                      setMensaje(null);
                    }}
                    disabled={guardando}
                  />
                  <button
                    type="submit"
                    style={{ ...estilos.boton, padding: '14px 24px', fontSize: 16 }}
                    disabled={guardando}
                  >
                    Confirmar
                  </button>
                </form>
                <p style={estilos.textoSecundario}>
                  Si escribes letras en vez de números, te aparecen abajo las coincidencias por nombre.
                </p>
              </>
            )}

            {mensaje && (
              <div
                style={{
                  ...estilos.aviso,
                  ...(mensaje.tipo === 'exito'
                    ? estilos.avisoExito
                    : mensaje.tipo === 'advertencia'
                    ? estilos.avisoAdvertencia
                    : mensaje.tipo === 'error'
                    ? estilos.avisoError
                    : estilos.avisoInfo),
                }}
              >
                {mensaje.texto}
              </div>
            )}

            {sugerencias.length > 0 && !sinProgramar && (
              <ul style={estilos.listaSugerencias}>
                {sugerencias.map((p) => (
                  <li key={p.cedula} style={estilos.itemLista}>
                    <button type="button" style={estilos.botonSugerencia} onClick={() => procesar(p.cedula)}>
                      {p.nombre} — {p.area}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* ---- Lista de pendientes: se va vaciando ---- */}
            <h2 style={estilos.h2}>Faltan por confirmar ({datos.totalPendientes})</h2>
            {datos.totalPendientes === 0 ? (
              <p style={{ ...estilos.aviso, ...estilos.avisoExito }}>
                🎉 No queda nadie pendiente: todos los programados de este día ya fueron confirmados.
              </p>
            ) : (
              <>
                <p style={estilos.textoSecundario}>
                  Quienes queden en esta lista son los que no asistieron.
                </p>
                <ul style={estilos.lista}>
                  {datos.pendientes.map((p) => (
                    <li key={p.cedula} style={estilos.itemLista}>
                      {p.nombre} — {p.area} · {p.bodega || 'sin bodega'}
                    </li>
                  ))}
                </ul>

                {confirmandoCierre ? (
                  <div style={{ ...estilos.aviso, ...estilos.avisoAdvertencia }}>
                    Vas a marcar como <strong>no asistieron</strong> a las {datos.totalPendientes} personas de
                    la lista de arriba. Esto queda guardado en la hoja.
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" style={estilos.boton} disabled={guardando} onClick={cerrarJornada}>
                        {guardando ? 'Guardando...' : 'Sí, marcarlos'}
                      </button>
                      <button
                        type="button"
                        style={estilos.botonSecundario}
                        disabled={guardando}
                        onClick={() => setConfirmandoCierre(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    style={{ ...estilos.botonSecundario, marginTop: 12 }}
                    onClick={() => setConfirmandoCierre(true)}
                  >
                    Cerrar jornada y marcar los {datos.totalPendientes} restantes como no asistieron
                  </button>
                )}
              </>
            )}

            {/* ---- Lo ya resuelto, plegado ---- */}
            {datos.confirmados.length > 0 && (
              <details style={estilos.desplegable}>
                <summary style={estilos.desplegableTitulo}>
                  Ya confirmados <span style={estilos.contador}>{datos.confirmados.length}</span>
                </summary>
                <ul style={{ ...estilos.lista, padding: '0 16px 12px 32px' }}>
                  {datos.confirmados.map((p) => (
                    <li key={p.cedula}>
                      ✅ {p.nombre} — {p.area}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {datos.noAsistieron.length > 0 && (
              <details style={estilos.desplegable}>
                <summary style={estilos.desplegableTitulo}>
                  Marcados como que no asistieron <span style={estilos.contador}>{datos.noAsistieron.length}</span>
                </summary>
                <ul style={{ ...estilos.lista, padding: '0 16px 12px 32px' }}>
                  {datos.noAsistieron.map((p) => (
                    <li key={p.cedula}>
                      ❌ {p.nombre} — {p.area}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {datos.avisaronQueNo.length > 0 && (
              <details style={estilos.desplegable}>
                <summary style={estilos.desplegableTitulo}>
                  Avisaron que no venían <span style={estilos.contador}>{datos.avisaronQueNo.length}</span>
                </summary>
                <div style={{ padding: '0 16px 12px' }}>
                  <p style={estilos.textoSecundario}>
                    No entran a la lista por confirmar. Si alguno se presentó igual, escanéalo y se marca como
                    asistido.
                  </p>
                  <ul style={estilos.lista}>
                    {datos.avisaronQueNo.map((p) => (
                      <li key={p.cedula}>
                        {p.nombre} — {p.area}
                        {p.motivo ? ` (${p.motivo})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </>
        )}
      </main>
    </>
  );
}

const estilos = {
  contenedor: { fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 640, margin: '0 auto' },
  titulo: { fontSize: 20, marginBottom: 0 },
  subtitulo: { color: '#555', marginTop: 4, marginBottom: 24 },
  h2: { fontSize: 16, marginTop: 28, marginBottom: 8 },
  etiqueta: { display: 'block', fontWeight: 600, marginTop: 8, marginBottom: 6, fontSize: 13 },
  input: {
    padding: 10,
    fontSize: 16,
    borderRadius: 8,
    border: '1px solid #ccc',
    minWidth: 160,
    maxWidth: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  filaTarjetas: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 },
  tarjeta: {
    flex: '1 1 110px',
    background: '#f6f8fa',
    borderRadius: 8,
    padding: 12,
    textAlign: 'center',
    borderTop: '4px solid #1a73e8',
  },
  tarjetaValor: { fontSize: 24, fontWeight: 700 },
  tarjetaEtiqueta: { fontSize: 12, color: '#555', marginTop: 2 },
  textoSecundario: { color: '#555', fontSize: 14 },
  aviso: { padding: 10, borderRadius: 8, marginTop: 8, fontSize: 14 },
  avisoExito: { background: '#e6f4ea', color: '#1e7e34' },
  avisoError: { background: '#fdecea', color: '#b3261e' },
  avisoAdvertencia: { background: '#fff4e5', color: '#9a5b00' },
  avisoInfo: { background: '#e8f0fe', color: '#1a53a8' },
  lista: { paddingLeft: 20, lineHeight: 1.9, margin: '8px 0' },
  itemLista: { fontSize: 15 },
  listaSugerencias: { listStyle: 'none', padding: 0, margin: '8px 0' },
  botonSugerencia: {
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: 15,
    border: '1px solid #ccc',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    marginBottom: 6,
    fontFamily: 'inherit',
  },
  panelSinProgramar: {
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    background: '#e8f0fe',
    border: '1px solid #c3d6f7',
  },
  boton: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
    background: '#1a73e8',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  botonSecundario: {
    fontSize: 15,
    fontWeight: 600,
    color: '#555',
    background: '#fff',
    border: '1px solid #ccc',
    borderRadius: 8,
    padding: '10px 20px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  desplegable: { border: '1px solid #e0e0e0', borderRadius: 8, marginTop: 8, background: '#fafafa' },
  desplegableTitulo: { cursor: 'pointer', padding: 12, fontWeight: 600, fontSize: 15 },
  contador: {
    fontWeight: 400,
    fontSize: 13,
    color: '#555',
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 10,
    padding: '1px 8px',
    marginLeft: 6,
  },
};
