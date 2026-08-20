/**
 * Works out which artboard PDF to build from.
 *
 * The exports arrive with whatever name the designer saved them under —
 * "Employee ID.pdf" one week, "Employee ID 20261608.pdf" the next — and both
 * sit on the Desktop afterwards. Defaulting to a fixed filename means a later
 * run can quietly rebuild from a superseded file and look like it worked, so
 * the newest match wins instead.
 *
 * SRC_PDF overrides everything when you want a specific file.
 */
const fs = require('fs');
const path = require('path');

const DIR = process.env.SRC_PDF_DIR || 'C:/Users/molli/OneDrive/Desktop';
const PATTERN = /^Employee ID.*\.pdf$/i;

function sourcePdf() {
  if (process.env.SRC_PDF) {
    if (!fs.existsSync(process.env.SRC_PDF)) throw new Error('SRC_PDF does not exist: ' + process.env.SRC_PDF);
    return process.env.SRC_PDF;
  }
  const found = fs.readdirSync(DIR)
    .filter(f => PATTERN.test(f))
    .map(f => {
      const full = path.join(DIR, f);
      return { full, at: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.at - a.at);

  if (!found.length) throw new Error('no "Employee ID*.pdf" found in ' + DIR + ' — set SRC_PDF');
  if (found.length > 1) {
    // Say which one lost, so a stale rebuild is visible rather than silent.
    console.log('using newest of ' + found.length + ' exports: ' + path.basename(found[0].full) +
      ' (ignoring ' + found.slice(1).map(f => path.basename(f.full)).join(', ') + ')');
  }
  return found[0].full;
}

module.exports = { sourcePdf };
