'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const ORIGIN = 'https://looker-url-json-connector.softec.be';

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

/** True when a site path such as /privacy/ or /logo.png is a published file. */
function published(sitePath) {
  const clean = sitePath.split('#')[0].split('?')[0];
  const file = path.join(SITE, clean.endsWith('/') ? clean + 'index.html' : clean);
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

test('every internal link and asset of the site exists', () => {
  const pages = htmlFiles(SITE);
  assert.ok(pages.length >= 5);
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const targets = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(targets.length > 0, page);
    for (const target of targets) {
      if (/^https:\/\//.test(target)) continue;
      assert.ok(target.startsWith('/'), `${page}: "${target}" must be https or start with /`);
      assert.ok(published(target), `${page}: "${target}" does not exist in site/`);
    }
  }
});

test('the pages the gallery review asks for exist and link to each other', () => {
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  for (const link of ['/privacy/', '/terms/', '/support/']) {
    assert.ok(published(link), link);
    assert.ok(home.includes(`href="${link}"`), 'the overview links to ' + link);
  }
});

test('the manifest URLs on the site domain point at published files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'appsscript.json'), 'utf8')).dataStudio;
  const onSite = ['addOnUrl', 'supportUrl', 'privacyPolicyUrl', 'termsOfServiceUrl', 'logoUrl'];
  for (const field of onSite) {
    assert.ok(manifest[field].startsWith(ORIGIN + '/'), `${field} is on the site domain`);
    assert.ok(published(manifest[field].slice(ORIGIN.length)), `${field}: ${manifest[field]}`);
  }
});

test('no page shows a placeholder', () => {
  for (const page of htmlFiles(SITE)) {
    const visible = fs.readFileSync(page, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    assert.ok(!/placeholder|todo|lorem/i.test(visible), page);
  }
});
