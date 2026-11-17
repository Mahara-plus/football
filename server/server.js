const http=require("http");const {WebSocketServer}=require("ws");
const srv=http.createServer((q,r)=>r.end("ok"));
const wss=new WebSocketServer({server:srv,maxPayload:20000});
const rooms=new Map();let nid=1;
const code=()=>{let c;do{c=Math.random().toString(36).slice(2,7).toUpperCase()}while(rooms.has(c));return c};
const snd=(w,o)=>{if(w&&w.readyState===1)w.send(JSON.stringify(o))};
wss.on("connection",ws=>{
 ws.on("message",raw=>{
  let m;try{m=JSON.parse(raw)}catch(e){return}
  if(m.t==="create"&&!ws.room){const c=code();rooms.set(c,{host:ws,g:new Map(),last:null});ws.room=c;ws.role="h";snd(ws,{t:"created",code:c})}
  else if(m.t==="join"&&!ws.room){
   const c=String(m.code||"").toUpperCase(),r=rooms.get(c);
   if(!r)return snd(ws,{t:"err",m:"الغرفة غير موجودة"});
   if(r.g.size>=50)return snd(ws,{t:"err",m:"الغرفة ممتلئة"});
   ws.room=c;ws.role="g";ws.id="u"+nid++;ws.name=String(m.name||"لاعب").slice(0,20);r.g.set(ws.id,ws);
   snd(ws,{t:"joined",code:c});snd(r.host,{t:"peer",on:true,id:ws.id,name:ws.name});
   if(r.last)snd(ws,{t:"d",d:r.last});
  }
  else if(m.t==="bc"&&ws.role==="h"){const r=rooms.get(ws.room);if(r){r.last=m.d;r.g.forEach(g=>snd(g,{t:"d",d:m.d}))}}
  else if(m.t==="buzz"&&ws.role==="g"){const r=rooms.get(ws.room);if(r)snd(r.host,{t:"buzz",id:ws.id})}
 });
 ws.on("close",()=>{
  const r=rooms.get(ws.room);if(!r)return;
  if(ws.role==="h"){r.g.forEach(g=>snd(g,{t:"end"}));rooms.delete(ws.room)}
  else{r.g.delete(ws.id);snd(r.host,{t:"peer",on:false,id:ws.id})}
 });
});
srv.listen(process.env.PORT||8080);
