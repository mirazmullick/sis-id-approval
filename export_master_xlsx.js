// Writes the employee master list as a real .xlsx workbook.
//
// This is the printed-card data as it stands in the artwork — separate from the
// response workbook the dashboard exports, which is about who has approved what.
// Use this one to hand the list to HR, the printer, or anyone who wants the
// roster in a spreadsheet.
//
//   node export_master_xlsx.js [output.xlsx]
const fs = require('fs');
const path = require('path');
const { buildXlsx } = require('./lib/xlsx.js');

const root = __dirname;
const employees = JSON.parse(fs.readFileSync(path.join(root, 'employees.json'), 'utf8'));
const out = process.argv[2] || path.join(root, 'Suma-Employee-ID-Master.xlsx');

// The card prints a designation over two or three lines; employees.json already
// joins them with spaces, so one flat cell per person keeps the sheet filterable.
const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const office = id => (/^SYL/.test(id) ? 'Sylhet' : 'Dhaka');

const roster = {
  name: 'Employees',
  columns: [
    { title: '#', width: 5 },
    { title: 'Employee ID', width: 14 },
    { title: 'Name', width: 34 },
    { title: 'Designation', width: 46 },
    { title: 'Blood group', width: 13 },
    { title: 'Office', width: 10 },
    { title: 'Photo on card', width: 14 },
    { title: 'Card position', width: 14 },
    { title: 'Card image', width: 22 },
  ],
  rows: employees.map((e, i) => [
    i + 1,
    e.empId,
    clean(e.name),
    clean(e.designation),
    clean(e.blood).replace(/\s+/g, ''),
    office(e.empId),
    e.hasPhoto === null ? 'not checked' : (e.hasPhoto ? 'yes' : 'MISSING'),
    'row ' + (e.row + 1) + ', col ' + (e.col + 1),
    'cards/' + e.empId + '.jpg',
  ]),
};

const tally = (list, key) => {
  const counts = new Map();
  list.forEach(e => counts.set(key(e), (counts.get(key(e)) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

const missing = employees.filter(e => e.hasPhoto === false);
const summaryRows = [
  ['Total employees', employees.length],
  [],
  ['By office', ''],
  ...tally(employees, e => office(e.empId)).map(([k, n]) => ['   ' + k, n]),
  [],
  ['By blood group', ''],
  ...tally(employees, e => clean(e.blood).replace(/\s+/g, '')).map(([k, n]) => ['   ' + k, n]),
  [],
  ['Cards with a photo', employees.filter(e => e.hasPhoto).length],
  ['Cards with an empty photo frame', missing.length],
  ...missing.map(e => ['   ' + e.empId + ' ' + clean(e.name), 'needs a photo']),
];

const summary = {
  name: 'Summary',
  columns: [{ title: 'Item', width: 40 }, { title: 'Value', width: 18 }],
  rows: summaryRows,
};

fs.writeFileSync(out, Buffer.from(buildXlsx([summary, roster])));
console.log(`${employees.length} employees -> ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
if (missing.length) console.log('flagged with no photo:', missing.map(e => e.empId).join(', '));
