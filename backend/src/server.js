require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "64kb" }));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || "*" } });

async function startRedisAdapter() {
  if (!process.env.REDIS_URL) return;
  try {
    const pub = createClient({ url: process.env.REDIS_URL });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    console.log("Socket.IO Redis adapter enabled");
  } catch (e) {
    console.warn("Redis adapter unavailable; running single-instance mode:", e.message);
  }
}
const sign = user => jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
function auth(req,res,next) {
  const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  try { req.user=jwt.verify(token,process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({error:"يلزم تسجيل الدخول"}); }
}
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

app.get("/health",(req,res)=>res.json({ok:true,service:"football-challenge-api"}));

app.post("/api/auth/register", asyncRoute(async(req,res)=>{
  const {username,email,password}=req.body||{};
  if(!username||!email||!password||password.length<8) return res.status(400).json({error:"أدخل اسم مستخدم وبريداً وكلمة مرور من 8 أحرف على الأقل"});
  const hash=await bcrypt.hash(password,12);
  try {
    const q=await pool.query("INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING id,username,email,points",[username,email.toLowerCase(),hash]);
    res.status(201).json({token:sign(q.rows[0]),user:q.rows[0]});
  } catch(e) { if(e.code==="23505") return res.status(409).json({error:"اسم المستخدم أو البريد مستخدم مسبقاً"}); throw e; }
}));
app.post("/api/auth/login", asyncRoute(async(req,res)=>{
  const {email,password}=req.body||{};
  const q=await pool.query("SELECT * FROM users WHERE email=$1",[String(email||"").toLowerCase()]);
  if(!q.rowCount || !(await bcrypt.compare(password||"",q.rows[0].password_hash))) return res.status(401).json({error:"بيانات الدخول غير صحيحة"});
  const u=q.rows[0]; res.json({token:sign(u),user:{id:u.id,username:u.username,email:u.email,points:u.points}});
}));
app.get("/api/me",auth,asyncRoute(async(req,res)=>{
  const q=await pool.query("SELECT id,username,email,points FROM users WHERE id=$1",[req.user.id]);
  res.json(q.rows[0]||{});
}));
app.get("/api/questions",auth,asyncRoute(async(req,res)=>{
  const category=req.query.category;
  const difficulty=req.query.difficulty;
  const params=[]; let where="active=TRUE";
  if(category){params.push(category);where+=` AND category=$${params.length}`;}
  if(difficulty){params.push(difficulty);where+=` AND difficulty=$${params.length}`;}
  params.push(Math.min(Number(req.query.limit)||20,100));
  const q=await pool.query(`SELECT id,category,difficulty,question,options FROM questions WHERE ${where} ORDER BY RANDOM() LIMIT $${params.length}`,params);
  res.json({questions:q.rows});
}));
app.post("/api/rooms",auth,asyncRoute(async(req,res)=>{
  const rounds=Math.max(1,Math.min(100,Number(req.body.rounds)||5));
  const questionsPerRound=Math.max(1,Math.min(20,Number(req.body.questionsPerRound)||5));
  const code=Math.random().toString(36).slice(2,8).toUpperCase();
  const q=await pool.query("INSERT INTO game_rooms(code,host_user_id,rounds,questions_per_round) VALUES($1,$2,$3,$4) RETURNING id,code,rounds,questions_per_round,status",[code,req.user.id,rounds,questionsPerRound]);
  await pool.query("INSERT INTO room_players(room_id,user_id) VALUES($1,$2)",[q.rows[0].id,req.user.id]);
  res.status(201).json({room:q.rows[0]});
}));
app.post("/api/rooms/join",auth,asyncRoute(async(req,res)=>{
  const code=String(req.body.code||"").toUpperCase();
  const q=await pool.query("SELECT * FROM game_rooms WHERE code=$1 AND status='waiting'",[code]);
  if(!q.rowCount) return res.status(404).json({error:"الغرفة غير موجودة أو بدأت"});
  await pool.query("INSERT INTO room_players(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[q.rows[0].id,req.user.id]);
  io.to(code).emit("room_update",{event:"player_joined"});
  res.json({room:{id:q.rows[0].id,code:q.rows[0].code,rounds:q.rows[0].rounds}});
}));
app.get("/api/leaderboard",asyncRoute(async(req,res)=>{
  const q=await pool.query("SELECT username,points FROM users ORDER BY points DESC,created_at ASC LIMIT 100");
  res.json({leaderboard:q.rows});
}));
app.post("/api/score",auth,asyncRoute(async(req,res)=>{
  const points=Math.max(0,Math.min(100000,Number(req.body.points)||0));
  const q=await pool.query("UPDATE users SET points=points+$1 WHERE id=$2 RETURNING points",[points,req.user.id]);
  res.json({points:q.rows[0].points});
}));

io.use((socket,next)=>{
  try { socket.user=jwt.verify(socket.handshake.auth.token,process.env.JWT_SECRET); next(); }
  catch { next(new Error("unauthorized")); }
});
io.on("connection",socket=>{
  socket.on("join_room",async({code}={})=>{
    const room=String(code||"").toUpperCase();
    const q=await pool.query("SELECT id FROM game_rooms WHERE code=$1",[room]);
    if(!q.rowCount) return socket.emit("room_error",{message:"الغرفة غير موجودة"});
    await pool.query("INSERT INTO room_players(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[q.rows[0].id,socket.user.id]);
    socket.join(room); io.to(room).emit("room_update",{event:"player_connected",username:socket.user.username});
  });
  socket.on("chat_message",({code,message}={})=>{
    if(!code||!message||String(message).length>300) return;
    io.to(String(code).toUpperCase()).emit("chat_message",{username:socket.user.username,message:String(message)});
  });
});

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(500).json({error:"حدث خطأ في الخادم"});
});
const port=Number(process.env.PORT)||3000;
startRedisAdapter().finally(()=>server.listen(port,()=>console.log(`API listening on ${port}`)));
