// Google OAuth sign-in for the Kappy prototype. No care data is sent to Supabase yet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const preferenceKey="kappy-stay-signed-in", authKey="kappy-auth-session";
const remember=document.getElementById("stay-signed-in");
remember.checked=localStorage.getItem(preferenceKey)!=="false";
const storage={
 getItem(key){return sessionStorage.getItem(key)??localStorage.getItem(key)},
 setItem(key,value){const persistent=localStorage.getItem(preferenceKey)!=="false";const target=persistent?localStorage:sessionStorage;const other=persistent?sessionStorage:localStorage;target.setItem(key,value);other.removeItem(key)},
 removeItem(key){localStorage.removeItem(key);sessionStorage.removeItem(key)}
};
const supabase=createClient("https://qswyqcbunrdsiyyltdct.supabase.co","sb_publishable_z_9muNs_w-Odghw6ziVTfw_6fpO3n-e",{auth:{storage,storageKey:authKey,persistSession:true,detectSessionInUrl:true}});
const splash=document.getElementById("splash"),app=document.getElementById("kappy-app");
const splashStatus=document.getElementById("splash-status"),splashGoogle=document.getElementById("splash-google"),splashEnter=document.getElementById("splash-enter");
const status=document.getElementById("auth-status"),login=document.getElementById("google-login"),logout=document.getElementById("google-logout");
let entered=false,entryPending=false;
function enter(){if(entered)return;entered=true;app.hidden=false;splash.classList.add("dismissed");setTimeout(()=>{splash.hidden=true},550)}
splashEnter.addEventListener("click",enter);
remember.addEventListener("change",()=>{const existing=storage.getItem(authKey);localStorage.setItem(preferenceKey,String(remember.checked));if(existing)storage.setItem(authKey,existing)});
function show(session){
 const user=session?.user;
 login.hidden=!!user;logout.hidden=!user;
 status.textContent=user?"Signed in: "+(user.email||"Google account"):"Not signed in";
 splashStatus.textContent=user?"Welcome back"+(user.user_metadata?.name?", "+user.user_metadata.name.split(" ")[0]:"")+"!":"Welcome to Kappy";
 splashGoogle.hidden=!!user;splashEnter.hidden=!user;
 if(user&&!entered&&!entryPending){entryPending=true;setTimeout(()=>{entryPending=false;if(splashEnter.hidden===false)enter()},1900)}
 if(!user){entered=false;entryPending=false;app.hidden=true;splash.hidden=false;splash.classList.remove("dismissed")}
}
async function startLogin(){
 login.disabled=true;splashGoogle.disabled=true;
 status.textContent="Connecting to Google…";splashStatus.textContent="Connecting to Google…";
 try{const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+location.pathname}});if(error)throw error}
 catch(err){status.textContent="Google sign-in failed: "+err.message;splashStatus.textContent=status.textContent;login.disabled=false;splashGoogle.disabled=false}
}
login.addEventListener("click",startLogin);splashGoogle.addEventListener("click",startLogin);
logout.addEventListener("click",async()=>{
 logout.disabled=true;
 const {error}=await supabase.auth.signOut();
 if(error)status.textContent="Sign-out failed: "+error.message;
 logout.disabled=false;
});
supabase.auth.onAuthStateChange((_event,session)=>show(session));
supabase.auth.getSession().then(({data,error})=>{if(error){splashStatus.textContent="Session error: "+error.message;splashGoogle.hidden=false}else show(data.session)}).catch(e=>{splashStatus.textContent="Authentication unavailable: "+e.message;splashGoogle.hidden=false});
