// Renders one cropped JPEG per ID card straight out of the source artboard PDF.
// Crop boxes come from employees.json (pixels at 100 dpi); pdftoppm wants them
// in output-resolution pixels, hence the SCALE factor.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PDF = require('./lib/source_pdf.js').sourcePdf();
const PDFTOPPM = 'C:/Users/molli/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe/poppler-25.07.0/Library/bin/pdftoppm.exe';
const DPI = 220;
const SCALE = DPI / 100;
const OUT = path.join(__dirname, 'cards');

const employees = JSON.parse(fs.readFileSync(path.join(__dirname, 'employees.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

for (const e of employees) {
  const prefix = path.join(OUT, e.empId);
  execFileSync(PDFTOPPM, [
    '-jpeg', '-jpegopt', 'quality=88', '-r', String(DPI),
    '-x', String(Math.round(e.crop.x * SCALE)),
    '-y', String(Math.round(e.crop.y * SCALE)),
    '-W', String(Math.round(e.crop.w * SCALE)),
    '-H', String(Math.round(e.crop.h * SCALE)),
    '-f', '1', '-l', '1', PDF, prefix,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  fs.renameSync(prefix + '-1.jpg', prefix + '.jpg');
  process.stdout.write('.');
}
console.log('\nrendered', employees.length, 'cards ->', OUT);
