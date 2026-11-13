// Google OAuth sign-in for the Kappy prototype. No care data is sent to Supabase yet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const supabase=createClient("https://qswyqcbunrdsiyyltdct.supabase.co","sb_publishable_z_9muNs_w-Odghw6ziVTfw_6fpO3n-e");
const status=document.getElementById("auth-status");
const login=document.getElementById("google-login");
const logout=document.getElementById("google-logout");
function show(session){
 const user=session?.user;
 login.hidden=!!user;logout.hidden=!user;
 status.textContent=user?"Signed in: "+(user.email||"Google account"):"Not signed in";
}
login.addEventListener("click",async()=>{
 login.disabled=true;status.textContent="Connecting to Google…";
 try{
  const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+location.pathname}});
  if(error)throw error;
 }catch(err){status.textContent="Google sign-in failed: "+err.message;login.disabled=false;}
});
logout.addEventListener("click",async()=>{
 logout.disabled=true;
 const {error}=await supabase.auth.signOut();
 if(error)status.textContent="Sign-out failed: "+error.message;
 logout.disabled=false;
});
supabase.auth.onAuthStateChange((_event,session)=>show(session));
supabase.auth.getSession().then(({data,error})=>{if(error)status.textContent="Session error: "+error.message;else show(data.session)}).catch(e=>status.textContent="Authentication unavailable: "+e.message);
