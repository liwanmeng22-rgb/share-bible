const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = vm.createContext({setTimeout, clearTimeout});
vm.runInContext(fs.readFileSync('reader-speech.js','utf8'),context);
function fixture(voices = [{lang:'en-US'}, {lang:'zh-CN'}]) {
  const spoken = [], messages = [], selected = [], timeouts = new Map();
  let handler, playing, tid=0;
  const synth={paused:false, getVoices:()=>voices, cancel(){}, speak(u){spoken.push(u);}, addEventListener(n,h){handler=h;}};
  const reader=context.BibleSpeech.createReader({synth, Utterance:function(text){this.text=text;},status:m=>messages.push(m),highlight:v=>selected.push(v),controls:v=>playing=v,rate:()=>0.9,setTimer:f=>{timeouts.set(++tid,f);return tid;},clearTimer:i=>timeouts.delete(i)});
  return {reader,spoken,messages,selected,timeouts,voices,synth,changed:()=>handler(),playing:()=>playing};
}
const verses=[{verse:1,zh:'第一句经文。'},{verse:2,zh:'第二句经文。'}];
{
  const f=fixture();f.reader.start(verses);
  assert.equal(f.spoken.length,1);assert.equal(f.spoken[0].voice.lang,'zh-CN');
  assert.equal(f.selected.at(-1),null,'must not scroll before playback starts');
  f.spoken[0].onerror({error:'language-unavailable'});
  assert.equal(f.spoken.length,1,'failure must not jump to the next verse');
  assert.equal(f.playing(),false);assert.match(f.messages.at(-1),/language-unavailable/);
}
{
  const f=fixture();f.reader.start(verses);
  const oldEnd=f.spoken[0].onend,oldError=f.spoken[0].onerror;
  f.reader.start(verses);
  oldEnd();oldError({error:'canceled'});
  assert.equal(f.spoken.length,2,'old cancellation cannot alter new playback');
  f.spoken[1].onstart();assert.equal(f.selected.at(-1),1);
  f.spoken[1].onend();assert.equal(f.spoken.length,3);
  f.spoken[2].onstart();f.spoken[2].onend();
  assert.equal(f.playing(),false);assert.match(f.messages.at(-1),/已完成/);
}
{
  const f=fixture([{lang:'en-US'}]);f.reader.start(verses);
  assert.equal(f.spoken.length,0,'never speak Chinese with the English fallback');
  f.voices.push({lang:'zh-CN'});f.changed();
  assert.match(f.messages.at(-1),/再次点击/);
  assert.equal(f.spoken.length,0,'voiceschanged must not lose the tap permission by autoplaying');
  f.reader.start(verses);assert.equal(f.spoken.length,1);
}
{
  const f=fixture();f.reader.start(verses);[...f.timeouts.values()][0]();
  assert.match(f.messages.at(-1),/start-timeout/);assert.equal(f.spoken.length,1);
}
{
  const f=fixture();f.reader.start(verses);f.spoken[0].onend();
  assert.equal(f.spoken.length,1,'end without start must not skip through chapter');
}
{
  const f=fixture();f.reader.start([{verse:1,zh:'经'.repeat(260)}]);
  let i=0;
  while(i<f.spoken.length){assert(f.spoken[i].text.length<=100);f.spoken[i].onstart();f.spoken[i++].onend();}
  assert.equal(f.spoken.map(u=>u.text).join(''),'经'.repeat(260));
}
console.log('PASS: Chinese voice selection, no error skipping, old-event isolation, voice readiness, start timeout, chunk integrity');
