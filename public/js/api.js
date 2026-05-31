const API_BASE = '/api';
const MAX_CAPACITY = 18;

const ROOMS = [
  {id:'A1',type:'Apartment',rate:2100},{id:'A2',type:'Apartment',rate:2100},{id:'A3',type:'Apartment',rate:2100},
  {id:'S1',type:'Suite',rate:1800},{id:'S2',type:'Suite',rate:1800},{id:'S3',type:'Suite',rate:1800},
  {id:'S4',type:'Suite',rate:1800},{id:'S5',type:'Suite',rate:1800},
  {id:'C1',type:'Cabin',rate:1500},{id:'C2',type:'Cabin',rate:1500},{id:'C3',type:'Cabin',rate:1500},
  {id:'C4',type:'Cabin',rate:1500},{id:'C5',type:'Cabin',rate:1500},{id:'C6',type:'Cabin',rate:1500},
  {id:'C7',type:'Cabin',rate:1500},{id:'C8',type:'Cabin',rate:1500},{id:'C9',type:'Cabin',rate:1500},
  {id:'C10',type:'Cabin',rate:1500},
];

const BOOKING_TYPES = { overnight:'Overnight', day_boarding:'Day Boarding', trial:'Trial Stay' };
const TYPE_COLORS = { overnight:'var(--navy)', day_boarding:'var(--accent-dark)', trial:'#FF8C00' };

const api = {
  async get(path) {
    const r = await fetch(API_BASE+path,{credentials:'same-origin'});
    if(r.status===401){window.location.href='/login';return null;}
    return r.json();
  },
  async post(path,data) {
    const r = await fetch(API_BASE+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.status===401){window.location.href='/login';return null;}
    return r.json();
  },
  async put(path,data) {
    const r = await fetch(API_BASE+path,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.status===401){window.location.href='/login';return null;}
    return r.json();
  },
  async delete(path) {
    const r = await fetch(API_BASE+path,{method:'DELETE',credentials:'same-origin'});
    return r.json();
  }
};

function showToast(msg,type='default') {
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.style.borderLeftColor=type==='warn'?'#FF8C00':'var(--accent)';
  t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'),3000);
}

function formatDate(str) {
  if(!str) return '—';
  return new Date(str).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}

function formatCurrency(n) {
  if(!n&&n!==0) return '—';
  return '₹'+parseFloat(n).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:0});
}

function nightsBetween(a,b) {
  if(!a||!b) return 0;
  return Math.max(0,Math.round((new Date(b)-new Date(a))/(1000*60*60*24)));
}

function updateCapacityBar(active) {
  const pct=Math.min((active/MAX_CAPACITY)*100,100);
  const fill=document.getElementById('capacity-fill');
  const count=document.getElementById('capacity-count');
  if(!fill||!count) return;
  fill.style.width=pct+'%';
  count.textContent=active+' / '+MAX_CAPACITY;
  fill.className='capacity-fill'+(pct>=100?' full':pct>=75?' warn':'');
}

function vaccinationWarnings(pet) {
  const warnings=[];
  const now=new Date(); const warn30=new Date(now.getTime()+30*864e5);
  if(pet.arv_vaccinated&&pet.arv_expiry){const e=new Date(pet.arv_expiry);if(e<now)warnings.push('ARV vaccination expired');else if(e<warn30)warnings.push('ARV expires '+formatDate(pet.arv_expiry));}
  if(pet.kc_vaccinated&&pet.kc_expiry){const e=new Date(pet.kc_expiry);if(e<now)warnings.push('Kennel Cough vaccination expired');else if(e<warn30)warnings.push('KC vaccine expires '+formatDate(pet.kc_expiry));}
  return warnings;
}

function calcRate(bookingType, roomId, numDogs, nights, dayRate) {
  const room = ROOMS.find(r=>r.id===roomId);
  let total=0, lines=[];
  if(bookingType==='overnight') {
    const rate = room?room.rate:0;
    total += rate*nights;
    lines.push(`${room?.type||'Room'} ${roomId} × ${nights} night${nights!==1?'s':''} @ ₹${rate} = ₹${rate*nights}`);
    const addl=Math.max(0,numDogs-1);
    if(addl>0){total+=addl*nights*1200;lines.push(`${addl} additional dog${addl>1?'s':''} × ${nights} nights @ ₹1200 = ₹${addl*nights*1200}`);}
  } else if(bookingType==='day_boarding') {
    const rate=dayRate||500;
    total+=rate*numDogs;
    lines.push(`Day boarding × ${numDogs} dog${numDogs!==1?'s':''} @ ₹${rate} = ₹${rate*numDogs}`);
  } else if(bookingType==='trial') {
    total+=500*numDogs;
    lines.push(`Trial stay × ${numDogs} dog${numDogs!==1?'s':''} @ ₹500 = ₹${500*numDogs}`);
  }
  return {total,lines};
}
