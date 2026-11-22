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
      select.addEventListener('change',()=>{teamId=select.value;refresh()});label.append(select);label.className='kappy-team-picker';if(teams.length>1)root.append(label);
      const welcome=el('div');welcome.className='care-welcome';welcome.append(el('span','Care for'),el('strong',teams.find(t=>t.id===teamId)?.name||'Your team'));root.append(welcome);
      const nav=el('nav');nav.className='kappy-live-nav';nav.setAttribute('aria-label','Care circle sections');
      const panes={};const content=el('div');root.append(content,nav);
      for(const [id,name] of [['home','Home'],['calendar','Calendar'],['messages','Messages'],['wellbeing','Care Notes'],['payroll','My Hours'],['people','Team']]){
        const button=el('button',name);button.type='button';button.dataset.liveTab=id;
        button.addEventListener('click',()=>{activeTab=id;activate()});nav.append(button);
        const pane=el('section');pane.className='care-pane';pane.dataset.pane=id;content.append(pane);panes[id]=pane;
      }
      function activate(){for(const [id,pane] of Object.entries(panes))pane.hidden=id!==activeTab;for(const b of nav.querySelectorAll('button')){const selected=b.dataset.liveTab===activeTab;b.setAttribute('aria-current',selected?'page':'false');b.classList.toggle('active',selected)}window.scrollTo?.(0,0)}
      activate();
      // Four clear entry points, with the existing live screens one tap away.
      const home=panes.home;
      const intro=el('section');intro.className='kappy-home-intro';
      intro.append(el('h2','What would you like to do?'));
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
      const wellbeing=section('Recent check-ins',checks,x=>x.observed_on+' · '+(x.mood||'Mood not recorded')+(x.steps==null?'':' · '+x.steps+' steps'));
      // Tap & Track: fast, timestamped activities, with per-caregiver display preferences.
      const activityPanel=el('section');activityPanel.className='kappy-activity-panel';
      activityPanel.append(el('h3','Tap & Track'),el('p','Tap what happened. Kappy records the time automatically.'));
      const activityGrid=el('div');activityGrid.className='kappy-activity-grid';
      const activityStatus=el('p');activityStatus.setAttribute('role','status');activityStatus.className='kappy-activity-status';
      const activityLog=el('div');activityLog.className='kappy-activity-log';
      const activityKey='kappy-custom-activities:'+user.id+':'+teamId;
      let customActivities=[];try{const parsed=JSON.parse(localStorage.getItem(activityKey)||'[]');if(Array.isArray(parsed))customActivities=parsed.filter(x=>x&&typeof x.label==='string'&&typeof x.key==='string').slice(0,12)}catch{}
      const standardActivities=[
        {key:'outside',label:'Went outside',emoji:'🌳',symbol:'♧'},
        {key:'water',label:'Had water',emoji:'💧',symbol:'◉'},
        {key:'meal',label:'Ate a meal',emoji:'🍽️',symbol:'▤'},
        {key:'walk',label:'Went for a walk',emoji:'🚶',symbol:'➜'},
        {key:'nap',label:'Had a nap',emoji:'😴',symbol:'☾'},
        {key:'medication',label:'Medication',emoji:'💊',symbol:'✚'}
      ];
      let activityBusy=false;
      const addActivity=el('button','＋ Add a button');addActivity.type='button';addActivity.className='kappy-activity-add';
      const customForm=el('form');customForm.className='kappy-custom-activity';customForm.hidden=true;
      const customName=el('input');customName.placeholder='Activity name';customName.maxLength=70;customName.required=true;customName.setAttribute('aria-label','New activity name');
      const customSave=el('button','Add activity');customSave.type='submit';customForm.append(customName,customSave);
      addActivity.onclick=()=>{customForm.hidden=!customForm.hidden;if(!customForm.hidden)customName.focus()};
      customForm.onsubmit=e=>{e.preventDefault();const label=customName.value.trim();if(!label)return;if(customActivities.length>=12){activityStatus.textContent='Maximum 12 custom buttons';return}const key='custom_'+Math.random().toString(36).slice(2,10);customActivities.push({key,label,emoji:'⭐',symbol:'☆'});try{localStorage.setItem(activityKey,JSON.stringify(customActivities))}catch{}customName.value='';customForm.hidden=true;drawActivities()};
      const activityPrefKey='kappy-checkin-icons:'+user.id;
      const currentActivityStyle=()=>{try{return localStorage.getItem(activityPrefKey)==='classic'?'classic':'emoji'}catch{return 'emoji'}};
      function drawActivities(){
        activityGrid.replaceChildren();
        for(const item of [...standardActivities,...customActivities]){
          const button=el('button');button.type='button';button.className='kappy-activity-button';
          const symbol=el('span',currentActivityStyle()==='classic'?item.symbol:item.emoji);symbol.className=currentActivityStyle()==='classic'?'kappy-classic-symbol':'kappy-emoji-symbol';
          button.append(symbol,el('strong',item.label));
          button.onclick=async()=>{
            if(activityBusy)return;
            if(item.key==='medication'){
              activityStatus.textContent='Medication records require drug and dose confirmation. Use care notes until medication details are supported.';
              return;
            }
            activityBusy=true;button.disabled=true;activityStatus.textContent='Saving '+item.label+'…';
            try{
              const now=new Date().toISOString();
              await call(client.from('kappy_activity_events').insert({team_id:teamId,author_id:user.id,activity_key:item.key,activity_label:item.label,occurred_at:now}));
              activityStatus.textContent=item.label+' recorded at '+new Date(now).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
              await loadActivityLog();
            }catch(err){activityStatus.textContent='Not saved. Activity tracking needs beta database setup, or check your connection.'}
            finally{activityBusy=false;button.disabled=false}
          };
          activityGrid.append(button);
        }
      }
      async function loadActivityLog(){
        try{
          const events=await call(client.from('kappy_activity_events').select('activity_label,occurred_at').eq('team_id',teamId).order('occurred_at',{ascending:false}).limit(20));
          activityLog.replaceChildren(el('h4','Recent activity'));
          if(!events.length)activityLog.append(el('p','No activities recorded yet.'));
          for(const event of events){const line=el('p');line.append(el('strong',event.activity_label),document.createTextNode(' · '+new Date(event.occurred_at).toLocaleString()));activityLog.append(line)}
        }catch{activityLog.replaceChildren(el('p','Tap & Track is awaiting beta database setup.'))}
      }
      activityPanel.append(activityGrid,addActivity,customForm,activityStatus,activityLog);
      panes.wellbeing.prepend(activityPanel);
      drawActivities();loadActivityLog();
      const wf=el('form');wf.className='kappy-checkin-form';
      const preferenceKey='kappy-checkin-icons:'+user.id;
      let iconStyle='emoji';try{iconStyle=localStorage.getItem(preferenceKey)==='classic'?'classic':'emoji'}catch{}
      const displaySettings=el('div');displaySettings.className='kappy-icon-settings';
      const displayLabel=el('span','Icon style');const styleButtons=el('div');styleButtons.className='kappy-icon-style-options';styleButtons.setAttribute('role','group');styleButtons.setAttribute('aria-label','Check-in icon style');
      const moodOptions=el('div');moodOptions.className='kappy-mood-options';moodOptions.setAttribute('role','group');moodOptions.setAttribute('aria-label','Choose how Sylvie is feeling');
      const moodItems=[['😊','Good','good','sun'],['😐','Okay','okay','minus'],['😟','Not great','not great','cloud-rain']];
      let chosenMood='';
      const renderMood=()=>{
        moodOptions.replaceChildren();
        for(const [emoji,label,value,symbol] of moodItems){
          const option=el('button');option.type='button';option.className='kappy-mood-option';option.setAttribute('aria-pressed',String(chosenMood===value));option.classList.toggle('selected',chosenMood===value);
          const graphic=el('span',iconStyle==='emoji'?emoji:({sun:'☀',minus:'−','cloud-rain':'☁'}[symbol]));graphic.className=iconStyle==='emoji'?'kappy-emoji-symbol':'kappy-classic-symbol';
          option.append(graphic,el('strong',label));
          option.addEventListener('click',()=>{chosenMood=value;renderMood()});
          moodOptions.append(option);
        }
      };
      for(const [value,label] of [['emoji','😊 Emoji'],['classic','Kappy Classic']]){
        const button=el('button',label);button.type='button';button.className='kappy-style-choice';
        button.setAttribute('aria-pressed',String(iconStyle===value));
        button.addEventListener('click',()=>{iconStyle=value;try{localStorage.setItem(preferenceKey,value)}catch{};for(const b of styleButtons.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));renderMood();drawActivities()});
        styleButtons.append(button);
      }
      displaySettings.append(displayLabel,styleButtons);wf.append(displaySettings);
      const prompt=el('h3','How is Sylvie feeling?');wf.append(prompt);
      renderMood();
      wf.append(moodOptions);
      const dateLabel=el('label','Date');const observed=el('input');observed.type='date';observed.required=true;observed.value=new Date().toLocaleDateString('en-CA');dateLabel.append(observed);
      const stepsLabel=el('label','Steps (optional)');const steps=el('input');steps.type='number';steps.min=0;steps.max=200000;steps.placeholder='Leave blank if unknown';stepsLabel.append(steps);
      const more=el('details');more.className='kappy-checkin-more';more.append(el('summary','Add details (optional)'),dateLabel,stepsLabel);wf.append(more);
      const save=el('button','Save check-in');save.type='submit';save.className='kappy-checkin-save';wf.append(save);
      wellbeing.prepend(wf);
      wf.addEventListener('submit',async e=>{e.preventDefault();if(!chosenMood){const first=moodOptions.querySelector('button');first.focus();return}save.disabled=true;try{await call(client.from('kappy_wellbeing').insert({team_id:teamId,author_id:user.id,observed_on:observed.value,mood:chosenMood,steps:steps.value===''?null:Number(steps.value)}));await refresh()}catch(err){root.append(message('Check-in not saved: '+err.message))}finally{save.disabled=false}});
      await mountTeamNotifications(client,panes.calendar,user,teamId);
      const team=el('section');team.append(el('h3','Care circle members'));const memberData=await call(client.from('kappy_members').select('user_id,role').eq('team_id',teamId));for(const m of memberData){team.append(el('p',(m.user_id===user.id?'You':m.user_id.slice(0,8))+' · '+(m.role==='admin'?'Care Steward':m.role==='payroll_manager'?'Payroll Coordinator':'Caregiver')))}panes.people.append(team);
      const workHost=el('div');panes.payroll.append(workHost);await mountWorkRecords(client,workHost,user,teamId);
      const reload=el('button','Refresh shared records');reload.type='button';reload.addEventListener('click',refresh);root.append(reload);
    } catch(err){root.append(message('Shared workspace unavailable: '+err.message))}
  }
  refresh();
}
