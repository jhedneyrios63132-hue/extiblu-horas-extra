/**
 * Pantalla de Administrador: consulta por fecha y área, y muestra todo el
 * resumen (programados, faltantes, duplicados, horas extra y
 * alimentaciones a pedir) sin que nadie tenga que comparar nada a mano.
 */
import { Fragment, useEffect, useState } from 'react';
import EncabezadoGlovanze from '../components/EncabezadoGlovanze';

const BODEGAS = ['Bodega 222', 'Bodega 224', 'Bodega 230'];

function hoyISO() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function TarjetaNumero({ etiqueta, valor, color }) {
  return (
    <div style={{ ...estilos.tarjeta, borderTop: `4px solid ${color || '#1a73e8'}` }}>
      <div style={estilos.tarjetaValor}>{valor}</div>
      <div style={estilos.tarjetaEtiqueta}>{etiqueta}</div>
    </div>
  );
}

/**
 * Sección plegable. Se usa para las novedades del día (apoyo, revisión
 * manual, duplicados, cédulas desconocidas) para que no empujen la tabla de
 * programados hasta el final de la página: se ve el título con el número de
 * casos y solo se abre si hay que mirarla.
 */
function Desplegable({ titulo, cantidad, etiquetaCantidad, children }) {
  return (
    <details style={estilos.desplegable}>
      <summary style={estilos.desplegableTitulo}>
        {titulo} <span style={estilos.contador}>{cantidad} {etiquetaCantidad}</span>
      </summary>
      <div style={{ padding: '4px 12px 12px' }}>{children}</div>
    </details>
  );
}

function ResumenArea({ titulo, resumen }) {
  return (
    <div style={estilos.bloqueArea}>
      <h3 style={{ marginBottom: 8 }}>{titulo}</h3>
      <div style={estilos.filaTarjetasChicas}>
        <TarjetaNumero etiqueta="Debía programarse" valor={resumen.totalDebiaProgramarse} />
        <TarjetaNumero etiqueta="Programados" valor={resumen.totalProgramados} color="#1e7e34" />
        <TarjetaNumero etiqueta="Faltantes" valor={resumen.totalFaltantes} color="#b3261e" />
        <TarjetaNumero etiqueta="Alimentaciones" valor={resumen.totalAlimentaciones} color="#e37400" />
      </div>
    </div>
  );
}

export default function Administrador() {
  const [fecha, setFecha] = useState(hoyISO());
  const [area, setArea] = useState('TODAS');
  const [bodega, setBodega] = useState('TODAS');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [comidasOtrasAreas, setComidasOtrasAreas] = useState(0);
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(new Set());
  const [errorAsistencia, setErrorAsistencia] = useState('');
  const [vistaLista, setVistaLista] = useState('PROGRAMADOS');

  // Edición de un registro ya existente (solo desde esta pantalla).
  const [editando, setEditando] = useState(null); // cédula de la persona que se está editando, o null
  const [formEdicion, setFormEdicion] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState('');

  async function cargarDatos(cancelRef) {
    setCargando(true);
    setError('');
    try {
      const resp = await fetch(
        `/api/administrador?fecha=${encodeURIComponent(fecha)}&area=${encodeURIComponent(area)}` +
          `&bodega=${encodeURIComponent(bodega)}`
      );
      const json = await resp.json();
      if (cancelRef && cancelRef.cancelado) return;
      if (!json.ok) {
        setError(json.error || 'No se pudo cargar la información.');
        setDatos(null);
      } else {
        setDatos(json);
      }
    } catch (e) {
      if (!cancelRef || !cancelRef.cancelado) setError('No se pudo consultar el servidor. Intenta de nuevo.');
    } finally {
      if (!cancelRef || !cancelRef.cancelado) setCargando(false);
    }
  }

  useEffect(() => {
    const cancelRef = { cancelado: false };
    cargarDatos(cancelRef);
    return () => {
      cancelRef.cancelado = true;
    };
  }, [fecha, area, bodega]);

  async function confirmarAsistencia(cedula, asistioReal) {
    setErrorAsistencia('');
    setGuardandoAsistencia((anterior) => new Set(anterior).add(cedula));
    try {
      const resp = await fetch('/api/confirmar-asistencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, fecha, asistioReal }),
      });
      const json = await resp.json();
      if (!json.ok) {
        setErrorAsistencia(json.error || 'No se pudo guardar la confirmación.');
      } else {
        // Actualiza solo esa fila en memoria (sin recargar todo desde el
        // servidor) para que la página no "salte" ni pierda la posición al
        // confirmar muchas personas seguidas.
        setDatos((anterior) => {
          if (!anterior) return anterior;
          return {
            ...anterior,
            programados: anterior.programados.map((p) =>
              p.cedula === cedula ? { ...p, asistioReal } : p
            ),
          };
        });
      }
    } catch (e) {
      setErrorAsistencia('No se pudo guardar la confirmación. Intenta de nuevo.');
    } finally {
      setGuardandoAsistencia((anterior) => {
        const nuevo = new Set(anterior);
        nuevo.delete(cedula);
        return nuevo;
      });
    }
  }

  function abrirEdicion(p) {
    setEditando(p.cedula);
    setFormEdicion({
      bodega: p.bodega || '',
      asiste: p.asiste === 'No' ? 'No' : 'Si',
      motivo: p.motivo || '',
      horaSalidaReal: p.horaSalidaReal || '',
      editadoPor: '',
    });
    setErrorEdicion('');
  }

  function cancelarEdicion() {
    setEditando(null);
    setErrorEdicion('');
  }

  async function guardarEdicion(cedula) {
    setErrorEdicion('');
    if (formEdicion.asiste === 'No' && !formEdicion.motivo.trim()) {
      setErrorEdicion('Si no asiste, el motivo es obligatorio.');
      return;
    }
    if (!formEdicion.editadoPor.trim()) {
      setErrorEdicion('Escribe tu nombre antes de guardar el cambio.');
      return;
    }
    setGuardandoEdicion(true);
    try {
      const resp = await fetch('/api/editar-registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cedula,
          fecha,
          bodega: formEdicion.bodega,
          asiste: formEdicion.asiste,
          motivo: formEdicion.motivo,
          horaSalidaReal: formEdicion.horaSalidaReal,
          editadoPor: formEdicion.editadoPor,
        }),
      });
      const json = await resp.json();
      if (!json.ok) {
        setErrorEdicion(json.error || 'No se pudo guardar el cambio.');
      } else {
        setEditando(null);
        await cargarDatos();
      }
    } catch (e) {
      setErrorEdicion('No se pudo guardar el cambio. Intenta de nuevo.');
    } finally {
      setGuardandoEdicion(false);
    }
  }

  const totalAlimentacionesConExtra = (datos ? datos.totalAlimentaciones : 0) + (Number(comidasOtrasAreas) || 0);

  // Cuántas cosas hay realmente por mirar ese día (sin contar el apoyo, que
  // es informativo y no un problema).
  const totalNovedades = datos
    ? datos.revisionManual.length + datos.duplicados.length + datos.fueraDeAlcance.length
    : 0;

  return (
    <>
    <EncabezadoGlovanze />
    <main style={estilos.contenedor}>
      <h1 style={estilos.titulo}>Programaciones Extiblu</h1>
      <p style={estilos.subtitulo}>
        Panel de Administrador · <a href="/confirmar-asistencia">Confirmar asistencia por escaneo</a> ·{' '}
        <a href="/trazabilidad">Ver trazabilidad por persona</a>
      </p>

      <div style={estilos.filaSelectores}>
        <div>
          <label style={estilos.etiqueta}>Fecha</label>
          <input style={estilos.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label style={estilos.etiqueta}>Área</label>
          <select style={estilos.input} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="TODAS">Todas las áreas</option>
            {/* Las áreas se leen del listado maestro, así que si aparece una
                nueva en la hoja sale aquí sola. */}
            {(datos?.areasDisponibles || []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={estilos.etiqueta}>Bodega</label>
          <select style={estilos.input} value={bodega} onChange={(e) => setBodega(e.target.value)}>
            <option value="TODAS">Todas las bodegas</option>
            {BODEGAS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {bodega !== 'TODAS' && (
        <div style={{ ...estilos.aviso, ...estilos.avisoInfo }}>
          Mostrando solo <strong>{bodega}</strong>: la tabla de programados y las alimentaciones son de esa
          Bodega. Los totales del día y los faltantes siguen siendo de toda el área seleccionada, porque quien
          falta por programar todavía no tiene Bodega asignada.
        </div>
      )}

      {cargando && <p>Cargando...</p>}
      {error && <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {error}</div>}

      {datos && !cargando && (
        <>
          <div style={estilos.filaTarjetas}>
            <TarjetaNumero etiqueta="Debía programarse" valor={datos.totalDebiaProgramarse} />
            <TarjetaNumero etiqueta="Programados" valor={datos.totalProgramados} color="#1e7e34" />
            <TarjetaNumero etiqueta="Faltantes" valor={datos.totalFaltantes} color="#b3261e" />
            <TarjetaNumero etiqueta="Duplicados" valor={datos.totalDuplicados} color="#b3261e" />
          </div>

          <h2 style={estilos.h2}>Alimentaciones a pedir</h2>
          <div style={estilos.filaTarjetas}>
            <TarjetaNumero etiqueta="Del área seleccionada" valor={datos.totalAlimentaciones} color="#e37400" />
            <div style={estilos.tarjeta}>
              <label style={{ ...estilos.etiqueta, marginTop: 0 }}>+ Otras áreas</label>
              <input
                style={{ ...estilos.input, textAlign: 'center', fontSize: 20 }}
                type="number"
                min="0"
                value={comidasOtrasAreas}
                onChange={(e) => setComidasOtrasAreas(e.target.value)}
              />
            </div>
            <TarjetaNumero etiqueta="TOTAL a pedir" valor={totalAlimentacionesConExtra} color="#0b8043" />
          </div>

          {Object.keys(datos.alimentacionPorBodega).length > 0 && (
            <p style={estilos.textoSecundario}>
              Por Bodega:{' '}
              {Object.entries(datos.alimentacionPorBodega)
                .map(([bodega, cantidad]) => `${bodega || 'Sin bodega'}: ${cantidad}`)
                .join(' · ')}
            </p>
          )}

          {datos.porArea && (
            <Desplegable
              titulo="Resumen por área"
              cantidad={Object.keys(datos.porArea).length}
              etiquetaCantidad="áreas"
            >
              {Object.keys(datos.porArea).map((nombreArea) => (
                <ResumenArea key={nombreArea} titulo={nombreArea} resumen={datos.porArea[nombreArea]} />
              ))}
            </Desplegable>
          )}

          {/* Las novedades quedan plegadas para que la tabla de programados
              no quede enterrada al final de la página. Cada una muestra
              cuántos casos tiene, y se abre solo si hace falta revisarla. */}
          {totalNovedades === 0 ? (
            <p style={{ ...estilos.textoSecundario, marginTop: 24 }}>
              ✅ Sin novedades para este día: no hay casos por revisar, duplicados ni registros fuera del listado.
            </p>
          ) : (
            <h2 style={estilos.h2}>Novedades del día ({totalNovedades})</h2>
          )}

          {datos.apoyoOtrasAreas.length > 0 && (
            <Desplegable
              titulo="Apoyo de otras áreas"
              cantidad={datos.apoyoOtrasAreas.length}
              etiquetaCantidad="personas"
            >
              <p style={estilos.textoSecundario}>
                No es un error: son personas de otra área que se registraron este día para apoyar. Su
                alimentación sí está incluida en el total a pedir de arriba.
              </p>
              <ul style={estilos.lista}>
                {datos.apoyoOtrasAreas.map((p) => (
                  <li key={p.cedula}>
                    {p.nombre} ({p.area}) — {p.bodega || 'sin bodega'}
                    {p.calculo
                      ? ` · ${p.calculo.horasExtraTexto || '—'}${p.calculo.tieneAlimentacion ? ' · ✅ con alimentación' : ''}`
                      : ` · no asiste${p.motivo ? ` (${p.motivo})` : ''}`}
                  </li>
                ))}
              </ul>
            </Desplegable>
          )}

          {datos.revisionManual.length > 0 && (
            <Desplegable
              titulo="⚠️ Necesitan revisión manual"
              cantidad={datos.revisionManual.length}
              etiquetaCantidad="casos"
            >
              <ul style={estilos.lista}>
                {datos.revisionManual.map((p) => (
                  <li key={p.cedula}>
                    {p.nombre} ({p.cedula}) — {p.calculo.motivoRevision}
                  </li>
                ))}
              </ul>
            </Desplegable>
          )}

          {datos.duplicados.length > 0 && (
            <Desplegable
              titulo="⚠️ Registros duplicados"
              cantidad={datos.duplicados.length}
              etiquetaCantidad="casos"
            >
              <ul style={estilos.lista}>
                {datos.duplicados.map((p) => (
                  <li key={p.cedula}>
                    {p.nombre} ({p.cedula}) — {p.cantidadRegistros} registros ese día, revisar cuál es el correcto.
                  </li>
                ))}
              </ul>
            </Desplegable>
          )}

          {datos.fueraDeAlcance.length > 0 && (
            <Desplegable
              titulo="⚠️ Cédulas que no están en el listado maestro"
              cantidad={datos.fueraDeAlcance.length}
              etiquetaCantidad="registros"
            >
              <ul style={estilos.lista}>
                {datos.fueraDeAlcance.map((p, i) => (
                  <li key={`${p.cedula}-${i}`}>
                    {p.nombre || 'Sin nombre'} ({p.cedula}) — {p.motivo}
                  </li>
                ))}
              </ul>
            </Desplegable>
          )}

          <div style={{ marginTop: 32 }}>
            <label style={estilos.etiqueta}>Ver lista</label>
            <select style={estilos.input} value={vistaLista} onChange={(e) => setVistaLista(e.target.value)}>
              <option value="PROGRAMADOS">Programados ({datos.programados.length})</option>
              <option value="FALTANTES">Faltan por programar ({datos.faltantes.length})</option>
            </select>
          </div>

          {vistaLista === 'FALTANTES' && (
            <>
              <h2 style={estilos.h2}>Faltantes por programar ({datos.faltantes.length})</h2>
              {datos.faltantes.length === 0 ? (
                <p style={estilos.textoSecundario}>Nadie falta por programar. 🎉</p>
              ) : (
                <ul style={estilos.lista}>
                  {datos.faltantes.map((p) => (
                    <li key={p.cedula}>
                      {p.nombre} ({p.cedula}) — {p.area}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {vistaLista === 'PROGRAMADOS' && (
            <>
              <h2 style={estilos.h2}>
                Programados{bodega !== 'TODAS' ? ` en ${bodega}` : ''} ({datos.programados.length})
              </h2>
              <p style={estilos.textoSecundario}>
                Para corregir el registro de alguien (Bodega, Asiste, Hora de salida), usa "Editar" — esto solo lo
                puede hacer un administrador, no la persona misma.
              </p>
              {errorAsistencia && <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {errorAsistencia}</div>}
              <div style={{ overflowX: 'auto' }}>
                <table style={estilos.tabla}>
                  <thead>
                    <tr>
                      <th style={estilos.th}>Nombre</th>
                      <th style={estilos.th}>Área</th>
                      <th style={estilos.th}>Bodega</th>
                      <th style={estilos.th}>Asiste</th>
                      <th style={estilos.th}>Hora efectiva</th>
                      <th style={estilos.th}>Horas extra</th>
                      <th style={estilos.th}>Alimentación</th>
                      <th style={estilos.th}>¿Asistió realmente?</th>
                      <th style={estilos.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.programados.map((p) => (
                      <Fragment key={p.cedula}>
                        <tr>
                          <td style={estilos.td}>{p.nombre}</td>
                          <td style={estilos.td}>{p.area}</td>
                          <td style={estilos.td}>{p.bodega}</td>
                          <td style={estilos.td}>{p.asiste}{p.motivo ? ` (${p.motivo})` : ''}</td>
                          <td style={estilos.td}>{p.calculo ? p.calculo.horaEfectiva || '—' : '—'}</td>
                          <td style={estilos.td}>{p.calculo ? p.calculo.horasExtraTexto || '—' : '—'}</td>
                          <td style={estilos.td}>
                            {p.calculo
                              ? p.calculo.requiereRevisionManual
                                ? '⚠️ Revisar'
                                : p.calculo.tieneAlimentacion
                                ? '✅ Sí'
                                : 'No'
                              : '—'}
                          </td>
                          <td style={estilos.td}>
                            {!p.calculo ? (
                              '—'
                            ) : (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  type="button"
                                  disabled={guardandoAsistencia.has(p.cedula)}
                                  onClick={() => confirmarAsistencia(p.cedula, 'Si')}
                                  style={p.asistioReal === 'Si' ? estilos.botonAsistenciaActivoSi : estilos.botonAsistencia}
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  disabled={guardandoAsistencia.has(p.cedula)}
                                  onClick={() => confirmarAsistencia(p.cedula, 'No')}
                                  style={p.asistioReal === 'No' ? estilos.botonAsistenciaActivoNo : estilos.botonAsistencia}
                                >
                                  No
                                </button>
                                {!p.asistioReal && <span style={estilos.textoSecundario}>Sin confirmar</span>}
                              </div>
                            )}
                          </td>
                          <td style={estilos.td}>
                            {editando !== p.cedula && (
                              <button type="button" style={estilos.botonEditar} onClick={() => abrirEdicion(p)}>
                                ✏️ Editar
                              </button>
                            )}
                          </td>
                        </tr>
                        {editando === p.cedula && formEdicion && (
                          <tr>
                            <td style={estilos.tdEdicion} colSpan={9}>
                              <div style={estilos.panelEdicion}>
                                <strong>Editando a {p.nombre}</strong>

                                <div style={estilos.filaFormEdicion}>
                                  <div>
                                    <label style={estilos.etiqueta}>Bodega</label>
                                    <select
                                      style={estilos.input}
                                      value={formEdicion.bodega}
                                      onChange={(e) => setFormEdicion({ ...formEdicion, bodega: e.target.value })}
                                    >
                                      {BODEGAS.map((b) => (
                                        <option key={b} value={b}>
                                          {b}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={estilos.etiqueta}>Asiste</label>
                                    <select
                                      style={estilos.input}
                                      value={formEdicion.asiste}
                                      onChange={(e) => setFormEdicion({ ...formEdicion, asiste: e.target.value })}
                                    >
                                      <option value="Si">Sí</option>
                                      <option value="No">No</option>
                                    </select>
                                  </div>
                                  {formEdicion.asiste === 'No' ? (
                                    <div>
                                      <label style={estilos.etiqueta}>Motivo</label>
                                      <input
                                        style={estilos.input}
                                        type="text"
                                        value={formEdicion.motivo}
                                        onChange={(e) => setFormEdicion({ ...formEdicion, motivo: e.target.value })}
                                      />
                                    </div>
                                  ) : (
                                    <div>
                                      <label style={estilos.etiqueta}>Hora de salida real (opcional)</label>
                                      <input
                                        style={estilos.input}
                                        type="text"
                                        placeholder="HH:MM, en blanco = jornada completa"
                                        value={formEdicion.horaSalidaReal}
                                        onChange={(e) => setFormEdicion({ ...formEdicion, horaSalidaReal: e.target.value })}
                                      />
                                    </div>
                                  )}
                                  <div>
                                    <label style={estilos.etiqueta}>Tu nombre (quién edita)</label>
                                    <input
                                      style={estilos.input}
                                      type="text"
                                      placeholder="Obligatorio"
                                      value={formEdicion.editadoPor}
                                      onChange={(e) => setFormEdicion({ ...formEdicion, editadoPor: e.target.value })}
                                    />
                                  </div>
                                </div>

                                {errorEdicion && (
                                  <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {errorEdicion}</div>
                                )}

                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                  <button
                                    type="button"
                                    disabled={guardandoEdicion}
                                    onClick={() => guardarEdicion(p.cedula)}
                                    style={estilos.boton}
                                  >
                                    {guardandoEdicion ? 'Guardando...' : 'Guardar cambio'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={guardandoEdicion}
                                    onClick={cancelarEdicion}
                                    style={estilos.botonSecundario}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </main>
    </>
  );
}

const estilos = {
  contenedor: { fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 960, margin: '0 auto' },
  titulo: { fontSize: 20, marginBottom: 0 },
  subtitulo: { color: '#555', marginTop: 4, marginBottom: 24 },
  h2: { fontSize: 16, marginTop: 32, marginBottom: 8 },
  filaSelectores: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  etiqueta: { display: 'block', fontWeight: 600, marginTop: 8, marginBottom: 6, fontSize: 13 },
  input: { padding: 10, fontSize: 16, borderRadius: 8, border: '1px solid #ccc', minWidth: 160 },
  filaTarjetas: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 },
  filaTarjetasChicas: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  tarjeta: {
    flex: '1 1 140px',
    background: '#f6f8fa',
    borderRadius: 8,
    padding: 16,
    textAlign: 'center',
  },
  tarjetaValor: { fontSize: 28, fontWeight: 700 },
  tarjetaEtiqueta: { fontSize: 13, color: '#555', marginTop: 4 },
  bloqueArea: { marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 8 },
  textoSecundario: { color: '#555', fontSize: 14 },
  aviso: { padding: 10, borderRadius: 8, marginTop: 8, fontSize: 14 },
  avisoError: { background: '#fdecea', color: '#b3261e' },
  avisoInfo: { background: '#e8f0fe', color: '#1a53a8' },
  desplegable: {
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    marginTop: 8,
    background: '#fafafa',
  },
  desplegableTitulo: {
    cursor: 'pointer',
    padding: '12px',
    fontWeight: 600,
    fontSize: 15,
    listStyle: 'revert',
  },
  contador: {
    fontWeight: 400,
    fontSize: 13,
    color: '#555',
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 10,
    padding: '1px 8px',
    marginLeft: 6,
    whiteSpace: 'nowrap',
  },
  lista: { paddingLeft: 20, lineHeight: 1.8 },
  tabla: { width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 14 },
  th: { textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px 6px', background: '#f6f8fa' },
  td: { borderBottom: '1px solid #eee', padding: '8px 6px' },
  botonAsistencia: {
    padding: '4px 10px',
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
  },
  botonAsistenciaActivoSi: {
    padding: '4px 10px',
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid #1e7e34',
    background: '#e6f4ea',
    color: '#1e7e34',
    fontWeight: 600,
    cursor: 'pointer',
  },
  botonAsistenciaActivoNo: {
    padding: '4px 10px',
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid #b3261e',
    background: '#fdecea',
    color: '#b3261e',
    fontWeight: 600,
    cursor: 'pointer',
  },
  botonEditar: {
    padding: '4px 10px',
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid #1a73e8',
    background: '#fff',
    color: '#1a73e8',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
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
  },
  tdEdicion: { padding: 0, borderBottom: '1px solid #eee', background: '#f6f8fa' },
  panelEdicion: { padding: 16 },
  filaFormEdicion: { display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 },
};
