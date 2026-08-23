import { Preferences } from '@capacitor/preferences';
import { registerPlugin } from '@capacitor/core';
import './styles.css';

type Mode = 'A' | 'B';
type Channel = 'left' | 'right';
type Settings = { apiKey: string; model: string; leftRole: string; consent: boolean; theme: 'dark' | 'light' };
type RecordItem = { id: string; mode: Mode; sourceLanguage: string; source: string; translation: string; suggestion?: string; createdAt: string };
type NativeInterpreter = {
  startListening(options: { language: string }): Promise<{ text?: string }>;
  stopListening(): Promise<void>;
  speak(options: { text: string; language: string; channel: Channel }): Promise<void>;
  stopAudio(): Promise<void>;
  release(): Promise<void>;
  testChannel(options: { channel: Channel }): Promise<void>;
};
const Interpreter = registerPlugin<NativeInterpreter>('Interpreter');
const DEFAULTS: Settings = { apiKey: '', model: 'gemini-2.5-flash', leftRole: 'Io parlo italiano', consent: false, theme: 'dark' };
let settings: Settings = { ...DEFAULTS };
let history: RecordItem[] = [];
let mode: Mode = 'A';
let listening = false;
let speaking = false;
let page: 'home' | 'history' | 'settings' = 'home';
let lastAudio: { text: string; lang: string; channel: Channel } | null = null;

const el = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!));

async function loadState() {
  try {
    const [storedSettings, storedHistory] = await Promise.all([Preferences.get({ key: 'settings' }), Preferences.get({ key: 'history' })]);
    if (storedSettings.value) settings = { ...DEFAULTS, ...JSON.parse(storedSettings.value) };
    if (storedHistory.value) history = JSON.parse(storedHistory.value);
  } catch { // Browser fallback
    try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') ?? '{}') }; history = JSON.parse(localStorage.getItem('history') ?? '[]'); } catch { /* clean start */ }
  }
  document.documentElement.dataset.theme = settings.theme;
}
async function saveSettings() {
  const value = JSON.stringify(settings);
  try { await Preferences.set({ key: 'settings', value }); } catch { localStorage.setItem('settings', value); }
}
async function saveHistory() {
  const value = JSON.stringify(history);
  try { await Preferences.set({ key: 'history', value }); } catch { localStorage.setItem('history', value); }
}
function isNative() { return Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()); }
function setStatus(text: string, kind: 'ready' | 'listening' | 'work' | 'error' = 'ready') {
  const status = document.querySelector<HTMLElement>('[data-status]');
  if (status) { status.textContent = text; status.dataset.kind = kind; }
}
function formatDate(value: string) { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }

function layout() {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#home" aria-label="Torna alla home"><span class="brand-mark">↔</span><span>Interprete <strong>Duo</strong></span></a>
        <div class="connection-pill"><span class="pulse-dot"></span><span>${isNative() ? 'Dispositivo pronto' : 'Anteprima web'}</span></div>
      </header>
      <main id="page-content"></main>
      <nav class="bottom-nav" aria-label="Navigazione principale">
        <a href="#home" class="nav-item" data-page="home"><span>⌂</span><small>Interpreta</small></a>
        <a href="#history" class="nav-item" data-page="history"><span>◷</span><small>Cronologia</small></a>
        <a href="#settings" class="nav-item" data-page="settings"><span>⚙</span><small>Impostazioni</small></a>
      </nav>
      <div id="toast" role="status" aria-live="polite"></div>
    </div>`;
  renderPage();
}
function renderPage() {
  document.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  const target = el('#page-content');
  if (page === 'home') target.innerHTML = homeTemplate();
  if (page === 'history') target.innerHTML = historyTemplate();
  if (page === 'settings') target.innerHTML = settingsTemplate();
  bindPageEvents();
}
function homeTemplate() {
  const a = mode === 'A';
  return `<section class="page home-page" aria-labelledby="welcome-title">
    <div class="eyebrow">TRADUZIONE IN PRESENZA</div><h1 id="welcome-title">Parlate senza<br><em>barriere.</em></h1>
    <p class="lead">Un interprete, due voci. Ognuno ascolta la propria traduzione nel suo auricolare.</p>
    <div class="mode-switch" role="tablist" aria-label="Modalità di conversazione">
      <button class="mode-tab ${a ? 'selected' : ''}" data-mode="A" role="tab" aria-selected="${a}"><span class="mode-letter">A</span><span><strong>Tu parli</strong><small>Italiano → Francese</small></span></button>
      <button class="mode-tab ${!a ? 'selected' : ''}" data-mode="B" role="tab" aria-selected="${!a}"><span class="mode-letter orange">B</span><span><strong>Tu ascolti</strong><small>Francese → Italiano</small></span></button>
    </div>
    <div class="route-card"><div class="route-line"><div class="lang-badge it">IT</div><div class="route-copy"><strong>${a ? 'Italiano' : 'Francese'}</strong><span>Input · microfono telefono</span></div><span class="route-arrow">→</span><div class="lang-badge fr">${a ? 'FR' : 'IT'}</div><div class="route-copy"><strong>${a ? 'Francese' : 'Italiano'}</strong><span>Output · auricolare ${a ? 'sinistro' : 'destro'}</span></div></div><div class="route-channel"><span class="channel-dot ${a ? 'left' : 'right'}"></span> Audio isolato sul canale <strong>${a ? 'SINISTRO' : 'DESTRO'}</strong></div></div>
    <div class="voice-panel"><div class="voice-panel-head"><div><h2>${a ? 'Parla in italiano' : 'Ascolta il francese'}</h2><p>${a ? 'Tieni premuto oppure tocca per iniziare' : 'Tocca per ascoltare il tuo interlocutore'}</p></div><span class="listen-indicator" data-listening-indicator></span></div>
      <button class="talk-button ${listening ? 'is-listening' : ''}" data-talk aria-label="${listening ? 'Ferma ascolto' : 'Inizia ascolto'}"><span class="mic-icon">${listening ? '■' : '●'}</span><span>${listening ? 'Ferma ascolto' : 'Tocca per parlare'}</span></button>
      <div class="status-line" data-status data-kind="${listening ? 'listening' : 'ready'}">${listening ? 'Ascolto in corso…' : 'Pronto quando vuoi'}</div><button class="stop-audio" data-stop-audio ${speaking ? '' : 'hidden'}>Ferma audio</button>
    </div>
    <div class="manual-card"><div class="card-heading"><span class="small-icon">⌨</span><div><h2>Modalità manuale</h2><p>Scrivi se preferisci non usare il microfono</p></div></div><textarea data-manual rows="2" placeholder="${a ? 'Scrivi qui in italiano…' : 'Scrivi qui in francese…'}" aria-label="Testo da tradurre"></textarea><button class="primary-button" data-translate>Traduci testo <span>→</span></button></div>
    <div class="result-area" data-result-area>${history[0] ? resultTemplate(history[0]) : ''}</div>
    <p class="privacy-note"><span>♧</span> Le tue conversazioni restano sul dispositivo. <a href="#settings">Privacy e consenso</a></p>
  </section>`;
}
function resultTemplate(item: RecordItem) {
  const a = item.mode === 'A';
  const outputLang = a ? 'FRANCESE' : 'ITALIANO';
  return `<article class="result-card"><div class="result-top"><span class="result-label">TRADUZIONE · ${outputLang}</span><button class="icon-button" data-repeat title="Ripeti audio" aria-label="Ripeti audio">↻</button></div><p class="source-quote">“${esc(item.source)}”</p><p class="translation">${esc(item.translation)}</p><div class="result-bottom"><span class="output-chip ${a ? 'left' : 'right'}">● ${a ? 'Auricolare sinistro' : 'Auricolare destro'}</span><span class="result-time">${formatDate(item.createdAt)}</span></div>${item.suggestion ? `<div class="suggestion"><div><span class="suggestion-label">RISPOSTA SUGGERITA · FR</span><p>${esc(item.suggestion)}</p></div><button class="secondary-button" data-speak-suggestion="${item.id}">Riproduci <span>▶</span></button></div>` : ''}</article>`;
}
function historyTemplate() {
  return `<section class="page sub-page"><div class="page-title"><div><div class="eyebrow">IL TUO DIARIO</div><h1>Cronologia</h1></div>${history.length ? '<button class="text-button danger" data-clear-history>Cancella tutto</button>' : ''}</div><p class="lead">Le ultime traduzioni, solo su questo dispositivo.</p>${history.length ? `<div class="history-list">${history.map((item) => resultTemplate(item)).join('')}</div>` : '<div class="empty-state"><span>◷</span><h2>Nessuna conversazione</h2><p>Le traduzioni che fai appariranno qui.</p><a class="primary-button inline" href="#home">Inizia a parlare</a></div>'}</section>`;
}
function settingsTemplate() {
  return `<section class="page sub-page settings-page"><div class="eyebrow">CONTROLLO E PRIVACY</div><h1>Impostazioni</h1><p class="lead">Personalizza l’esperienza e il modo in cui ascoltate.</p>
    <div class="settings-group"><h2>Gemini</h2><label for="api-key">Chiave API Google AI Studio</label><div class="input-with-action"><input id="api-key" data-api-key type="password" value="${esc(settings.apiKey)}" placeholder="Incolla la tua chiave API" autocomplete="off"><button data-show-key aria-label="Mostra o nascondi chiave">◉</button></div><p class="field-help">Salvata solo sul dispositivo. Non viene inclusa nei sorgenti.</p><label for="model">Modello</label><input id="model" data-model value="${esc(settings.model)}" placeholder="gemini-2.5-flash"><p class="field-help">Puoi usare un modello compatibile disponibile nel tuo account.</p></div>
    <div class="settings-group"><h2>Assegnazione auricolari</h2><p class="field-help">Un auricolare a persona. Il routing Bluetooth dipende dal telefono e dagli auricolari.</p><label for="left-role">Auricolare sinistro</label><select id="left-role" data-left-role><option ${settings.leftRole === 'Io parlo italiano' ? 'selected' : ''}>Io parlo italiano</option><option ${settings.leftRole === 'Io ascolto italiano' ? 'selected' : ''}>Io ascolto italiano</option></select><div class="channel-test-row"><button class="secondary-button" data-test-channel="left">Test sinistro</button><button class="secondary-button" data-test-channel="right">Test destro</button></div></div>
    <div class="settings-group"><h2>Aspetto</h2><div class="theme-row"><span>Modalità colore</span><div class="segmented"><button data-theme="dark" class="${settings.theme === 'dark' ? 'active' : ''}">Scura</button><button data-theme="light" class="${settings.theme === 'light' ? 'active' : ''}">Chiara</button></div></div></div>
    <div class="settings-group privacy-group"><h2>Consenso e privacy</h2><label class="check-row"><input type="checkbox" data-consent ${settings.consent ? 'checked' : ''}><span>Ho letto e accetto che il testo inserito venga inviato a Google Gemini per la traduzione.</span></label><p class="field-help">Il microfono viene attivato solo su tua richiesta. La cronologia è locale e puoi cancellarla in qualsiasi momento. Per dettagli, consulta il README incluso nel progetto.</p></div><button class="primary-button save-settings" data-save-settings>Salva impostazioni <span>✓</span></button>
  </section>`;
}

function bindPageEvents() {
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((button) => button.addEventListener('click', () => { mode = button.dataset.mode as Mode; renderPage(); }));
  document.querySelector<HTMLElement>('[data-talk]')?.addEventListener('click', toggleListening);
  document.querySelector<HTMLElement>('[data-stop-audio]')?.addEventListener('click', stopAudio);
  document.querySelector<HTMLElement>('[data-translate]')?.addEventListener('click', () => { const value = el<HTMLTextAreaElement>('[data-manual]').value.trim(); if (value) processText(value); else showToast('Scrivi prima una frase da tradurre.'); });
  document.querySelector<HTMLElement>('[data-clear-history]')?.addEventListener('click', async () => { history = []; await saveHistory(); renderPage(); showToast('Cronologia cancellata.'); });
  document.querySelectorAll<HTMLElement>('[data-repeat]').forEach((button, index) => button.addEventListener('click', () => { const item = page === 'history' ? history[index] : history[0]; if (item) speakForItem(item); }));
  document.querySelectorAll<HTMLElement>('[data-speak-suggestion]').forEach((button) => button.addEventListener('click', () => { const item = history.find((entry) => entry.id === button.dataset.speakSuggestion); if (item?.suggestion) speak(item.suggestion, 'fr-FR', 'left'); }));
  document.querySelector<HTMLElement>('[data-save-settings]')?.addEventListener('click', saveSettingsFromForm);
  document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((button) => button.addEventListener('click', () => { settings.theme = button.dataset.theme as 'dark' | 'light'; document.documentElement.dataset.theme = settings.theme; renderPage(); }));
  document.querySelector<HTMLElement>('[data-show-key]')?.addEventListener('click', () => { const input = el<HTMLInputElement>('[data-api-key]'); input.type = input.type === 'password' ? 'text' : 'password'; });
  document.querySelectorAll<HTMLElement>('[data-test-channel]').forEach((button) => button.addEventListener('click', () => testChannel(button.dataset.testChannel as Channel)));
}
async function saveSettingsFromForm() {
  settings.apiKey = el<HTMLInputElement>('[data-api-key]').value.trim(); settings.model = el<HTMLInputElement>('[data-model]').value.trim() || DEFAULTS.model; settings.leftRole = el<HTMLSelectElement>('[data-left-role]').value; settings.consent = el<HTMLInputElement>('[data-consent]').checked; await saveSettings(); showToast('Impostazioni salvate sul dispositivo.');
}
async function toggleListening() {
  if (listening) { await stopListening(); return; }
  if (!settings.consent) { showToast('Apri Impostazioni e conferma il consenso prima di usare la traduzione.'); return; }
  listening = true; renderPage(); setStatus('Ascolto in corso…', 'listening');
  const language = mode === 'A' ? 'it-IT' : 'fr-FR';
  try {
    let text = '';
    if (isNative()) { const result = await Interpreter.startListening({ language }); text = result.text?.trim() ?? ''; }
    else text = await webListen(language);
    listening = false; renderPage();
    if (text) await processText(text); else setStatus('Non ho rilevato parole.', 'error');
  } catch (error) { listening = false; renderPage(); showToast(error instanceof Error ? error.message : 'Impossibile usare il microfono.'); }
}
async function stopListening() { try { if (isNative()) await Interpreter.stopListening(); } finally { listening = false; renderPage(); setStatus('Ascolto fermato.', 'ready'); } }
function webListen(language: string): Promise<string> {
  return new Promise((resolve, reject) => { const Recognition = (window as Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition ?? (window as Window & { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition; if (!Recognition) { reject(new Error('Speech Recognition non disponibile in questo browser.')); return; } const recognition = new Recognition(); recognition.lang = language; recognition.interimResults = false; recognition.continuous = false; recognition.onresult = (event: any) => resolve(event.results[0][0].transcript); recognition.onerror = (event: any) => reject(new Error(`Microfono: ${event.error ?? 'errore'}`)); recognition.onend = () => resolve(''); recognition.start(); });
}
async function processText(source: string) {
  if (!settings.consent) { showToast('Conferma il consenso nelle Impostazioni.'); return; }
  setStatus('Gemini sta elaborando…', 'work');
  try { const result = await translateWithGemini(source); const item: RecordItem = { id: crypto.randomUUID(), mode, sourceLanguage: mode === 'A' ? 'it-IT' : 'fr-FR', source, translation: result.translation, suggestion: mode === 'B' ? result.suggestion : undefined, createdAt: new Date().toISOString() }; history = [item, ...history].slice(0, 50); await saveHistory(); lastAudio = { text: item.translation, lang: mode === 'A' ? 'fr-FR' : 'it-IT', channel: mode === 'A' ? 'left' : 'right' }; renderPage(); await speakForItem(item); } catch (error) { setStatus('Errore di traduzione.', 'error'); showToast(error instanceof Error ? error.message : 'Controlla la connessione e la chiave API.'); }
}
async function translateWithGemini(source: string): Promise<{ translation: string; suggestion?: string }> {
  if (!settings.apiKey) throw new Error('Inserisci una chiave Gemini nelle Impostazioni.');
  const from = mode === 'A' ? 'italiano' : 'francese'; const to = mode === 'A' ? 'francese' : 'italiano';
  const schema = mode === 'A' ? '{"translation":"stringa in francese"}' : '{"translation":"stringa in italiano","suggestion":"breve risposta naturale in francese"}';
  const prompt = `Sei un interprete conciso italiano-francese. Traduci dal ${from} al ${to}. Mantieni tono e significato, non aggiungere spiegazioni. Rispondi esclusivamente con JSON valido nel formato ${schema}. Testo: ${JSON.stringify(source)}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.15, responseMimeType: 'application/json' } }) });
  if (!response.ok) throw new Error(`Gemini ha risposto ${response.status}. Verifica modello e chiave.`);
  const payload = await response.json(); const raw = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('') ?? ''; const parsed = parseJsonAnswer(raw); if (!parsed.translation) throw new Error('Risposta Gemini non interpretabile.'); return parsed;
}
function parseJsonAnswer(raw: string): { translation: string; suggestion?: string } { try { return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '')); } catch { const match = raw.match(/\{[\s\S]*\}/); if (match) { try { return JSON.parse(match[0]); } catch { /* fallback below */ } } return { translation: raw.trim() }; } }
async function speakForItem(item: RecordItem) { lastAudio = { text: item.translation, lang: item.mode === 'A' ? 'fr-FR' : 'it-IT', channel: item.mode === 'A' ? 'left' : 'right' }; await speak(lastAudio.text, lastAudio.lang, lastAudio.channel); }
async function speak(text: string, lang: string, channel: Channel) {
  speaking = true; renderPage(); setStatus('Riproduzione audio…', 'work');
  try { if (isNative()) await Interpreter.speak({ text, language: lang, channel }); else await webSpeak(text, lang); } catch (error) { showToast(error instanceof Error ? error.message : 'Audio non disponibile.'); } finally { speaking = false; setStatus('Pronto quando vuoi', 'ready'); }
}
function webSpeak(text: string, lang: string) { return new Promise<void>((resolve) => { if (!('speechSynthesis' in window)) { resolve(); return; } window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = lang; utterance.onend = () => resolve(); utterance.onerror = () => resolve(); window.speechSynthesis.speak(utterance); }); }
async function stopAudio() { try { if (isNative()) await Interpreter.stopAudio(); else window.speechSynthesis?.cancel(); } finally { speaking = false; setStatus('Audio fermato.', 'ready'); renderPage(); } }
async function testChannel(channel: Channel) { const text = channel === 'left' ? 'Test canale sinistro' : 'Test canale destro'; try { if (isNative()) await Interpreter.testChannel({ channel }); else await webSpeak(text, 'it-IT'); showToast(`Test inviato al canale ${channel === 'left' ? 'sinistro' : 'destro'}.`); } catch { showToast('Test audio non riuscito.'); } }
function showToast(message: string) { const toast = el('#toast'); toast.textContent = message; toast.classList.add('show'); window.setTimeout(() => toast.classList.remove('show'), 3600); }
window.addEventListener('hashchange', () => { const next = location.hash.slice(1) as typeof page; if (['home', 'history', 'settings'].includes(next)) { page = next; renderPage(); } });
async function init() {
  await loadState();
  page = (location.hash.slice(1) as typeof page) || 'home';
  layout();
}
void init();
