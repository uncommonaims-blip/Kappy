import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../script.js',import.meta.url),'utf8');
for(const tab of ['calendar','messages','wellbeing','people'])test('has '+tab+' navigation',()=>assert.match(html,new RegExp('data-tab="'+tab+'"')));
for(const form of ['requestForm','messageForm','forumForm','topicForm','foodForm','checkinForm'])test('includes '+form,()=>assert.match(js,new RegExp(form)));
test('escapes user-entered content',()=>assert.match(js,/const safe=/));
test('demo has no network requests or persistent storage',()=>{assert.doesNotMatch(js,/\\bfetch\\s*\\(|localStorage|sessionStorage|XMLHttpRequest/)});
