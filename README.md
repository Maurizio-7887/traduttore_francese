# Interprete Duo

**Interprete Duo** è una companion app mobile in italiano per conversazioni italiano/francese: ogni persona usa un auricolare (Redmi Buds 4 Active o altro TWS) e ascolta la propria traduzione. Il progetto usa Vite + TypeScript per l'interfaccia e Capacitor Android per le funzioni native.

> App indipendente, non affiliata a Google/Gemini, Xiaomi o Honor.

## Funzioni

- **Modalità A — Tu parli:** microfono del telefono, riconoscimento `it-IT`, Gemini → francese, voce sul canale **sinistro**.
- **Modalità B — Tu ascolti:** riconoscimento `fr-FR`, Gemini → italiano e breve risposta suggerita in francese, voce italiana sul canale **destro**; il pulsante della risposta la riproduce sul sinistro.
- Push-to-talk / tap-to-start e stop esplicito (non ascolto continuo), inserimento manuale, ripeti, stop nativo, cronologia locale, cancellazione, impostazioni, test canali e assegnazione auricolari.
- Tema scuro/chiaro e interfaccia responsive/accessibile.
- Fallback Web Speech API in `npm run dev`: il browser può riconoscere la voce e usare SpeechSynthesis, ma **non garantisce la separazione dei canali**.

## Avvio web

Prerequisiti: Node.js 20+ e npm.

```bash
npm install
npm run dev
# controllo statico e build
npm run typecheck
npm run build
npm run preview
```

## API Gemini

1. Crea una chiave personale su [Google AI Studio](https://aistudio.google.com/apikey).
2. Avvia l'app e incollala in **Impostazioni → Chiave API Google AI Studio**; scegli anche il modello (predefinito `gemini-2.5-flash`).
3. Accetta il consenso all'invio del testo a Gemini.

La chiave viene salvata localmente con Capacitor Preferences (o `localStorage` nel browser) e non è mai inclusa nei sorgenti. Una chiave client-side **non è sicurezza da produzione**: per una distribuzione pubblica usa un backend/proxy con autenticazione, rate limit e gestione dei segreti. Il testo inviato a Gemini è soggetto alle condizioni del relativo servizio.

## Android / Honor 200

Prerequisiti: Node.js 20+, JDK 21 (richiesto dalla configurazione Capacitor 7), Android Studio con Android SDK (compile/target 35), platform-tools e licenze accettate.

```bash
npm install
npm run build
npx cap sync android
npx cap open android
# oppure, da android/ con SDK configurato
./gradlew assembleDebug
```

Il progetto ha già `android/` importabile in Android Studio. I due sorgenti nativi sono volutamente in `android/InterpreterPlugin.java` e `android/MainActivity.java`; `android/app/build.gradle` li include tramite `sourceSets`, così sono immediatamente visibili nel repository. L'APK debug sarà `android/app/build/outputs/apk/debug/app-debug.apk` e può essere installato su Honor 200/MagicOS con adb o Android Studio. Lo script `npm run android:apk` esegue build web, sync e Gradle.

Il plugin Android personalizzato `InterpreterPlugin` usa il microfono del telefono e implementa:

- `SpeechRecognizer` con permesso `RECORD_AUDIO`, locale richiesto, callback di risultati/errori e stop;
- `TextToSpeech.synthesizeToFile` in WAV temporaneo e `AudioTrack` PCM stereo; i campioni vengono scritti **solo nel canale scelto** (`left` o `right`), con stop/release e gestione init/lingua/errori;
- permessi `INTERNET` e `RECORD_AUDIO`; non richiede `BLUETOOTH_CONNECT` perché non controlla né forza il routing Bluetooth.

Il routing Bluetooth e la reale separazione TWS vanno verificati sul dispositivo: Android, firmware, codec e auricolari possono riprodurre in mono o gestire diversamente i canali. Durante il riconoscimento vocale non viene promessa simultaneità; il flusso è intenzionalmente sequenziale per affidabilità. L'audio resta stereo quando non è in registrazione.

## Privacy e limiti

Il microfono parte solo dopo un'azione dell'utente e il pulsante **Stop ascolto** interrompe la sessione. La cronologia e la chiave restano nel dispositivo e possono essere cancellate dall'app; le frasi da tradurre sono inviate a Gemini quando si preme traduci. Non inserire dati sensibili. Il riconoscimento Android e il TTS richiedono servizi/lingue disponibili sul dispositivo e possono dipendere dalla rete.

## GitHub e CI

Il repository è un repository di **sorgenti**: GitHub Pages non distribuisce un APK. Il workflow `Build` esegue la build web e, quando è disponibile un runner Android con SDK/JDK, prepara un artifact APK debug. Non committare `node_modules`, `local.properties`, build o chiavi.

```bash
zip -r interprete-duo-github.zip . -x 'node_modules/*' 'android/.gradle/*' 'android/**/build/*' 'android/local.properties' '.env'
```

## Licenza

MIT — vedere [LICENSE](LICENSE).
