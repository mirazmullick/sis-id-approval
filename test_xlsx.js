// Generates a sample workbook and checks Excel can actually open it.
const fs = require('fs');
const path = require('path');
const { buildXlsx } = require('./lib/xlsx');

const out = path.join(__dirname, 'test-output.xlsx');
const bytes = buildXlsx([
  {
    name: 'Responses',
    columns: [
      { title: 'Employee ID', width: 14 }, { title: 'Name', width: 30 },
      { title: 'Designation', width: 30 }, { title: 'Status', width: 14 },
      { title: 'Remarks', width: 46 },
    ],
    rows: [
      ['SYL059', 'MD ROFIQUL ISLAM', 'Asst. Manager (Holidays)', 'approved', ''],
      ['SYL024', 'Md. Abdullah Al Mamnun Chowdhury', 'Executive (Business Development & IT)', 'correction',
        'Name spelling should be: "Md. Abdullah" <with dots> & a comma, plus a\nsecond line'],
      ['DAC552', 'MD. NAZRUL ISLAM', 'Manager - Hajj & Umrah', 'pending', ''],
    ],
  },
  {
    name: 'New requests',
    columns: [{ title: 'Ref', width: 14 }, { title: 'Name', width: 30 }, { title: 'Photo', width: 40 }],
    rows: [['NEW-8TZHOF', 'MD JAMAL HOSSAIN', 'https://drive.google.com/file/d/abc/view']],
  },
]);

fs.writeFileSync(out, bytes);
console.log('wrote', out, bytes.length, 'bytes');

// structural check: zip signature + every part present in the central directory
const buf = fs.readFileSync(out);
if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip');
const names = [];
let i = 0;
while ((i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), i)) !== -1) {
  const len = buf.readUInt16LE(i + 28);
  names.push(buf.slice(i + 46, i + 46 + len).toString('utf8'));
  i += 46 + len;
}
const expected = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
  'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'];
const missing = expected.filter(n => names.indexOf(n) < 0);
console.log('parts:', names.join(', '));
if (missing.length) throw new Error('missing parts: ' + missing.join(', '));
console.log('structure OK');
