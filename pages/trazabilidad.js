/**
 * Trazabilidad por persona: busca por cédula y muestra el total de horas
 * extra programadas vs. las confirmadas como asistidas, con el % de
 * cumplimiento. La confirmación de asistencia se hace desde el panel de
 * Administrador (columna "¿Asistió realmente?").
 */
import { useEffect, useState } from 'react';

export default function Trazabilidad() {
  const [cedula, setCedula] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const soloDigitos = cedula.replace(/\D/g, '');
    if (!soloDigitos) {
      setDatos(null);
      setError('');
      return;
    }

    let cancelado = false;
    setCargando(true);
    setError('');

    const temporizador = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/trazabilidad?cedula=${encodeURIComponent(soloDigitos)}`);
        const json = await resp.json();
        if (cancelado) return;
        if (!json.ok) {
          setError(json.error || 'No se pudo consultar.');
          setDatos(null);
        } else {
          setDatos(json);
        }
      } catch (e) {
        if (!cancelado) setError('No se pudo consultar el servidor. Intenta de nuevo.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }, 500);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [cedula]);

  return (
    <main style={estilos.contenedor}>
      <h1 style={estilos.titulo}>Programaciones Extiblu</h1>
      <p style={estilos.subtitulo}>
        Trazabilidad por persona · <a href="/administrador">Volver al Panel de Administrador</a>
      </p>

      <label style={estilos.etiqueta}>Cédula</label>
      <input
        style={estilos.input}
        type="tel"
        inputMode="numeric"
        placeholder="Escribe la cédula de la persona"
        value={cedula}
        onChange={(e) => setCedula(e.target.value)}
      />

      {cargando && <p>Buscando...</p>}
      {error && <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {error}</div>}

      {datos && !cargando && (
        <>
          <h2 style={estilos.h2}>
            {datos.nombre} — {datos.area}
          </h2>

          <div style={estilos.filaTarjetas}>
            <div style={estilos.tarjeta}>
              <div style={estilos.tarjetaValor}>{datos.totalHorasProgramadasTexto}</div>
              <div style={estilos.tarjetaEtiqueta}>Horas programadas</div>
            </div>
            <div style={{ ...estilos.tarjeta, borderTop: '4px solid #1e7e34' }}>
              <div style={estilos.tarjetaValor}>{datos.totalHorasAsistidasTexto}</div>
              <div style={estilos.tarjetaEtiqueta}>Horas asistidas (confirmadas)</div>
            </div>
            <div style={{ ...estilos.tarjeta, borderTop: '4px solid #0b8043' }}>
              <div style={estilos.tarjetaValor}>
                {datos.porcentajeCumplimiento === null ? '—' : `${datos.porcentajeCumplimiento}%`}
              </div>
              <div style={estilos.tarjetaEtiqueta}>Cumplimiento</div>
            </div>
          </div>

          {datos.totalPendientesPorConfirmar > 0 && (
            <p style={estilos.textoSecundario}>
              ⚠️ {datos.totalPendientesPorConfirmar} día(s) programado(s) todavía sin confirmar en el panel de
              Administrador — mientras no se confirmen, cuentan como no asistidos en el % de cumplimiento.
            </p>
          )}

          <h2 style={estilos.h2}>Detalle por día ({datos.detalle.length})</h2>
          {datos.detalle.length === 0 ? (
            <p style={estilos.textoSecundario}>Esta persona no tiene horas extra programadas todavía.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.th}>Fecha</th>
                    <th style={estilos.th}>Horas programadas</th>
                    <th style={estilos.th}>¿Asistió?</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.detalle.map((d) => (
                    <tr key={d.fecha}>
                      <td style={estilos.td}>{d.fecha}</td>
                      <td style={estilos.td}>{d.horasProgramadasTexto}</td>
                      <td style={estilos.td}>
                        {d.asistioReal === 'Si' ? '✅ Sí' : d.asistioReal === 'No' ? '❌ No' : '— Sin confirmar'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {datos.sinCalcular.length > 0 && (
            <>
              <h2 style={estilos.h2}>⚠️ Días que no se pudieron calcular</h2>
              <ul style={estilos.lista}>
                {datos.sinCalcular.map((d, i) => (
                  <li key={`${d.fecha}-${i}`}>
                    {d.fecha} — {d.motivo}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}

const estilos = {
  contenedor: { fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 720, margin: '0 auto' },
  titulo: { fontSize: 20, marginBottom: 0 },
  subtitulo: { color: '#555', marginTop: 4, marginBottom: 24 },
  h2: { fontSize: 16, marginTop: 28, marginBottom: 8 },
  etiqueta: { display: 'block', fontWeight: 600, marginTop: 8, marginBottom: 6, fontSize: 13 },
  input: { padding: 10, fontSize: 16, borderRadius: 8, border: '1px solid #ccc', width: '100%', boxSizing: 'border-box', maxWidth: 320 },
  filaTarjetas: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 },
  tarjeta: { flex: '1 1 160px', background: '#f6f8fa', borderRadius: 8, padding: 16, textAlign: 'center', borderTop: '4px solid #1a73e8' },
  tarjetaValor: { fontSize: 24, fontWeight: 700 },
  tarjetaEtiqueta: { fontSize: 13, color: '#555', marginTop: 4 },
  textoSecundario: { color: '#555', fontSize: 14, marginTop: 12 },
  aviso: { padding: 10, borderRadius: 8, marginTop: 8, fontSize: 14 },
  avisoError: { background: '#fdecea', color: '#b3261e' },
  lista: { paddingLeft: 20, lineHeight: 1.8 },
  tabla: { width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 14 },
  th: { textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px 6px', background: '#f6f8fa' },
  td: { borderBottom: '1px solid #eee', padding: '8px 6px' },
};
