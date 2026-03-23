const tg = window.Telegram.WebApp;

const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

let allEvents = [];
let storage = [];
let selectedDate = new Date().toISOString().split('T')[0];

// 🔐 ПРОВЕРКА ЧЕРЕЗ TELEGRAM ID
async function init(){

if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
    showDenied();
    return;
}

const user = tg.initDataUnsafe.user;
const telegram_id = user.id;

// 🔥 ПРОВЕРКА В БАЗЕ
const res = await fetch(`${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegram_id}`, {
headers:{
apikey:SUPABASE_KEY,
Authorization:"Bearer "+SUPABASE_KEY
}
});

const data = await res.json();

if (!data.length) {
    showDenied();
    return;
}

document.getElementById("app-content").classList.remove("hidden");

tg.expand();

await loadData();
renderCalendar();
renderEvents();
renderFilms();
}

function showDenied(){
document.getElementById("access-denied").classList.remove("hidden");
}

// DATA
async function loadData(){
let res1 = await fetch(`${SUPABASE_URL}/rest/v1/events?select=*`,{
headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}
});
allEvents = await res1.json();

let res2 = await fetch(`${SUPABASE_URL}/rest/v1/storage?select=*`,{
headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}
});
storage = await res2.json();
}

// календарь
function renderCalendar(){
let el = document.getElementById("calendar-strip");
el.innerHTML="";

for(let i=-3;i<7;i++){
let d=new Date();
d.setDate(d.getDate()+i);

let iso=d.toISOString().split('T')[0];

let div=document.createElement("div");
div.className="day";
div.innerText=d.getDate();

div.onclick=()=>{
selectedDate=iso;
renderEvents();
};

el.appendChild(div);
}
}

// события + прибыль
function renderEvents(){

let el=document.getElementById("events");

let filtered=allEvents.filter(e=>e.start_date && e.start_date.startsWith(selectedDate));

let dayTotal=filtered.reduce((s,e)=>s+(e.amount||0),0);
let profitDay=filtered.reduce((s,e)=>s+(e.profit||0),0);

let weekAgo=new Date();
weekAgo.setDate(weekAgo.getDate()-7);

let weekTotal=allEvents
.filter(e=>new Date(e.start_date)>weekAgo)
.reduce((s,e)=>s+(e.amount||0),0);

document.getElementById("money-day").innerText=dayTotal+"$";
document.getElementById("profit-day").innerText=profitDay+"$";
document.getElementById("money-week").innerText=weekTotal+"$";

el.innerHTML=filtered.map(e=>`
<div class="card">
<div>
<b>${e.car_model || ""}</b><br>
<small>${e.client_name || ""}</small><br>
${e.media_url ? `<img src="${e.media_url}">` : ""}
</div>

<div>
<b>$${e.amount || 0}</b><br>
<span class="${e.profit>=0?'profit':'loss'}">${e.profit||0}$</span>
</div>
</div>
`).join('');
}

// плёнка
function renderFilms(){
const select=document.getElementById("film-select");
select.innerHTML='<option value="">Без плёнки</option>';

storage
.filter(s=>s.type==="film")
.forEach(s=>{
select.innerHTML+=`<option value="${s.name}">${s.name}</option>`;
});
}

// загрузка
async function uploadFile(file){
const fileName=Date.now()+"_"+file.name;

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

// сохранение заказа
async function submitOrder(){

let file=document.getElementById("media").files[0];
let media_url=null;

if(file){
media_url=await uploadFile(file);
}

let filmName=document.getElementById("film-select").value;
let filmQty=parseFloat(document.getElementById("film-qty").value)||0;

let cost=0;

if(filmName && filmQty){
let film=storage.find(s=>s.name===filmName);
if(film && film.price_per_unit){
cost=film.price_per_unit*filmQty;
}
}

let amount=parseInt(document.getElementById("order-amount").value)||0;
let profit=amount-cost;

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
amount:amount,
cost:cost,
profit:profit,
start_date:document.getElementById("date-start").value,
media_url:media_url,
film_used:filmName,
film_amount:filmQty
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
