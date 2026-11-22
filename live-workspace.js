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
  let chatSubscription=null;
  async function refresh(){
    if(chatSubscription){client.removeChannel(chatSubscription);chatSubscription=null}
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
        call(client.from('kappy_messages').select('id,body,channel,created_at').eq('team_id',teamId).is('conversation_id',null).order('created_at',{ascending:false}).limit(30)),
        call(client.from('kappy_wellbeing').select('id,observed_on,steps,mood').eq('team_id',teamId).order('observed_on',{ascending:false}).limit(15))
      ]);
      const section=(heading,items,formatter)=>{const s=el('section');s.append(el('h3',heading));const ul=el('ul');for(const x of items)ul.append(el('li',formatter(x)));if(!items.length)ul.append(el('li','No records yet'));s.append(ul);panes[heading==='Upcoming care-circle events'?'calendar':heading==='Team messages'?'messages':'wellbeing'].append(s);return s};
      // Single-surface calendar: tap for details, hold to choose a range, then tap an action.
      const calendarPane=panes.calendar;
      const monthCard=el('section');monthCard.className='care-month-card kappy-compact-calendar';
      calendarPane.append(monthCard);
      let rangeStart=null,rangeEnd=null,rangeArmed=false,expandedDay=null,holdTimer=null,holdTriggered=false;
      const calendarStatus=el('p');calendarStatus.className='kappy-calendar-status';calendarStatus.setAttribute('role','status');
      const detail=el('div');detail.className='care-day-detail kappy-calendar-detail';
      const actions=el('div');actions.className='kappy-calendar-actions';
      const isoDay=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const pretty=key=>new Date(key+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
      function matching(key){return entries.filter(x=>x.starts_at.slice(0,10)<=key&&x.ends_at.slice(0,10)>=key)}
      function chooseDay(key){
        if(rangeArmed&&rangeStart){
          rangeEnd=key<rangeStart?rangeStart:key;
          if(key<rangeStart)rangeStart=key;
          rangeArmed=false;selectedDay=key;expandedDay=null;
        }else if(selectedDay===key){expandedDay=expandedDay===key?null:key}
        else{selectedDay=key;rangeStart=null;rangeEnd=null;expandedDay=null}
        drawMonth();
      }
      function armRange(key){selectedDay=key;rangeStart=key;rangeEnd=null;rangeArmed=true;expandedDay=null;drawMonth()}
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
          const key=isoDay(new Date(viewMonth.getFullYear(),viewMonth.getMonth(),day));
          const btn=el('button',String(day));btn.type='button';btn.className='care-day';btn.dataset.liveDate=key;
          btn.setAttribute('aria-label',pretty(key)+'; long press to start date range');
          if(key===selectedDay)btn.classList.add('selected');
          if(key===isoDay(new Date()))btn.classList.add('today');
          if(rangeStart&&rangeEnd&&key>=rangeStart&&key<=rangeEnd)btn.classList.add('kappy-range-day');
          if(key===rangeStart)btn.classList.add('kappy-range-start');
          if(key===rangeEnd)btn.classList.add('kappy-range-end');
          if(rangeArmed&&key===rangeStart)btn.classList.add('kappy-range-armed');
          if(matching(key).length){const dot=el('span');dot.className='care-event-dot';btn.append(dot)}
          btn.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;holdTriggered=false;clearTimeout(holdTimer);holdTimer=setTimeout(()=>{holdTriggered=true;armRange(key)},550)});
          for(const event of ['pointerup','pointercancel','pointerleave'])btn.addEventListener(event,()=>clearTimeout(holdTimer));
          btn.addEventListener('contextmenu',e=>{e.preventDefault();clearTimeout(holdTimer);holdTriggered=true;armRange(key)});
          btn.addEventListener('click',()=>{if(holdTriggered){holdTriggered=false;return}chooseDay(key)});
          grid.append(btn);
        }
        monthCard.append(grid);
        detail.replaceChildren();
        const selected=selectedDay||isoDay(new Date());
        const matches=matching(selected);
        const summary=el('div');summary.className='kappy-calendar-summary';
        const summaryText=el('span',pretty(selected)+' · '+(matches.length?matches.length+' item'+(matches.length===1?'':'s'):'Nothing scheduled'));
        const more=el('button',expandedDay===selected?'Less':'Info');more.type='button';more.setAttribute('aria-label','Show details for '+pretty(selected));more.onclick=()=>{expandedDay=expandedDay===selected?null:selected;drawMonth()};
        summary.append(summaryText,more);detail.append(summary);
        if(expandedDay===selected){for(const item of matches)detail.append(el('p',(item.title||item.kind)+' · '+item.kind+' · '+item.status));if(!matches.length)detail.append(el('p','No team entries on this date.'))}
        monthCard.append(detail);
        calendarStatus.textContent=rangeArmed?'Range started: '+pretty(rangeStart)+'. Tap an end date.':rangeStart&&rangeEnd?'Selected '+pretty(rangeStart)+' through '+pretty(rangeEnd):'Tap a day to select it. Hold a day to select a date range.';
        monthCard.append(calendarStatus,actions);
      }
      let saving=false;
      for(const [kind,label] of [['available','Available'],['unavailable','Unavailable'],['request','Request']]){
        const button=el('button',label);button.type='button';button.className='kappy-calendar-action';
        button.onclick=async()=>{
          if(saving)return;
          const start=rangeStart||selectedDay,end=rangeEnd||start;
          if(!start){calendarStatus.textContent='Choose a date first.';return}
          saving=true;for(const b of actions.querySelectorAll('button'))b.disabled=true;
          calendarStatus.textContent='Saving '+label.toLowerCase()+'…';
          try{
            await call(client.from('kappy_calendar_entries').insert({team_id:teamId,created_by:user.id,kind,starts_at:new Date(start+'T00:00:00').toISOString(),ends_at:new Date(end+'T23:59:59').toISOString(),title:label,status:kind==='request'?'pending':'recorded'}));
            rangeStart=null;rangeEnd=null;rangeArmed=false;
            await refresh();
          }catch(err){calendarStatus.textContent='Could not save: '+err.message}
          finally{saving=false;for(const b of actions.querySelectorAll('button'))b.disabled=false}
        };
        actions.append(button);
      }
      const eventDetails=el('details');eventDetails.className='care-action-details kappy-event-details';
      const eventForm=el('form');const eventDate=el('input');eventDate.type='date';eventDate.required=true;eventDate.value=selectedDay||isoDay(new Date());
      const eventTitle=el('input');eventTitle.required=true;eventTitle.maxLength=100;eventTitle.placeholder='Event title';eventTitle.setAttribute('aria-label','Event title');
      const eventSave=el('button','Save event');eventSave.type='submit';eventForm.append(eventDate,eventTitle,eventSave);
      eventDetails.append(el('summary','+ Other event'),eventForm);calendarPane.append(eventDetails);
      eventForm.addEventListener('submit',async e=>{e.preventDefault();eventSave.disabled=true;try{await call(client.from('kappy_calendar_entries').insert({team_id:teamId,created_by:user.id,kind:'event',starts_at:new Date(eventDate.value+'T12:00:00').toISOString(),ends_at:new Date(eventDate.value+'T13:00:00').toISOString(),title:eventTitle.value.trim()}));await refresh()}catch(err){calendarStatus.textContent='Event not saved: '+err.message}finally{eventSave.disabled=false}});
      drawMonth();
      // Live text-message style team chat. Only team channels are supported in this beta.
      const messages=el('section');messages.className='kappy-chat';panes.messages.append(messages);
      const chatHeader=el('div');chatHeader.className='kappy-chat-header';
      const chatTitle=el('h3','Team chat');
      const chatConnection=el('span','Connecting…');chatConnection.className='kappy-chat-connection';chatConnection.setAttribute('role','status');
      chatHeader.append(chatTitle,chatConnection);messages.append(chatHeader);
      const ch=el('select');ch.setAttribute('aria-label','Chat topic');
      for(const [value,label] of [['general','💬 General'],['nutrition','🍽️ Nutrition'],['sleep','🌙 Sleep']]){const o=el('option',label);o.value=value;o.selected=value===channel;ch.append(o)}
      const privateRooms=await call(client.from('kappy_conversations').select('id,title').eq('team_id',teamId));
      for(const room of privateRooms){const o=el('option','🔒 '+room.title);o.value='private:'+room.id;o.selected=o.value===channel;ch.append(o)}
      if(!Array.from(ch.options).some(o=>o.value===channel))channel='general';
      ch.value=channel;
      messages.append(ch);
      const create=el('details');create.append(el('summary','New private conversation'));
      const cf=el('form'), ct=el('input');ct.placeholder='Conversation name';ct.required=true;ct.maxLength=100;cf.append(ct);
      const participants=await call(client.from('kappy_members').select('user_id,role').eq('team_id',teamId));
      for(const member of participants.filter(m=>m.user_id!==user.id)){const label=el('label');const check=el('input');check.type='checkbox';check.value=member.user_id;label.append(check,document.createTextNode(member.user_id.slice(0,8)+' · '+member.role));cf.append(label)}
      const cb=el('button','Create conversation');cb.type='submit';const cs=el('p');cs.setAttribute('role','status');cf.append(cb,cs);create.append(cf);messages.append(create);
      cf.onsubmit=async e=>{e.preventDefault();cb.disabled=true;try{const ids=Array.from(cf.querySelectorAll('input:checked'),x=>x.value);if(!ids.length)throw Error('Select at least one participant');const id=await call(client.rpc('kappy_create_conversation',{p_team:teamId,p_title:ct.value.trim(),p_users:ids}));channel='private:'+id;await refresh()}catch(err){cs.textContent=err.message}finally{cb.disabled=false}};
      const privateId=topic=>topic.startsWith('private:')?topic.slice(8):null;
      const conversation=el('div');conversation.className='kappy-chat-conversation';conversation.setAttribute('role','log');conversation.setAttribute('aria-label','Team conversation');conversation.setAttribute('aria-live','polite');messages.append(conversation);
      const chatError=el('p');chatError.className='kappy-chat-error';chatError.setAttribute('role','status');messages.append(chatError);
      const mf=el('form');mf.className='kappy-chat-compose';
      const body=el('textarea');body.required=true;body.maxLength=5000;body.rows=2;body.placeholder='Message the care team…';body.setAttribute('aria-label','Type a message');
      const send=el('button','Send ➤');send.type='submit';mf.append(body,send);messages.append(mf);
      const seenMessages=new Set();
      const renderChat=(records)=>{
        conversation.replaceChildren();seenMessages.clear();
        if(!records.length){const empty=el('p','No messages yet. Say hello to your team!');empty.className='kappy-chat-empty';conversation.append(empty)}
        for(const record of records){
          if(seenMessages.has(record.id))continue;seenMessages.add(record.id);
          const bubble=el('div');bubble.className='kappy-chat-bubble '+(record.author_id===user.id?'mine':'theirs');
          const meta=el('small',(record.author_id===user.id?'You':'Caregiver')+' · '+new Date(record.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}));
          bubble.append(meta,el('p',record.body));conversation.append(bubble);
        }
        conversation.scrollTop=conversation.scrollHeight;
      };
      let chatRequest=0;
      const loadChat=async()=>{
        const request=++chatRequest;const topic=channel;
        try{
          const records=await call(client.from('kappy_messages').select('id,author_id,body,created_at').eq('team_id',teamId).match(privateId(topic)?{conversation_id:privateId(topic)}:{channel:topic}).filter('conversation_id',privateId(topic)?'not.is':'is',null).order('created_at',{ascending:false}).limit(100));
          if(request!==chatRequest||topic!==channel)return;
          renderChat(records.reverse());chatError.textContent='';
        }catch(err){if(request===chatRequest)chatError.textContent='Messages could not load. Please try again.'}
      };
      ch.onchange=()=>{channel=ch.value;loadChat()};
      mf.addEventListener('submit',async e=>{
        e.preventDefault();const text=body.value.trim();if(!text)return;
        const topic=channel;send.disabled=true;chatError.textContent='';
        try{
          await call(client.from('kappy_messages').insert({team_id:teamId,author_id:user.id,channel:privateId(topic)?'general':topic,conversation_id:privateId(topic),body:text}));
          body.value='';await loadChat();body.focus();
        }catch(err){chatError.textContent='Message not sent. Please check your connection and retry.'}
        finally{send.disabled=false}
      });
      body.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(typeof mf.requestSubmit==='function')mf.requestSubmit()}});
      await loadChat();
      if(typeof client.channel==='function'){
        chatSubscription=client.channel('kappy-chat-'+teamId+'-'+user.id)
          .on('postgres_changes',{event:'INSERT',schema:'public',table:'kappy_messages',filter:'team_id=eq.'+teamId},payload=>{
            if(payload.new&&(privateId(channel)?payload.new.conversation_id===privateId(channel):!payload.new.conversation_id&&payload.new.channel===channel))loadChat();
          })
          .subscribe(status=>{chatConnection.textContent=status==='SUBSCRIBED'?'● Live':status==='CHANNEL_ERROR'||status==='TIMED_OUT'?'Offline · reopen chat to retry':'Connecting…'});
      }else{chatConnection.textContent='Refresh to see new messages'}
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
