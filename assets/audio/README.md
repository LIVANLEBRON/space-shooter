# Audio de Void Runner

El juego usa síntesis provisional mediante Web Audio API cuando una entrada no existe en `audio-manifest.json`.

Para usar archivos reales, colócalos en las carpetas correspondientes y registra cada ruta en el manifiesto. Ejemplo:

```json
{
  "files": {
    "music_flight": "assets/audio/music/flight.ogg",
    "player_shoot": "assets/audio/sfx/player/shoot.ogg",
    "boss_phase": "assets/audio/sfx/bosses/phase.ogg",
    "ui_confirm": "assets/audio/sfx/ui/confirm.ogg"
  }
}
```

Formatos recomendados: `.ogg` o `.mp3` para música; `.ogg` o `.wav` para efectos.

Los nombres de eventos disponibles están documentados en `audio.js`. Las pistas admitidas son `music_menu`, `music_flight`, `music_devourer`, `music_devourer_phase2`, `music_devourer_phase3`, `music_mothership`, `music_mothership_phase2`, `music_mothership_phase3`, `music_victory` y `music_gameover`.
