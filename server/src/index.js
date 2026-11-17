require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN || '*' } });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is required. Set it in .env');

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../web')));

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'يلزم تسجيل الدخول.' }); }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'football-challenge' }));

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password || password.length < 8)
      return res.status(400).json({ error: 'أدخل اسم مستخدم وبريداً وكلمة مرور من 8 أحرف على الأقل.' });
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING id,username,email',
      [username.trim(), email.trim().toLowerCase(), hash]
    );
    const user = result.rows[0];
    res.json({ token: sign(user), user: { id: user.id, username: user.username, email: user.email } });
  } catch (e) {
    res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'اسم المستخدم أو البريد مستخدم.' : 'تعذر إنشاء الحساب.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash)))
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });
    res.json({ token: sign(user), user: { id: user.id, username: user.username, email: user.email } });
  } catch { res.status(500).json({ error: 'تعذر تسجيل الدخول.' }); }
});

app.get('/api/me', auth, async (req, res) => {
  const r = await pool.query('SELECT id,username,email FROM users WHERE id=$1', [req.user.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'الحساب غير موجود.' });
  res.json({ user: r.rows[0] });
});

app.get('/api/questions', auth, async (req, res) => {
  const category = ['transfer','general'].includes(req.query.category) ? req.query.category : null;
  const r = await pool.query(
    `SELECT id,category,difficulty,question,options,correct_index,explanation FROM questions ${category ? 'WHERE category=$1' : ''} ORDER BY id`,
    category ? [category] : []
  );
  res.json({ questions: r.rows });
});

const rooms = new Map();
const sampleQuestions = [
  {category:'general',q:'أي منتخب فاز بكأس العالم 2022؟',o:['الأرجنتين','فرنسا','البرازيل','ألمانيا'],a:0},
  {category:'general',q:'كم لاعباً يبدأ به كل فريق؟',o:['9','10','11','12'],a:2},
  {category:'general',q:'ما النادي الأكثر تتويجاً بدوري أبطال أوروبا؟',o:['برشلونة','ريال مدريد','ميلان','بايرن ميونخ'],a:1},
  {category:'general',q:'كم مدة المباراة الأصلية؟',o:['80','90','100','120 دقيقة'],a:1},
  {category:'transfer',q:'انتقل رونالدو من مانشستر يونايتد إلى أي نادٍ عام 2009؟',o:['ريال مدريد','يوفنتوس','النصر','سبورتينغ'],a:0},
  {category:'transfer',q:'من أي نادٍ انتقل سواريز إلى برشلونة؟',o:['ليفربول','أياكس','أتلتيكو','نابولي'],a:0},
  {category:'transfer',q:'من أي نادٍ انتقل هالاند إلى مانشستر سيتي؟',o:['دورتموند','لايبزيغ','سالزبورغ','مولده'],a:0},
  {category:'transfer',q:'من أي نادٍ انتقل بيلينغهام إلى ريال مدريد؟',o:['دورتموند','تشيلسي','ليفربول','بايرن'],a:0}
];

function publicRoom(room) {
  return { code: room.code, host: room.host, settings: room.settings, status: room.status,
    players: [...room.players.values()].map(p => ({ username:p.username, score:p.score, ready:p.ready })) };
}
function emitRoom(room) { io.to(room.code).emit('room:update', publicRoom(room)); }
function chooseQuestions(room) {
  let poolQ = sampleQuestions.filter(q => room.settings.category === 'mixed' || q.category === room.settings.category);
  if (!poolQ.length) poolQ = sampleQuestions;
  const out = [];
  for (let i=0;i<room.settings.rounds;i++) out.push(poolQ[i % poolQ.length]);
  return out;
}
function sendQuestion(room) {
  const q = room.questions[room.round - 1];
  if (!q) return finishRoom(room);
  room.answers = new Map();
  io.to(room.code).emit('game:question', {
    round: room.round, total: room.settings.rounds, category: q.category,
    question: q.q, options: q.o, seconds: room.settings.seconds
  });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => advanceRound(room), room.settings.seconds * 1000);
}
function advanceRound(room) {
  if (!rooms.has(room.code) || room.status !== 'playing') return;
  const q = room.questions[room.round - 1];
  io.to(room.code).emit('game:reveal', { correctIndex: q.a, explanation: q.explanation || '' });
  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    room.round++;
    if (room.round > room.settings.rounds) finishRoom(room);
    else sendQuestion(room);
  }, 2500);
}
function finishRoom(room) {
  clearTimeout(room.timer);
  room.status = 'finished';
  const ranking = [...room.players.values()].sort((a,b) => b.score-a.score);
  io.to(room.code).emit('game:finished', { ranking: ranking.map((p,i)=>({rank:i+1,username:p.username,score:p.score})) });
  emitRoom(room);
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { next(new Error('AUTH_REQUIRED')); }
});

io.on('connection', socket => {
  socket.on('room:create', (settings, cb = ()=>{}) => {
    const rounds = Math.max(1, Math.min(100, Number(settings?.rounds) || 10));
    const maxPlayers = Math.max(2, Math.min(20, Number(settings?.maxPlayers) || 8));
    const seconds = Math.max(5, Math.min(90, Number(settings?.seconds) || 20));
    const category = ['transfer','general','mixed'].includes(settings?.category) ? settings.category : 'mixed';
    const code = Math.random().toString(36).slice(2,8).toUpperCase();
    const room = { code, host: socket.user.username, settings:{rounds,maxPlayers,seconds,category},
      players:new Map(), status:'waiting', round:0, answers:new Map(), questions:[], timer:null };
    room.players.set(socket.id,{username:socket.user.username,score:0,ready:true});
    rooms.set(code,room); socket.join(code); cb({ok:true,room:publicRoom(room)}); emitRoom(room);
  });

  socket.on('room:join', (code, cb = ()=>{}) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return cb({ok:false,error:'الغرفة غير موجودة.'});
    if (room.status !== 'waiting') return cb({ok:false,error:'المباراة بدأت بالفعل.'});
    if (room.players.size >= room.settings.maxPlayers) return cb({ok:false,error:'الغرفة مكتملة.'});
    if ([...room.players.values()].some(p=>p.username===socket.user.username)) return cb({ok:false,error:'أنت داخل الغرفة بالفعل.'});
    room.players.set(socket.id,{username:socket.user.username,score:0,ready:true});
    socket.join(room.code); cb({ok:true,room:publicRoom(room)}); emitRoom(room);
  });

  socket.on('game:start', (code, cb = ()=>{}) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.host !== socket.user.username) return cb({ok:false,error:'فقط منشئ الغرفة يستطيع البدء.'});
    if (room.status !== 'waiting') return cb({ok:false,error:'المباراة بدأت.'});
    if (room.players.size < 2) return cb({ok:false,error:'تحتاج إلى لاعبين اثنين على الأقل.'});
    room.status='playing'; room.questions=chooseQuestions(room); room.round=1;
    io.to(room.code).emit('game:started'); emitRoom(room); sendQuestion(room); cb({ok:true});
  });

  socket.on('game:answer', ({code, choice}, cb = ()=>{}) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.status !== 'playing' || room.answers.has(socket.id)) return cb({ok:false});
    const player = room.players.get(socket.id);
    if (!player) return cb({ok:false});
    const q = room.questions[room.round - 1];
    const correct = Number(choice) === q.a;
    room.answers.set(socket.id, true);
    if (correct) player.score += 10;
    cb({ok:true,correct});
    io.to(room.code).emit('room:update', publicRoom(room));
    if (room.answers.size >= room.players.size) { clearTimeout(room.timer); advanceRound(room); }
  });

  socket.on('disconnect', () => {
    for (const [code,room] of rooms) {
      if (room.players.delete(socket.id)) {
        if (!room.players.size) { clearTimeout(room.timer); rooms.delete(code); }
        else { emitRoom(room); if (room.status==='playing' && room.answers.size >= room.players.size) advanceRound(room); }
      }
    }
  });
});

server.listen(PORT, () => console.log(`Football Challenge server listening on ${PORT}`));
