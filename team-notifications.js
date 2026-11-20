export async function mountTeamNotifications(client,root,user,teamId){
 const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x};
 const box=el('section');box.className='card';box.append(el('h3','Notifications and schedule approvals'));root.append(box);
 const status=el('p','');status.setAttribute('role','status');box.append(status);
 const fetch=async q=>{const {data,error}=await q;if(error)throw error;return data};
 try{
 const [members,notifications,requests]=await Promise.all([
 fetch(client.from('kappy_members').select('user_id,role').eq('team_id',teamId)),
 fetch(client.from('kappy_notifications').select('id,title,body,created_at,read_at').eq('team_id',teamId).order('created_at',{ascending:false}).limit(30)),
 fetch(client.from('kappy_calendar_entries').select('id,title,starts_at,ends_at,created_by,status').eq('team_id',teamId).eq('kind','request').eq('status','pending').order('created_at',{ascending:false}).limit(30))
 ]);
 const role=members.find(m=>m.user_id===user.id)?.role;const admin=role==='admin';
 box.append(el('p',notifications.filter(n=>!n.read_at).length+' unread notification(s)'));
 for(const n of notifications){const row=el('p',(n.read_at?'✓ ':'● ')+n.title+' · '+n.body+' · '+new Date(n.created_at).toLocaleString());box.append(row);if(!n.read_at){const b=el('button','Mark read');b.type='button';b.onclick=async()=>{b.disabled=true;try{await fetch(client.from('kappy_notifications').update({read_at:new Date().toISOString()}).eq('id',n.id));row.remove();}catch(e){status.textContent=e.message;b.disabled=false}};row.append(b)}}
 if(!notifications.length)box.append(el('p','No notifications yet'));
 const f=el('form');f.append(el('h4','Request schedule change'));const title=el('input'),start=el('input'),end=el('input');title.placeholder='Reason or request';title.required=true;title.maxLength=100;start.type='date';end.type='date';start.required=true;end.required=true;for(const [label,input] of [['Request',title],['First day',start],['Last day',end]]){const wrap=el('label',label+' ');wrap.append(input);f.append(wrap)}const send=el('button','Submit request');send.type='submit';f.append(send);box.append(f);
 f.onsubmit=async e=>{e.preventDefault();send.disabled=true;try{if(end.value<start.value)throw Error('End date must not precede start date');await fetch(client.from('kappy_calendar_entries').insert({team_id:teamId,created_by:user.id,kind:'request',status:'pending',title:title.value.trim(),starts_at:new Date(start.value+'T12:00:00Z').toISOString(),ends_at:new Date(end.value+'T13:00:00Z').toISOString()}));status.textContent='Request submitted to manager';f.reset()}catch(err){status.textContent=err.message}finally{send.disabled=false}};
 if(admin){box.append(el('h4','Pending schedule requests ('+requests.length+')'));for(const r of requests){const row=el('p',(r.title||'Request')+' · '+r.starts_at.slice(0,10)+' to '+r.ends_at.slice(0,10));for(const decision of ['approved','declined']){const b=el('button',decision==='approved'?'Approve':'Decline');b.type='button';b.onclick=async()=>{b.disabled=true;try{await fetch(client.from('kappy_calendar_entries').update({status:decision}).eq('id',r.id));row.remove()}catch(e){status.textContent=e.message;b.disabled=false}};row.append(b)}box.append(row)}}
 }catch(e){status.textContent='Notifications unavailable: '+e.message}
}
