// Configuración de la app. Solo tienes que cambiar clientId.
// El clientId NO es una contraseña: identifica la app ante Microsoft.
window.APP_CONFIG = {
  clientId: "3c497a7c-0019-4763-8dc5-eafbf48a2f60",   // Microsoft Entra › Registros de aplicaciones › Id. de aplicación (cliente)
  fileName: "patrimonio.xlsx",                   // nombre del Excel dentro de OneDrive › Aplicaciones › (nombre de tu app)
  idleMinutes: 15                                // minutos sin uso antes de cerrar la sesión de la app
};
