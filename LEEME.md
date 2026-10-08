# Mi patrimonio – app conectada a OneDrive

App web instalable en el móvil. Lee y escribe tus datos en un Excel de tu OneDrive personal.
Para entrar pide tu cuenta Microsoft, que aprobarás en Microsoft Authenticator.

- No hay servidor propio: el móvil habla directamente con Microsoft.
- El código no contiene datos ni contraseñas.
- El Excel vive en **OneDrive › Aplicaciones › Patrimonio › patrimonio.xlsx**. La app solo tiene permiso sobre esa carpeta, no sobre el resto de tu OneDrive.

> ⚠️ **El repositorio es público: no subas nunca tus Excel ni ningún documento personal.** El archivo `.gitignore` excluye los Excel, pero revisa antes cada subida.

---

## Paso 1 · Repositorio público en GitHub

1. Entra en GitHub › **New repository**.
   - Nombre: `patrimonio`.
   - Visibilidad: **Public**.
2. Pulsa **uploading an existing file** y arrastra **todo el contenido** de esta carpeta, sin la carpeta que lo contiene:
   - `index.html`, `app.js`, `config.js`, `sw.js`, `manifest.webmanifest`, `.gitignore`, `.nojekyll`;
   - las carpetas `lib/` e `icons/`.
   - Los archivos que empiezan por punto pueden no verse en tu explorador. Si no se suben, no pasa nada grave, pero `.gitignore` evita que subas un Excel por error.
3. Pulsa **Commit changes**.

Qué queda público: el código de la app y, tras el paso 4, el identificador de la app de Microsoft. **Ninguno es secreto.** Tus datos no están en el repositorio: viven solo en tu OneDrive y para verlos hay que entrar con tu cuenta y aprobar en Authenticator.

## Paso 2 · Publicarla con GitHub Pages

1. En el repositorio ve a **Settings › Pages**.
2. En **Source**, elige **Deploy from a branch**.
3. En **Branch**, elige **main** y carpeta **/ (root)**, y pulsa **Save**.
4. En uno o dos minutos aparecerá la dirección: `https://TU-USUARIO.github.io/patrimonio/`. Apúntala exactamente así, con la barra final.

## Paso 3 · Registrar la app en Microsoft

1. Entra en https://entra.microsoft.com (o portal.azure.com) con tu cuenta personal.
   - Si te pide crear un directorio o una cuenta gratuita de Azure, hazlo. Es gratis, aunque puede pedir una tarjeta para verificar tu identidad.
2. Ve a **Aplicaciones › Registros de aplicaciones › Nuevo registro**.
   - Nombre: **Patrimonio**. Será el nombre de la carpeta en OneDrive.
   - Tipos de cuenta admitidos: **Solo cuentas personales de Microsoft**.
   - URI de redirección: plataforma **Aplicación de página única (SPA)**, dirección `https://TU-USUARIO.github.io/patrimonio/` (la del paso 2, **con la barra final**).
3. Pulsa **Registrar** y copia el **Id. de aplicación (cliente)**.
4. Ve a **Permisos de API › Agregar un permiso › Microsoft Graph › Permisos delegados** y marca:
   - `Files.ReadWrite.AppFolder`
   - `User.Read` (ya suele venir).

## Paso 4 · Poner el identificador en la app

1. En GitHub, abre `config.js` y pulsa el lápiz para editarlo.
2. Pega el Id. de aplicación en `clientId`.
3. Pulsa **Commit changes**. GitHub Pages publica la nueva versión sola en uno o dos minutos.

## Paso 5 · Exigir Microsoft Authenticator

1. Entra en https://account.microsoft.com › **Seguridad** › **Opciones de seguridad avanzadas**.
2. Activa la **verificación en dos pasos** y añade **Microsoft Authenticator**.
   - Opcional: activa la **cuenta sin contraseña**. Así solo tendrás que aprobar en Authenticator.

La app pide iniciar sesión cada vez que abres una sesión nueva. Además, la cierra tras 15 minutos sin uso (se cambia en `config.js`).

## Paso 6 · Primer uso en el móvil

1. Abre `https://TU-USUARIO.github.io/patrimonio/` en el móvil y pulsa **Entrar con Microsoft**. Aprueba en Authenticator y acepta los permisos.
2. Ve a **Datos › Importar un Excel** y elige `patrimonio_datos_iniciales.xlsx`. Se crea `patrimonio.xlsx` en OneDrive.
3. Instálala en la pantalla de inicio:
   - **iPhone (Safari):** Compartir › Añadir a pantalla de inicio.
   - **Android (Chrome):** menú ⋮ › Instalar aplicación.

---

## Cómo se comporta

- **Al abrir:** lee la última versión del Excel. También vuelve a leerla al volver a la app tras más de un minuto fuera, si no hay cambios pendientes.
- **Al cambiar algo:** lo guarda en OneDrive en un segundo. Abajo verás "Guardado hh:mm".
- **Si el Excel cambió desde otro sitio:** la app te pregunta si quieres sobrescribirlo o cargar la versión de OneDrive.
- **Si tienes el Excel abierto en el ordenador:** OneDrive lo bloquea. La app avisa y reintenta cada 30 segundos. Cierra el Excel para que guarde.
- **Para editar a mano en Excel:** hazlo con la app cerrada y respeta los nombres de las hojas y columnas (Productos, Movimientos, Valoraciones, Deudas, Ajustes).
- **Copias de seguridad:** OneDrive guarda el historial de versiones del archivo (clic derecho › Historial de versiones). También tienes **Datos › Descargar copia**.

## Problemas frecuentes

- **AADSTS50011 (redirect URI):** la dirección registrada en el paso 3 no coincide exactamente con la de la app. Revisa `https`, el nombre del repositorio y la barra final.
- **La web da error 404:** espera unos minutos tras activar Pages y comprueba que `index.html` está en la raíz del repositorio, no dentro de una subcarpeta.
- **Falta configurar la app:** no has pegado el `clientId` en `config.js`.
- **Se queda en "Leyendo OneDrive…":** cierra sesión en Datos y vuelve a entrar para aceptar los permisos.
