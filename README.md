# Programaciones Extiblu — Herramienta de horas extra y alimentación

Estado actual: **Paso 1 de la construcción.** Ya está lista la lógica de cálculo
(probada) y la conexión a Google Sheets. Falta construir las pantallas de
Registro y Administrador — eso viene en el siguiente paso, una vez confirmes
que esta primera parte funciona con tus datos reales.

Este documento trae, en orden, todo lo que necesitas hacer de tu lado antes de
poder probar la herramienta. No necesitas saber programar para seguir estos
pasos, son configuraciones dentro de Google y de Vercel.

---

## Paso 1 — Crear la cuenta de servicio de Google (una sola vez)

Esto le da a la herramienta un "usuario robot" con permiso solo para leer y
escribir en las dos hojas que le indiquemos — nunca tiene acceso a tu cuenta
personal de Google ni a nada más.

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) con tu cuenta de Google.
2. Si no tienes un proyecto todavía, créalo (arriba a la izquierda, "Seleccionar proyecto" → "Proyecto nuevo"). Puedes llamarlo, por ejemplo, `extiblu-horas-extra`.
3. Con el proyecto seleccionado, ve al buscador de arriba y escribe **"Google Sheets API"** → ábrela → botón **Habilitar**.
4. Ve al menú (☰) → **IAM y administración** → **Cuentas de servicio** → **Crear cuenta de servicio**.
   - Nombre: `extiblu-sheets-bot` (o el que prefieras).
   - No necesitas darle ningún rol especial en este paso (puedes dejarlo en blanco y avanzar).
   - Termina la creación.
5. Ya creada la cuenta de servicio, haz clic en ella → pestaña **Claves** → **Agregar clave** → **Crear clave nueva** → tipo **JSON** → **Crear**.
   - Esto descarga un archivo `.json` a tu computador. **Guárdalo en un lugar seguro y no lo compartas** (equivale a una contraseña).
6. Abre ese archivo `.json` con el Bloc de notas (o similar). Vas a necesitar dos valores de ahí:
   - `client_email` → algo como `extiblu-sheets-bot@tu-proyecto.iam.gserviceaccount.com`
   - `private_key` → un texto largo que empieza con `-----BEGIN PRIVATE KEY-----`

## Paso 2 — Compartir las hojas de Google Sheets con esa cuenta de servicio

1. Abre tu **listado maestro** de personal en Google Sheets → botón **Compartir** → pega el `client_email` del paso anterior → dale permiso de **Editor** → Enviar (no hace falta que le llegue notificación por correo, puedes desmarcar esa opción).
2. Crea una **hoja nueva** de Google Sheets para el registro diario (ya no se usa la de AppSheet). En la primera fila, pon exactamente estas columnas, en este orden:

   | Cedula | Nombre | Fecha | Asiste | Motivo | Bodega | Area | Hora_salida_real | Timestamp | Asistio_Real | Editado_Por | Fecha_Edicion |
   |---|---|---|---|---|---|---|---|---|---|---|---|

   - `Fecha`: formato `AAAA-MM-DD` (ej. `2026-09-16`).
   - `Asiste`: `Si` o `No`.
   - `Hora_salida_real`: formato `HH:MM` en 24 horas (ej. `16:30`), solo se llena cuando aplica.
   - `Asistio_Real` (columna J): la llena la herramienta misma cuando se confirma si la
     persona realmente asistió a sus horas extra (`Si` o `No`), ya sea escaneando cédulas
     en la pantalla "Confirmar asistencia" o con los botones Sí/No del Panel de
     Administrador. Queda vacía hasta que alguien la confirme — no hace falta llenarla a
     mano, solo crear la columna con ese encabezado exacto.
   - `Editado_Por` (columna K) y `Fecha_Edicion` (columna L): las llena la herramienta
     sola cuando un administrador corrige un registro ya existente desde el Panel de
     Administrador (Bodega, Asiste/Motivo u Hora de salida real). Quedan vacías hasta
     que alguien edite ese registro — solo hay que crear las dos columnas con esos
     encabezados exactos.
   - Las demás columnas, texto libre como ya las conoces.
3. Comparte también esta hoja nueva con el mismo `client_email`, igualmente con permiso de **Editor**.
4. **Pestaña del turno sabatino** (opcional, pero necesaria si tienes personal que trabaja los sábados
   por turno fijo). En ese mismo archivo del registro diario, crea una pestaña llamada exactamente
   `Turno_Sabado`. En la celda A1 escribe el encabezado `Cedula`, y debajo pega una cédula por fila.

   Esa gente no manda registro porque ya sabe que le toca venir. Con esa lista, los sábados la
   herramienta los cuenta sola como programados: salen a las 12:00, no llevan almuerzo, sus horas no
   se cuentan como extra (es su jornada normal), y en la pantalla de Confirmar asistencia aparecen ya
   contados sin tener que escanearlos. Si alguno de ellos sí se queda haciendo horas extra y registra
   su salida, ese registro manda sobre el automático.

   Si la pestaña no existe, la herramienta funciona igual que siempre: nadie se cuenta por turno.
   Para cambiar quién está en el turno, basta con editar esa pestaña — no hay que tocar el código.

## Paso 3 — Configurar las variables de entorno

1. En este proyecto, copia el archivo `.env.example` y renómbralo a `.env.local`.
2. Ábrelo y completa:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: el `client_email` del paso 1.
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: el `private_key` del paso 1, completo, entre comillas dobles (respeta los `\n` tal como aparecen en el JSON).
   - `SHEET_ID_MAESTRO`: de la URL de tu hoja maestra, la parte entre `/d/` y `/edit`. Ejemplo: si la URL es `https://docs.google.com/spreadsheets/d/1AbCdEf.../edit`, el ID es `1AbCdEf...`.
   - `TAB_MAESTRO`: el nombre exacto de la pestaña del maestro (ej. `Control personal`).
   - `SHEET_ID_REGISTRO` y `TAB_REGISTRO`: lo mismo pero para la hoja nueva del paso 2.

## Paso 4 — Probar localmente (opcional pero recomendado)

Si tienes Node.js instalado en tu computador:

```bash
npm install
npm test        # corre las pruebas de las reglas de horas extra/alimentación
npm run dev      # levanta la app en http://localhost:3000
```

Abre `http://localhost:3000/api/prueba-maestro` en el navegador. Si todo está
bien configurado, verás un JSON con el total de personas del maestro y una
muestra de 3 filas. Si algo falla, el mismo mensaje te dice qué revisar.

## Paso 5 — Desplegar en Vercel

Ya tienes cuenta en Vercel, así que estos pasos te van a sonar conocidos:

1. Sube este proyecto a un repositorio de GitHub (o el que uses) — es la forma más simple de que Vercel lo despliegue y lo actualice automáticamente cada vez que hagamos cambios.
2. En Vercel: **Add New → Project** → selecciona ese repositorio.
3. Antes de darle "Deploy", ve a **Environment Variables** y agrega las mismas 6 variables del paso 3 (cópialas de tu `.env.local`). Esto es lo único delicado: esa información nunca debe ir en el código ni en GitHub, solo aquí, en Vercel.
4. Deploy. Cuando termine, prueba la misma URL de prueba: `https://tu-app.vercel.app/api/prueba-maestro`.

## Qué sigue después de validar esto

Una vez confirmes que `/api/prueba-maestro` te muestra bien tus datos, construyo
las dos pantallas reales:

- **Registro** (para todo el personal, pensada para abrirse fácil desde el
  celular — más adelante le agregamos el código QR que mencionaste).
- **Administrador** (con todos los totales, faltantes, horas extra y
  alimentaciones a pedir, desglosadas por Bodega y por área).

No se te pedirá ninguna otra credencial además de las de este documento.
