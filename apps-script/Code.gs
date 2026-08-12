/**
 * Suma Group — ID card approval collector.
 *
 * Paste this into Extensions → Apps Script on a blank Google Sheet, set TOKEN
 * below to the same value as endpoint.json in the repo, then Deploy → New
 * deployment → Web app, "Execute as: Me", "Who has access: Anyone".
 * Copy the /exec URL it gives you.
 *
 * Two tabs are kept automatically:
 *   Responses — one row per employee, always the latest answer
 *   Log       — every submission ever, appended, as an audit trail
 */

var TOKEN = 'fLottKWUKbS_pTM4YGmTErHe';

var HEAD = ['Updated', 'Employee ID', 'Name', 'Designation', 'Status', 'Approved', 'Remarks', 'Submitted by'];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return json({ ok: false, error: 'bad token' });
    if (!body.id) return json({ ok: false, error: 'missing employee id' });

    var row = [
      new Date(), String(body.id), String(body.name || ''), String(body.designation || ''),
      String(body.status || ''), body.approved ? 'Yes' : 'No',
      String(body.remarks || ''), String(body.by || '')
    ];

    var sh = tab('Responses');
    var ids = idColumn(sh);
    var at = ids.indexOf(String(body.id));
    if (at >= 0) sh.getRange(at + 2, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);

    tab('Log').appendRow(row);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    if (!e || !e.parameter || e.parameter.token !== TOKEN) return json({ ok: false, error: 'bad token' });
    var sh = tab('Responses');
    var last = sh.getLastRow();
    if (last < 2) return json({ ok: true, responses: [] });
    var values = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
    var out = values.map(function (r) {
      return {
        at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
        id: String(r[1]), name: String(r[2]), designation: String(r[3]),
        status: String(r[4]), approved: String(r[5]) === 'Yes',
        remarks: String(r[6]), by: String(r[7])
      };
    });
    return json({ ok: true, responses: out });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function tab(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEAD);
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function idColumn(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 2, last - 1, 1).getValues().map(function (r) { return String(r[0]); });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
