const assert = require('assert');
const E = require('../js/elliott-structure-engine.js');
let passed = 0;
const ok = label => { console.log('ok  ', label); passed++; };
const p = (idx, price, kind) => ({ index: idx, time: idx * 60, price, kind, confirmed: true, confirmationIndex: idx + 1, confirmationTime: (idx + 1) * 60 });

{
  const upward = [p(0, 100, 'low'), p(10, 120, 'high'), p(18, 110, 'low'), p(30, 132, 'high')];
  assert.strictEqual(E.classifySequenceRole(upward, 1), 'motive-wave3');
  assert.strictEqual(E.classifySequenceRole(upward, -1), 'countertrend-correction');
  assert.strictEqual(E.classifySequenceRole(upward, 0), 'unknown');
  ok('A-B-C-like 4-pivot geometry is classified by parent trend, not by geometry alone');
}

{
  const upward = [p(0, 100, 'low'), p(10, 120, 'high'), p(18, 110, 'low'), p(30, 132, 'high')];
  const c = E.evaluateDevelopingImpulseWave3(upward);
  assert.ok(c);
  assert.strictEqual(c.pattern, 'impulse_developing_wave3');
  assert.strictEqual(c.nextWave, '4');
  assert.strictEqual(c.hardRules.filter(x => x.status === 'fail').length, 0);
  const bad = [p(0, 100, 'low'), p(10, 120, 'high'), p(18, 99, 'low'), p(30, 132, 'high')];
  assert.strictEqual(E.evaluateDevelopingImpulseWave3(bad), null, 'Wave 2 origin break must reject standard impulse interpretation');
  ok('Developing 0-1-2-3 count enforces origin and Wave 3 extension hard rules');
}

{
  const bars = [];
  const n = 656;
  for (let i = 0; i < n; i++) {
    let base = 3800 + i * 0.35;
    if (i >= 500) {
      const k = i - 500;
      if (k < 40) base += k * 1.8;
      else if (k < 60) base += 72 - (k - 40) * 1.2;
      else base += 48 + (k - 60) * 2.2;
    }
    const close = base + Math.sin(i / 4) * 3 + Math.sin(i / 11) * 4;
    const previous = i ? bars[i - 1].close : close;
    bars.push({ time: i * 60, open: previous, high: Math.max(previous, close) + 1.3, low: Math.min(previous, close) - 1.3, close, volume: 100 });
  }
  const result = E.analyze(bars);
  assert.strictEqual(result.trendContext.regime, 'uptrend');
  assert.ok(result.preferred, 'a clear directional structure should be selected');
  assert.strictEqual(result.preferred.direction, 'bullish', 'macro-aligned motive count should beat a tiny countertrend fragment');
  assert.ok(result.preferred.pattern === 'impulse_developing_wave3' || result.preferred.pattern === 'impulse_developing_wave5' || result.preferred.pattern === 'impulse');
  assert.ok(!result.candidates.some(c => c.pattern === 'zigzag' && c.direction === 'bullish'), 'bullish geometry in a bullish context must not be emitted as an ABC Zigzag');
  ok('End-to-end rising market does not show an upward ABC; it prefers a bullish motive count');
}

{
  const bars = Array.from({ length: 220 }, (_, i) => {
    const close = 100 + Math.sin(i / 7) * 2 + Math.sin(i / 2.8) * 0.4;
    const previous = i ? 100 + Math.sin((i - 1) / 7) * 2 + Math.sin((i - 1) / 2.8) * 0.4 : close;
    return { time: i * 60, open: previous, high: Math.max(previous, close) + 0.1, low: Math.min(previous, close) - 0.1, close, volume: 100 };
  });
  const trend = E.estimateTrendContext(E.normalizeBars(bars));
  assert.strictEqual(trend.regime, 'range-or-uncertain');
  assert.strictEqual(trend.direction, 0);
  ok('Range/uncertain regime is not forced into a bullish or bearish direction');
}

{
  const bars = Array.from({ length: 90 }, (_, i) => {
    const close = -120 + i * 0.65 + Math.sin(i / 5) * 0.18;
    const previous = i ? -120 + (i - 1) * 0.65 + Math.sin((i - 1) / 5) * 0.18 : close;
    return { time: i * 60, open: previous, high: Math.max(previous, close) + 0.08, low: Math.min(previous, close) - 0.08, close, volume: 10 };
  });
  const trend = E.estimateTrendContext(E.normalizeBars(bars));
  assert.strictEqual(trend.direction, 1);
  assert.ok(trend.windows.every(x => x.scale === 'arithmetic'), 'non-positive futures prices must not be clamped into artificial log prices');
  ok('Trend context remains valid for instruments with zero/negative traded prices');
}

{
  const bars = Array.from({ length: 80 }, (_, i) => {
    const close = 100 + Math.sin(i / 5) * 3 + i * 0.03;
    const previous = i ? 100 + Math.sin((i - 1) / 5) * 3 + (i - 1) * 0.03 : close;
    return { time: i * 60, open: previous, high: Math.max(previous, close) + 1, low: Math.min(previous, close) - 1, close, volume: 10 };
  });
  const normalized = E.normalizeBars(bars);
  const result = E.directionalChangePivots(normalized, { atrPeriod: 14, thresholdMultiplier: 1.1 });
  assert.ok(result.pivots.length > 0);
  const sample = result.pivots.find(x => x.kind === 'high');
  if (sample) assert.strictEqual(sample.price, normalized[sample.index].high, 'high pivots use candle highs, not closes');
  ok('Swing pivots anchor to actual OHLC extremes and use close-confirmed reversals');
}


{
  const upward = [p(0, 100, 'low'), p(10, 120, 'high'), p(18, 110, 'low'), p(30, 132, 'high')];
  const mislabelled = E.auditManualSequence(upward, ['0', 'A', 'B', 'C'], { contextDirection: 1 });
  assert.strictEqual(mislabelled.status, 'FAIL');
  assert.ok(mislabelled.rules.some(x => x.id === 'EW-MAN-ABC-ROLE'));
  const validCorrection = E.auditManualSequence(upward, ['0', 'A', 'B', 'C'], { contextDirection: -1 });
  assert.strictEqual(validCorrection.status, 'REVIEW', 'geometry passes but child grammar remains unverified');
  const motive = E.auditManualSequence(upward, ['0', '1', '2', '3'], { contextDirection: 1 });
  assert.ok(motive.rules.some(x => x.id === 'EW-MOTIVE3-02'));
  ok('Manual Count rejects same-direction ABC and accepts contextual 0-1-2-3 labeling');
}


{
  const current = {
    id: 'impulse_developing_wave3:current', pattern: 'impulse_developing_wave3', direction: 'bullish', directionSign: 1,
    startIndex: 0, endIndex: 30, pivots: [p(0, 100, 'low'), p(10, 120, 'high'), p(18, 110, 'low'), p(30, 145, 'high')]
  };
  const forecast = E.buildNextWaveForecast(current, [], []);
  assert.strictEqual(forecast.available, true);
  assert.strictEqual(forecast.wave, '4');
  assert.deepStrictEqual(forecast.fib.map(x => x.ratio), [0.236, 0.382, 0.5]);
  assert.ok(forecast.fib.every(x => x.price < forecast.origin));
  ok('Developing Wave 3 gives conditional Wave 4 Fibonacci retracement scenarios');
}

console.log(`\n${passed} nhóm kiểm thử Elliott context-first v0.8 đạt`);
