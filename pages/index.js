/**
 * Página de inicio temporal. Se reemplazará por las pantallas reales
 * (Registro diario y Administrador) en el siguiente paso, una vez esté
 * validada la conexión a Google Sheets.
 */
export default function Inicio() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20 }}>Programaciones Extiblu</h1>
      <p>
        Esta es una versión inicial en construcción. Por ahora solo está lista
        la conexión de prueba con el listado maestro.
      </p>
      <p>
        Prueba la conexión aquí: <a href="/api/prueba-maestro">/api/prueba-maestro</a>
      </p>
    </main>
  );
}
