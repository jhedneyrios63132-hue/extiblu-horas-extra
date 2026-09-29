/**
 * Página de inicio: punto de entrada a las pantallas de la herramienta.
 */
export default function Inicio() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20 }}>Programaciones Extiblu</h1>
      <p>
        <a href="/registro" style={{ fontSize: 18 }}>➡️ Ir a Registro de horas extra</a>
      </p>
      <p>
        <a href="/administrador" style={{ fontSize: 18 }}>📋 Ir a Panel de Administrador</a>
      </p>
      <p>
        <a href="/checklist-comidas" style={{ fontSize: 18 }}>🍽️ Ir a Checklist de entrega de comidas</a>
      </p>
      <p>
        <a href="/trazabilidad" style={{ fontSize: 18 }}>📈 Ir a Trazabilidad por persona</a>
      </p>
      <p style={{ color: '#666', fontSize: 14 }}>
        (Prueba técnica de la conexión al maestro: <a href="/api/prueba-maestro">/api/prueba-maestro</a>)
      </p>
    </main>
  );
}
