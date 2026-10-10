import {pricing,actualResult,changeOrder,clientQuote,exportJobsCSV,InputError} from '../src/pricing.mjs';
const $=id=>document.getElementById(id);
const named=['crew','hours','hourly','laborBurden','materials','supplies','travel','tools','subcontract','contingency','overhead','targetMargin','minMargin','discount','taxRate','quote'];
const actualFields=['crew','hours','hourly','materials','supplies','travel','tools','subcontract'];
const storeKey='tradebid-workbench-v1';
let jobs=[],last=null,lastActual=null,lastExtra=null,currentId=null;
const allowedCurrencies=['USD','ILS','GBP','EUR'];
const str=(s,max=1200)=>String(s??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,max);
function currency(){return allowedCurrencies.includes($('currency').value)?$('currency').value:'USD';}
function formatMoney(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:currency(),maximumFractionDigits:2}).format(n||0);}
function num(v){return v===''?'':Number(v);}
function quoteInput(){const x={};for(const id of named)x[id]=num($(id).value);return x;}
function details(){return Object.fromEntries(['business','customer','job','reference','currency','scope','excluded','terms','contact','validUntil'].map(k=>[k,$(k).value]));}
function error(message){$('errors').textContent=message;$('errors').hidden=false;}
function clearError(){$('errors').textContent='';$('errors').hidden=true;}
function notify(msg){const x=$('toast');x.textContent=msg;x.classList.add('show');setTimeout(()=>x.classList.remove('show'),2400);}
function setText(id,value){$(id).textContent=value;}
function row(label,value){const el=document.createElement('div');el.className='row';const span=document.createElement('span'),b=document.createElement('strong');span.textContent=label;b.textContent=formatMoney(value);el.append(span,b);return el;}
function tab(which){for(const b of document.querySelectorAll('button[data-tab]'))b.classList.toggle('current',b.dataset.tab===which);for(const x of document.querySelectorAll('.tab-panel'))x.classList.toggle('visible',x.id===which+'Tab');if(which==='client')paintClient();if(which==='history')paintHistory();if(which==='actual')paintActual();window.scrollTo({top:130,behavior:'smooth'});}
function compute(){
 try{
  const p=pricing(quoteInput());last=p;clearError();
  setText('costNumber',formatMoney(p.cost));setText('suggestedNumber',formatMoney(p.suggested));setText('profitNumber',formatMoney(p.grossProfit));
  setText('marginNumber',p.margin.toFixed(2)+'%');setText('customerTotal',formatMoney(p.customerTotal));
  setText('minimumPrice',formatMoney(p.minimumPrice));
  setText('stressMargin',p.stressed.margin.toFixed(2)+'%');
  setText('markup',p.markup===null?'N/A':p.markup.toFixed(2)+'%');
  const flag=$('marginFlag');flag.className='flag';
  if(p.grossProfit<0){flag.classList.add('danger');flag.textContent='LOSS ALERT: this quote is below your modeled cost. Review the scope, labor and price.';}
  else if(p.redFlag){flag.classList.add('warning');flag.textContent='MARGIN WARNING: your discount/price falls below the minimum margin you chose.';}
  else if(p.cost===0){flag.classList.add('warning');flag.textContent='No job cost was entered. Check all expenses before sending this quote.';}
  else flag.textContent='ON TARGET: this quote meets your minimum estimated margin; verify your input assumptions.';
  setText('marginBarLabel',p.margin.toFixed(1)+'%');$('marginBar').style.width=Math.max(0,Math.min(100,p.margin/60*100))+'%';$('marginBar').classList.toggle('low',p.redFlag);
  const breakdown=$('costBreakdown');breakdown.replaceChildren();
  [['Labor with burden',p.labor],['Materials & supplies',p.materials+p.supplies],['Travel and equipment',p.travel+p.tools],['Subcontract',p.subcontract],['Contingency budget',p.contingency],['Overhead allocation',p.overhead]].forEach(([k,v])=>breakdown.append(row(k,v)));
  const checklist=[
   p.crew<=0||p.hours<=0?'Validate hours and crew; zero hours means labor was not estimated.':null,
   p.cost===0?'Enter actual cost estimates before approving the price.':null,
   !details().scope.trim()?'Document the included tasks in writing.':null,
   !details().excluded.trim()?'Specify exclusions or change-order triggers.':null,
   !details().customer.trim()?'Confirm your buyer details and quote reference.':null,
   p.redFlag?'Raise the price or revise scope before sending.':null
  ].filter(Boolean);
  if(!checklist.length)checklist.push('Confirm customer requirements and any permits, taxes or local restrictions.','Review the proposed amount and validity with the customer.','Get explicit written approval before providing additional services.');
  const g=$('guardrails');g.replaceChildren();for(const item of checklist){const li=document.createElement('li');li.textContent=item;g.append(li);}
  paintActual();
  paintExtra();
  if($('clientTab').classList.contains('visible'))paintClient();
 }catch(e){last=null;error(e instanceof InputError?e.message:'Could not calculate this quote. Review the amounts.');}
}
function div(txt,cls){const x=document.createElement('div');x.className=cls||'';x.textContent=txt;return x;}
function group(label,text){const c=div('');const l=document.createElement('label');l.textContent=label;const v=document.createElement('p');v.textContent=text||'Not specified';c.append(l,v);return c;}
function paintClient(){
 const paper=$('quotePreview');paper.replaceChildren();if(!last)return;
 const q=clientQuote(details(),last);
 const head=div('','paper-head'),top=div(''),company=document.createElement('h2');company.textContent=q.business||'Business name';top.append(company,div(q.contact||'Contact details not provided'));head.append(top,div('ESTIMATE','chip'));
 const grid=div('','detail-grid');grid.append(group('For',q.customer||'Customer not specified'),group('Quote reference',q.reference||'Draft'),group('Job',q.job||'Job description missing'),group('Valid until',q.validUntil||'Date not entered'));
 const scope=group('Included work',q.scope||'Scope missing');const excl=group('Excluded work',q.excluded||'No exclusions specified');const terms=group('Terms',q.terms||'Work is subject to confirmation.');
 const total=div('','total');total.append(div('Estimated total'),div(formatMoney(q.total)));
 const disc=group('Price summary',`Subtotal: ${formatMoney(q.subtotal)}\nDiscount: ${formatMoney(q.discount)}\nModeled sales tax: ${formatMoney(q.tax)}`);
 paper.append(head,grid,scope,excl,terms,disc,total,div(q.disclaimer,'disclaimer'));
}
function actualInput(){const x={};for(const f of actualFields)x[f]=num($('actual'+f[0].toUpperCase()+f.slice(1)).value);return x;}
function paintActual(){
 if(!last)return;try{lastActual=actualResult(last,actualInput());clearError();setText('actualCost',formatMoney(lastActual.cost));setText('actualProfit',formatMoney(lastActual.profit));setText('actualMargin',lastActual.margin.toFixed(2)+'%');
 const v=lastActual.variance;setText('actualVariance',(v>0?'+':'')+formatMoney(v));
 }catch(e){lastActual=null;error('Actual job values must be valid non-negative amounts.');}
}

function extraInputs(){return {workerHours:num($('scopeExtraHours').value),materials:num($('scopeExtraMaterials').value),travel:num($('scopeExtraTravel').value),equipment:num($('scopeExtraEquipment').value)};}
function paintExtra(){
 if(!last){lastExtra=null;return;}
 try{
  lastExtra=changeOrder(last,extraInputs());
  setText('extraCost',formatMoney(lastExtra.addedCost));
  setText('extraPrice',formatMoney(lastExtra.suggestedExtraPrice));
  $('copyChangeOrder').disabled=lastExtra.addedCost===0;
  setText('extraWarning',lastExtra.addedCost===0
   ?'Enter actual additional work or materials to build an add-on estimate.'
   :'Add-on proposal is a draft; new work requires written customer approval. Suggested price is before any applicable tax.');
 }catch(e){lastExtra=null;$('copyChangeOrder').disabled=true;setText('extraWarning',e.message);}
}

function copyEstimateToActual(){for(const f of actualFields){const id='actual'+f[0].toUpperCase()+f.slice(1);$(id).value=$(f).value;}paintActual();}
function safeStore(){try{localStorage.setItem(storeKey,JSON.stringify(jobs));return true;}catch{error('Local save unavailable. Use Export JSON to keep a copy.');return false;}}
function loadStore(){try{const raw=JSON.parse(localStorage.getItem(storeKey)||'[]');if(!Array.isArray(raw))return; jobs=raw.filter(x=>x&&typeof x==='object'&&typeof x.id==='string'&&x.id.length<70).slice(0,250);}catch{jobs=[];}}
function jobSnapshot(status='Quoted'){
 const detail=details();const id=currentId||crypto.randomUUID();const now=new Date().toISOString();
 return {id,reference:detail.reference||id.slice(0,8),customer:str(detail.customer,90),job:str(detail.job,150),status,quote:last.afterDiscount,cost:last.cost,profit:last.grossProfit,margin:last.margin,updated:now,detail,inputs:quoteInput(),actual:lastActual,actualInputs:status==='Completed'?actualInput():null,quoteOutput:clientQuote(detail,last)};
}
function saveJob(status='Quoted'){
 if(!last){error('Fix calculation errors before saving');return;}
 const d=details();if(!d.business.trim()||!d.customer.trim()||!d.job.trim()||!d.scope.trim()){error('Business name, customer, job title and included work are required to save.');tab('quote');return;}
 const j=jobSnapshot(status);jobs=jobs.filter(x=>x.id!==j.id);jobs.unshift(j);jobs=jobs.slice(0,250);currentId=j.id;
 if(safeStore())notify('Saved locally. Export JSON regularly to keep a backup.');
 paintHistory();
}
function paintHistory(){
 const tbody=$('historyRows');tbody.replaceChildren();$('emptyHistory').hidden=jobs.length>0;
 for(const j of jobs){const tr=document.createElement('tr');
  for(const value of [j.reference,(j.customer||'')+' / '+(j.job||''),j.status,formatMoney(Number(j.quote)),formatMoney(Number(j.profit))]){
   const td=document.createElement('td');td.textContent=String(value);tr.append(td);}
  const td=document.createElement('td'),open=document.createElement('button');open.className='secondary';open.textContent='Open';open.onclick=()=>openJob(j.id);
  const del=document.createElement('button');del.className='secondary';del.textContent='Delete';del.onclick=()=>{if(!confirm('Delete this job from this browser?'))return;jobs=jobs.filter(x=>x.id!==j.id);if(currentId===j.id)currentId=null;safeStore();paintHistory();};
  td.append(open,document.createTextNode(' '),del);tr.append(td);tbody.append(tr);
 }
}
function openJob(id){const j=jobs.find(x=>x.id===id);if(!j)return;currentId=id;
 for(const [k,v] of Object.entries(j.detail||{})){if($(k))$(k).value=v??'';}
 for(const [k,v] of Object.entries(j.inputs||{})){if($(k))$(k).value=v===undefined?'':String(v);}
 if(j.actualInputs){for(const f of actualFields){const id='actual'+f[0].toUpperCase()+f.slice(1);if(j.actualInputs[f]!==undefined&&$(id))$(id).value=j.actualInputs[f];}}else{copyEstimateToActual();}
 compute();tab('quote');notify('Job loaded. Review costs before editing.');
}
function download(content,name,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}
function exportAll(){download(JSON.stringify({version:1,generated:new Date().toISOString(),jobs},null,2),'tradebid-jobs-backup.json','application/json;charset=utf-8');notify('JSON backup downloaded');}
async function importJobs(file){if(!file)return;if(file.size>3*1024*1024){error('Backup is too large.');return;}
 try{const d=JSON.parse(await file.text());if(d.version!==1||!Array.isArray(d.jobs))throw Error('Wrong backup format');
 const imported=d.jobs.slice(0,250).filter(j=>j&&typeof j.id==='string'&&j.id.length<70&&j.detail&&typeof j.detail==='object'&&j.inputs&&typeof j.inputs==='object');
 if(!imported.length)throw Error('No valid saved jobs found.');
 const byId=new Map(jobs.map(x=>[x.id,x]));for(const j of imported)byId.set(j.id,j);
 jobs=[...byId.values()].slice(0,250);safeStore();paintHistory();notify(imported.length+' jobs imported locally');
 }catch(e){error('Unable to import backup: '+str(e.message,170));}
}
async function copy(txt){try{await navigator.clipboard.writeText(txt);notify('Copied');}catch{const a=document.createElement('textarea');a.value=txt;document.body.append(a);a.select();document.execCommand('copy');a.remove();notify('Copied, if your browser allowed clipboard access');}}
function quoteEmail(){if(!last)return '';const d=details();return `Hello ${d.customer||'there'},\n\nHere is our estimate for ${d.job||'your project'}.\n\nIncluded: ${d.scope||'Please confirm details.'}\nExcluded: ${d.excluded||'Not specified'}\n\nEstimated total (including modeled tax): ${formatMoney(last.customerTotal)}.\nValid until: ${d.validUntil||'to be confirmed'}.\n\nPlease reply to confirm the scope, timing and any changes before work starts.\n\n${d.business||'Your service provider'}\n${d.contact||''}`;}
function init(){
 loadStore();for(const x of document.querySelectorAll('[data-tab]'))x.addEventListener('click',()=>tab(x.dataset.tab));
 for(const f of [...named,'business','customer','job','reference','currency','validUntil','scope','excluded','terms','contact']){
  const el=$(f);el.addEventListener('input',compute);el.addEventListener('change',compute);
 }
 for(const f of actualFields){const id='actual'+f[0].toUpperCase()+f.slice(1);$(id).addEventListener('input',paintActual);}
 $('newJob').onclick=()=>{currentId=null;for(const k of ['customer','job','reference','scope','excluded','terms','validUntil','quote'])$(k).value='';copyEstimateToActual();compute();tab('quote');notify('New job started. Previous jobs remain saved locally.');};
 $('saveJob').onclick=()=>saveJob('Quoted');$('recordActual').onclick=()=>{if(!lastActual){error('Enter valid actual values first');return;}saveJob('Completed');};
 $('copyEstimateToActual').onclick=copyEstimateToActual;$('openPreview').onclick=()=>tab('client');
 $('printQuote').onclick=()=>{if(!last){error('Create a valid estimate first');return;}window.print();};
 $('copyEmail').onclick=()=>copy(quoteEmail());
 for(const k of ['scopeExtraHours','scopeExtraMaterials','scopeExtraTravel','scopeExtraEquipment'])$(k).addEventListener('input',paintExtra);
 $('copyChangeOrder').onclick=()=>{if(!lastExtra||lastExtra.addedCost<=0)return;const d=details();const note=$('scopeExtraNotes').value.trim();copy('Proposed additional work for '+(d.customer||'customer')+' — '+(d.job||'your job')+'\\n\\nRequested change: '+(note||'Please confirm details')+'\\nAdditional quoted price before applicable sales tax: '+formatMoney(lastExtra.suggestedExtraPrice)+'\\n\\nThis is a new, separate scope. Please confirm approval in writing before work begins.\\n'+(d.business||''));};$('exportAll').onclick=exportAll;
 $('importTrigger').onclick=()=>$('importFile').click();$('importFile').onchange=e=>importJobs(e.target.files?.[0]);
 $('exportCSV').onclick=()=>download(exportJobsCSV(jobs),'tradebid-job-summary.csv','text/csv;charset=utf-8');
 compute();paintHistory();
}
document.addEventListener('DOMContentLoaded',init);
