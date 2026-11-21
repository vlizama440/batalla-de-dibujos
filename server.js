'use strict';
const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {maxHttpBufferSize: 1e6, pingTimeout: 25000});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_,res)=>res.json({ok:true}));
const rooms = new Map();
const pickId = () => crypto.randomInt(100, 1000).toString();
const token = () => crypto.randomBytes(20).toString('hex');
const safe = (v,n=80) => typeof v==='string' ? v.trim().slice(0,n).replace(/[<>]/g,'') : '';
const reply = (ack, result) => {if(typeof ack==='function')ack(result)};
const status = (room, player, isAdmin=false) => ({
  code:room.code, stage:room.stage, prompt:room.prompt,
  proposed:room.prompts.length, players: [...room.players.values()].map(p=>({id:p.id,name:p.name,online:p.sockets.size,submitted:p.submitted,removed:p.removed,voted:p.votes.length===2})),
  drawingEndsAt:room.drawingEndsAt, gallery: (isAdmin || ['voting','results'].includes(room.stage)) ? [...room.players.values()].filter(p=>p.image).map(p=>({id:p.id,name:p.name,image:p.image})) : [],
  slide:room.slide, votesCast:[...room.players.values()].filter(p=>p.votes.length===2).length,
  results:room.stage==='results' ? [...room.players.values()].filter(p=>p.image).map(p=>({...{id:p.id,name:p.name,image:p.image},votes:[...room.players.values()].filter(q=>q.votes.includes(p.id)).length})).sort((a,b)=>b.votes-a.votes) : [],
  ...(isAdmin?{prompts:room.prompts.map((x,i)=>({index:i,name:x.name,text:x.text}))}:{})
});
const sendState = room => {
  for (const sid of room.adminSockets) io.to(sid).emit('state',status(room,null,true));
  for(const p of room.players.values()) for(const sid of p.sockets)io.to(sid).emit('state',status(room,p,false));
};
function asRoom(socket){const data=socket.data;return data.code&&rooms.get(data.code)}
function isAdmin(socket,room){return !!room && socket.data.admin && room.adminToken===socket.data.adminToken}
function startPresentation(room){
  if(room.stage!=='drawing')return;
  room.stage='presentation';room.drawingEndsAt=0;room.slide=0;
  sendState(room);
}
function drawDeadline(room){
  if(room.stage!=='drawing'||room.deadlineTriggered)return;
  room.deadlineTriggered=true;
  io.to(room.code).emit('drawing:finish');
  setTimeout(()=>{if(rooms.get(room.code)===room && room.stage==='drawing')startPresentation(room)},2500);
}
function resetRoom(room){
  room.stage='lobby';room.prompt='';room.prompts=[];room.drawingEndsAt=0;room.deadlineTriggered=false;room.slide=0;
  for(const p of room.players.values()){p.image=null;p.submitted=false;p.removed=false;p.votes=[];p.proposed=false;}
  sendState(room);
}
setInterval(()=>{for(const room of rooms.values())if(room.stage==='drawing' && Date.now()>=room.drawingEndsAt)drawDeadline(room)},1000);
io.on('connection',socket=>{
  socket.on('admin:create',(_,ack)=>{
    let code;do{code=pickId()}while(rooms.has(code));
    const room={code,adminToken:token(),adminSockets:new Set([socket.id]),players:new Map(),prompts:[],prompt:'',stage:'lobby',drawingEndsAt:0,slide:0,created:Date.now()};
    rooms.set(code,room);socket.data={code,admin:true,adminToken:room.adminToken};socket.join(code);
    reply(ack,{ok:true,code,adminToken:room.adminToken});sendState(room);
  });
  socket.on('admin:resume',(d,ack)=>{
    const room=rooms.get(String(d?.code||''));if(!room||room.adminToken!==d?.adminToken)return reply(ack,{ok:false,error:'Sala o acceso no válido.'});
    room.adminSockets.add(socket.id);socket.data={code:room.code,admin:true,adminToken:room.adminToken};socket.join(room.code);
    reply(ack,{ok:true});sendState(room);
  });
  socket.on('player:join',(d,ack)=>{
    const room=rooms.get(String(d?.code||''));if(!room)return reply(ack,{ok:false,error:'No existe esa sala.'});
    const name=safe(d?.name,24);if(name.length<2)return reply(ack,{ok:false,error:'Escribe un nombre de al menos 2 caracteres.'});
    let p=[...room.players.values()].find(x=>x.token===d?.playerToken);
    if(!p){
      if(room.stage!=='lobby')return reply(ack,{ok:false,error:'La partida ya comenzó.'});
      if(room.players.size>=50)return reply(ack,{ok:false,error:'La sala llegó a 50 jugadores.'});
      if([...room.players.values()].some(x=>x.name.toLowerCase()===name.toLowerCase()))return reply(ack,{ok:false,error:'Ese nombre ya está en uso. Prueba otro.'});
      p={id:token().slice(0,12),token:token(),name,sockets:new Set(),proposed:false,image:null,submitted:false,removed:false,votes:[]};room.players.set(p.id,p);
    }
    p.sockets.add(socket.id);socket.data={code:room.code,playerId:p.id,admin:false};socket.join(room.code);
    reply(ack,{ok:true,playerToken:p.token,playerId:p.id,name:p.name});sendState(room);
  });
  socket.on('prompt:send',(d,ack)=>{
    const room=asRoom(socket),p=room?.players.get(socket.data.playerId);
    if(!p||room.stage!=='lobby')return reply(ack,{ok:false,error:'Ya no puedes proponer desafíos.'});
    if(p.proposed)return reply(ack,{ok:false,error:'Ya enviaste tu propuesta.'});
    const content=safe(d?.text,110);if(content.length<5)return reply(ack,{ok:false,error:'Escribe una frase de al menos 5 caracteres.'});
    room.prompts.push({name:p.name,text:content});p.proposed=true;reply(ack,{ok:true});sendState(room);
  });
  socket.on('admin:choose',(d,ack)=>{
    const room=asRoom(socket);if(!isAdmin(socket,room)||room.stage!=='lobby')return reply(ack,{ok:false,error:'Acción no disponible.'});
    const index=Number(d?.index);if(!Number.isInteger(index)||!room.prompts[index])return reply(ack,{ok:false,error:'Elige un desafío válido.'});
    room.prompt=room.prompts[index].text;reply(ack,{ok:true});sendState(room);
  });
  socket.on('admin:start',(_,ack)=>{
    const room=asRoom(socket);if(!isAdmin(socket,room)||room.stage!=='lobby'||!room.prompt)return reply(ack,{ok:false,error:'Primero elige un desafío.'});
    room.stage='drawing';room.deadlineTriggered=false;room.drawingEndsAt=Date.now()+60000;
    reply(ack,{ok:true});sendState(room);
  });
  socket.on('drawing:submit',(d,ack)=>{
    const room=asRoom(socket),p=room?.players.get(socket.data.playerId);
    if(!p||room.stage!=='drawing')return reply(ack,{ok:false,error:'El tiempo de dibujar terminó.'});
    if(p.submitted)return reply(ack,{ok:true});
    const img=d?.image;
    if(typeof img!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img)||img.length>750000)return reply(ack,{ok:false,error:'Dibujo demasiado grande o inválido.'});
    p.image=img;p.submitted=true;p.removed=false;reply(ack,{ok:true});sendState(room);
    if([...room.players.values()].every(x=>x.submitted))startPresentation(room);
  });
  socket.on('admin:delete-drawing',(d,ack)=>{
    const room=asRoom(socket);
    if(!isAdmin(socket,room)||!['drawing','presentation'].includes(room.stage))return reply(ack,{ok:false,error:'Solo puedes borrar dibujos antes de abrir la votación.'});
    const p=room.players.get(String(d?.id||''));
    if(!p?.image)return reply(ack,{ok:false,error:'No se encontró el dibujo.'});
    p.image=null;p.submitted=true;p.removed=true;p.votes=[];
    const count=[...room.players.values()].filter(x=>x.image).length;
    room.slide=count?Math.min(room.slide,count-1):0;
    reply(ack,{ok:true});sendState(room);
  });
  socket.on('admin:present',(_,ack)=>{
    const room=asRoom(socket);if(!isAdmin(socket,room)||room.stage!=='drawing')return reply(ack,{ok:false,error:'No disponible.'});
    drawDeadline(room);reply(ack,{ok:true});
  });
  socket.on('admin:slide',(d,ack)=>{
    const room=asRoom(socket);if(!isAdmin(socket,room)||!['presentation','voting'].includes(room.stage))return reply(ack,{ok:false});
    const count=[...room.players.values()].filter(x=>x.image).length;
    room.slide=count?Math.min(count-1,Math.max(0,room.slide+(d?.delta===-1?-1:1))):0;sendState(room);reply(ack,{ok:true});
  });
  socket.on('admin:voting',(_,ack)=>{
    const room=asRoom(socket);if(!isAdmin(socket,room)||room.stage!=='presentation')return reply(ack,{ok:false});
    if([...room.players.values()].filter(x=>x.image).length<3)return reply(ack,{ok:false,error:'Se necesitan al menos tres dibujos para que todos puedan elegir dos sin votar por el suyo.'});
    room.stage='voting';sendState(room);reply(ack,{ok:true});
  });
  socket.on('vote:cast',(d,ack)=>{
    const room=asRoom(socket),p=room?.players.get(socket.data.playerId);
    if(!p||room.stage!=='voting')return reply(ack,{ok:false,error:'La votación no está abierta.'});
    if(p.votes.length)return reply(ack,{ok:false,error:'Ya votaste.'});
    const ids=d?.ids;
    if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1]||ids.includes(p.id)||ids.some(id=>!room.players.get(id)?.image))return reply(ack,{ok:false,error:'Elige dos dibujos distintos que no sean el tuyo.'});
    p.votes=[...ids];reply(ack,{ok:true});sendState(room);
  });
  socket.on('admin:results',(_,ack)=>{
    const room=asRoom(socket);if(!isAdmin(socket,room)||room.stage!=='voting')return reply(ack,{ok:false});
    room.stage='results';sendState(room);reply(ack,{ok:true});
  });
  socket.on('admin:reset',(_,ack)=>{
    const room=asRoom(socket);if(!isAdmin(socket,room))return reply(ack,{ok:false});resetRoom(room);reply(ack,{ok:true});
  });
  socket.on('disconnect',()=>{
    const room=asRoom(socket);if(!room)return;
    if(socket.data.admin)room.adminSockets.delete(socket.id);
    else room.players.get(socket.data.playerId)?.sockets.delete(socket.id);
    sendState(room);
  });
});
const port=process.env.PORT||3000;
server.listen(port,'0.0.0.0',()=>console.log('Batalla de Dibujos escuchando en '+port));
