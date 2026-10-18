import { language } from '../state';

// Loaded with test selection, outside the initial application dependency graph.
const labels = {
  "de": {
    "calibrate": "Messgerät kalibrieren",
    "testPaused": "Dein Test ist pausiert und lokal gesichert. Werte und Timer bleiben erhalten. Nach Abschluss oder Abbrechen kehrst du zum Test zurück.",
    "finishAndResume": "Abschließen und Test fortsetzen",
    "title": "Einrichtung und Kalibrierung",
    "scope": "Dieser Assistent begleitet dein konkretes Messgerät. Jeder bestätigte Schritt beschreibt deine eigene Durchführung; die App prüft oder kalibriert keine Hardware und überträgt keinen Kalibrierstatus auf andere Geräte.",
    "mode": "Ablauf",
    "all": "Einrichten, kalibrieren und messen",
    "beforeUse": "Vor jeder Benutzung",
    "setup": "Einrichtung",
    "calibration": "Kalibrierung",
    "progress": "Schritt {current} von {total}",
    "progressLabel": "Fortschritt",
    "confirm": "Am Gerät durchgeführt und erfolgreich geprüft bzw. laut meinem Modellhandbuch nicht erforderlich.",
    "back": "Zurück",
    "next": "Bestätigen und weiter",
    "finished": "Checkliste durchgegangen",
    "finishedHint": "Prüfe vor der Messung weiterhin die tatsächliche Geräteanzeige. Das Durchgehen dieser Checkliste ist kein Kalibrierzertifikat. Messwerte anschließend manuell eintragen.",
    "restart": "Neu beginnen",
    "units": "Einheiten für die Eingabe",
    "pauseHint": "Beim Schließen wird der Assistent beendet. Beim nächsten Öffnen beginnt eine neue Checkliste; deine Testwerte bleiben erhalten. Nach dem ersten vollständigen Online-Abgleich sind diese Schritte auch offline verfügbar. Externe Herstellerlinks benötigen eine Verbindung.",
    "sources": "Herstellerquellen",
    "sourceHint": "Bei abweichenden Tasten, Sonden oder Standards gilt die mitgelieferte Modellanleitung. Fehlende öffentliche Tastenschritte sind ausdrücklich gekennzeichnet.",
    "open": "{name}: Einrichtung / Kalibrierung"
  },
  "en": {
    "calibrate": "Calibrate meter",
    "testPaused": "Your test is paused and saved locally. Readings and timers are preserved. Completing or cancelling returns you to the test.",
    "finishAndResume": "Finish and resume test",
    "title": "Setup and calibration",
    "scope": "This wizard guides you through your specific meter. Confirmations describe your own actions; the app cannot verify or calibrate hardware and does not transfer calibration status to other devices.",
    "mode": "Procedure",
    "all": "Set up, calibrate and measure",
    "beforeUse": "Before each use",
    "setup": "Setup",
    "calibration": "Calibration",
    "progress": "Step {current} of {total}",
    "progressLabel": "Progress",
    "confirm": "Performed and successfully checked on my meter, or not required according to my model manual.",
    "back": "Back",
    "next": "Confirm and continue",
    "finished": "Checklist reviewed",
    "finishedHint": "Always check the actual device display before measuring. Reviewing this checklist is not a calibration certificate. Enter readings manually afterwards.",
    "restart": "Start again",
    "units": "Units for entry",
    "pauseHint": "Closing ends the wizard. Reopening starts a new checklist; your test readings are preserved. After the first complete online sync, these steps are also available offline. External manufacturer links require a connection.",
    "sources": "Manufacturer sources",
    "sourceHint": "If buttons, probes or standards differ, follow the supplied model manual. Missing public button instructions are explicitly identified.",
    "open": "{name}: setup / calibration"
  }
};
export function deviceText(key: keyof typeof labels.de, params: Record<string, unknown> = {}): string {
  return labels[language.value][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]));
}
