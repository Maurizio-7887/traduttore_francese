# Stato build

- **npm install: PASS** (eseguito in workspace temporaneo; `node_modules` è escluso dal progetto).
- **npm run typecheck: PASS**.
- **npm run build: PASS** — output Vite generato e sincronizzato nel progetto Android.
- **Capacitor sync: PASS**.
- **Configurazione Gradle: verificata e corretta** durante una compilazione locale fino alla fase Java.
- **APK locale: non incluso**: Capacitor 7 richiede JDK 21; l'ambiente locale disponibile aveva JDK 17. Il workflow GitHub incluso usa JDK 21, Android SDK 35 e genera automaticamente l'artifact `interprete-duo-debug-apk`.

Dopo il caricamento su GitHub, aprire **Actions → Build** e scaricare l'artifact APK. In alternativa, con Android Studio/JDK 21:

```bash
npm install
npm run typecheck
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```
