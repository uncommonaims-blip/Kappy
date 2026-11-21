import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workspace=readFileSync(new URL('../live-workspace.js',import.meta.url),'utf8');
const auth=readFileSync(new URL('../auth.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('live workspace is mounted only for a signed-in user',()=>{
 assert.match(auth,/mountLiveWorkspace\(supabase,liveHost,user\)/);
 assert.match(workspace,/if \(!user\) return/);
});
test('all live records are scoped to the selected team',()=>{
 for(const table of ['kappy_calendar_entries','kappy_messages','kappy_wellbeing']){
  assert.match(workspace,new RegExp("from\\('"+table+"'\\)\\.select\\([\\s\\S]*?\\)\\.eq\\('team_id',teamId\\)"));
 }
});
test('live writes use the authenticated user identity and team',()=>{
 assert.match(workspace,/created_by:user\.id/);
 assert.match(workspace,/author_id:user\.id/);
 assert.match(workspace,/team_id:teamId/);
});
test('beta clearly separates synchronized records from demo panels',()=>{
 assert.match(html,/id="live-workspace"/);
 assert.match(html,/Live team workspace\. Use synthetic data only until beta security approval/);
 assert.match(html,/\.tabs,#panel\{display:none!important\}/);
 assert.match(workspace,/\['calendar','Calendar'\]/);
 assert.match(workspace,/\['payroll','My Hours'\]/);
 assert.match(workspace,/\['home','Home'\]/);
 assert.match(workspace,/kappy-home-choice/);
});
test('workspace never uses service role or innerHTML for server content',()=>{
 assert.doesNotMatch(workspace,/service_role|serviceRole|innerHTML/);
});
