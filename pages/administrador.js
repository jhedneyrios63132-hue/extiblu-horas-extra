/**
 * Pantalla de Administrador: consulta por fecha y área, y muestra todo el
 * resumen (programados, faltantes, duplicados, horas extra y
 * alimentaciones a pedir) sin que nadie tenga que comparar nada a mano.
 */
import { useEffect, useState } from 'react';

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
  const [area, setArea] = useState('AMBAS');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [comidasOtrasAreas, setComidasOtrasAreas] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError('');

    fetch(`/api/administrador?fecha=${encodeURIComponent(fecha)}&area=${encodeURIComponent(area)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelado) return;
        if (!json.ok) {
          setError(json.error || 'No se pudo cargar la información.');
          setDatos(null);
        } else {
          setDatos(json);
        }
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo consultar el servidor. Intenta de nuevo.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [fecha, area]);

  const totalAlimentacionesConExtra = (datos ? datos.totalAlimentaciones : 0) + (Number(comidasOtrasAreas) || 0);

  return (
    <main style={estilos.contenedor}>
      <h1 style={estilos.titulo}>Programaciones Extiblu</h1>
      <p style={estilos.subtitulo}>Panel de Administrador</p>

      <div style={estilos.filaSelectores}>
        <div>
          <label style={estilos.etiqueta}>Fecha</label>
          <input style={estilos.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label style={estilos.etiqueta}>Área</label>
          <select style={estilos.input} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="AMBAS">Ambas</option>
            <option value="PRODUCCION">Producción</option>
            <option value="LOGISTICA">Logística</option>
          </select>
        </div>
      </div>

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
            <>
              <h2 style={estilos.h2}>Resumen por área</h2>
              <ResumenArea titulo="Producción" resumen={datos.porArea.PRODUCCION} />
              <ResumenArea titulo="Logística" resumen={datos.porArea.LOGISTICA} />
            </>
          )}

          {datos.revisionManual.length > 0 && (
            <>
              <h2 style={estilos.h2}>⚠️ Necesitan revisión manual</h2>
              <ul style={estilos.lista}>
                {datos.revisionManual.map((p) => (
                  <li key={p.cedula}>
                    {p.nombre} ({p.cedula}) — {p.calculo.motivoRevision}
                  </li>
                ))}
              </ul>
            </>
          )}

          {datos.duplicados.length > 0 && (
            <>
              <h2 style={estilos.h2}>⚠️ Registros duplicados</h2>
              <ul style={estilos.lista}>
                {datos.duplicados.map((p) => (
                  <li key={p.cedula}>
                    {p.nombre} ({p.cedula}) — {p.cantidadRegistros} registros ese día, revisar cuál es el correcto.
                  </li>
                ))}
              </ul>
            </>
          )}

          {datos.fueraDeAlcance.length > 0 && (
            <>
              <h2 style={estilos.h2}>⚠️ Registros fuera de lista o de área</h2>
              <ul style={estilos.lista}>
                {datos.fueraDeAlcance.map((p, i) => (
                  <li key={`${p.cedula}-${i}`}>
                    {p.nombre || 'Sin nombre'} ({p.cedula}) — {p.motivo}
                  </li>
                ))}
              </ul>
            </>
          )}

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

          <h2 style={estilos.h2}>Programados ({datos.programados.length})</h2>
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
                </tr>
              </thead>
              <tbody>
                {datos.programados.map((p) => (
                  <tr key={p.cedula}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
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
  lista: { paddingLeft: 20, lineHeight: 1.8 },
  tabla: { width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 14 },
  th: { textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px 6px', background: '#f6f8fa' },
  td: { borderBottom: '1px solid #eee', padding: '8px 6px' },
};
