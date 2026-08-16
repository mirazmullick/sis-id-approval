// Rebuilds employees.json from the source artboard PDF.
//
// Two passes, no OCR anywhere:
//   1. Grid detection — render the page to a 100 dpi greyscale PGM and find the
//      white gutters between cards. Gives the row/column bands, so the layout is
//      read from the artwork rather than hard-coded.
//   2. Text — pdftotext -bbox-layout gives every word with a bounding box. Words
//      are bucketed into the card whose band contains their centre, grouped into
//      lines by y, and split on the "ID:" and "Blood Group:" lines.
//
// Run this whenever the designer adds, removes or moves cards; then
// `node render_cards.js && node build.js`.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const PDF = process.env.SRC_PDF || 'C:/Users/molli/OneDrive/Desktop/Employee ID.pdf';
const BIN = process.env.POPPLER_BIN ||
  'C:/Users/molli/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe/poppler-25.07.0/Library/bin';
const DPI = 100;                 // crop boxes in employees.json are in 100 dpi pixels
const PAD = 5;                   // px of white kept around each card
const MIN_BAND = 50;             // px — ignore ink specks, only real card bands
const tool = n => path.join(BIN, n + '.exe');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sis-ids-'));

// --- pass 1: where are the cards? --------------------------------------------
execFileSync(tool('pdftoppm'), ['-gray', '-r', String(DPI), '-f', '1', '-l', '1', PDF, path.join(tmp, 'g')]);
const pgm = fs.readFileSync(path.join(tmp, 'g-1.pgm'));

let p = 0;
const header = [];
while (header.length < 4) {
  while (pgm[p] <= 32) p++;
  if (pgm[p] === 0x23) { while (pgm[p] !== 10) p++; continue; }  // comment
  const s = p;
  while (pgm[p] > 32) p++;
  header.push(pgm.slice(s, p).toString());
}
p++;
const [, W, H] = header.map(Number);

const colInk = new Array(W).fill(0);
const rowInk = new Array(H).fill(0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (pgm[p + y * W + x] < 245) { colInk[x]++; rowInk[y]++; }
  }
}
// A band is a stretch of columns/rows that carry ink; the gutters between cards
// are pure white, so the bands are the cards.
const bands = arr => {
  const out = [];
  let start = -1;
  arr.forEach((v, i) => {
    if (v > 2 && start < 0) start = i;
    if (v <= 2 && start >= 0) { out.push([start, i - 1]); start = -1; }
  });
  if (start >= 0) out.push([start, arr.length - 1]);
  return out.filter(([a, z]) => z - a > MIN_BAND);
};
const COLS = bands(colInk);
// The artboard can carry a part-row of empty card shells below the last real
// row; those are dropped later because no text falls inside them.
const ROWS = bands(rowInk);

// --- pass 2: what does each card say? ----------------------------------------
const xmlPath = path.join(tmp, 'text.xml');
execFileSync(tool('pdftotext'), ['-bbox-layout', '-f', '1', '-l', '1', PDF, xmlPath]);
const unesc = s => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const PT = 72 / DPI;
const words = [...fs.readFileSync(xmlPath, 'utf8')
  .matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]*)<\/word>/g)]
  .map(m => ({
    cx: (+m[1] + +m[3]) / 2 / PT, cy: (+m[2] + +m[4]) / 2 / PT,  // -> 100 dpi px
    y: +m[2] / PT, t: unesc(m[5]),
  }));

const employees = [];
ROWS.forEach(([ry0, ry1], row) => {
  COLS.forEach(([cx0, cx1], col) => {
    const inside = words.filter(w => w.cx >= cx0 && w.cx <= cx1 && w.cy >= ry0 && w.cy <= ry1);
    if (!inside.length) return;   // empty slot or a blank template shell

    const lines = [];
    for (const w of inside.sort((a, b) => a.y - b.y || a.cx - b.cx)) {
      const line = lines.find(l => Math.abs(l.y - w.y) < 4 / PT);   // same baseline
      if (line) { line.words.push(w); line.y = Math.min(line.y, w.y); }
      else lines.push({ y: w.y, words: [w] });
    }
    const text = lines.sort((a, b) => a.y - b.y)
      .map(l => l.words.sort((a, b) => a.cx - b.cx).map(w => w.t).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const iId = text.findIndex(t => /^ID:/i.test(t));
    const iBlood = text.findIndex(t => /Blood\s*Group/i.test(t));
    if (iId < 0) { console.warn('WARN no ID line at row', row, 'col', col, '->', text.join(' / ')); return; }

    employees.push({
      empId: text[iId].replace(/^ID:\s*/i, '').trim(),
      name: text.slice(0, iId).join(' ').trim(),
      designation: text.slice(iId + 1, iBlood < 0 ? undefined : iBlood).join(' ').trim(),
      blood: iBlood < 0 ? null : text[iBlood].replace(/^Blood\s*Group:\s*/i, '').trim(),
      row, col,
      crop: { x: cx0 - PAD, y: ry0 - PAD, w: cx1 - cx0 + 1 + 2 * PAD, h: ry1 - ry0 + 1 + 2 * PAD },
    });
  });
});
// --- pass 3: which cards actually carry a photo? -----------------------------
// An empty photo frame reads as a perfectly good card in passes 1 and 2 — the
// text is all there — so it has to be caught by looking for a placed image
// inside the card. Every `... cm /ImN Do` in the content stream is one placed
// image; map its centre to a card the same way words were mapped.
function photoIds() {
  const raw = fs.readFileSync(PDF);
  const s = raw.toString('latin1');
  const pageAt = s.indexOf('\r10 0 obj\r') + 1;
  const pageDict = s.slice(pageAt, s.indexOf('endobj', pageAt));
  const pageHeight = +/\/MediaBox\[\s*[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+([\d.]+)/.exec(pageDict)[1];

  const contentsAt = s.indexOf('\r' + /\/Contents (\d+) 0 R/.exec(pageDict)[1] + ' 0 obj') + 1;
  const streamAt = s.indexOf('stream', contentsAt);
  const dict = s.slice(contentsAt, streamAt);
  let at = streamAt + 6;
  if (s[at] === '\r') at++;
  if (s[at] === '\n') at++;
  let body = raw.slice(at, at + Number(/\/Length (\d+)/.exec(dict)[1]));
  if (/FlateDecode/.test(dict)) body = zlib.inflateSync(body);
  body = body.toString('latin1');

  const placed = /([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) cm[\s\S]{0,80}?\/Im\d+ Do/g;
  const withPhoto = new Set();
  let m;
  while ((m = placed.exec(body))) {
    // PDF space is bottom-left origin; card crops are top-left, 100 dpi pixels
    const cx = (+m[5] + +m[1] / 2) / PT;
    const cy = (pageHeight - (+m[6] + +m[4] / 2)) / PT;
    const card = employees.find(e => cx >= e.crop.x && cx <= e.crop.x + e.crop.w &&
                                     cy >= e.crop.y && cy <= e.crop.y + e.crop.h);
    if (card) withPhoto.add(card.empId);
  }
  return withPhoto;
}

let withPhoto;
try {
  withPhoto = photoIds();
} catch (err) {
  // Only the photo check depends on the content stream's exact shape, so a
  // change in how Illustrator writes the PDF must not break the whole extract.
  console.warn('WARN could not read photo placements (' + err.message + '); hasPhoto left null');
  withPhoto = null;
}
employees.forEach(e => {
  e.hasPhoto = withPhoto ? withPhoto.has(e.empId) : null;
  e.file = 'cards/' + e.empId + '.jpg';
});
const noPhoto = employees.filter(e => e.hasPhoto === false);
if (noPhoto.length) console.warn('WARN empty photo frame:', noPhoto.map(e => e.empId + ' ' + e.name).join('; '));

const dupes = employees.map(e => e.empId).filter((id, i, a) => a.indexOf(id) !== i);
if (dupes.length) console.warn('WARN duplicate employee IDs:', dupes.join(', '));
const blank = employees.filter(e => !e.name || !e.designation || !e.blood);
if (blank.length) console.warn('WARN incomplete cards:', blank.map(e => e.empId).join(', '));

fs.writeFileSync(path.join(__dirname, 'employees.json'), JSON.stringify(employees, null, 2) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`grid ${ROWS.length} x ${COLS.length}, ${employees.length} cards -> employees.json`);
