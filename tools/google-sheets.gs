// ML Quest → Google Sheets. Paste this into the spreadsheet's Apps Script editor (Extensiones →
// Apps Script), set the script property SECRET (Configuración del proyecto → Propiedades de la
// secuencia de comandos) to a long random string, and deploy it as a web app (Implementar → Nueva
// implementación → Aplicación web; ejecutar como: yo; acceso: cualquier usuario). The server then
// needs SHEETS_URL = the web app's /exec URL and SHEETS_SECRET = that same string.
// Each finished game arrives as { secret, row } and becomes one row of the "Resultados" sheet.

const SHEET_NAME = 'Resultados';
const COLUMNS = [
  ['fecha', 'Fecha'], ['jugador', 'Jugador'], ['nombre', 'Nombre'], ['telefono', 'Teléfono'], ['correo', 'Correo'],
  ['autoriza_personales', 'Autoriza datos personales'], ['autoriza_sensibles', 'Autoriza datos sensibles'],
  ['carrera_1', 'Carrera 1'], ['porcentaje_1', '% 1'], ['carrera_2', 'Carrera 2'], ['porcentaje_2', '% 2'],
  ['carrera_3', 'Carrera 3'], ['porcentaje_3', '% 3'], ['puntos', 'Puntos por carrera'], ['respuestas', 'Respuestas'],
];

function doPost(e) {
  const reply = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: 'bad json' }); }
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || data.secret !== secret) return reply({ ok: false, error: 'forbidden' });
  const row = data.row || {};

  const lock = LockService.getScriptLock();   // two games finishing at once must not overwrite each other
  lock.waitLock(10000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(COLUMNS.map((c) => c[1]));
    // whatever a student typed is stored as text, never run as a formula
    const safe = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v);
    sheet.appendRow(COLUMNS.map((c) => safe(row[c[0]] === undefined ? '' : row[c[0]])));
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}
