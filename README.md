# Cauce · Agenda del día

Planificador diario visual con línea de tiempo. Web app instalable (PWA) que funciona sin conexión.

- Línea de tiempo con tareas de colores, tiempo libre y línea de «ahora»
- Arrastrar para cambiar la hora · Replanificar tareas pendientes
- Bandeja de entrada, tareas de todo el día, subtareas, notas y repetición
- Modo enfoque con temporizador y Pomodoro
- Tema claro/oscuro · Exportar/importar en JSON

Los datos se guardan en el `localStorage` del navegador (clave `cauce:v1`).

## Ejecutar en local

```bash
python -m http.server 5173
```

Y abre http://localhost:5173
