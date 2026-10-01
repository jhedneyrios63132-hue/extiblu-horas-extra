/**
 * Checklist de entrega de comidas — para el día de entrega, se escribe la
 * cédula de cada persona a la que se le entrega la comida y la herramienta
 * la busca sola en la lista de esa Fecha+Bodega y la tacha. Si la cédula no
 * está en esa lista, queda registrada aparte en "No programados" (puede ser
 * de otra área, otro día, u otra Bodega). También se puede marcar tocando
 * el nombre directamente en la lista, como respaldo.
 *
 * No se guarda en ningún lado (confirmado con la usuaria): es solo para el
 * momento de la entrega.
 */
import { useEffect, useRef, useState } from 'react';

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

  // cédulas marcadas como "entregado" (tanto de la lista esperada como de "revisar manual")
  const [reclamados, setReclamados] = useState(new Set());

  // cédulas que se entregaron sin estar en la lista de esta Fecha+Bodega
  const [noProgramados, setNoProgramados] = useState([]);

  // entrada principal: cédula de la persona a la que se le está entregando
  const [entradaCedula, setEntradaCedula] = useState('');
  const [mensajeEntrada, setMensajeEntrada] = useState(null); // {tipo: 'exito'|'advertencia'|'info', texto}
  const inputRef = useRef(null);

  useEffect(() => {
    setReclamados(new Set());
    setNoProgramados([]);
    setEntradaCedula('');
    setMensajeEntrada(null);

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

  useEffect(() => {
    if (datos && !cargando) {
      inputRef.current?.focus();
    }
  }, [datos, cargando]);

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

  async function registrarEntrega(cedulaCruda) {
    const cedula = (cedulaCruda || '').replace(/\D/g, '');
    if (!cedula) return;

    const listaCompleta = [...(datos?.esperados || []), ...(datos?.revisarManual || [])];
    const persona = listaCompleta.find((p) => p.cedula === cedula);

    if (persona) {
      if (reclamados.has(cedula)) {
        setMensajeEntrada({ tipo: 'advertencia', texto: `⚠️ Ya se le había entregado la comida a ${persona.nombre}.` });
      } else {
        setReclamados((anterior) => new Set(anterior).add(cedula));
        setMensajeEntrada({ tipo: 'exito', texto: `✅ ${persona.nombre} — comida entregada.` });
      }
    } else if (noProgramados.some((p) => p.cedula === cedula)) {
      setMensajeEntrada({ tipo: 'advertencia', texto: '⚠️ Esa cédula ya se había registrado en "No programados".' });
    } else {
      setNoProgramados((anteriores) => [...anteriores, { cedula, nombre: null, area: null, cargando: true, noEncontrada: false }]);
      setMensajeEntrada({ tipo: 'info', texto: `Cédula ${cedula} no estaba en la lista de esta Bodega — se agregó a "No programados".` });

      try {
        const resp = await fetch(`/api/buscar-persona?cedula=${encodeURIComponent(cedula)}`);
        const json = await resp.json();
        setNoProgramados((anteriores) =>
          anteriores.map((p) =>
            p.cedula === cedula
              ? {
                  ...p,
                  cargando: false,
                  nombre: json.encontrada ? json.nombre : null,
                  area: json.encontrada ? json.area : null,
                  noEncontrada: !json.encontrada,
                }
              : p
          )
        );
      } catch (e) {
        setNoProgramados((anteriores) =>
          anteriores.map((p) => (p.cedula === cedula ? { ...p, cargando: false, noEncontrada: true } : p))
        );
      }
    }

    setEntradaCedula('');
    inputRef.current?.focus();
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
          <h2 style={{ ...estilos.h2, marginTop: 8 }}>Entregar comida</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              registrarEntrega(entradaCedula);
            }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          >
            <input
              ref={inputRef}
              style={{ ...estilos.input, flex: '1 1 220px', fontSize: 20, padding: 14 }}
              type="tel"
              inputMode="numeric"
              placeholder="Escribe la cédula y presiona Entregar"
              value={entradaCedula}
              onChange={(e) => {
                setEntradaCedula(e.target.value);
                setMensajeEntrada(null);
              }}
            />
            <button
              type="submit"
              style={{ ...estilos.boton, width: 'auto', marginTop: 0, padding: '14px 24px', fontSize: 16 }}
            >
              Entregar
            </button>
          </form>
          {mensajeEntrada && (
            <div
              style={{
                ...estilos.aviso,
                ...(mensajeEntrada.tipo === 'exito'
                  ? estilos.avisoExito
                  : mensajeEntrada.tipo === 'advertencia'
                  ? estilos.avisoAdvertencia
                  : estilos.avisoInfo),
              }}
            >
              {mensajeEntrada.texto}
            </div>
          )}

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
              <div style={estilos.tarjetaValor}>{noProgramados.length}</div>
              <div style={estilos.tarjetaEtiqueta}>No programados</div>
            </div>
          </div>

          <h2 style={estilos.h2}>Lista de entrega ({totalEsperados})</h2>
          <p style={estilos.textoSecundario}>
            Se tachan solas al escribir la cédula arriba. También puedes tocar un nombre para marcarlo manualmente.
          </p>
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

          {noProgramados.length > 0 && (
            <>
              <h2 style={estilos.h2}>No programados (se entregó comida sin estar en esta lista)</h2>
              <ul style={estilos.listaChecklist}>
                {noProgramados.map((p) => (
                  <li key={p.cedula} style={estilos.itemChecklist}>
                    {p.cargando
                      ? `Buscando... (${p.cedula})`
                      : p.noEncontrada
                      ? `⚠️ Cédula ${p.cedula} — no se encontró en el listado maestro`
                      : `✅ ${p.nombre} — ${p.area} (${p.cedula})`}
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
  filaTarjetas: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 },
  tarjeta: { flex: '1 1 110px', background: '#f6f8fa', borderRadius: 8, padding: 12, textAlign: 'center', borderTop: '4px solid #1a73e8' },
  tarjetaValor: { fontSize: 24, fontWeight: 700 },
  tarjetaEtiqueta: { fontSize: 12, color: '#555', marginTop: 2 },
  textoSecundario: { color: '#555', fontSize: 14 },
  aviso: { padding: 10, borderRadius: 8, marginTop: 8, fontSize: 14 },
  avisoExito: { background: '#e6f4ea', color: '#1e7e34' },
  avisoError: { background: '#fdecea', color: '#b3261e' },
  avisoAdvertencia: { background: '#fff4e5', color: '#9a5b00' },
  avisoInfo: { background: '#e8f0fe', color: '#1a53a8' },
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
