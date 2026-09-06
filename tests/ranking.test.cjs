const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(fetch, online = false, initial = {}) {
  const data = new Map(Object.entries(initial));
  const context = { window: { VOID_FIREBASE_CONFIG: { apiKey: 'test', projectId: 'test' } }, navigator: { onLine: online }, localStorage: { getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) }, fetch, setTimeout() {}, setInterval() {}, addEventListener() {}, URLSearchParams, Date };
  vm.runInNewContext(fs.readFileSync('ranking.js', 'utf8'), context);
  return { api: context.window.VoidRanking, data, context };
}
const record = (progress, score = 100) => ({ name: 'Pilot', highestLevel: 10, finalBossProgress: progress, maxScore: score, playerCount: 1 });
test('progress outranks farmed score; worse runs never replace best; reload preserves best', async () => {
  const {api, data} = setup(); await api.submit(record(50, 9000)); await api.submit(record(70, 10)); await api.submit(record(30, 90000));
  assert.equal(api.best().finalBossProgress, 70);
  const reloaded = setup(undefined, false, Object.fromEntries(data)); assert.equal(reloaded.api.best().finalBossProgress, 70);
  assert.equal((await reloaded.api.top())[0].maxScore, 10);
});
test('pagination ranks beyond first 100 and merges unsynced local record', async () => {
  let calls=0; const {api} = setup(async () => ({ok:true,json:async()=> ++calls===1 ? {documents:[{fields:{uid:{stringValue:'a'},highestLevel:{integerValue:'2'}}}],nextPageToken:'next'} : {documents:[{fields:{uid:{stringValue:'b'},highestLevel:{integerValue:'9'}}}]} }), true);
  const top=await api.top(); assert.equal(calls,2);assert.equal(top[0].highestLevel,9);
});
test('queued record syncs and new metric is serialized', async()=>{
  let written; const {api,context,data}=setup(async(url,options)=>{
    if(url.includes('signUp'))return {ok:true,json:async()=>({localId:'test-user',idToken:'test-token',refreshToken:'refresh'})};
    if(url.includes(':commit')){written=JSON.parse(options.body);return {ok:true};}
    return {ok:false,status:404};
  });
  await api.submit(record(82));context.navigator.onLine=true;assert.equal(await api.sync(),true);
  assert.equal(written.writes[0].update.fields.finalBossProgress.integerValue,'82');assert.equal(data.has('void-runner-record-queue-v1'),false);
});
test('permission failures retain pending score and never overwrite unreadable remote record',async()=>{
  const {api,context,data}=setup(async url=>url.includes('signUp')?{ok:true,json:async()=>({localId:'u',idToken:'t'})}:{ok:false,status:403});await api.submit(record(20));context.navigator.onLine=true;assert.equal(await api.sync(),false);assert.ok(data.has('void-runner-record-queue-v1'));
});
