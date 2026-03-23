const SUPABASE_URL="https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY="sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

let allEvents=[];
let selectedDate=new Date().toISOString().split('T')[0];

async function init(){
await loadData();
renderCalendar();
renderEvents();
}

async function loadData(){
let res=await fetch(`${SUPABASE_URL}/rest/v1/events?select=*`,{
headers:{
apikey:SUPABASE_KEY,
Authorization:"Bearer "+SUPABASE_KEY
}});
allEvents=await res.json();
}

function renderCalendar(){
const strip=document.getElementById("calendar-strip");
strip.innerHTML="";

for(let i=-2;i<5;i++){
let d=new Date();
d.setDate(d.getDate()+i);
let iso=d.toISOString().split('T')[0];

let el=document.createElement("div");
el.className="card";
el.innerText=d.getDate();
el.onclick=()=>{selectedDate=iso;renderEvents();}
strip.appendChild(el);
}
}

function renderEvents(){
let el=document.getElementById("events");

let filtered=allEvents.filter(e=>e.start_date && e.start_date.startsWith(selectedDate));

let total=filtered.reduce((s,e)=>s+(e.amount||0),0);

document.getElementById("stat-money").innerText=total+"$";
document.getElementById("stat-cars").innerText=filtered.length;

el.innerHTML=filtered.map(e=>`
<div class="card">
<div>
<b>${e.car_model}</b><br>
<small>${e.client_name}</small><br>
<span class="status ${e.status}">${e.status}</span>
</div>
<div>
<b>$${e.amount}</b>
</div>
</div>
`).join('');
}

async function submitOrder(){
await fetch(`${SUPABASE_URL}/rest/v1/events`,{
method:"POST",
headers:{
apikey:SUPABASE_KEY,
Authorization:"Bearer "+SUPABASE_KEY,
"Content-Type":"application/json"
},
body:JSON.stringify({
client_name:document.getElementById("car-client").value,
car_model:document.getElementById("car-model").value,
amount:parseInt(document.getElementById("order-amount").value),
status:document.getElementById("status").value,
start_date:document.getElementById("date-start").value
})
});
closeModal("modal-order");
init();
}

function openOrderModal(){
document.getElementById("modal-order").classList.add("open");
}

function closeModal(id){
document.getElementById(id).classList.remove("open");
}

function showPage(p){
document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
document.getElementById("page-"+p).classList.add("active");
}

init();
