/**
 * Minimal .xlsx writer — no dependencies, ES5, runs in the browser and in Node.
 *
 * An xlsx file is a zip of XML parts. Everything here is written with the zip
 * STORE method (no compression), which keeps the code short; these workbooks are
 * a few hundred rows, so the size difference does not matter.
 *
 * buildXlsx([{ name, columns, rows }]) -> Uint8Array
 *   name    sheet tab name (trimmed to Excel's 31-char limit)
 *   columns [{ title, width }]
 *   rows    array of arrays of values (written as text; blank for null/undefined)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XLSX = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CRC = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();

  function crc32(buf) {
    var c = -1;
    for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, 'utf8'));
  }

  function concat(parts) {
    var total = 0, i;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total), at = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
    return out;
  }

  function zipStore(files) {
    var local = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);           // UTF-8 names
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      local.push(new Uint8Array(lh.buffer), name, data);

      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);          // offset of this file's local header
      central.push(new Uint8Array(cd.buffer), name);

      offset += 30 + name.length + data.length;
    });

    var centralBytes = concat(central);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralBytes.length, true);
    end.setUint32(16, offset, true);
    return concat([concat(local), centralBytes, new Uint8Array(end.buffer)]);
  }

  function esc(v) {
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // control characters are illegal in XML and Excel refuses the file
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(i) {
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
    return s;
  }

  function sheetXml(sheet) {
    var cols = sheet.columns || [];
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '</sheetView></sheetViews>';

    if (cols.length) {
      head += '<cols>';
      cols.forEach(function (c, i) {
        head += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 18) + '" customWidth="1"/>';
      });
      head += '</cols>';
    }

    var body = '<sheetData>';
    var all = [cols.map(function (c) { return c.title; })].concat(sheet.rows || []);
    all.forEach(function (row, r) {
      body += '<row r="' + (r + 1) + '">';
      row.forEach(function (val, c) {
        if (val === null || val === undefined || val === '') return;
        body += '<c r="' + colName(c) + (r + 1) + '" t="inlineStr"><is><t xml:space="preserve">' +
          esc(val) + '</t></is></c>';
      });
      body += '</row>';
    });
    body += '</sheetData></worksheet>';
    return head + body;
  }

  function tabName(name, i) {
    var clean = String(name || ('Sheet' + (i + 1))).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31);
    return clean || ('Sheet' + (i + 1));
  }

  function buildXlsx(sheets) {
    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
    var wbSheets = '', wbRels = '';
    sheets.forEach(function (s, i) {
      var n = i + 1;
      types += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wbSheets += '<sheet name="' + esc(tabName(s.name, i)) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      wbRels += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
    });
    types += '</Types>';

    var files = [
      { name: '[Content_Types].xml', data: utf8(types) },
      { name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>') },
      { name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets>' + wbSheets + '</sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels + '</Relationships>') }
    ];
    sheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(sheetXml(s)) });
    });
    return zipStore(files);
  }

  return { buildXlsx: buildXlsx, colName: colName };
}));
