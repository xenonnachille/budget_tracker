const SHEET_NAME = 'Entries';
const TOKEN = 'SECRET_KEY';

function doGet(e) {
  if (!isAuthorized(e)) return json({ error: 'Unauthorized' }, 401);
  const action = (e.parameter.action || 'pull').toLowerCase();

  if (action === 'pull') {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    const [header, ...rows] = data;
    const entries = rows
      .filter((r) => r[0])
      .map((r) => ({
        id: String(r[0]),
        type: r[1],
        amount: Number(r[2]),
        category: r[3],
        note: r[4],
        date: r[5],
        updatedAt: r[6],
      }));
    return json({ entries });
  }

  return json({ error: 'Unknown action' }, 400);
}

function doPost(e) {
  if (!isAuthorized(e)) return json({ error: 'Unauthorized' }, 401);
  const action = (e.parameter.action || 'push').toLowerCase();

  if (action !== 'push') return json({ error: 'Unknown action' }, 400);

  const payload = JSON.parse(e.postData.contents || '{}');
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const idToRow = new Map();

  for (let i = 1; i < data.length; i += 1) {
    const id = String(data[i][0] || '');
    if (id) idToRow.set(id, i + 1);
  }

  entries.forEach((entry) => {
    if (!entry || !entry.id) return;
    const row = [
      String(entry.id),
      entry.type || '',
      Number(entry.amount || 0),
      entry.category || '',
      entry.note || '',
      entry.date || '',
      entry.updatedAt || new Date().toISOString(),
    ];

    const existingRow = idToRow.get(String(entry.id));
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  });

  return json({ syncedIds: entries.map((e) => String(e.id)) });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id', 'type', 'amount', 'category', 'note', 'date', 'updatedAt']);
  }
  return sheet;
}

function isAuthorized(e) {
  if (TOKEN === 'SECRET_KEY') return true;
  const token = (e && e.parameter && e.parameter.token) || '';
  return token === TOKEN;
}

function json(obj, code) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
