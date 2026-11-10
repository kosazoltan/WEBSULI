import assert from 'node:assert/strict';
import test from 'node:test';
import { planSecretWrite, prunedRenderValue, rotatedRenderValue } from './set-proxy-secret.mjs';

// Spec 2026-11-10-korlat-kliens-ip (T4). A tesztértékek nem titkok.
test('terv: új változó létrehozása, meglévő felülírása csak --rotate kapcsolóval', () => {
  assert.equal(planSecretWrite({ renderHas: false, vercelHas: false, rotate: false }), 'create');
  assert.equal(planSecretWrite({ renderHas: true, vercelHas: false, rotate: false }), 'refuse');
  assert.equal(planSecretWrite({ renderHas: false, vercelHas: true, rotate: false }), 'refuse');
  assert.equal(planSecretWrite({ renderHas: true, vercelHas: true, rotate: true }), 'rotate');
});

test('review #411: csere után minden korábban elfogadott érték érvényben marad, az új elöl', () => {
  assert.equal(rotatedRenderValue('regi-1', 'uj'), 'uj,regi-1');
  // Részleges átállás után ismételt csere: a Vercel által még küldött legrégebbi érték sem vész el.
  assert.equal(rotatedRenderValue('regi-2, regi-1', 'uj'), 'uj,regi-2,regi-1');
  assert.equal(rotatedRenderValue('', 'uj'), 'uj');
  assert.equal(rotatedRenderValue(' , regi-1,,regi-1', 'uj'), 'uj,regi-1');
});

test('lezárás: csak a legújabb érték marad; egyetlen értéknél nincs teendő', () => {
  assert.equal(prunedRenderValue('uj,regi-2,regi-1'), 'uj');
  assert.equal(prunedRenderValue('uj'), null);
  assert.equal(prunedRenderValue(''), null);
});
