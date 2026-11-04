const assert=require('assert');
const Q=require('../js/quant-stats.js');
let n=0;const ok=s=>{console.log('ok  ',s);n++};
{
  const p=Q.parseCSV('Time,Close,Volume\n2026-01-01,100,20\n2026-01-02,102,25');
  assert.deepStrictEqual(p.headers,['Time','Close','Volume']);assert.strictEqual(p.rows.length,2);assert.strictEqual(p.rows[1][1],'102');ok('CSV comma/header/basic rows');
}
{
  const p=Q.parseCSV('Time;Close;Note\n2026-01-01;1.234,56;"text; with separator"\n2026-01-02;1.235,56;ok');
  assert.strictEqual(p.delimiter,';');assert.strictEqual(Q.parseNumber(p.rows[0][1],p.delimiter),1234.56);assert.strictEqual(p.rows[0][2],'text; with separator');ok('CSV semicolon, decimal comma, quoted delimiter');
}
{
  const s=Q.stats([1,2,3,4]);assert.strictEqual(s.n,4);assert.strictEqual(s.mean,2.5);assert.strictEqual(s.median,2.5);assert.ok(Math.abs(s.variance-5/3)<1e-12);assert.strictEqual(s.min,1);assert.strictEqual(s.max,4);ok('descriptive statistics and sample variance');
}
{
  const r=Q.returns([100,110,99]);assert.ok(Math.abs(r[0].simple-.1)<1e-12);assert.ok(Math.abs(r[0].log-Math.log(1.1))<1e-12);assert.ok(Math.abs(r[1].simple+.1)<1e-12);ok('simple and logarithmic returns');
}
{
  assert.ok(Math.abs(Q.correlation([1,2,3],[2,4,6])-1)<1e-12);assert.ok(Math.abs(Q.correlation([1,2,3],[6,4,2])+1)<1e-12);assert.ok(Number.isNaN(Q.correlation([1,1],[3,4])));ok('Pearson correlation and constant-column guard');
}
{
  const h=Q.histogram([0,1,2,3],2);assert.strictEqual(h.length,2);assert.deepStrictEqual(h.map(x=>x.count),[2,2]);ok('histogram bin counts and bounds');
}
{
  const r=Q.rolling([1,2,3,4],3);assert.strictEqual(r[0],null);assert.strictEqual(r[2].mean,2);assert.strictEqual(r[3].mean,3);ok('rolling mean/std window');
}
console.log(`\n${n} nhóm kiểm thử Quant Stats đạt`);
{
  assert.strictEqual(Q.parseNumber('12.5%'),.125);assert.strictEqual(Q.parseNumber('1.234,5%', ';'),12.345);ok('percent fields are converted to decimal fractions');
}
{
  const s=Q.stats([1,2,2,3,3,3]);assert.strictEqual(s.mode,3);assert.strictEqual(s.modeFrequency,3);assert.deepStrictEqual(s.modes,[3]);ok('mode and tied-frequency tracking');
}
{
  assert.ok(Math.abs(Q.covariance([1,2,3],[2,4,8])-3)<1e-12);assert.throws(()=>Q.covariance([1,2],[1]),/cùng số quan sát/);ok('sample covariance and mismatched-series guard');
}
{
  assert.strictEqual(Q.detectTimeColumn(['Update','Close']),-1);assert.strictEqual(Q.detectTimeColumn(['Timestamp (UTC)','Close']),0);ok('timestamp detection avoids matching the word Update');
}
{
  const p=Q.parseCSV('Time,Close,Close\n2026-01-01,1,2');assert.deepStrictEqual(p.headers,['Time','Close','Close (2)']);assert.throws(()=>Q.parseCSV('Time,Close\n2026-01-01,"100'),/chưa đóng/);ok('duplicate headers and malformed quoted CSV validation');
}
{
  const r=Q.returns([100,null,105,110]);assert.ok(Number.isNaN(r[0].simple));assert.ok(Number.isNaN(r[1].simple));assert.ok(Math.abs(r[2].simple-110/105+1)<1e-12);ok('returns do not coerce missing values to zero');
}
{
  const r=Q.rolling([1,2,null,4,5],2);assert.strictEqual(r[1].n,2);assert.strictEqual(r[2],null);assert.strictEqual(r[3],null);assert.strictEqual(r[4].n,2);ok('rolling windows require a complete valid window');
}
{
  assert.strictEqual(Q.parseTimestamp('20260131'),Date.UTC(2026,0,31));assert.strictEqual(Q.parseTimestamp('1767225600'),1767225600000);assert.strictEqual(Q.parseTimestamp('1767225600000'),1767225600000);assert.ok(Number.isNaN(Q.parseTimestamp('20260231')));ok('timestamp parser supports YYYYMMDD, Unix seconds/milliseconds and rejects invalid dates');
}
{
  assert.throws(()=>Q.parseCSV('Time,Close\n2026-01-01,1\n2026-01-02,2,unexpected'),/nhiều hơn/);ok('CSV parser rejects excess fields rather than silently discarding data');
}
