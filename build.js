// Builds two things from one template:
//   1. site/          — the GitHub Pages build; card images stay separate files
//   2. the standalone — everything inlined, for email / shared drive / USB
const fs = require('fs');
const path = require('path');

const root = __dirname;
const employees = JSON.parse(fs.readFileSync(path.join(root, 'employees.json'), 'utf8'));

const record = e => ({
  id: e.empId,
  name: e.name.replace(/\s+/g, ' ').trim(),
  designation: e.designation.replace(/\s+/g, ' ').trim(),
  blood: e.blood.replace(/\s+/g, '').trim(),
  office: /^SYL/.test(e.empId) ? 'Sylhet' : 'Dhaka',
});

const data = employees.map(e => {
  const jpg = path.join(root, 'cards', e.empId + '.jpg');
  if (!fs.existsSync(jpg)) throw new Error('missing card image for ' + e.empId);
  return Object.assign(record(e), {
    img: 'data:image/jpeg;base64,' + fs.readFileSync(jpg).toString('base64'),
  });
});
const webData = employees.map(e => Object.assign(record(e), { img: 'cards/' + e.empId + '.jpg' }));

const missing = data.filter(d => !d.name || !d.designation || !d.blood);
if (missing.length) console.warn('WARN incomplete records:', missing.map(m => m.id + ' ' + JSON.stringify({n:m.name,d:m.designation,b:m.blood})));

// brand marks are cut from the same artboard, so they always match the printed card
const dataUri = f => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'brand', f)).toString('base64');
const mark = dataUri('suma-mark.png');
const lockup = dataUri('suma-lockup.png');

const template = fs.readFileSync(path.join(root, 'template.html'), 'utf8');

function render(records) {
  return template
    .replace('__MARK__', mark)
    .replace('/*__DATA__*/',
      'window.__EMPLOYEES__ = ' + JSON.stringify(records).replace(/<\//g, '<\\/') + ';\n' +
      'window.__LOCKUP__ = ' + JSON.stringify(lockup) + ';');
}

const standalone = path.join(root, 'SIS-Employee-ID-Approval.html');
fs.writeFileSync(standalone, render(data));

// --- Pages build -------------------------------------------------------------
// Public site, so keep it out of search engines. This hides it from Google;
// it does NOT make the page private — anyone with the URL can open it.
const site = path.join(root, 'docs');   // GitHub Pages source: main branch /docs
fs.mkdirSync(path.join(site, 'cards'), { recursive: true });
fs.writeFileSync(path.join(site, 'index.html'),
  render(webData).replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow, noarchive">'));
employees.forEach(e => fs.copyFileSync(path.join(root, 'cards', e.empId + '.jpg'), path.join(site, 'cards', e.empId + '.jpg')));
fs.writeFileSync(path.join(site, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(site, '.nojekyll'), '');
fs.copyFileSync(standalone, path.join(site, 'SIS-Employee-ID-Approval.html'));

const mb = f => (fs.statSync(f).size / 1048576).toFixed(2) + ' MB';
console.log('standalone:', standalone, mb(standalone));
console.log('site:      ', path.join(site, 'index.html'), mb(path.join(site, 'index.html')), '+', employees.length, 'card images');
