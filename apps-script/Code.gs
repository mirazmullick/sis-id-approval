/**
 * Suma Group — ID card approval collector.
 *
 * Paste this into Extensions → Apps Script on a blank Google Sheet, set TOKEN
 * below to the same value as endpoint.json in the repo, then Deploy → New
 * deployment → Web app, "Execute as: Me", "Who has access: Anyone".
 * Copy the /exec URL it gives you.
 *
 * Three tabs are kept automatically:
 *   Responses    — one row per employee, always the latest answer
 *   Log          — every submission ever, appended, as an audit trail
 *   New requests — ID cards asked for by hand (new joiners, reissues)
 */

var TOKEN = 'fLottKWUKbS_pTM4YGmTErHe';

// Id of the "Suma ID card approvals" spreadsheet. Set this when the script is a
// standalone project; leave it blank if the script lives inside the sheet itself.
var SHEET_ID = '1VpFwNy1zwIux0YDTrjKg3SNsJHrnblrLXbKHp2HpU1A';

function book() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

var HEAD = ['Updated', 'Employee ID', 'Name', 'Designation', 'Status', 'Approved', 'Remarks', 'Submitted by'];
var NEW_HEAD = ['Updated', 'Ref', 'Employee ID', 'Name', 'Designation', 'Blood group', 'Office', 'Notes', 'Submitted by', 'Photo'];
var PHOTO_FOLDER = 'Suma ID card photos';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return json({ ok: false, error: 'bad token' });
    if (!body.id) return json({ ok: false, error: 'missing employee id' });

    // a manually added card request is its own thing — never merged into the 50
    if (body.kind === 'new') {
      var nsh = tab('New requests', NEW_HEAD);
      var refs = columnValues(nsh, 2);
      var nat = refs.indexOf(String(body.ref || ''));
      var photoUrl = body.photo
        ? savePhoto(body.photo, [body.name || 'photo', body.empId || body.ref || ''].join(' '))
        : (nat >= 0 ? nsh.getRange(nat + 2, NEW_HEAD.length).getValue() : '');   // keep the old one on re-send
      var nrow = [new Date(), String(body.ref || ''), String(body.empId || body.id || ''), String(body.name || ''),
        String(body.designation || ''), String(body.blood || ''), String(body.office || ''),
        String(body.remarks || ''), String(body.by || ''), String(photoUrl || '')];
      if (body.ref && nat >= 0) nsh.getRange(nat + 2, 1, 1, nrow.length).setValues([nrow]);
      else nsh.appendRow(nrow);
      return json({ ok: true, photo: photoUrl });
    }

    var row = [
      new Date(), String(body.id), String(body.name || ''), String(body.designation || ''),
      String(body.status || ''), body.approved ? 'Yes' : 'No',
      String(body.remarks || ''), String(body.by || '')
    ];

    var sh = tab('Responses', HEAD);
    var ids = columnValues(sh, 2);
    var at = ids.indexOf(String(body.id));
    if (at >= 0) sh.getRange(at + 2, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);

    tab('Log', HEAD).appendRow(row);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    if (!e || !e.parameter || e.parameter.token !== TOKEN) return json({ ok: false, error: 'bad token' });
    return json({ ok: true, responses: readResponses(), newRequests: readNewRequests() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function readResponses() {
  var sh = tab('Responses', HEAD);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEAD.length).getValues().map(function (r) {
    return {
      at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      id: String(r[1]), name: String(r[2]), designation: String(r[3]),
      status: String(r[4]), approved: String(r[5]) === 'Yes',
      remarks: String(r[6]), by: String(r[7])
    };
  });
}

function readNewRequests() {
  var sh = tab('New requests', NEW_HEAD);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, NEW_HEAD.length).getValues().map(function (r) {
    return {
      at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      ref: String(r[1]), empId: String(r[2]), name: String(r[3]), designation: String(r[4]),
      blood: String(r[5]), office: String(r[6]), remarks: String(r[7]), by: String(r[8]),
      photo: String(r[9] || '')
    };
  });
}

/** Uploaded photos land in a Drive folder; the sheet keeps a link to each. */
function savePhoto(dataUri, name) {
  try {
    var parts = String(dataUri).match(/^data:([^;]+);base64,(.+)$/);
    if (!parts) return '';
    var blob = Utilities.newBlob(Utilities.base64Decode(parts[2]), parts[1],
      String(name).replace(/[^\w .-]+/g, ' ').trim() + '.jpg');
    return photoFolder().createFile(blob).getUrl();
  } catch (err) {
    return 'upload failed: ' + err;
  }
}

function photoFolder() {
  var found = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return found.hasNext() ? found.next() : DriveApp.createFolder(PHOTO_FOLDER);
}

function tab(name, head) {
  var ss = book();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function columnValues(sh, col) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, col, last - 1, 1).getValues().map(function (r) { return String(r[0]); });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
