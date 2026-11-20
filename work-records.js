// Work Records beta. Never trust UI-only permissions: Supabase RLS is authoritative.
export async function mountWorkRecords(client,host,user,teamId){
 host.replaceChildren();
 const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x};
 const section=el('section');section.className='card';section.append(el('h2','Work records · weekly payroll'));host.append(section);
 const status=el('p','');status.setAttribute('role','status');section.append(status);
 const query=async p=>{const {data,error}=await p;if(error)throw error;return data};
 const monday=d=>{const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x.toISOString().slice(0,10)};
 const weekStart=monday(new Date()),weekEnd=new Date(weekStart+'T12:00:00');weekEnd.setDate(weekEnd.getDate()+7);
 const end=weekEnd.toISOString().slice(0,10);
 const form=(title,fields,action)=>{const f=el('form');f.append(el('h3',title));const inputs={};for(const [key,label,type,required] of fields){const wrap=el('label',label+' '),i=el('input');i.type=type;i.required=required;i.setAttribute('aria-label',label);if(type==='number'){i.min='0';i.step='0.25'}if(type==='date')i.value=new Date().toISOString().slice(0,10);wrap.append(i);f.append(wrap);inputs[key]=i}const b=el('button','Save '+title.toLowerCase());b.type='submit';f.append(b);f.addEventListener('submit',async e=>{e.preventDefault();b.disabled=true;try{await action(Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.value])));await mountWorkRecords(client,host,user,teamId)}catch(err){status.textContent=err.message}finally{b.disabled=false}});section.append(f)};
 try{
 const [members,work,expenses,submissions]=await Promise.all([
 query(client.from('kappy_members').select('user_id,role').eq('team_id',teamId)),
 query(client.from('kappy_work_entries').select('worker_id,category,hours,hourly_rate,work_date').eq('team_id',teamId).gte('work_date',weekStart).lt('work_date',end)),
 query(client.from('kappy_expenses').select('id,worker_id,category,amount,spent_on,description,receipt_path').eq('team_id',teamId).gte('spent_on',weekStart).lt('spent_on',end)),
 query(client.from('kappy_weekly_submissions').select('worker_id').eq('team_id',teamId).eq('week_start',weekStart))
 ]);
 const role=members.find(m=>m.user_id===user.id)?.role;
 const manager=role==='admin'||role==='payroll_manager';
 const money=n=>'$'+n.toFixed(2);
 section.append(el('p','Week of '+weekStart+' · 168 coverage hours available'));
 const rows=manager?members:members.filter(m=>m.user_id===user.id);
 const table=el('table'),head=el('tr');for(const h of ['Worker','Coverage','Extra','Labor','Groceries','Total','Submitted'])head.append(el('th',h));table.append(head);
 let coverage=0,extra=0,labor=0,reimb=0;
 for(const m of rows){const w=work.filter(x=>x.worker_id===m.user_id),e=expenses.filter(x=>x.worker_id===m.user_id);
 const c=w.filter(x=>x.category==='coverage').reduce((s,x)=>s+Number(x.hours),0),a=w.filter(x=>x.category!=='coverage').reduce((s,x)=>s+Number(x.hours),0),l=w.reduce((s,x)=>s+Number(x.hours)*Number(x.hourly_rate),0),g=e.filter(x=>x.category==='groceries').reduce((s,x)=>s+Number(x.amount),0),other=e.filter(x=>x.category!=='groceries').reduce((s,x)=>s+Number(x.amount),0);
 coverage+=c;extra+=a;labor+=l;reimb+=g+other;
 const tr=el('tr');for(const v of [m.user_id===user.id?'You':m.user_id.slice(0,8),c.toFixed(2),a.toFixed(2),money(l),money(g),money(l+g+other),submissions.some(x=>x.worker_id===m.user_id)?'Yes':'No'])tr.append(el('td',v));table.append(tr)}
 section.append(table);
 section.append(el('p','Coverage: '+coverage.toFixed(2)+' / 168 hours · '+(168-coverage).toFixed(2)+' hours remaining'));
 if(coverage>168)section.append(el('p','Review: coverage exceeds 168 hours. Check overlapping shifts.'));
 section.append(el('p','Additional labor: '+extra.toFixed(2)+' hours · Labor '+money(labor)+' · Reimbursements '+money(reimb)+' · Grand total '+money(labor+reimb)));
 if(role!=='payroll_manager'){
 form('Work hours',[['work_date','Work date','date',true],['hours','Hours','number',true],['hourly_rate','Hourly rate ($)','number',true],['notes','Notes','text',false]],async v=>query(client.from('kappy_work_entries').insert({...v,hours:Number(v.hours),hourly_rate:Number(v.hourly_rate),category:document.getElementById('kappy-work-type')?.value||'coverage',team_id:teamId,worker_id:user.id})));
 const type=el('select');type.id='kappy-work-type';type.setAttribute('aria-label','Work type');for(const t of ['coverage','groceries','errand','other']){const o=el('option',t);o.value=t;type.append(o)}section.querySelector('form').prepend(type);
 form('Expense',[['spent_on','Date','date',true],['amount','Amount ($)','number',true],['description','Description','text',true]],async v=>{
 const file=document.getElementById('kappy-receipt-file')?.files?.[0];
 let receipt_path=null;
 if(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5242880)throw Error('Receipt must be a JPEG, PNG or WebP under 5 MB');
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
  receipt_path=teamId+'/'+user.id+'/'+crypto.randomUUID()+'.'+ext;
  const {error}=await client.storage.from('kappy-receipts').upload(receipt_path,file,{contentType:file.type,upsert:false});
  if(error)throw error;
 }
 try{await query(client.from('kappy_expenses').insert({...v,amount:Number(v.amount),category:document.getElementById('kappy-expense-type')?.value||'groceries',team_id:teamId,worker_id:user.id,receipt_path}))}
 catch(err){if(receipt_path)await client.storage.from('kappy-receipts').remove([receipt_path]);throw err}
});
 const expenseType=el('select');expenseType.id='kappy-expense-type';expenseType.setAttribute('aria-label','Expense type');for(const t of ['groceries','supplies','other']){const o=el('option',t);o.value=t;expenseType.append(o)}section.querySelectorAll('form')[1].prepend(expenseType);
 const uploadLabel=el('label','Receipt photo (optional, JPEG/PNG/WebP, max 5 MB) '),upload=el('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.id='kappy-receipt-file';upload.setAttribute('aria-label','Receipt photo');uploadLabel.append(upload);section.querySelectorAll('form')[1].insertBefore(uploadLabel,section.querySelectorAll('form')[1].lastChild);
 const submit=el('button',submissions.some(x=>x.worker_id===user.id)?'Week submitted':'Submit this week');submit.disabled=submissions.some(x=>x.worker_id===user.id);submit.addEventListener('click',async()=>{try{await query(client.from('kappy_weekly_submissions').insert({team_id:teamId,worker_id:user.id,week_start:weekStart}));await mountWorkRecords(client,host,user,teamId)}catch(err){status.textContent=err.message}});section.append(submit);
 }
 const archive=el('section');archive.append(el('h3','Expense and receipt archive'));
 for(const e of expenses){const line=el('p',e.spent_on+' · '+e.category+' · '+money(Number(e.amount))+' · '+(e.description||'No description')+' ');
 if(e.receipt_path){const btn=el('button','View receipt');btn.type='button';btn.addEventListener('click',async()=>{btn.disabled=true;try{const {data,error}=await client.storage.from('kappy-receipts').createSignedUrl(e.receipt_path,60);if(error)throw error;window.open(data.signedUrl,'_blank','noopener,noreferrer')}catch(err){status.textContent='Receipt unavailable: '+err.message}finally{btn.disabled=false}});line.append(btn)}archive.append(line)}
 if(!expenses.length)archive.append(el('p','No expenses recorded for this week'));section.append(archive);
 section.append(el('p','Sunday noon notifications are not enabled yet. Use synthetic test receipts only until beta security review is complete.'));
 }catch(err){status.textContent='Work records unavailable: '+err.message}
}
