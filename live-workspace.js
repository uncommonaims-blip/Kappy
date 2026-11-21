import {mountTeamNotifications} from './team-notifications.js';
import { mountWorkRecords } from "./work-records.js";
// Private beta workspace: all reads and writes use the signed-in Supabase session and RLS.
export function mountLiveWorkspace(client, host, user) {
  host.replaceChildren();
  if (!user) return;
  const root=document.createElement('section');
  root.className='card';
  root.setAttribute('aria-label','Live care team workspace');
  host.append(root);
  let teamId=null, channel='general', activeTab='home', viewMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1), selectedDay=null;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
  const message=text=>{const p=el('p',text);p.setAttribute('role','status');return p};
  async function call(promise){const {data,error}=await promise;if(error)throw error;return data}
  async function refresh(){
    root.replaceChildren();
    try {
      const teams=await call(client.from('kappy_teams').select('id,name').order('created_at'));
      if(!teams.length){
        root.append(message('No care team yet. Create one to start sharing records.'));
        const form=el('form');const name=el('input');name.required=true;name.maxLength=100;name.placeholder='Care team name';name.setAttribute('aria-label','Care team name');
        const button=el('button','Create team');button.type='submit';form.append(name,button);root.append(form);
        form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await call(client.rpc('kappy_create_team',{p_name:name.value.trim()}));await refresh()}catch(err){root.append(message('Could not create team: '+err.message))}finally{button.disabled=false}});
        return;
      }
      if(!teams.some(t=>t.id===teamId))teamId=teams[0].id;
      const label=el('label','Active team ');const select=el('select');select.setAttribute('aria-label','Active team');
      for(const t of teams){const opt=el('option',t.name);opt.value=t.id;opt.selected=t.id===teamId;select.append(opt)}
      select.addEventListener('change',()=>{teamId=select.value;refresh()});label.append(select);root.append(label);
      const welcome=el('div');welcome.className='care-welcome';welcome.append(el('span','YOUR CARE CIRCLE'),el('h2','Care happens together.'));root.append(welcome);
      const nav=el('nav');nav.className='kappy-live-nav';nav.setAttribute('aria-label','Care circle sections');
      const panes={};const content=el('div');root.append(content,nav);
      for(const [id,name] of [['home','Home'],['calendar','Calendar'],['messages','Messages'],['wellbeing','Care Notes'],['payroll','My Hours'],['people','Team']]){
        const button=el('button',name);button.type='button';button.dataset.liveTab=id;
        button.addEventListener('click',()=>{activeTab=id;activate()});nav.append(button);
        const pane=el('section');pane.className='care-pane';pane.dataset.pane=id;content.append(pane);panes[id]=pane;
      }
      function activate(){for(const [id,pane] of Object.entries(panes))pane.hidden=id!==activeTab;for(const b of nav.querySelectorAll('button')){const selected=b.dataset.liveTab===activeTab;b.setAttribute('aria-current',selected?'page':'false');b.classList.toggle('active',selected)}window.scrollTo?.(0,0)}
      activate();
      const [entries,posts,checks]=await Promise.all([
        call(client.from('kappy_calendar_entries').select('id,title,kind,starts_at,ends_at,status').eq('team_id',teamId).order('starts_at',{ascending:false}).limit(25)),
        call(client.from('kappy_messages').select('id,body,channel,created_at').eq('team_id',teamId).order('created_at',{ascending:false}).limit(30)),
        call(client.from('kappy_wellbeing').select('id,observed_on,steps,mood').eq('team_id',teamId).order('observed_on',{ascending:false}).limit(15))
      ]);
      const section=(heading,items,formatter)=>{const s=el('section');s.append(el('h3',heading));const ul=el('ul');for(const x of items)ul.append(el('li',formatter(x)));if(!items.length)ul.append(el('li','No records yet'));s.append(ul);panes[heading==='Upcoming care-circle events'?'calendar':heading==='Team messages'?'messages':'wellbeing'].append(s);return s};
      const calendar=section('Upcoming care-circle events',entries,x=>x.starts_at.slice(0,10)+' · '+x.kind+' · '+(x.title||'Untitled')+' ('+x.status+')');
      // Real monthly calendar. Day dots and details are drawn from persisted team events.
      const monthCard=el('section');monthCard.className='care-month-card';panes.calendar.prepend(monthCard);
      function drawMonth(){
        monthCard.replaceChildren();
        const heading=el('div');heading.className='care-month-heading';
        const prev=el('button','‹'),next=el('button','›');prev.type=next.type='button';
        prev.setAttribute('aria-label','Previous month');next.setAttribute('aria-label','Next month');
        const monthTitle=el('h3',viewMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'}));
        prev.onclick=()=>{viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()-1,1);drawMonth()};
        next.onclick=()=>{viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,1);drawMonth()};
        heading.append(prev,monthTitle,next);monthCard.append(heading);
        const grid=el('div');grid.className='care-month-grid';
        for(const d of ['S','M','T','W','T','F','S']){const label=el('span',d);label.className='care-weekday';grid.append(label)}
        const offset=viewMonth.getDay(),days=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,0).getDate();
        for(let i=0;i<offset;i++)grid.append(el('span'));
        for(let day=1;day<=days;day++){
          const key=viewMonth.getFullYear()+'-'+String(viewMonth.getMonth()+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
          const btn=el('button',String(day));btn.type='button';btn.className='care-day';
          btn.dataset.liveDate=key;btn.setAttribute('aria-label',key);
          if(key===selectedDay)btn.classList.add('selected');
          if(key===new Date().toLocaleDateString('en-CA'))btn.classList.add('today');
          if(entries.some(x=>x.starts_at.slice(0,10)<=key&&x.ends_at.slice(0,10)>=key)){const dot=el('span');dot.className='care-event-dot';btn.append(dot)}
          btn.onclick=()=>{selectedDay=key;date.value=key;drawMonth()};
          grid.append(btn);
        }
        monthCard.append(grid);
        if(selectedDay){const detail=el('div');detail.className='care-day-detail';detail.append(el('strong',new Date(selectedDay+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})));const matches=entries.filter(x=>x.starts_at.slice(0,10)<=selectedDay&&x.ends_at.slice(0,10)>=selectedDay);detail.append(el('p',matches.length?matches.map(x=>x.title||x.kind).join(' · '):'No events on this date'));monthCard.append(detail)}
      }
      const cf=el('form');const date=el('input');date.type='date';date.required=true;date.setAttribute('aria-label','Calendar date');const title=el('input');title.placeholder='Event title';title.required=true;title.maxLength=100;title.setAttribute('aria-label','Event title');const add=el('button','Add shared event');add.type='submit';cf.append(date,title,add);const addDetails=el('details');addDetails.className='care-action-details';const addSummary=el('summary','+ Add calendar event');addDetails.append(addSummary,cf);panes.calendar.insertBefore(addDetails,calendar);drawMonth();
      cf.addEventListener('submit',async e=>{e.preventDefault();add.disabled=true;try{const starts_at=date.value+'T12:00:00';const ends_at=date.value+'T13:00:00';await call(client.from('kappy_calendar_entries').insert({team_id:teamId,created_by:user.id,kind:'event',starts_at:new Date(starts_at).toISOString(),ends_at:new Date(ends_at).toISOString(),title:title.value.trim()}));await refresh()}catch(err){root.append(message('Event not saved: '+err.message))}finally{add.disabled=false}});
      const messages=section('Team messages',posts.filter(p=>p.channel===channel),x=>new Date(x.created_at).toLocaleString()+' · '+x.body);
      const ch=el('select');ch.setAttribute('aria-label','Message channel');for(const value of ['general','nutrition','sleep']){const o=el('option',value);o.value=value;o.selected=value===channel;ch.append(o)}ch.addEventListener('change',()=>{channel=ch.value;refresh()});messages.prepend(ch);
      const mf=el('form');const body=el('textarea');body.required=true;body.maxLength=5000;body.placeholder='Message your team';body.setAttribute('aria-label','Message');const send=el('button','Send message');send.type='submit';mf.append(body,send);messages.append(mf);
      mf.addEventListener('submit',async e=>{e.preventDefault();send.disabled=true;try{await call(client.from('kappy_messages').insert({team_id:teamId,author_id:user.id,channel,body:body.value.trim()}));await refresh()}catch(err){root.append(message('Message not sent: '+err.message))}finally{send.disabled=false}});
      const wellbeing=section('Test check-ins',checks,x=>x.observed_on+' · '+(x.steps??'No steps')+' steps · '+(x.mood??'No mood'));
      const wf=el('form');const observed=el('input');observed.type='date';observed.required=true;observed.setAttribute('aria-label','Observation date');const steps=el('input');steps.type='number';steps.min=0;steps.max=200000;steps.placeholder='Steps';steps.setAttribute('aria-label','Steps');const save=el('button','Save test check-in');save.type='submit';wf.append(observed,steps,save);const checkDetails=el('details');checkDetails.className='care-action-details';checkDetails.append(el('summary','+ New check-in'),wf);wellbeing.append(checkDetails);
      wf.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{await call(client.from('kappy_wellbeing').insert({team_id:teamId,author_id:user.id,observed_on:observed.value,steps:steps.value===''?null:Number(steps.value)}));await refresh()}catch(err){root.append(message('Check-in not saved: '+err.message))}finally{save.disabled=false}});
      await mountTeamNotifications(client,panes.calendar,user,teamId);
      const team=el('section');team.append(el('h3','Care circle members'));const memberData=await call(client.from('kappy_members').select('user_id,role').eq('team_id',teamId));for(const m of memberData){team.append(el('p',(m.user_id===user.id?'You':m.user_id.slice(0,8))+' · '+(m.role==='admin'?'Care Steward':m.role==='payroll_manager'?'Payroll Coordinator':'Caregiver')))}panes.people.append(team);
      const workHost=el('div');panes.payroll.append(workHost);await mountWorkRecords(client,workHost,user,teamId);
      // Four clear entry points, with the existing live screens one tap away.
      const home=panes.home;
      const intro=el('section');intro.className='kappy-home-intro';
      intro.append(el('p','WELCOME HOME'),el('h2','What would you like to do?'),el('p','Choose one. We’ll take it from there.'));
      home.append(intro);
      const choices=el('div');choices.className='kappy-home-choices';
      for(const [id,icon,label,hint] of [
        ['calendar','📅','Calendar',"See who's working"],
        ['messages','💬','Messages','Talk to the team'],
        ['wellbeing','❤️','Care Notes','Record a check-in'],
        ['payroll','🕒','My Hours','Record work and expenses']
      ]){
        const b=el('button');b.type='button';b.className='kappy-home-choice';
        const symbol=el('span',icon);symbol.className='kappy-home-symbol';
        const name=el('strong',label);const sub=el('small',hint);
        b.append(symbol,name,sub);b.addEventListener('click',()=>{activeTab=id;activate()});choices.append(b);
      }
      home.append(choices);
      const help=el('p','Need to see the team? Tap Team below.');help.className='kappy-home-help';home.append(help);
      const reload=el('button','Refresh shared records');reload.type='button';reload.addEventListener('click',refresh);root.append(reload);
    } catch(err){root.append(message('Shared workspace unavailable: '+err.message))}
  }
  refresh();
}
