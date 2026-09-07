import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdaptiveSession, adaptiveTimeBudget, pickAdaptiveTier } from '../client/src/game-engine/adaptiveSession';

test('three correct harden, two wrong soften actual time budgets; reset clears history', () => {
  const s = createAdaptiveSession(4);
  const initial = s.band;
  s.answer(true); s.answer(true); s.answer(true);
  assert.ok(s.band > initial);
  assert.ok(adaptiveTimeBudget(30, s.band) < adaptiveTimeBudget(30, initial));
  s.answer(false); s.answer(false);
  assert.ok(s.band < initial);
  s.reset(4);
  assert.equal(s.band, initial);
  s.answer(true);
  assert.equal(s.band, initial);
});

test('long runs stay bounded and finite', () => {
  const s = createAdaptiveSession(4);
  for (let i=0;i<1000;i++) { s.answer(i<500); assert.ok(s.band>=0.15&&s.band<=1); }
  assert.ok(adaptiveTimeBudget(20,s.band)>=20);
});

test('tier selection changes challenge, avoids repeats and supports sparse pools', () => {
  const pools = {easy:[{id:'e'}],med:[{id:'m'}],hard:[{id:'h'},{id:'h2'}]};
  assert.equal(pickAdaptiveTier(pools,0.15,[],()=>0)?.id,'e');
  assert.equal(pickAdaptiveTier(pools,1,['h'],()=>0)?.id,'h2');
  assert.equal(pickAdaptiveTier({easy:[],med:pools.med,hard:[]},1,[],()=>0)?.id,'m');
  assert.equal(pickAdaptiveTier({easy:[],med:[],hard:[]},0.5,[],()=>0),null);
});
