const $ = id => document.getElementById(id);
const sections = ['auth','lobby','room','game','results'];
let token = localStorage.getItem('fc_token'), user = null, socket = null, currentCode = null, isHost = false, countdown = null;
function show(id){sections.forEach(x=>$(x).classList.toggle('hidden',x!==id));}
function msg(id,text){$(id).textContent=text||'';}
async function api(path,body){
 const r=await fetch((window.FC_CONFIG.serverUrl||location.origin)+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'حدث خطأ');return d;
}
function connect(){
 if(socket)socket.disconnect();
 socket=io(window.FC_CONFIG.serverUrl||location.origin,{auth:{token}});
 socket.on('connect_error',e=>msg('lobbyMsg',e.message==='AUTH_REQUIRED'?'انتهت الجلسة، سجّل الدخول مجدداً.':e.message));
 socket.on('room:update',renderRoom);
 socket.on('game:started',()=>{show('game');msg('feedback','بدأت المباراة!');});
 socket.on('game:question',q=>{
   show('game');$('roundLabel').textContent=`الجولة ${q.round} من ${q.total}`;
   $('categoryLabel').textContent=q.category==='transfer'?'انتقالات':'معلومات عامة';
   $('question').textContent=q.question;$('options').innerHTML='';msg('feedback','');
   q.options.forEach((v,i)=>{const b=document.createElement('button');b.textContent=v;b.onclick=()=>answer(i,b);$('options').appendChild(b);});
   let left=q.seconds;$('timer').textContent=left+' ثانية';clearInterval(countdown);
   countdown=setInterval(()=>{$('timer').textContent=(--left)+' ثانية';if(left<=0)clearInterval(countdown);},1000);
 });
 socket.on('game:reveal',d=>{clearInterval(countdown);msg('feedback','الإجابة الصحيحة: '+d.correctIndex+' — '+(d.explanation||''));[...$('options').children].forEach((b,i)=>{b.disabled=true;if(i===d.correctIndex)b.classList.add('chosen');});});
 socket.on('game:finished',d=>{clearInterval(countdown);show('results');$('ranking').innerHTML='';d.ranking.forEach(p=>{const li=document.createElement('li');li.textContent=`${p.username} — ${p.score} نقطة`; $('ranking').appendChild(li);});});
}
async function answer(choice,button){
 [...$('options').children].forEach(b=>b.disabled=true);button.classList.add('chosen');
 socket.emit('game:answer',{code:currentCode,choice},r=>msg('feedback',r?.correct?'إجابة صحيحة! +10 نقاط':'تم تسجيل إجابتك.'));
}
function renderRoom(r){
 if(!r)return;currentCode=r.code;$('code').textContent=r.code;$('roomStatus').textContent=r.status==='waiting'?'بانتظار اللاعبين':'المباراة جارية';
 $('roomSettings').textContent=`${r.settings.rounds} جولة · حتى ${r.settings.maxPlayers} لاعبين · ${r.settings.seconds} ثانية للسؤال`;
 $('players').innerHTML='';$('scores').innerHTML='';
 r.players.forEach(p=>{const li=document.createElement('li');li.textContent=`${p.username} — ${p.score} نقطة`;$('players').appendChild(li);$('scores').appendChild(li.cloneNode(true));});
 $('start').classList.toggle('hidden',r.host!==user?.username||r.status!=='waiting');
 if(r.status==='waiting' && ! $('room').classList.contains('hidden')) show('room');
}
$('register').onclick=async()=>{try{const d=await api('/api/register',{username:$('username').value,email:$('email').value,password:$('password').value});signedIn(d);}catch(e){msg('authMsg',e.message);}};
$('login').onclick=async()=>{try{const d=await api('/api/login',{email:$('email').value,password:$('password').value});signedIn(d);}catch(e){msg('authMsg',e.message);}};
function signedIn(d){token=d.token;user=d.user;localStorage.setItem('fc_token',token);$('who').textContent=user.username;connect();show('lobby');}
$('logout').onclick=()=>{localStorage.removeItem('fc_token');if(socket)socket.disconnect();token=null;user=null;show('auth');};
$('create').onclick=()=>{socket.emit('room:create',{rounds:+$('rounds').value,maxPlayers:+$('maxPlayers').value,seconds:+$('seconds').value,category:$('category').value},r=>{if(!r.ok)return msg('lobbyMsg',r.error);isHost=true;currentCode=r.room.code;show('room');renderRoom(r.room);});};
$('join').onclick=()=>socket.emit('room:join',$('roomCode').value.trim(),r=>{if(!r.ok)return msg('lobbyMsg',r.error);isHost=false;currentCode=r.room.code;show('room');renderRoom(r.room);});
$('start').onclick=()=>socket.emit('game:start',currentCode,r=>{if(!r.ok)msg('feedback',r.error);});
$('leave').onclick=()=>{if(socket)socket.disconnect();connect();currentCode=null;show('lobby');};
$('back').onclick=()=>{currentCode=null;show('lobby');};
(async()=>{if(token){try{const r=await fetch((window.FC_CONFIG.serverUrl||location.origin)+'/api/me',{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw 0;user=(await r.json()).user;$('who').textContent=user.username;connect();show('lobby');}catch{localStorage.removeItem('fc_token');show('auth');}}else show('auth');})();
