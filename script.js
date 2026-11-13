/* Kappy: intentionally local-only, fictional prototype data. */
const shifts=[{day:"Today",time:"8:00 AM – 4:00 PM",name:"Jamie"},{day:"Tomorrow",time:"4:00 PM – 10:00 PM",name:"Alex"},{day:"Friday",time:"8:00 AM – 4:00 PM",name:"Morgan"}];
const tasks=[{id:"water",label:"Offer water throughout the morning"},{id:"walk",label:"Enjoy a short walk or garden visit"},{id:"meal",label:"Prepare lunch and check dietary preferences"}];
const updates=[{author:"Jamie",when:"Today · 10:15 AM",body:"Rose enjoyed sitting by the window and talking about the garden."},{author:"Alex",when:"Yesterday · 5:40 PM",body:"Added fresh flowers to the kitchen table."}];
const people=[["Rose","Care recipient"],["Jamie","Caregiver"],["Alex","Caregiver"],["Morgan","Caregiver"],["Taylor","Family member"],["Sam","Family member"]];
const panel=document.getElementById("panel");let active="home";const completed=new Set();
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function card(title,body,extra=""){return '<section class="card '+extra+'"><h3>'+title+'</h3>'+body+'</section>';}
function shiftList(){return shifts.map(s=>'<div class="entry"><strong>'+esc(s.day)+' · '+esc(s.time)+'</strong><small>'+esc(s.name)+' · Scheduled</small></div>').join("");}
function taskList(){return tasks.map(t=>'<label class="check"><input type="checkbox" data-task="'+esc(t.id)+'" '+(completed.has(t.id)?"checked":"")+'><span>'+esc(t.label)+'</span></label>').join("");}
function updateList(){return updates.map(u=>'<div class="entry"><strong>'+esc(u.author)+'</strong><small>'+esc(u.when)+'</small><p>'+esc(u.body)+'</p></div>').join("");}
function render(){document.querySelectorAll("[data-tab]").forEach(b=>{if(b.dataset.tab===active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});let html="";
if(active==="home")html='<div class="grid">'+card("Next shifts",shiftList()+'<button class="button secondary" data-go="schedule">See schedule</button>')+card("Today’s care",taskList()+'<p><span class="tag">Demo checklist</span></p>')+card("Latest updates",updateList(),"full")+'</div>';
if(active==="schedule")html='<div class="grid">'+card("Upcoming shifts",shiftList(),"full")+card("Coverage requests","<p>Shift swaps and coverage requests will be designed together during ideation.</p><span class='tag'>Planned feature</span>","full")+'</div>';
if(active==="tasks")html='<div class="grid">'+card("Daily care checklist",taskList()+'<p>Changes reset when you reload this prototype.</p>',"full")+card("Care preferences","<p>Preferences, routines, and instructions will be permission-controlled in the production application.</p>","full")+'</div>';
if(active==="notes")html='<div class="grid">'+card("Circle updates",updateList(),"full")+card("Add a demo update",'<form id="update-form"><label for="note">Update</label><div class="formrow"><textarea id="note" name="note" maxlength="500" rows="3" required placeholder="Share a fictional update..."></textarea></div><button class="button" type="submit">Add update locally</button></form>',"full")+'</div>';
if(active==="people")html='<div class="grid">'+card("Circle members",people.map(p=>'<div class="entry"><strong>'+esc(p[0])+'</strong><small>'+esc(p[1])+'</small></div>').join(""),"full")+card("Invitations","<p>Inviting caregivers and family will require authentication and access controls. Not enabled in this demo.</p>","full")+'</div>';
panel.innerHTML=html;}
document.addEventListener("click",e=>{const b=e.target.closest("[data-tab],[data-go]");if(!b)return;active=b.dataset.tab||b.dataset.go;render();});
document.addEventListener("change",e=>{if(!e.target.matches("[data-task]"))return;const id=e.target.dataset.task;if(e.target.checked)completed.add(id);else completed.delete(id);});
document.addEventListener("submit",e=>{if(e.target.id!=="update-form")return;e.preventDefault();const note=e.target.elements.note.value.trim();if(!note)return;updates.unshift({author:"You (demo)",when:"Just now · local only",body:note});render();});
window.addEventListener("hashchange",()=>{if(location.hash==="#home"){active="home";render();}});render();