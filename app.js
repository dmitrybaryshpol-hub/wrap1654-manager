const tg = window.Telegram.WebApp;

const SUPABASE_URL="https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY="sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

const ALLOWED_USERS=["wrap_1654","star_lord_od","vlad_wraping"];

let allEvents=[];
let selectedDate=new Date().toISOString().split('T')[0];

// 🔐 INIT С ПРОВЕРКОЙ
async function init(){

const user = tg.initDataUnsafe?.user;
const username = user?.username?.toLowerCase();

if(!username || !ALLOWED_USERS.includes(username)){
document.getElementById("access-denied").style.display="flex";
document.getElementById("app-content").style.display="none";
return;
}

document.getElementById("app-content").style.display="block";

tg.expand();

await loadData();
renderCalendar();
renderEvents();
}

// ЗАГРУЗКА
async function loadData(){
let res=await fetch(`${SUPABASE_URL}/rest/v1/events?select=*`,{
headers:{
apikey:SUPABASE_KEY,
Authorization:"Bearer "+SUPABASE_KEY
}});
allEvents=await res.json();
}

// КАЛЕНДАРЬ
function renderCalendar(){
let el=document.getElementById("calendar-strip");
el.innerHTML="";

for(let i=-2;i<5;i++){
let d=new Date();
d.setDate(d.getDate()+i);

let iso=d.toISOString().split('T')[0];

let div=document.createElement("div");
div.className="card";
div.innerText=d.getDate();

div.onclick=()=>{
selectedDate=iso;
renderEvents();
};

el.appendChild(div);
}
}

// РЕНДЕР
function renderEvents(){
let el=document.getElementById("events");

let filtered=allEvents.filter(e=>e.start_date && e.start_date.startsWith(selectedDate));

let dayTotal=filtered.reduce((s,e)=>s+(e.amount||0),0);

// неделя
let now=new Date();
let weekAgo=new Date();
weekAgo.setDate(now.getDate()-7);

let weekTotal=allEvents
.filter(e=>new Date(e.start_date)>weekAgo)
.reduce((s,e)=>s+(e.amount||0),0);

document.getElementById("money-day").innerText=dayTotal+"$";
document.getElementById("money-week").innerText=weekTotal+"$";

el.innerHTML=filtered.map(e=>`
<div class="card">
<div>
<b>${e.car_model}</b><br>
<small>${e.client_name}</small><br>
${e.media_url ? `<img src="${e.media_url}">` : ""}
</div>
<div>$${e.amount}</div>
</div>
`).join('');
}

// 📸 ЗАГРУЗКА ФОТО
async function uploadFile(file){

const fileName = Date.now()+"_"+file.name;

await fetch(`${SUPABASE_URL}/storage/v1/object/cars/${fileName}`,{
method:"POST",
headers:{
apikey:SUPABASE_KEY,
Authorization:"Bearer "+SUPABASE_KEY,
"Content-Type":file.type
},
body:file
});

return `${SUPABASE_URL}/storage/v1/object/public/cars/${fileName}`;
}

// СОХРАНЕНИЕ
async function submitOrder(){

let file=document.getElementById("media").files[0];
let media_url=null;

if(file){
media_url=await uploadFile(file);
}

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
start_date:document.getElementById("date-start").value,
media_url:media_url
})
});

closeModal("modal-order");
init();
}

// UI
function openOrderModal(){
document.getElementById("modal-order").classList.add("open");
}

function closeModal(id){
document.getElementById(id).classList.remove("open");
}

init();
