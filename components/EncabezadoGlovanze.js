/**
 * Barra superior con el logo de Glovanze, compartida por todas las pantallas.
 *
 * El logo viene con la palabra "Glovanze" en blanco sobre fondo transparente,
 * por eso la barra es de color oscuro: sobre el fondo blanco de las páginas
 * el texto del logo no se vería. El archivo de imagen está en
 * public/glovanze-logo.png y se sirve en la ruta /glovanze-logo.png.
 */
export default function EncabezadoGlovanze() {
  return (
    <header style={estilos.barra}>
      <div style={estilos.contenido}>
        <img src="/glovanze-logo.png" alt="Glovanze" style={estilos.logo} />
      </div>
    </header>
  );
}

const estilos = {
  barra: {
    background: '#10211C',
    padding: '14px 24px',
  },
  contenido: {
    maxWidth: 960,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
  },
  logo: {
    height: 30,
    width: 'auto',
    maxWidth: '100%',
    display: 'block',
  },
};
