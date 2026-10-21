# Cauce · Agenda del día

Planificador diario visual con línea de tiempo. Web app instalable (PWA) que funciona sin conexión.

- Línea de tiempo con tareas de colores, tiempo libre y línea de «ahora»
- Arrastrar para cambiar la hora · Replanificar tareas pendientes
- Bandeja de entrada, tareas de todo el día, subtareas, notas y repetición
- Modo enfoque con temporizador y Pomodoro
- Tema claro/oscuro · Exportar/importar en JSON
- Cuenta opcional (correo y contraseña) con las tareas sincronizadas entre dispositivos
- Notificaciones push por tarea (al empezar, antes o al terminar), incluso con la app cerrada
- Más de 200 iconos por categorías con buscador; el icono se elige solo según el título de la tarea

Iconos: [Phosphor Icons](https://phosphoricons.com) (MIT) y [Material Design Icons](https://pictogrammers.com/library/mdi/) (Apache 2.0), generados con `python tools/build_icons.py`.

Los datos se guardan en el `localStorage` del navegador (clave `cauce:v1`).

## Ejecutar en local

```bash
python -m http.server 5173
```

Y abre http://localhost:5173

## Notificaciones

Las envía un pequeño servidor en Supabase (proyecto AulaMia, esquema `cauce`):

- `supabase/functions/cauce-sync`: recibe la suscripción push de cada dispositivo y sus avisos de los próximos 14 días.
- `supabase/functions/cauce-send`: envía los avisos que ya tocan; lo llama `pg_cron` cada minuto.
- `supabase/migrations/`: tablas y tarea programada.

En iPhone hay que añadir la app a la pantalla de inicio (iOS 16.4 o posterior) y activar las notificaciones en Ajustes.

## Cuentas y sincronización

Las cuentas son de Supabase y se comparten con el proyecto AulaMia (las altas desde Cauce llevan
`app: cauce` y no crean perfil en AulaMia). Las tareas viven en `cauce.tasks` y solo se accede a
ellas con las funciones `cauce_pull`, `cauce_push` y `cauce_delete_account`, que trabajan siempre
con el usuario de la sesión. La librería `vendor/supabase.js` es `@supabase/supabase-js` 2.49.4 (MIT).

