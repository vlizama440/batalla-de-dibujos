# Batalla de Dibujos

Juego web en español para un animador y hasta **50 jugadores** en tiempo real. Sin instalaciones para los participantes.

## Mecánica
1. El animador crea una sala de tres dígitos y muestra el código/QR.
2. Cada participante escribe su nombre y puede enviar **una propuesta** de desafío.
3. El animador ve las propuestas y selecciona una.
4. Al comenzar, todos tienen **60 segundos** para dibujar en el celular. Se puede enviar antes. Si todos envían se pasa a presentación automáticamente; al cumplirse el tiempo el navegador intenta enviar los dibujos pendientes.
5. El animador muestra cada dibujo con **Anterior** y **Siguiente**, a su ritmo.
6. El animador abre la votación: los jugadores ven **todos los dibujos** y eligen exactamente **dos de otros jugadores**.
7. El animador cierra los votos y proyecta el ranking. Cada voto vale un punto.
8. Se puede iniciar otra ronda manteniendo los participantes.

## Publicar sin instalar programas
1. Crear un repositorio nuevo en GitHub y subir **los archivos de esta carpeta** (`server.js`, `package.json`, `render.yaml`, `public/index.html`). Es importante subir también la carpeta `public`.
2. En Render: **New > Web Service**, conectar ese repositorio y elegir runtime **Node**, instancia **Free**.
3. Build Command: `npm install`; Start Command: `npm start`; Root Directory vacío.
4. Cuando el servicio marque Live, abrir el enlace de Render. El animador pulsa **Crear sala** y comparte el código/QR. Para jugadores se abre `/ ?sala=123` (sin espacio).

## Detalles y límites
- La sala y los dibujos se guardan **en memoria del servidor**. Si Render reinicia o suspende el proceso se perderá la partida y las salas. Usar durante una sesión activa, probar antes de un evento y, para producción, añadir persistencia.
- La app está diseñada para **una única instancia** Node; no escalar a varias instancias sin una base de datos/adapter Socket.IO.
- Para móvil, conviene usar Chrome/Safari fuera del navegador interno de WhatsApp para evitar problemas de navegación.
- Conexión a Internet necesaria para todos. El código de la sala es de 3 dígitos, por lo que no es un mecanismo de seguridad; evita compartirlo públicamente.
- El código QR se crea con un servicio externo de generación QR; si ese servicio está caído, los invitados pueden escribir el código.
- **No se han hecho pruebas de carga con 50 dispositivos físicos**. Probar con un grupo pequeño primero.

## Desarrollo local (opcional)
`npm install` y `npm start`, luego abrir http://localhost:3000.
