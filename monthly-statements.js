// Monthly statement export. Data comes from RLS-protected Supabase tables.
// Statements are snapshots of current records, not proof that a check cleared.
export async function mountMonthlyStatements(client,section,user,teamId,members,manager){
 if(!manager)return;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
 const box=el('section');box.className='card';box.append(el('h3','Monthly payroll PDF statements'));section.append(box);
 const controls=el('form'),month=el('input'),worker=el('select'),button=el('button','Generate monthly PDF'),status=el('p','');
 month.type='month';month.required=true;month.value=new Date().toISOString().slice(0,7);month.setAttribute('aria-label','Statement month');
 const all=el('option','All caregivers');all.value='all';worker.append(all);
 for(const m of members){const o=el('option',m.user_id===user.id?'You':m.user_id.slice(0,8));o.value=m.user_id;worker.append(o)}
 worker.setAttribute('aria-label','Caregiver');button.type='submit';status.setAttribute('role','status');
 controls.append(month,worker,button);box.append(controls,status);
 controls.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;status.textContent='Preparing statement…';
 try{
  const start=month.value+'-01';const [y,m]=month.value.split('-').map(Number);
  const end=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
  const fetch=async(table,columns,dateCol)=>{let q=client.from(table).select(columns).eq('team_id',teamId).gte(dateCol,start).lt(dateCol,end);
   if(worker.value!=='all')q=q.eq('worker_id',worker.value);
   const {data,error}=await q;if(error)throw error;return data};
  const [work,expenses,payments]=await Promise.all([
   fetch('kappy_work_entries','worker_id,work_date,category,hours,hourly_rate','work_date'),
   fetch('kappy_expenses','worker_id,spent_on,category,amount,description','spent_on'),
   fetch('kappy_payments','worker_id,week_start,amount,check_number,written_on,delivery_note,received_at','written_on')
  ]);
  const {jsPDF}=await import('https://esm.sh/jspdf@2.5.2');
  const pdf=new jsPDF({unit:'pt',format:'letter'}),money=n=>'$'+Number(n).toFixed(2);
  let page=1,top=48;
  const line=(text,bold=false)=>{if(top>742){pdf.addPage();page++;top=48}pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(bold?11:9);
   const lines=pdf.splitTextToSize(String(text),510);for(const t of lines){if(top>742){pdf.addPage();page++;top=48}pdf.text(t,48,top);top+=14}};
  pdf.setFont('helvetica','bold');pdf.setFontSize(18);pdf.text('KAPPY | MONTHLY PAYROLL STATEMENT',48,48);top=75;
  line('Period: '+month.value+'    Generated: '+new Date().toLocaleString());line('Statement type: '+(worker.value==='all'?'Team summary':'Individual caregiver'));line('Amounts reflect recorded entries and check confirmations, not bank clearance.');
  line('');let grandLabor=0,grandExpenses=0,grandChecks=0;
  const people=worker.value==='all'?members:members.filter(x=>x.user_id===worker.value);
  for(const person of people){const id=person.user_id,w=work.filter(x=>x.worker_id===id),e=expenses.filter(x=>x.worker_id===id),p=payments.filter(x=>x.worker_id===id);
   if(worker.value==='all'&&!w.length&&!e.length&&!p.length)continue;
   const regular=w.filter(x=>x.category==='coverage').reduce((a,x)=>a+Number(x.hours),0);
   const additional=w.filter(x=>x.category!=='coverage').reduce((a,x)=>a+Number(x.hours),0);
   const labor=w.reduce((a,x)=>a+Number(x.hours)*Number(x.hourly_rate),0);
   const reimb=e.reduce((a,x)=>a+Number(x.amount),0),checks=p.reduce((a,x)=>a+Number(x.amount),0);
   grandLabor+=labor;grandExpenses+=reimb;grandChecks+=checks;
   line('');line('Caregiver: '+(id===user.id?'You':id),true);
   line('Coverage '+regular.toFixed(2)+' h | Additional '+additional.toFixed(2)+' h | Labor '+money(labor)+' | Expenses '+money(reimb)+' | Total '+money(labor+reimb));
   for(const payment of p)line('Check #'+payment.check_number+' | '+money(payment.amount)+' | Written '+payment.written_on+' | '+payment.delivery_note+' | '+(payment.received_at?'Receipt confirmed '+new Date(payment.received_at).toLocaleDateString():'Awaiting receipt'));
   if(worker.value!=='all'){for(const x of w)line('Work '+x.work_date+' | '+x.category+' | '+Number(x.hours).toFixed(2)+' h @ '+money(x.hourly_rate));
    for(const x of e)line('Expense '+x.spent_on+' | '+x.category+' | '+money(x.amount)+' | '+(x.description||''))}
   if(!p.length)line('No checks recorded for this period.');
  }
  line('');line('MONTH TOTAL | Labor '+money(grandLabor)+' | Reimbursements '+money(grandExpenses)+' | Amount owed '+money(grandLabor+grandExpenses),true);
  line('Checks written in period: '+money(grandChecks)+' (may cover prior weeks).');
  line('Note: Work and expenses are grouped by activity date; checks by written date. These totals need not reconcile.');
  line('This is a generated record, not a bank-cleared payment confirmation.');
  pdf.save('Kappy-payroll-'+month.value+(worker.value==='all'?'-team':'-caregiver')+'.pdf');
  status.textContent='PDF generated. Review totals before distributing.';
 }catch(err){status.textContent='Unable to generate statement: '+err.message}finally{button.disabled=false}
 });
}
