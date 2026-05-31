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

const app    = express();
const PORT   = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/app/data/furr-seasons.db'
  : path.join(__dirname, 'furr-seasons.db');

// ─────────────────────────────────────────────
// SECURITY: Helmet — sets 15+ secure HTTP headers
// Prevents clickjacking, MIME sniffing, XSS via headers
// ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe_inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// SECURITY: Trust Railway's proxy for accurate IP tracking
if (isProd) app.set('trust proxy', 1);

// SECURITY: CORS — locked to your own domain only in production
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors({
  origin: isProd ? (allowedOrigin || false) : true,
  credentials: true,
}));

// Body parsing with size limits — prevents payload bomb attacks
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// ─────────────────────────────────────────────
// SECURITY: Sessions — httpOnly + secure + sameSite
// httpOnly: JS cannot steal the cookie (XSS protection)
// secure: cookie only sent over HTTPS in production
// sameSite strict: blocks CSRF attacks
// ─────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || (() => { throw new Error('SESSION_SECRET not set'); })(),
  name: 'fs_sid',           // non-default name; hides what framework you're using
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,  // 8-hour sessions
  },
}));

// ─────────────────────────────────────────────
// SECURITY: Rate limiting
// Login: max 10 attempts per 15 min per IP — stops brute force
// API: max 150 req/min — stops scraping/flooding
// ─────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  message: { error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ─────────────────────────────────────────────
// AUTH MIDDLEWARE
// Every API route requires a valid session.
// No session = 401. No exceptions.
// ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized.' });
}

// Validation error handler
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// ─────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────
let db;

async function initDB() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`PRAGMA journal_mode=WAL`);  // safer writes

  db.run(`CREATE TABLE IF NOT EXISTS owners (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, created_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY, owner_id TEXT, name TEXT NOT NULL, species TEXT, breed TEXT,
    age INTEGER, weight REAL, notes TEXT, created_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT, phone TEXT, email TEXT, shift TEXT, created_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, pet_id TEXT, owner_id TEXT, staff_id TEXT,
    check_in TEXT, check_out TEXT, status TEXT DEFAULT 'confirmed',
    kennel TEXT, rate REAL, notes TEXT, created_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY, booking_id TEXT, owner_id TEXT, amount REAL, tax REAL,
    total REAL, status TEXT DEFAULT 'unpaid', due_date TEXT, notes TEXT, created_at TEXT)`);

  saveDB();
  console.log('✓ Database ready');
}

function saveDB() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

// SECURITY: All queries use parameterised statements — zero SQL injection risk
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

// ─────────────────────────────────────────────
// VALIDATION SCHEMAS
// Every input is typed, length-capped, and sanitised.
// Prevents XSS, overflow, and garbage data.
// ─────────────────────────────────────────────
const ownerRules = [
  body('name').trim().notEmpty().isLength({ max: 100 }).escape(),
  body('phone').optional({checkFalsy:true}).trim().isLength({ max: 20 }),
  body('email').optional({checkFalsy:true}).trim().isEmail().normalizeEmail().isLength({ max: 150 }),
  body('address').optional({checkFalsy:true}).trim().isLength({ max: 300 }).escape(),
];
const petRules = [
  body('name').trim().notEmpty().isLength({ max: 100 }).escape(),
  body('owner_id').optional({checkFalsy:true}).isUUID(),
  body('species').optional({checkFalsy:true}).trim().isLength({ max: 50 }).escape(),
  body('breed').optional({checkFalsy:true}).trim().isLength({ max: 100 }).escape(),
  body('age').optional({checkFalsy:true}).isInt({ min: 0, max: 100 }),
  body('weight').optional({checkFalsy:true}).isFloat({ min: 0, max: 500 }),
  body('notes').optional({checkFalsy:true}).trim().isLength({ max: 1000 }).escape(),
];
const staffRules = [
  body('name').trim().notEmpty().isLength({ max: 100 }).escape(),
  body('role').optional({checkFalsy:true}).trim().isLength({ max: 60 }).escape(),
  body('phone').optional({checkFalsy:true}).trim().isLength({ max: 20 }),
  body('email').optional({checkFalsy:true}).trim().isEmail().normalizeEmail().isLength({ max: 150 }),
  body('shift').optional({checkFalsy:true}).trim().isLength({ max: 60 }).escape(),
];
const bookingRules = [
  body('pet_id').optional({checkFalsy:true}).isUUID(),
  body('owner_id').optional({checkFalsy:true}).isUUID(),
  body('staff_id').optional({checkFalsy:true}).isUUID(),
  body('check_in').optional({checkFalsy:true}).isISO8601(),
  body('check_out').optional({checkFalsy:true}).isISO8601(),
  body('status').optional({checkFalsy:true}).isIn(['confirmed','checked-out','cancelled']),
  body('kennel').optional({checkFalsy:true}).trim().isLength({ max: 10 }).escape(),
  body('rate').optional({checkFalsy:true}).isFloat({ min: 0, max: 100000 }),
  body('notes').optional({checkFalsy:true}).trim().isLength({ max: 1000 }).escape(),
];
const invoiceRules = [
  body('booking_id').optional({checkFalsy:true}).isUUID(),
  body('owner_id').optional({checkFalsy:true}).isUUID(),
  body('amount').isFloat({ min: 0, max: 10000000 }),
  body('tax').optional({checkFalsy:true}).isFloat({ min: 0, max: 10000000 }),
  body('due_date').optional({checkFalsy:true}).isISO8601(),
  body('notes').optional({checkFalsy:true}).trim().isLength({ max: 500 }).escape(),
];
const idRule = [param('id').isUUID()];

// ─────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────

// Login — rate limited, bcrypt password comparison
app.post('/api/auth/login', loginLimiter, [
  body('username').trim().notEmpty().isLength({ max: 50 }),
  body('password').notEmpty().isLength({ max: 200 }),
], validate, async (req, res) => {
  const { username, password } = req.body;
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  // SECURITY: Both checks run regardless of username match
  // Prevents timing attacks that reveal valid usernames
  const userOk = username === expectedUser;
  const passOk = expectedHash ? await bcrypt.compare(password, expectedHash) : false;

  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  req.session.regenerate((err) => {  // SECURITY: new session ID on login (session fixation prevention)
    if (err) return res.status(500).json({ error: 'Session error.' });
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ ok: true });
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('fs_sid');
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

// ─────────────────────────────────────────────
// STATIC FILES
// Login page is public; everything else requires auth at the route level
// ─────────────────────────────────────────────
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js',  express.static(path.join(__dirname, 'public/js')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/', (req, res) => {
  if (!req.session?.authenticated) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ─────────────────────────────────────────────
// API ROUTES — all require auth
// ─────────────────────────────────────────────

// OWNERS
app.get('/api/owners', requireAuth, (req, res) =>
  res.json(query('SELECT * FROM owners ORDER BY name')));

app.post('/api/owners', requireAuth, ownerRules, validate, (req, res) => {
  const { name, phone, email, address } = req.body;
  const id = uuidv4();
  run('INSERT INTO owners VALUES (?,?,?,?,?,?)', [id, name, phone, email, address, new Date().toISOString()]);
  res.json({ id, name, phone, email, address });
});

app.put('/api/owners/:id', requireAuth, [...idRule, ...ownerRules], validate, (req, res) => {
  const { name, phone, email, address } = req.body;
  run('UPDATE owners SET name=?,phone=?,email=?,address=? WHERE id=?',
    [name, phone, email, address, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/owners/:id', requireAuth, idRule, validate, (req, res) => {
  run('DELETE FROM owners WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// PETS
app.get('/api/pets', requireAuth, (req, res) =>
  res.json(query('SELECT p.*, o.name as owner_name FROM pets p LEFT JOIN owners o ON p.owner_id=o.id ORDER BY p.name')));

app.post('/api/pets', requireAuth, petRules, validate, (req, res) => {
  const { owner_id, name, species, breed, age, weight, notes } = req.body;
  const id = uuidv4();
  run('INSERT INTO pets VALUES (?,?,?,?,?,?,?,?,?)',
    [id, owner_id, name, species, breed, age||null, weight||null, notes, new Date().toISOString()]);
  res.json({ id });
});

app.put('/api/pets/:id', requireAuth, [...idRule, ...petRules], validate, (req, res) => {
  const { owner_id, name, species, breed, age, weight, notes } = req.body;
  run('UPDATE pets SET owner_id=?,name=?,species=?,breed=?,age=?,weight=?,notes=? WHERE id=?',
    [owner_id, name, species, breed, age||null, weight||null, notes, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/pets/:id', requireAuth, idRule, validate, (req, res) => {
  run('DELETE FROM pets WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// STAFF
app.get('/api/staff', requireAuth, (req, res) =>
  res.json(query('SELECT * FROM staff ORDER BY name')));

app.post('/api/staff', requireAuth, staffRules, validate, (req, res) => {
  const { name, role, phone, email, shift } = req.body;
  const id = uuidv4();
  run('INSERT INTO staff VALUES (?,?,?,?,?,?,?)',
    [id, name, role, phone, email, shift, new Date().toISOString()]);
  res.json({ id });
});

app.put('/api/staff/:id', requireAuth, [...idRule, ...staffRules], validate, (req, res) => {
  const { name, role, phone, email, shift } = req.body;
  run('UPDATE staff SET name=?,role=?,phone=?,email=?,shift=? WHERE id=?',
    [name, role, phone, email, shift, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/staff/:id', requireAuth, idRule, validate, (req, res) => {
  run('DELETE FROM staff WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// BOOKINGS
app.get('/api/bookings', requireAuth, (req, res) =>
  res.json(query(`
    SELECT b.*, p.name as pet_name, p.species, o.name as owner_name,
           o.phone as owner_phone, s.name as staff_name
    FROM bookings b
    LEFT JOIN pets p ON b.pet_id=p.id
    LEFT JOIN owners o ON b.owner_id=o.id
    LEFT JOIN staff s ON b.staff_id=s.id
    ORDER BY b.check_in DESC`)));

app.post('/api/bookings', requireAuth, bookingRules, validate, (req, res) => {
  const { pet_id, owner_id, staff_id, check_in, check_out, kennel, rate, notes } = req.body;
  const id = uuidv4();
  run('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [id, pet_id, owner_id, staff_id||null, check_in, check_out, 'confirmed', kennel, rate||null, notes, new Date().toISOString()]);
  res.json({ id });
});

app.put('/api/bookings/:id', requireAuth, [...idRule, ...bookingRules], validate, (req, res) => {
  const { pet_id, owner_id, staff_id, check_in, check_out, status, kennel, rate, notes } = req.body;
  run('UPDATE bookings SET pet_id=?,owner_id=?,staff_id=?,check_in=?,check_out=?,status=?,kennel=?,rate=?,notes=? WHERE id=?',
    [pet_id, owner_id, staff_id||null, check_in, check_out, status, kennel, rate||null, notes, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/bookings/:id', requireAuth, idRule, validate, (req, res) => {
  run('DELETE FROM bookings WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// INVOICES
app.get('/api/invoices', requireAuth, (req, res) =>
  res.json(query(`
    SELECT i.*, o.name as owner_name, b.check_in, b.check_out, p.name as pet_name
    FROM invoices i
    LEFT JOIN owners o ON i.owner_id=o.id
    LEFT JOIN bookings b ON i.booking_id=b.id
    LEFT JOIN pets p ON b.pet_id=p.id
    ORDER BY i.created_at DESC`)));

app.post('/api/invoices', requireAuth, invoiceRules, validate, (req, res) => {
  const { booking_id, owner_id, amount, tax, due_date, notes } = req.body;
  const id = uuidv4();
  const total = parseFloat(amount) + parseFloat(tax || 0);
  run('INSERT INTO invoices VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, booking_id, owner_id, amount, tax||0, total, 'unpaid', due_date, notes, new Date().toISOString()]);
  res.json({ id, total });
});

app.put('/api/invoices/:id/status', requireAuth, [
  param('id').isUUID(),
  body('status').isIn(['paid','unpaid','overdue']),
], validate, (req, res) => {
  run('UPDATE invoices SET status=? WHERE id=?', [req.body.status, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/invoices/:id', requireAuth, idRule, validate, (req, res) => {
  run('DELETE FROM invoices WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// STATS
app.get('/api/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  res.json({
    total_pets:      query('SELECT COUNT(*) as c FROM pets')[0].c,
    total_owners:    query('SELECT COUNT(*) as c FROM owners')[0].c,
    active_bookings: query(`SELECT COUNT(*) as c FROM bookings WHERE status='confirmed' AND check_out >= ?`, [today])[0].c,
    checkins_today:  query(`SELECT COUNT(*) as c FROM bookings WHERE date(check_in)=?`, [today])[0].c,
    checkouts_today: query(`SELECT COUNT(*) as c FROM bookings WHERE date(check_out)=?`, [today])[0].c,
    unpaid_invoices: query(`SELECT COUNT(*) as c FROM invoices WHERE status='unpaid'`)[0].c,
    revenue_month:   query(`SELECT COALESCE(SUM(total),0) as s FROM invoices WHERE status='paid' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`)[0].s,
    staff_count:     query('SELECT COUNT(*) as c FROM staff')[0].c,
  });
});

// SECURITY: Generic error handler — never leaks stack traces to client
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong.' });
});

initDB().then(() => {
  app.listen(PORT, () => console.log(`✓ Furr Seasons running on port ${PORT}`));
});
