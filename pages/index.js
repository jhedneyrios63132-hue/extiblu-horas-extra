/**
 * Página de inicio. La pantalla de Administrador todavía está pendiente de
 * construir — por ahora este es el punto de entrada a Registro.
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
      <p style={{ color: '#666', fontSize: 14 }}>
        (Prueba técnica de la conexión al maestro: <a href="/api/prueba-maestro">/api/prueba-maestro</a>)
      </p>
    </main>
  );
}
