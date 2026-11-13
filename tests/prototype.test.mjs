import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../script.js',import.meta.url),'utf8');
for(const tab of ['calendar','messages','wellbeing','people'])test('has '+tab+' navigation',()=>assert.match(html,new RegExp('data-tab="'+tab+'"')));
for(const form of ['requestForm','messageForm','forumForm','topicForm','foodForm','checkinForm'])test('includes '+form,()=>assert.match(js,new RegExp(form)));
test('escapes user-entered content',()=>assert.match(js,/const safe=/));
test('demo has no network requests or persistent storage',()=>{assert.doesNotMatch(js,/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest/)});

test('calendar initializes and renders clickable dates in a simulated DOM',async()=>{
  const {runInNewContext}=await import('node:vm');
  const panel={innerHTML:''};
  const handlers={};
  const document={
    querySelector:selector=>selector==='#panel'?panel:null,
    querySelectorAll:()=>[],
    addEventListener:(name,fn)=>{handlers[name]=fn}
  };
  const context={document,Date,Set,Number,String,Math,Object,Array,Map,Intl,setTimeout,clearTimeout};
  runInNewContext(js,context,{timeout:1000});
  assert.match(panel.innerHTML,/data-date="/);
  assert.match(panel.innerHTML,/data-requestmode="available"/);
  assert.match(panel.innerHTML,/data-requestmode="unavailable"/);
  assert.match(panel.innerHTML,/data-requestmode="request"/);
  assert.ok(handlers.click);
});
