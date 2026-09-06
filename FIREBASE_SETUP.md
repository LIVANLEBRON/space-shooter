# Configuración del ranking con Firebase

El juego funciona sin Firebase. Mientras no exista configuración, conserva el mejor récord en `LocalStorage` y muestra el ranking local.

## Datos públicos necesarios

Desde Firebase Console, crea o selecciona un proyecto y una aplicación Web. Necesitas proporcionar únicamente:

- `apiKey`
- `projectId`
- `appId`

Activa **Authentication > Sign-in method > Anonymous** y crea una base **Cloud Firestore**.

Edita `firebase-config.js` de esta forma:

```js
window.VOID_FIREBASE_CONFIG = {
  apiKey: "TU_API_KEY_PUBLICA",
  projectId: "TU_PROJECT_ID",
  appId: "TU_APP_ID_PUBLICO"
};
```

No añadas cuentas de servicio, claves privadas ni secretos. La `apiKey` Web de Firebase es configuración pública y debe restringirse al dominio donde publiques el juego desde Google Cloud Console.

## Reglas

Publica el contenido de `firestore.rules` en **Firestore Database > Rules**. Cada sesión anónima puede crear o actualizar solamente el documento `records/{uid}` cuyo identificador coincide con su propio `uid`. La lectura del ranking es pública.

## Prueba

1. Sirve el proyecto mediante HTTP/HTTPS; no abras `index.html` directamente como `file://`.
2. Escribe un nombre opcional en Opciones.
3. Termina un nivel o provoca Game Over.
4. Comprueba que aparece `records/{uid}` en Firestore.
5. Recarga el juego: el Top 7 debe conservar el resultado.
6. Desactiva la red, consigue un resultado mejor y comprueba “Récord guardado localmente”.
7. Recupera la red y comprueba “Récord sincronizado”.

## Récords de avance (septiembre de 2026)

Se guarda al entrar en cada nivel, cada cinco segundos durante la partida, al salir y al perder o ganar. El mejor intento se ordena por victoria, nivel alcanzado, porcentaje superado del jefe final (sus dos vidas) y puntos. Revivir al jefe equivale al 50%; vencerlo definitivamente, al 100%. Los récords anteriores siguen siendo compatibles; los intentos fallidos antiguos no tienen porcentaje de jefe registrado.

Los envíos pendientes se reintentan al abrir el juego, recuperar conexión y cada 30 segundos. El ranking completo ya no se limita a cuatro jugadores en móvil.

Si Firestore responde `PERMISSION_DENIED`, la cuenta propietaria debe publicar las reglas incluidas:

```sh
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project com-example-myapplicatio-32160
```

Actualizar GitHub/Vercel no publica las reglas de Firebase. El guardado local permanece disponible mientras el acceso global esté bloqueado.

Pruebas de persistencia y ordenación: `node --test tests/ranking.test.cjs`.
