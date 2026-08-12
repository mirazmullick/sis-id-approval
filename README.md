# Suma Group — Employee ID Card Approval Dashboard

Turns the `Employee ID.pdf` artboard (one page, 50 ID cards) into a review tool where each
person opens their own card, ticks **approve** if it is correct, or writes what needs fixing.

> **This repository is public.** The 50 employee photos, names, employee IDs, designations and
> blood groups in `docs/` are readable by anyone who has the URL, and they stay in the git
> history even if deleted later. `robots.txt` and a `noindex` tag keep the site out of Google,
> which is not the same as private. To pull it down: delete the repo, or turn Pages off in
> Settings → Pages.

## Two ways to use it

**Live site — <https://mirazmullick.github.io/sis-id-approval/>**
Send staff the link, or a direct link to their own card, e.g. `…/sis-id-approval/#SYL059`.
Works on any phone. Loads in under a second because card images are fetched one at a time.

**`SIS-Employee-ID-Approval.html`** (3.4 MB) — the same dashboard in one file, with all 50 card
images embedded. No internet, no server, no install. Email it, drop it on a shared drive, or put
it on a USB stick. Also downloadable from the live site at
`…/sis-id-approval/SIS-Employee-ID-Approval.html`.

## How people use it

1. Open the file and type your name in **Reviewed by** (top right).
2. Search your name or employee ID in the left panel and click yourself.
3. Check the card: name, ID, designation, blood group, photo.
4. Either tick **"The information on this ID card is correct — approve it"**,
   or type what is wrong in **Remarks / corrections needed**. The quick chips
   (Name spelling, Designation, Blood group, ID number, Photo, Office/branch) fill in the
   opening words for you.
5. Everything saves automatically in that browser. The status dot turns green (approved) or
   amber (correction requested).

Direct link to one person's card: append their ID to the file path, e.g. `…ID-Approval.html#SYL059`.

## Collecting responses in a Google Sheet (recommended)

Once this is connected, each person gets a **Send to HR** button, and a **Team responses**
button shows everyone's answers in one live table — no files to merge.

Set-up, once:

1. Create a blank Google Sheet (name it e.g. *Suma ID card approvals*).
2. **Extensions → Apps Script**. Delete the sample code, paste all of `apps-script/Code.gs`, save.
   The token is already filled in and matches `endpoint.example.json`.
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, then authorise when Google asks (it warns because the script is yours and unverified —
     choose *Advanced → Go to project*).
4. Copy the deployment URL. It ends in `/exec`.
5. Save it as `endpoint.json` next to `endpoint.example.json`, then rebuild and push:

```bash
node build.js && git add -A && git commit -m "connect HR sheet" && git push
```

The Sheet grows two tabs by itself: **Responses** (one row per employee, latest answer) and
**Log** (every submission, as an audit trail).

Worth knowing: the endpoint URL and token are inside the public page, so anyone who views source
could post a row. Junk rows would be visible and obviously wrong, and the Log tab shows
everything, but this is not authentication. Sheet access itself stays private to you.

Without `endpoint.json` the app simply hides those two buttons and works exactly as described
below.

## How HR collects the results (without the Sheet)

Under **Export & tools**:

| Action | Use it for |
| --- | --- |
| Download responses (CSV) | Full 50-row sheet for Excel: status, approved yes/no, remarks, who, when |
| Download responses (JSON) | The machine-readable version, used for merging |
| Copy my response as text | An employee pastes their own result into WhatsApp or email |
| Copy correction list for designer | Only the cards needing changes, numbered, ready to send to whoever edits the Illustrator file |
| Merge responses (JSON) | Load the JSON files people sent back and combine them into one master list |
| Clear all responses on this device | Reset |

Responses live in the browser's local storage, so they are per-device. Two ways to run it:

- **Central review (simplest):** one HR machine opens the file and goes through all 50 with
  people confirming. Export the CSV at the end.
- **Distributed review:** everyone gets the file, marks their own card, then uses
  *Download responses (JSON)* and sends the small file back. HR merges them all with
  *Merge responses*, then exports one CSV.

If you would rather have everything land in one place automatically (a Google Sheet or a small
server on the office network), that is a change to make next — the data shape is already there.

## Running it on the office network

```bash
node server.js
```

Serves on `http://localhost:4319`; other people on the same network can reach it at
`http://<this-machine-ip>:4319`. Note this only serves the page — responses still save per
browser until a backend is added.

## Rebuilding after the artwork changes

The source PDF is a single Adobe Illustrator artboard, 1524 × 2107 pt, holding 50 cards in an
8-column grid. Card positions were detected from a 100 dpi render (white gutters between cards),
and the text of every card was read from the PDF's own text layer, so names, IDs, designations
and blood groups are exact, not OCR guesses.

```bash
node render_cards.js   # re-cuts cards/<ID>.jpg from the PDF at 220 dpi
node build.js          # re-embeds them into SIS-Employee-ID-Approval.html
```

`render_cards.js` reads the source path from `SRC_PDF` (defaults to the Desktop copy).
If the grid or card count changes, re-derive `employees.json` — the detection scripts are in the
session scratchpad (`bands.js`, `extract.js`) and can be copied here on request.

## Files

```
docs/                           what GitHub Pages serves (index.html, cards/, robots.txt)
SIS-Employee-ID-Approval.html   the offline single-file build
employees.json                  50 records + crop boxes (source of truth for the build)
cards/                          50 individual card JPEGs, 491 × 759 px
brand/                          suma mark + full lockup, cut from the artwork, transparent PNG
render_cards.js                 PDF -> cards/
build.js                        cards/ + template.html -> docs/ and the single-file build
template.html                   the app itself, before images are embedded
server.js                       optional LAN preview server (port 4319)
```

## Publishing changes

`docs/` is generated — never edit it by hand. Edit `template.html`, then:

```bash
node build.js && git add -A && git commit -m "update dashboard" && git push
```

GitHub Pages is set to **main branch → /docs**, so the site updates a minute or so after the push.

## Notes on the data

- 50 employees: 23 Sylhet (`SYL…`) and 27 Dhaka (`DAC…`) — the office column is derived from
  the ID prefix, so branch staff (Moulvibazar, Habiganj) show under their ID's office.
- Blood groups are normalised (`O +ve` → `O+ve`).
- No two IDs collide, and every card yielded a name, ID, designation and blood group.
