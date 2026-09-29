/**
 * Checklist de entrega de comidas — para el día de entrega, marcar quién
 * reclama su alimentación y comparar contra quién tenía derecho según lo
 * programado. No se guarda en ningún lado (confirmado con la usuaria):
 * es solo para el momento de la entrega.
 */
import { useEffect, useState } from 'react';

const BODEGAS = ['Bodega 222', 'Bodega 224', 'Bodega 230'];

function hoyISO() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export default function ChecklistComidas() {
  const [fecha, setFecha] = useState(hoyISO());
  const [bodega, setBodega] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  // cédulas marcadas como "reclamó" (tanto de la lista esperada como de "revisar manual")
  const [reclamados, setReclamados] = useState(new Set());

  // personas que reclamaron sin estar en la lista de esperados
  const [extras, setExtras] = useState([]);
  const [cedulaExtra, setCedulaExtra] = useState('');
  const [estadoExtra, setEstadoExtra] = useState('vacio'); // vacio | buscando | encontrada | error
  const [personaExtra, setPersonaExtra] = useState(null);
  const [mensajeExtra, setMensajeExtra] = useState('');

  useEffect(() => {
    setReclamados(new Set());
    setExtras([]);
    setCedulaExtra('');
    setEstadoExtra('vacio');

    if (!bodega) {
      setDatos(null);
      return;
    }

    let cancelado = false;
    setCargando(true);
    setError('');

    fetch(`/api/checklist-comidas?fecha=${encodeURIComponent(fecha)}&bodega=${encodeURIComponent(bodega)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelado) return;
        if (!json.ok) {
          setError(json.error || 'No se pudo cargar la lista.');
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
  }, [fecha, bodega]);

  // Búsqueda de la persona "extra" (reclamó sin estar en la lista esperada)
  useEffect(() => {
    const soloDigitos = cedulaExtra.replace(/\D/g, '');
    if (!soloDigitos) {
      setEstadoExtra('vacio');
      setPersonaExtra(null);
      return;
    }
    setEstadoExtra('buscando');
    const temporizador = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/buscar-persona?cedula=${encodeURIComponent(soloDigitos)}`);
        const json = await resp.json();
        if (!json.encontrada) {
          setEstadoExtra('error');
          setPersonaExtra(null);
          setMensajeExtra(json.motivo || 'No se encontró esa cédula.');
          return;
        }
        setEstadoExtra('encontrada');
        setPersonaExtra({ cedula: soloDigitos, nombre: json.nombre, area: json.area });
      } catch (e) {
        setEstadoExtra('error');
        setMensajeExtra('No se pudo consultar el listado maestro.');
      }
    }, 500);
    return () => clearTimeout(temporizador);
  }, [cedulaExtra]);

  function alternarReclamado(cedula) {
    setReclamados((anterior) => {
      const nuevo = new Set(anterior);
      if (nuevo.has(cedula)) {
        nuevo.delete(cedula);
      } else {
        nuevo.add(cedula);
      }
      return nuevo;
    });
  }

  function agregarExtra() {
    if (!personaExtra) return;
    if (extras.some((p) => p.cedula === personaExtra.cedula) || datos?.esperados.some((p) => p.cedula === personaExtra.cedula)) {
      setMensajeExtra('Esa persona ya está en la lista.');
      setEstadoExtra('error');
      return;
    }
    setExtras((anteriores) => [...anteriores, personaExtra]);
    setReclamados((anterior) => new Set(anterior).add(personaExtra.cedula));
    setCedulaExtra('');
    setEstadoExtra('vacio');
    setPersonaExtra(null);
  }

  const esperados = datos ? datos.esperados : [];
  const revisarManual = datos ? datos.revisarManual : [];
  const totalEsperados = esperados.length;
  const reclamadosEsperados = esperados.filter((p) => reclamados.has(p.cedula)).length;
  const faltanPorReclamar = esperados.filter((p) => !reclamados.has(p.cedula));

  return (
    <main style={estilos.contenedor}>
      <h1 style={estilos.titulo}>Programaciones Extiblu</h1>
      <p style={estilos.subtitulo}>Checklist de entrega de comidas</p>

      <div style={estilos.filaSelectores}>
        <div>
          <label style={estilos.etiqueta}>Fecha</label>
          <input style={estilos.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label style={estilos.etiqueta}>Bodega</label>
          <select style={estilos.input} value={bodega} onChange={(e) => setBodega(e.target.value)}>
            <option value="">Selecciona...</option>
            {BODEGAS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!bodega && <p style={estilos.textoSecundario}>Selecciona una Bodega para ver la lista de entrega.</p>}
      {cargando && <p>Cargando...</p>}
      {error && <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {error}</div>}

      {datos && !cargando && (
        <>
          <div style={estilos.filaTarjetas}>
            <div style={estilos.tarjeta}>
              <div style={estilos.tarjetaValor}>{totalEsperados}</div>
              <div style={estilos.tarjetaEtiqueta}>Esperados</div>
            </div>
            <div style={{ ...estilos.tarjeta, borderTop: '4px solid #1e7e34' }}>
              <div style={estilos.tarjetaValor}>{reclamadosEsperados}</div>
              <div style={estilos.tarjetaEtiqueta}>Reclamados</div>
            </div>
            <div style={{ ...estilos.tarjeta, borderTop: '4px solid #b3261e' }}>
              <div style={estilos.tarjetaValor}>{faltanPorReclamar.length}</div>
              <div style={estilos.tarjetaEtiqueta}>Faltan por reclamar</div>
            </div>
            <div style={{ ...estilos.tarjeta, borderTop: '4px solid #e37400' }}>
              <div style={estilos.tarjetaValor}>{extras.length}</div>
              <div style={estilos.tarjetaEtiqueta}>Extras (no esperados)</div>
            </div>
          </div>

          <h2 style={estilos.h2}>Lista de entrega ({totalEsperados})</h2>
          {totalEsperados === 0 ? (
            <p style={estilos.textoSecundario}>Nadie tiene alimentación esperada en esta Bodega para este día.</p>
          ) : (
            <ul style={estilos.listaChecklist}>
              {esperados.map((p) => (
                <li key={p.cedula} style={estilos.itemChecklist}>
                  <label style={estilos.labelChecklist}>
                    <input
                      type="checkbox"
                      checked={reclamados.has(p.cedula)}
                      onChange={() => alternarReclamado(p.cedula)}
                      style={estilos.checkbox}
                    />
                    <span style={reclamados.has(p.cedula) ? estilos.textoReclamado : {}}>
                      {p.nombre} — {p.area}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {revisarManual.length > 0 && (
            <>
              <h2 style={estilos.h2}>⚠️ Revisar manualmente (no se sabe con seguridad si tienen derecho)</h2>
              <ul style={estilos.listaChecklist}>
                {revisarManual.map((p) => (
                  <li key={p.cedula} style={estilos.itemChecklist}>
                    <label style={estilos.labelChecklist}>
                      <input
                        type="checkbox"
                        checked={reclamados.has(p.cedula)}
                        onChange={() => alternarReclamado(p.cedula)}
                        style={estilos.checkbox}
                      />
                      <span style={reclamados.has(p.cedula) ? estilos.textoReclamado : {}}>
                        {p.nombre} — {p.area} ({p.motivo})
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {extras.length > 0 && (
            <>
              <h2 style={estilos.h2}>Reclamaron sin estar en la lista</h2>
              <ul style={estilos.listaChecklist}>
                {extras.map((p) => (
                  <li key={p.cedula} style={estilos.itemChecklist}>
                    ✅ {p.nombre} — {p.area} ({p.cedula})
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 style={estilos.h2}>Agregar persona que reclamó y no está en la lista</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <input
              style={{ ...estilos.input, flex: '1 1 200px' }}
              type="tel"
              inputMode="numeric"
              placeholder="Cédula"
              value={cedulaExtra}
              onChange={(e) => setCedulaExtra(e.target.value)}
            />
            <button
              type="button"
              onClick={agregarExtra}
              disabled={estadoExtra !== 'encontrada'}
              style={{
                ...estilos.boton,
                width: 'auto',
                marginTop: 0,
                padding: '10px 20px',
                ...(estadoExtra !== 'encontrada' ? estilos.botonDeshabilitado : {}),
              }}
            >
              Agregar
            </button>
          </div>
          {estadoExtra === 'buscando' && <p style={estilos.textoSecundario}>Buscando...</p>}
          {estadoExtra === 'encontrada' && personaExtra && (
            <div style={{ ...estilos.aviso, ...estilos.avisoExito }}>
              ✅ {personaExtra.nombre} — {personaExtra.area}
            </div>
          )}
          {estadoExtra === 'error' && <div style={{ ...estilos.aviso, ...estilos.avisoError }}>⚠️ {mensajeExtra}</div>}
        </>
      )}
    </main>
  );
}

const estilos = {
  contenedor: { fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 560, margin: '0 auto' },
  titulo: { fontSize: 20, marginBottom: 0 },
  subtitulo: { color: '#555', marginTop: 4, marginBottom: 24 },
  h2: { fontSize: 16, marginTop: 28, marginBottom: 8 },
  filaSelectores: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  etiqueta: { display: 'block', fontWeight: 600, marginTop: 8, marginBottom: 6, fontSize: 13 },
  input: {
    padding: 10,
    fontSize: 16,
    borderRadius: 8,
    border: '1px solid #ccc',
    minWidth: 160,
    boxSizing: 'border-box',
  },
  filaTarjetas: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  tarjeta: { flex: '1 1 110px', background: '#f6f8fa', borderRadius: 8, padding: 12, textAlign: 'center', borderTop: '4px solid #1a73e8' },
  tarjetaValor: { fontSize: 24, fontWeight: 700 },
  tarjetaEtiqueta: { fontSize: 12, color: '#555', marginTop: 2 },
  textoSecundario: { color: '#555', fontSize: 14 },
  aviso: { padding: 10, borderRadius: 8, marginTop: 8, fontSize: 14 },
  avisoExito: { background: '#e6f4ea', color: '#1e7e34' },
  avisoError: { background: '#fdecea', color: '#b3261e' },
  listaChecklist: { listStyle: 'none', padding: 0, margin: 0 },
  itemChecklist: { padding: '10px 4px', borderBottom: '1px solid #eee' },
  labelChecklist: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15 },
  checkbox: { width: 20, height: 20 },
  textoReclamado: { textDecoration: 'line-through', color: '#888' },
  boton: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
    background: '#1a73e8',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  botonDeshabilitado: { background: '#a9c3ec', cursor: 'not-allowed' },
};
