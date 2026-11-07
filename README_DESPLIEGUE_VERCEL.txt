OBRA CONTROL v14 · Paquete web basado en OBRA_CONTROL_V14_WEB_REFERENCIA

CONTENIDO
- Interfaz principal OBRA CONTROL con Calidad, DH/NCR/RDI, PREVENT, ACADEMY,
  proyectos, inspecciones, evidencias, cuadrillas, usuarios e indicadores.
- Viviendas y planos (planos/) con marcadores DH/NCR/RDI.
- Carta Gantt diaria (gantt/) y sus relaciones locales.
- cloud.js: integración de Supabase Auth y sincronización privada de estado.

SUPABASE
- El acceso en la nube utiliza el correo y la contraseña de una cuenta existente
  en Supabase Auth, con perfil activo en public.profiles.
- Se utiliza la clave publishable de Supabase, que está diseñada para estar en
  el navegador. No se incorpora una service_role key ni otra clave administrativa.
- Los módulos main, plans y gantt se guardan en public.obra_control_v14_state.
  Las políticas RLS restringen cada fila al usuario autenticado (auth.uid()).
- Cada cuenta mantiene su propio estado sincronizado. La aplicación conserva
  también el modo local/demo original. El almacenamiento privado por cuenta no
  equivale a sincronización colaborativa entre usuarios ni sustituye las tablas
  relacionales de calidad, prevención o viviendas que ya existen en Supabase.
- Si el usuario no inicia sesión con Supabase, la app conserva el comportamiento
  local del paquete original.

DESPLIEGUE ESTÁTICO EN VERCEL
- Publicar index.html, app.js, style.css, cloud.js, planos/, gantt/ y vercel.json
  desde la raíz de esta carpeta.
- La tabla RLS se crea mediante la migración
  obra_control_v14_user_scoped_cloud_state.
- Probar en la URL publicada: inicio de sesión cloud, modo demo, creación/edición
  de registros, Planos y Gantt. Verificar sincronización con la misma cuenta en
  otra sesión/dispositivo.
