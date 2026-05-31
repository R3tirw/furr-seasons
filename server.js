require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const session      = require('express-session');
const bcrypt       = require('bcryptjs');
const rateLimit    = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const path         = require('path');
const initSqlJs    = require('sql.js');
const fs           = require('fs');
const XLSX         = require('xlsx');

const app    = express();
const PORT   = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const DB_PATH = isProd
  ? '/app/data/furr-seasons.db'
  : path.join(__dirname, 'furr-seasons.db');

if (isProd && !fs.existsSync('/app/data/furr-seasons.db') && fs.existsSync('/app/furr-seasons.db')) {
  fs.mkdirSync('/app/data', { recursive: true });
  fs.copyFileSync('/app/furr-seasons.db', '/app/data/furr-seasons.db');
  console.log('✓ Migrated database to volume');
}
// One-time migration: copy old db to volume if new one doesn't exist yet
if (isProd) {
  const oldPath = '/app/furr-seasons.db';
  if (!fs.existsSync(DB_PATH) && fs.existsSync(oldPath)) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(oldPath, DB_PATH);
    console.log('✓ Migrated database to persistent volume');
  }
}
// ── ROOMS ────────────────────────────────────────────────────────────────────
const ROOMS = [
  ...['A1','A2','A3'].map(id => ({ id, type:'Apartment', rate:2100 })),
  ...['S1','S2','S3','S4','S5'].map(id => ({ id, type:'Suite', rate:1800 })),
  ...['C1','C2','C3','C4','C5','C6','C7','C8','C9','C10'].map(id => ({ id, type:'Cabin', rate:1500 })),
];
const CABIN_IDS = ROOMS.filter(r=>r.type==='Cabin').map(r=>r.id);
const MAX_CAPACITY = 18;

// ── SECURITY ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
if (isProd) app.set('trust proxy', 1);
app.use(cors({ origin: isProd ? (process.env.ALLOWED_ORIGIN || false) : true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || (() => { throw new Error('SESSION_SECRET not set'); })(),
  name: 'fs_sid', resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProd, sameSite: 'strict', maxAge: 8*60*60*1000 },
}));

const loginLimiter = rateLimit({ windowMs:15*60*1000, max:10, message:{error:'Too many attempts.'} });
const apiLimiter   = rateLimit({ windowMs:60*1000, max:200, message:{error:'Too many requests.'} });
app.use('/api/', apiLimiter);

function requireAuth(req,res,next){ if(req.session?.authenticated) return next(); res.status(401).json({error:'Unauthorized.'}); }
function validate(req,res,next){ const e=validationResult(req); if(!e.isEmpty()) return res.status(400).json({errors:e.array()}); next(); }

// ── DATABASE ──────────────────────────────────────────────────────────────────
let db;
async function initDB(){
  const SQL = await initSqlJs();
  if(fs.existsSync(DB_PATH)){
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    // ensure directory exists
    const dir = path.dirname(DB_PATH);
    if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
    db = new SQL.Database();
  }

  db.run(`PRAGMA journal_mode=WAL`);

  // OWNERS
  db.run(`CREATE TABLE IF NOT EXISTS owners (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, created_at TEXT)`);

  // PETS — added special_instructions, arv_vaccinated, arv_expiry, kc_vaccinated, kc_expiry
  db.run(`CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY, owner_id TEXT, name TEXT NOT NULL, species TEXT, breed TEXT,
    age INTEGER, weight REAL, notes TEXT, special_instructions TEXT,
    arv_vaccinated INTEGER DEFAULT 0, arv_expiry TEXT,
    kc_vaccinated INTEGER DEFAULT 0, kc_expiry TEXT,
    created_at TEXT)`);

  // Safe migrations for existing pets table
  const petCols = query(`PRAGMA table_info(pets)`).map(c=>c.name);
  if(!petCols.includes('special_instructions')) db.run(`ALTER TABLE pets ADD COLUMN special_instructions TEXT`);
  if(!petCols.includes('arv_vaccinated')) db.run(`ALTER TABLE pets ADD COLUMN arv_vaccinated INTEGER DEFAULT 0`);
  if(!petCols.includes('arv_expiry')) db.run(`ALTER TABLE pets ADD COLUMN arv_expiry TEXT`);
  if(!petCols.includes('kc_vaccinated')) db.run(`ALTER TABLE pets ADD COLUMN kc_vaccinated INTEGER DEFAULT 0`);
  if(!petCols.includes('kc_expiry')) db.run(`ALTER TABLE pets ADD COLUMN kc_expiry TEXT`);

  // STAFF
  db.run(`CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT, phone TEXT, email TEXT, shift TEXT, created_at TEXT)`);

  // BOOKINGS — added booking_type, room_id, num_dogs, checkin_time, checkout_time, status_confirmed_at, status_checkedin_at, status_checkedout_at
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, pet_id TEXT, owner_id TEXT, staff_id TEXT,
    check_in TEXT, check_out TEXT,
    checkin_time TEXT, checkout_time TEXT,
    status TEXT DEFAULT 'confirmed',
    status_confirmed_at TEXT, status_checkedin_at TEXT, status_checkedout_at TEXT, status_cancelled_at TEXT,
    booking_type TEXT DEFAULT 'overnight',
    room_id TEXT, kennel TEXT,
    num_dogs INTEGER DEFAULT 1,
    rate REAL, notes TEXT, created_at TEXT)`);

  const bookCols = query(`PRAGMA table_info(bookings)`).map(c=>c.name);
  if(!bookCols.includes('booking_type')) db.run(`ALTER TABLE bookings ADD COLUMN booking_type TEXT DEFAULT 'overnight'`);
  if(!bookCols.includes('room_id')) db.run(`ALTER TABLE bookings ADD COLUMN room_id TEXT`);
  if(!bookCols.includes('num_dogs')) db.run(`ALTER TABLE bookings ADD COLUMN num_dogs INTEGER DEFAULT 1`);
  if(!bookCols.includes('checkin_time')) db.run(`ALTER TABLE bookings ADD COLUMN checkin_time TEXT`);
  if(!bookCols.includes('checkout_time')) db.run(`ALTER TABLE bookings ADD COLUMN checkout_time TEXT`);
  if(!bookCols.includes('status_confirmed_at')) db.run(`ALTER TABLE bookings ADD COLUMN status_confirmed_at TEXT`);
  if(!bookCols.includes('status_checkedin_at')) db.run(`ALTER TABLE bookings ADD COLUMN status_checkedin_at TEXT`);
  if(!bookCols.includes('status_checkedout_at')) db.run(`ALTER TABLE bookings ADD COLUMN status_checkedout_at TEXT`);
  if(!bookCols.includes('status_cancelled_at')) db.run(`ALTER TABLE bookings ADD COLUMN status_cancelled_at TEXT`);

  // Migrate kennel -> room_id for existing bookings
  db.run(`UPDATE bookings SET room_id=kennel WHERE room_id IS NULL AND kennel IS NOT NULL`);

  // INVOICE LINE ITEMS
  db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL,
    description TEXT, amount REAL, is_auto INTEGER DEFAULT 0,
    created_at TEXT)`);

  // INVOICES
  db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY, booking_id TEXT, owner_id TEXT,
    amount REAL, tax REAL, total REAL,
    status TEXT DEFAULT 'draft',
    needs_review INTEGER DEFAULT 0,
    due_date TEXT, notes TEXT, created_at TEXT)`);

  const invCols = query(`PRAGMA table_info(invoices)`).map(c=>c.name);
  if(!invCols.includes('needs_review')) db.run(`ALTER TABLE invoices ADD COLUMN needs_review INTEGER DEFAULT 0`);
  if(!invCols.includes('status')) db.run(`ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT 'draft'`);

  saveDB();
  console.log('✓ Database ready —', DB_PATH);
}

function saveDB(){ fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }

function query(sql, params=[]){
  const stmt = db.prepare(sql); stmt.bind(params);
  const rows=[]; while(stmt.step()) rows.push(stmt.getAsObject()); stmt.free(); return rows;
}
function run(sql, params=[]){ db.run(sql, params); saveDB(); }

// ── ROOM CONFLICT CHECK ───────────────────────────────────────────────────────
function checkRoomConflict(roomId, checkIn, checkOut, checkinTime, checkoutTime, bookingType, excludeId=null){
  // For overnight: block full day range
  // For day boarding / trial: block by time window on same date
  const existing = query(`
    SELECT * FROM bookings
    WHERE room_id=? AND status NOT IN ('cancelled','checked-out')
    ${excludeId ? `AND id != '${excludeId}'` : ''}
  `, [roomId]);

  for(const b of existing){
    if(bookingType === 'overnight' || b.booking_type === 'overnight'){
      // Overnight blocks full days — check date overlap
      const bIn = b.check_in, bOut = b.check_out || b.check_in;
      const newIn = checkIn, newOut = checkOut || checkIn;
      if(newIn < bOut && newOut > bIn) return b;
    } else {
      // Both are day boarding or trial — check same date + time overlap
      if(b.check_in === checkIn){
        const bStart = b.checkin_time || '00:00';
        const bEnd   = b.checkout_time || '23:59';
        const nStart = checkinTime || '00:00';
        const nEnd   = checkoutTime || '23:59';
        if(nStart < bEnd && nEnd > bStart) return b;
      }
    }
  }
  return null;
}

// ── INVOICE HELPERS ───────────────────────────────────────────────────────────
function calcBookingTotal(booking){
  const room = ROOMS.find(r=>r.id===booking.room_id);
  const rate = room ? room.rate : (parseFloat(booking.rate)||0);
  const numDogs = parseInt(booking.num_dogs)||1;
  const addlDogs = Math.max(0, numDogs-1);
  let total = 0;
  let items = [];

  if(booking.booking_type === 'overnight'){
    const d1 = new Date(booking.check_in), d2 = new Date(booking.check_out||booking.check_in);
    const nights = Math.max(1, Math.round((d2-d1)/(1000*60*60*24)));
    total += rate * nights;
    items.push({ description: `${room?.type||'Room'} ${booking.room_id} × ${nights} night${nights>1?'s':''} @ ₹${rate}`, amount: rate*nights, is_auto:1 });
    if(addlDogs > 0){
      const addlAmt = addlDogs * nights * 1200;
      total += addlAmt;
      items.push({ description: `${addlDogs} additional dog${addlDogs>1?'s':''} × ${nights} nights @ ₹1200`, amount: addlAmt, is_auto:1 });
    }
  } else if(booking.booking_type === 'day_boarding'){
    const baseRate = booking.rate === 500 ? 500 : 1000;
    total += baseRate * numDogs;
    items.push({ description: `Day boarding (${baseRate===500?'4hrs':'8hrs'}) × ${numDogs} dog${numDogs>1?'s':''} @ ₹${baseRate}`, amount: baseRate*numDogs, is_auto:1 });
  } else if(booking.booking_type === 'trial'){
    total += 500 * numDogs;
    items.push({ description: `Trial stay × ${numDogs} dog${numDogs>1?'s':''} @ ₹500`, amount: 500*numDogs, is_auto:1 });
  }
  return { total, items };
}

function createDraftInvoice(bookingId, ownerId, booking){
  const { total, items } = calcBookingTotal(booking);
  const invoiceId = uuidv4();
  const due = new Date(Date.now()+7*864e5).toISOString().split('T')[0];
  run(`INSERT INTO invoices VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [invoiceId, bookingId, ownerId, total, 0, total, 'draft', 0, due, '', new Date().toISOString()]);
  items.forEach(item => {
    run(`INSERT INTO invoice_items VALUES (?,?,?,?,?,?)`,
      [uuidv4(), invoiceId, item.description, item.amount, item.is_auto, new Date().toISOString()]);
  });
  return invoiceId;
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', loginLimiter, [
  body('username').trim().notEmpty().isLength({max:50}),
  body('password').notEmpty().isLength({max:200}),
], validate, async (req,res) => {
  const {username,password} = req.body;
  const userOk = username === (process.env.ADMIN_USERNAME||'admin');
  const passOk = process.env.ADMIN_PASSWORD_HASH ? await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH) : false;
  if(!userOk||!passOk) return res.status(401).json({error:'Invalid username or password.'});
  req.session.regenerate(err => {
    if(err) return res.status(500).json({error:'Session error.'});
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ok:true});
  });
});
app.post('/api/auth/logout', requireAuth, (req,res) => {
  req.session.destroy(() => { res.clearCookie('fs_sid'); res.json({ok:true}); });
});
app.get('/api/auth/me', (req,res) => res.json({authenticated:!!req.session?.authenticated}));

// ── STATIC ────────────────────────────────────────────────────────────────────
app.use('/css', express.static(path.join(__dirname,'public/css')));
app.use('/js',  express.static(path.join(__dirname,'public/js')));
app.get('/login', (req,res) => res.sendFile(path.join(__dirname,'public/login.html')));
app.get('/', (req,res) => {
  if(!req.session?.authenticated) return res.redirect('/login');
  res.sendFile(path.join(__dirname,'public/index.html'));
});

// ── ROOMS API ─────────────────────────────────────────────────────────────────
app.get('/api/rooms', requireAuth, (req,res) => {
  const today = new Date().toISOString().split('T')[0];
  const occupied = query(`
    SELECT room_id, booking_type, status FROM bookings
    WHERE status IN ('confirmed','checked-in')
    AND check_in <= ? AND (check_out >= ? OR check_out IS NULL)
  `, [today, today]);
  const occupiedIds = new Set(occupied.map(b=>b.room_id));
  res.json(ROOMS.map(r => ({...r, occupied: occupiedIds.has(r.id)})));
});

app.post('/api/rooms/check', requireAuth, (req,res) => {
  const {room_id, check_in, check_out, checkin_time, checkout_time, booking_type, exclude_id} = req.body;
  const conflict = checkRoomConflict(room_id, check_in, check_out, checkin_time, checkout_time, booking_type, exclude_id);
  res.json({available: !conflict, conflict: conflict || null});
});

// ── OWNERS ────────────────────────────────────────────────────────────────────
app.get('/api/owners', requireAuth, (req,res) => res.json(query('SELECT * FROM owners ORDER BY name')));

app.get('/api/owners/:id', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  const owner = query('SELECT * FROM owners WHERE id=?',[req.params.id])[0];
  if(!owner) return res.status(404).json({error:'Not found'});
  const dogs = query('SELECT * FROM pets WHERE owner_id=? ORDER BY name',[req.params.id]);
  res.json({...owner, dogs});
});

app.post('/api/owners', requireAuth, [
  body('name').trim().notEmpty().isLength({max:100}).escape(),
  body('phone').optional({checkFalsy:true}).trim().isLength({max:20}),
  body('email').optional({checkFalsy:true}).trim().isLength({max:150}),
  body('address').optional({checkFalsy:true}).trim().isLength({max:300}).escape(),
], validate, (req,res) => {
  const {name,phone,email,address} = req.body;
  const id = uuidv4();
  run('INSERT INTO owners VALUES (?,?,?,?,?,?)',[id,name,phone||'',email||'',address||'',new Date().toISOString()]);
  res.json({id,name,phone,email,address});
});

app.put('/api/owners/:id', requireAuth, [param('id').isUUID(),
  body('name').trim().notEmpty().isLength({max:100}).escape(),
  body('phone').optional({checkFalsy:true}).trim().isLength({max:20}),
  body('email').optional({checkFalsy:true}).trim().isEmail().normalizeEmail(),
  body('address').optional({checkFalsy:true}).trim().isLength({max:300}).escape(),
], validate, (req,res) => {
  const {name,phone,email,address} = req.body;
  run('UPDATE owners SET name=?,phone=?,email=?,address=? WHERE id=?',[name,phone,email,address,req.params.id]);
  res.json({success:true});
});

app.delete('/api/owners/:id', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  run('DELETE FROM owners WHERE id=?',[req.params.id]);
  res.json({success:true});
});

// ── PETS ──────────────────────────────────────────────────────────────────────
app.get('/api/pets', requireAuth, (req,res) => res.json(
  query('SELECT p.*, o.name as owner_name, o.phone as owner_phone FROM pets p LEFT JOIN owners o ON p.owner_id=o.id ORDER BY p.name')));

app.get('/api/pets/search', requireAuth, (req,res) => {
  const q = '%' + (req.query.q||'') + '%';
  res.json(query(`SELECT p.*, o.name as owner_name, o.phone as owner_phone, o.email as owner_email
    FROM pets p LEFT JOIN owners o ON p.owner_id=o.id
    WHERE p.name LIKE ? ORDER BY p.name LIMIT 10`, [q]));
});

app.get('/api/pets/:id', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  const pet = query('SELECT p.*, o.name as owner_name, o.phone as owner_phone FROM pets p LEFT JOIN owners o ON p.owner_id=o.id WHERE p.id=?',[req.params.id])[0];
  if(!pet) return res.status(404).json({error:'Not found'});
  res.json(pet);
});

app.post('/api/pets', requireAuth, [
  body('name').trim().notEmpty().isLength({max:100}).escape(),
  body('owner_id').optional({checkFalsy:true}).isUUID(),
  body('species').optional({checkFalsy:true}).trim().isLength({max:50}).escape(),
  body('breed').optional({checkFalsy:true}).trim().isLength({max:100}).escape(),
  body('age').optional({checkFalsy:true}).isInt({min:0,max:100}),
  body('weight').optional({checkFalsy:true}).isFloat({min:0,max:500}),
  body('notes').optional({checkFalsy:true}).trim().isLength({max:1000}).escape(),
  body('special_instructions').optional({checkFalsy:true}).trim().isLength({max:2000}).escape(),
  body('arv_vaccinated').optional().isBoolean(),
  body('kc_vaccinated').optional().isBoolean(),
], validate, (req,res) => {
  const {owner_id,name,species,breed,age,weight,notes,special_instructions,arv_vaccinated,arv_expiry,kc_vaccinated,kc_expiry} = req.body;
  const id = uuidv4();
  try {
    run(`INSERT INTO pets (id,owner_id,name,species,breed,age,weight,notes,special_instructions,arv_vaccinated,arv_expiry,kc_vaccinated,kc_expiry,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,owner_id||null,name,species||'Dog',breed||'',age||null,weight||null,notes||'',special_instructions||'',
       arv_vaccinated?1:0,arv_expiry||null,kc_vaccinated?1:0,kc_expiry||null,new Date().toISOString()]);
    res.json({id});
  } catch(e) {
    console.error('Pet insert error:', e.message);
    res.status(500).json({error:'Failed to create dog: '+e.message});
  }
});

app.put('/api/pets/:id', requireAuth, [param('id').isUUID(),
  body('name').trim().notEmpty().isLength({max:100}).escape(),
], validate, (req,res) => {
  const {owner_id,name,species,breed,age,weight,notes,special_instructions,arv_vaccinated,arv_expiry,kc_vaccinated,kc_expiry} = req.body;
  run(`UPDATE pets SET owner_id=?,name=?,species=?,breed=?,age=?,weight=?,notes=?,
    special_instructions=?,arv_vaccinated=?,arv_expiry=?,kc_vaccinated=?,kc_expiry=? WHERE id=?`,
    [owner_id,name,species,breed,age||null,weight||null,notes,special_instructions,
     arv_vaccinated?1:0,arv_expiry||null,kc_vaccinated?1:0,kc_expiry||null,req.params.id]);
  res.json({success:true});
});

app.delete('/api/pets/:id', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  run('DELETE FROM pets WHERE id=?',[req.params.id]);
  res.json({success:true});
});

// ── STAFF ─────────────────────────────────────────────────────────────────────
app.get('/api/staff', requireAuth, (req,res) => res.json(query('SELECT * FROM staff ORDER BY name')));

app.post('/api/staff', requireAuth, [
  body('name').trim().notEmpty().isLength({max:100}).escape(),
  body('role').optional({checkFalsy:true}).trim().isLength({max:60}).escape(),
  body('phone').optional({checkFalsy:true}).trim().isLength({max:20}),
  body('email').optional({checkFalsy:true}).trim().isEmail().normalizeEmail(),
  body('shift').optional({checkFalsy:true}).trim().isLength({max:60}).escape(),
], validate, (req,res) => {
  const {name,role,phone,email,shift} = req.body;
  const id = uuidv4();
  run('INSERT INTO staff VALUES (?,?,?,?,?,?,?)',[id,name,role,phone,email,shift,new Date().toISOString()]);
  res.json({id});
});

app.put('/api/staff/:id', requireAuth, [param('id').isUUID(),
  body('name').trim().notEmpty().isLength({max:100}).escape(),
], validate, (req,res) => {
  const {name,role,phone,email,shift} = req.body;
  run('UPDATE staff SET name=?,role=?,phone=?,email=?,shift=? WHERE id=?',[name,role,phone,email,shift,req.params.id]);
  res.json({success:true});
});

app.delete('/api/staff/:id', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  run('DELETE FROM staff WHERE id=?',[req.params.id]);
  res.json({success:true});
});

// ── BOOKINGS ──────────────────────────────────────────────────────────────────
app.get('/api/bookings', requireAuth, (req,res) => {
  const rows = query(`
    SELECT b.*, p.name as pet_name, p.species, p.special_instructions,
           o.name as owner_name, o.phone as owner_phone, s.name as staff_name
    FROM bookings b
    LEFT JOIN pets p ON b.pet_id=p.id
    LEFT JOIN owners o ON b.owner_id=o.id
    LEFT JOIN staff s ON b.staff_id=s.id
    ORDER BY b.check_in DESC, b.created_at DESC`);
  res.json(rows);
});

app.get('/api/bookings/calendar', requireAuth, (req,res) => {
  const rows = query(`
    SELECT b.*, p.name as pet_name, o.name as owner_name
    FROM bookings b
    LEFT JOIN pets p ON b.pet_id=p.id
    LEFT JOIN owners o ON b.owner_id=o.id
    WHERE b.status NOT IN ('cancelled')
    ORDER BY b.check_in`);
  res.json(rows);
});

app.post('/api/bookings', requireAuth, [
  body('pet_id').optional({checkFalsy:true}).isUUID(),
  body('owner_id').optional({checkFalsy:true}).isUUID(),
  body('check_in').notEmpty().isISO8601(),
  body('check_out').optional({checkFalsy:true}).isISO8601(),
  body('booking_type').isIn(['overnight','day_boarding','trial']),
  body('room_id').notEmpty().trim().isLength({max:5}).escape(),
  body('num_dogs').optional().isInt({min:1,max:20}),
  body('rate').optional({checkFalsy:true}).isFloat({min:0,max:100000}),
  body('notes').optional({checkFalsy:true}).trim().isLength({max:1000}).escape(),
], validate, (req,res) => {
  const {pet_id,owner_id,staff_id,check_in,check_out,checkin_time,checkout_time,
         booking_type,room_id,num_dogs,rate,notes} = req.body;

  // Conflict check
  const conflict = checkRoomConflict(room_id,check_in,check_out||check_in,checkin_time,checkout_time,booking_type);
  if(conflict) return res.status(409).json({error:`Room ${room_id} is already booked for that period.`});

  const id = uuidv4();
  const now = new Date().toISOString();
  run(`INSERT INTO bookings (id,pet_id,owner_id,staff_id,check_in,check_out,checkin_time,checkout_time,status,status_confirmed_at,status_checkedin_at,status_checkedout_at,status_cancelled_at,booking_type,room_id,kennel,num_dogs,rate,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,pet_id||null,owner_id||null,staff_id||null,check_in,check_out||null,
     checkin_time||null,checkout_time||null,
     'confirmed',now,null,null,null,
     booking_type,room_id,room_id,
     num_dogs||1,rate||null,notes||'',now]);

  // Auto-generate draft invoice
  const bookingForInvoice = {booking_type,room_id,check_in,check_out,rate,num_dogs:num_dogs||1};
  createDraftInvoice(id, owner_id, bookingForInvoice);

  res.json({id});
});

app.put('/api/bookings/:id', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  const {pet_id,owner_id,staff_id,check_in,check_out,checkin_time,checkout_time,
         status,booking_type,room_id,num_dogs,rate,notes} = req.body;

  const existing = query('SELECT * FROM bookings WHERE id=?',[req.params.id])[0];
  if(!existing) return res.status(404).json({error:'Not found'});

  // Conflict check if room or dates changed
  if(room_id !== existing.room_id || check_in !== existing.check_in || check_out !== existing.check_out){
    const conflict = checkRoomConflict(room_id,check_in,check_out||check_in,checkin_time,checkout_time,booking_type,req.params.id);
    if(conflict) return res.status(409).json({error:`Room ${room_id} is already booked for that period.`});
  }

  const now = new Date().toISOString();
  const confirmedAt = status==='confirmed' ? (existing.status_confirmed_at||now) : existing.status_confirmed_at;
  const checkedInAt = status==='checked-in' ? (existing.status_checkedin_at||now) : existing.status_checkedin_at;
  const checkedOutAt = status==='checked-out' ? (existing.status_checkedout_at||now) : existing.status_checkedout_at;
  const cancelledAt = status==='cancelled' ? (existing.status_cancelled_at||now) : existing.status_cancelled_at;

  run(`UPDATE bookings SET pet_id=?,owner_id=?,staff_id=?,check_in=?,check_out=?,
    checkin_time=?,checkout_time=?,status=?,
    status_confirmed_at=?,status_checkedin_at=?,status_checkedout_at=?,status_cancelled_at=?,
    booking_type=?,room_id=?,kennel=?,num_dogs=?,rate=?,notes=? WHERE id=?`,
    [pet_id,owner_id,staff_id||null,check_in,check_out||null,
     checkin_time||null,checkout_time||null,status,
     confirmedAt,checkedInAt,checkedOutAt,cancelledAt,
     booking_type,room_id,room_id,num_dogs||1,rate||null,notes,req.params.id]);

  // Flag invoice for review if key fields changed
  const invoice = query('SELECT id FROM invoices WHERE booking_id=? AND status != ?',[req.params.id,'paid'])[0];
  if(invoice && (check_in!==existing.check_in||check_out!==existing.check_out||room_id!==existing.room_id||num_dogs!==existing.num_dogs)){
    run('UPDATE invoices SET needs_review=1 WHERE id=?',[invoice.id]);
  }

  res.json({success:true});
});

app.post('/api/bookings/:id/end-trial', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  const now = new Date();
  const time = now.toTimeString().slice(0,5);
  run(`UPDATE bookings SET checkout_time=?, status='checked-out', status_checkedout_at=? WHERE id=? AND booking_type='trial'`,
    [time, now.toISOString(), req.params.id]);
  res.json({success:true, checkout_time:time});
});

app.delete('/api/bookings/:id', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  run('DELETE FROM bookings WHERE id=?',[req.params.id]);
  res.json({success:true});
});

// ── INVOICES ──────────────────────────────────────────────────────────────────
app.get('/api/invoices', requireAuth, (req,res) => {
  const invoices = query(`
    SELECT i.*, o.name as owner_name, b.check_in, b.check_out,
           b.booking_type, b.room_id, p.name as pet_name
    FROM invoices i
    LEFT JOIN owners o ON i.owner_id=o.id
    LEFT JOIN bookings b ON i.booking_id=b.id
    LEFT JOIN pets p ON b.pet_id=p.id
    ORDER BY i.created_at DESC`);
  invoices.forEach(inv => {
    inv.items = query('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY created_at',[inv.id]);
  });
  res.json(invoices);
});

app.get('/api/invoices/:id', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  const inv = query(`SELECT i.*, o.name as owner_name, b.check_in, b.check_out, b.booking_type, b.room_id, p.name as pet_name
    FROM invoices i LEFT JOIN owners o ON i.owner_id=o.id LEFT JOIN bookings b ON i.booking_id=b.id LEFT JOIN pets p ON b.pet_id=p.id
    WHERE i.id=?`,[req.params.id])[0];
  if(!inv) return res.status(404).json({error:'Not found'});
  inv.items = query('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY created_at',[inv.id]);
  res.json(inv);
});

app.post('/api/invoices/:id/items', requireAuth, [param('id').isUUID(),
  body('description').trim().notEmpty().isLength({max:500}),
  body('amount').isFloat({min:0,max:10000000}),
], validate, (req,res) => {
  const {description,amount} = req.body;
  const itemId = uuidv4();
  run('INSERT INTO invoice_items VALUES (?,?,?,?,?,?)',[itemId,req.params.id,description,amount,0,new Date().toISOString()]);
  // Recalc total
  const items = query('SELECT * FROM invoice_items WHERE invoice_id=?',[req.params.id]);
  const total = items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0);
  run('UPDATE invoices SET total=?,amount=? WHERE id=?',[total,total,req.params.id]);
  res.json({success:true,itemId,total});
});

app.delete('/api/invoices/:id/items/:itemId', requireAuth, (req,res) => {
  run('DELETE FROM invoice_items WHERE id=? AND invoice_id=? AND is_auto=0',[req.params.itemId,req.params.id]);
  const items = query('SELECT * FROM invoice_items WHERE invoice_id=?',[req.params.id]);
  const total = items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0);
  run('UPDATE invoices SET total=?,amount=? WHERE id=?',[total,total,req.params.id]);
  res.json({success:true,total});
});

app.put('/api/invoices/:id/status', requireAuth, [param('id').isUUID(),
  body('status').isIn(['draft','finalised','paid']),
], validate, (req,res) => {
  run('UPDATE invoices SET status=?,needs_review=0 WHERE id=?',[req.body.status,req.params.id]);
  res.json({success:true});
});

app.put('/api/invoices/:id/notes', requireAuth, [param('id').isUUID()], validate, (req,res) => {
  run('UPDATE invoices SET notes=? WHERE id=?',[req.body.notes||'',req.params.id]);
  res.json({success:true});
});

// ── STATS ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, (req,res) => {
  const today = new Date().toISOString().split('T')[0];
  res.json({
    total_pets:      query('SELECT COUNT(*) as c FROM pets')[0].c,
    total_owners:    query('SELECT COUNT(*) as c FROM owners')[0].c,
    active_bookings: query(`SELECT COUNT(*) as c FROM bookings WHERE status IN ('confirmed','checked-in') AND (check_out >= ? OR check_out IS NULL)`, [today])[0].c,
    checkedin_now:   query(`SELECT COUNT(*) as c FROM bookings WHERE status='checked-in'`)[0].c,
    expected_today:  query(`SELECT COUNT(*) as c FROM bookings WHERE status='confirmed' AND check_in=?`, [today])[0].c,
    checkout_today:  query(`SELECT COUNT(*) as c FROM bookings WHERE status='checked-in' AND check_out=?`, [today])[0].c,
    unpaid_invoices: query(`SELECT COUNT(*) as c FROM invoices WHERE status != 'paid'`)[0].c,
    revenue_month:   query(`SELECT COALESCE(SUM(total),0) as s FROM invoices WHERE status='paid' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`)[0].s,
    revenue_overnight: query(`SELECT COALESCE(SUM(i.total),0) as s FROM invoices i JOIN bookings b ON i.booking_id=b.id WHERE i.status='paid' AND b.booking_type='overnight' AND strftime('%Y-%m',i.created_at)=strftime('%Y-%m','now')`)[0].s,
    revenue_day:     query(`SELECT COALESCE(SUM(i.total),0) as s FROM invoices i JOIN bookings b ON i.booking_id=b.id WHERE i.status='paid' AND b.booking_type IN ('day_boarding','trial') AND strftime('%Y-%m',i.created_at)=strftime('%Y-%m','now')`)[0].s,
    staff_count:     query('SELECT COUNT(*) as c FROM staff')[0].c,
  });
});

app.get('/api/stats/today-rooms', requireAuth, (req,res) => {
  const today = new Date().toISOString().split('T')[0];
  const bookings = query(`
    SELECT b.*, p.name as pet_name, p.special_instructions, o.name as owner_name
    FROM bookings b
    LEFT JOIN pets p ON b.pet_id=p.id
    LEFT JOIN owners o ON b.owner_id=o.id
    WHERE b.status NOT IN ('cancelled','checked-out')
    AND (b.check_in <= ? AND (b.check_out >= ? OR b.check_out IS NULL))
  `, [today, today]);
  res.json({ rooms: ROOMS, bookings, today });
});

// ── EXPORT ────────────────────────────────────────────────────────────────────
app.get('/api/export/:type', requireAuth, (req,res) => {
  const { type } = req.params;
  const { from, to } = req.query;
  const dateFilter = (col) => from && to ? ` AND date(${col}) BETWEEN '${from}' AND '${to}'` : '';

  const wb = XLSX.utils.book_new();

  if(type === 'owners' || type === 'all'){
    const owners = query(`SELECT o.*, GROUP_CONCAT(p.name, ', ') as dogs FROM owners o LEFT JOIN pets p ON p.owner_id=o.id GROUP BY o.id ORDER BY o.name`);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(owners.map(o=>({
      Name:o.name, Phone:o.phone||'', Email:o.email||'', Address:o.address||'',
      Dogs:o.dogs||'', 'Member Since':o.created_at?.split('T')[0]||''
    }))), 'Owners');
  }

  if(type === 'pets' || type === 'all'){
    const pets = query(`SELECT p.*, o.name as owner_name, o.phone as owner_phone FROM pets p LEFT JOIN owners o ON p.owner_id=o.id ORDER BY p.name`);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pets.map(p=>({
      Name:p.name, Breed:p.breed||'', Gender:p.species||'', Age:p.age||'', 'Weight (kg)':p.weight||'',
      Owner:p.owner_name||'', 'Owner Phone':p.owner_phone||'',
      'Care Notes':p.notes||'', 'Special Instructions':p.special_instructions||'',
      'ARV Vaccinated':p.arv_vaccinated?'Yes':'No', 'ARV Expiry':p.arv_expiry||'',
      'Kennel Cough Vaccinated':p.kc_vaccinated?'Yes':'No', 'KC Expiry':p.kc_expiry||'',
    }))), 'Dogs');
  }

  if(type === 'bookings' || type === 'all'){
    const bookings = query(`SELECT b.*, p.name as pet_name, o.name as owner_name FROM bookings b LEFT JOIN pets p ON b.pet_id=p.id LEFT JOIN owners o ON b.owner_id=o.id ORDER BY b.check_in DESC`);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookings.map(b=>({
      Dog:b.pet_name||'', Owner:b.owner_name||'', Type:b.booking_type||'',
      Room:b.room_id||'', Status:b.status||'',
      'Check-in':b.check_in||'', 'Check-out':b.check_out||'',
      'Check-in Time':b.checkin_time||'', 'Check-out Time':b.checkout_time||'',
      Dogs:b.num_dogs||1, Rate:b.rate||'', Notes:b.notes||'',
    }))), 'Bookings');
  }

  if(type === 'invoices' || type === 'all'){
    const invoices = query(`SELECT i.*, o.name as owner_name, p.name as pet_name, b.booking_type, b.room_id FROM invoices i LEFT JOIN owners o ON i.owner_id=o.id LEFT JOIN bookings b ON i.booking_id=b.id LEFT JOIN pets p ON b.pet_id=p.id ORDER BY i.created_at DESC`);
    const rows = [];
    invoices.forEach(inv => {
      const items = query('SELECT * FROM invoice_items WHERE invoice_id=?',[inv.id]);
      rows.push({
        Owner:inv.owner_name||'', Dog:inv.pet_name||'', Type:inv.booking_type||'',
        Room:inv.room_id||'', Status:inv.status||'',
        'Line Items': items.map(i=>`${i.description}: ₹${i.amount}`).join(' | '),
        Total:inv.total||0, 'Due Date':inv.due_date||'', Notes:inv.notes||'',
        'Created':inv.created_at?.split('T')[0]||'',
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Invoices');
  }

  const buf = XLSX.write(wb, {type:'buffer', bookType:'xlsx'});
  const filename = `furr-seasons-${type}-${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err,req,res,next) => {
  console.error(err.stack);
  res.status(500).json({error:'Something went wrong.'});
});

initDB().then(() => {
  app.listen(PORT, () => console.log(`✓ Furr Seasons running on port ${PORT}`));
});
