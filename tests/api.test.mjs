import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { createApp } from '../server.mjs';

async function fixture(t, options={}) {
  const app=createApp({dbPath:':memory:',...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  function client(){let cookie='';return async(path,{method='GET',body,headers={}}={})=>{
    const res=await fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const setCookie=res.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
    const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:res.status,data,headers:res.headers};
  };}
  return {...app,client,origin};
}
const credentials={email:'alice@example.com',password:'correct horse battery'};
const job={company:'Test studio',title:'Developer',status:'saved',salary_min:3000,salary_max:5000,description:'Build products'};
const register=client=>client('/api/auth/register',{method:'POST',body:credentials});
const addJob=client=>client('/api/jobs',{method:'POST',body:job});

test('регистрация, вход, выход и защита сессии',async t=>{
  const {client}=await fixture(t), a=client();
  assert.equal((await a('/api/state')).status,401);
  const registration=await register(a);assert.equal(registration.status,201);assert.match(registration.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal((await a('/api/state')).data.jobs.length,0);
  assert.equal((await a('/api/auth/logout',{method:'POST',body:{}})).status,200);
  assert.equal((await a('/api/state')).status,401);
  assert.equal((await a('/api/auth/login',{method:'POST',body:{...credentials,password:'wrong'}})).status,401);
  assert.equal((await a('/api/auth/login',{method:'POST',body:credentials})).status,200);
  assert.equal((await register(a)).status,409);
});

test('вакансия, история, задачи и заметки проходят полный цикл',async t=>{
  const {client}=await fixture(t),a=client();await register(a);const {data:{id}}=await addJob(a);
  assert.ok(id);
  await a(`/api/jobs/${id}`,{method:'PATCH',body:{status:'applied'}});
  await a(`/api/jobs/${id}`,{method:'PATCH',body:{status:'applied'}});
  await a(`/api/jobs/${id}/notes`,{method:'POST',body:{body:'Позвонить в четверг'}});
  const task=await a('/api/tasks',{method:'POST',body:{job_id:id,title:'Интервью',due_date:'2026-09-23',due_time:'15:30',kind:'interview'}});
  assert.equal(task.status,201);
  await a(`/api/tasks/${task.data.id}`,{method:'PATCH',body:{completed:true}});
  let state=(await a('/api/state')).data;
  assert.equal(state.jobs[0].status,'applied');assert.equal(state.events.filter(e=>e.kind==='status').length,1);assert.equal(state.tasks[0].completed,1);assert.equal(state.events.filter(e=>e.kind==='note')[0].body,'Позвонить в четверг');
  await a(`/api/tasks/${task.data.id}`,{method:'PATCH',body:{completed:false}});
  assert.equal((await a('/api/state')).data.tasks[0].completed,0);
  await a(`/api/jobs/${id}`,{method:'DELETE'});state=(await a('/api/state')).data;
  assert.equal(state.jobs.length,0);assert.equal(state.tasks.length,0);assert.equal(state.events.length,0);
});

test('два пользователя не видят и не изменяют чужие данные',async t=>{
  const {client}=await fixture(t),a=client(),b=client();await register(a);await b('/api/auth/register',{method:'POST',body:{...credentials,email:'bob@example.com'}});
  const {data:{id}}=await addJob(a);
  const task=await a('/api/tasks',{method:'POST',body:{job_id:id,title:'Private task',due_date:'2026-10-01'}});
  assert.equal(task.status,201);
  assert.equal((await b('/api/state')).data.jobs.length,0);
  for(const method of ['GET','PATCH','DELETE'])assert.equal((await b(`/api/jobs/${id}`,{method,...(method==='PATCH'?{body:{title:'Stolen'}}:{})})).status,404);
  assert.equal((await b(`/api/jobs/${id}/notes`,{method:'POST',body:{body:'Intruder'}})).status,404);
  assert.equal((await b('/api/tasks',{method:'POST',body:{job_id:id,title:'Intruder',due_date:'2026-10-01'}})).status,404);
  assert.equal((await b(`/api/tasks/${task.data.id}`,{method:'PATCH',body:{completed:true}})).status,404);
  assert.equal((await b(`/api/tasks/${task.data.id}`,{method:'DELETE'})).status,404);
  assert.equal((await b('/api/export')).data.jobs.length,0);
  assert.equal((await a('/api/state')).data.jobs.length,1);
});

test('валидация URL, зарплаты, дат и этапов',async t=>{
  const {client}=await fixture(t),a=client();await register(a);
  for(const patch of [{url:'javascript:alert(1)'},{url:'https://user:secret@example.com'},{salary_min:6000,salary_max:3000},{salary_min:-1},{company:''},{status:'invented'},{description:123}]){
    assert.equal((await a('/api/jobs',{method:'POST',body:{...job,...patch}})).status,400);
  }
  const {data:{id}}=await addJob(a);
  for(const due_date of ['2026-02-30','not-date','2201-01-01'])assert.equal((await a('/api/tasks',{method:'POST',body:{job_id:id,title:'Call',due_date}})).status,400);
  assert.equal((await a('/api/tasks',{method:'POST',body:{job_id:id,title:'Call',due_date:'2026-10-01',due_time:'25:99'}})).status,400);
  assert.equal((await a(`/api/jobs/${id}`,{method:'PATCH',body:{status:'no'}})).status,400);
  const state=(await a('/api/state')).data;assert.equal(state.events.length,1);assert.equal(state.jobs[0].status,'saved');
});

test('экспорт полон, приватен, CSV защищает от формул',async t=>{
  const {client}=await fixture(t),a=client();await register(a);
  const result=await a('/api/jobs',{method:'POST',body:{...job,company:'=HYPERLINK("https://example.com")',description:'<script>alert(1)</script>'}});
  await a(`/api/jobs/${result.data.id}/notes`,{method:'POST',body:{body:'Заметка для экспорта'}});
  const json=(await a('/api/export')).data;assert.equal(json.schemaVersion,1);assert.equal(json.events.length,2);assert.equal(json.jobs[0].user_id,undefined);assert.equal(json.password_hash,undefined);
  const csv=await a('/api/export?format=csv');assert.match(csv.data,/'=HYPERLINK/);assert.match(csv.headers.get('content-disposition'),/attachment/);
});

test('демо изолировано и не заменяет личный аккаунт',async t=>{
  const {client}=await fixture(t),a=client(),b=client();await register(a);await addJob(a);
  assert.equal((await b('/api/auth/demo',{method:'POST',body:{}})).data.user.demo,true);
  assert.equal((await b('/api/state')).data.jobs.length,8);
  await b('/api/auth/logout',{method:'POST',body:{}});
  await b('/api/auth/login',{method:'POST',body:credentials});
  const state=(await b('/api/state')).data;assert.equal(state.user.demo,false);assert.equal(state.jobs.length,1);
});

test('проверка Origin и базовые защитные заголовки',async t=>{
  const {client,origin}=await fixture(t),a=client();await register(a);
  assert.equal((await a('/api/jobs',{method:'POST',body:job,headers:{Origin:'https://attacker.example'}})).status,403);
  assert.equal((await a('/api/jobs',{method:'POST',body:job,headers:{Origin:''}})).status,403);
  const foreignHost=await new Promise((resolve,reject)=>get(origin+'/api/health',{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
  assert.equal(foreignHost,403);
  const page=await a('/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(page.headers.get('x-frame-options'),'DENY');
  assert.equal((await a('/server.mjs')).status,404);
});

test('редактирование заметки сохраняет её id и не допускает доступ к чужим заметкам и истории',async t=>{
  const {client}=await fixture(t),a=client(),b=client();
  await register(a);await b('/api/auth/register',{method:'POST',body:{...credentials,email:'notes-b@example.com'}});
  const {data:{id}}=await addJob(a);
  await a(`/api/jobs/${id}/notes`,{method:'POST',body:{body:'До редактирования'}});
  const events=(await a('/api/state')).data.events;
  const note=events.find(e=>e.kind==='note'),history=events.find(e=>e.kind==='created');
  const path=`/api/jobs/${id}/notes/${note.id}`;
  assert.equal((await b(path,{method:'PATCH',body:{body:'Чужая правка'}})).status,404);
  assert.equal((await a(path,{method:'PATCH',body:{body:'   '}})).status,400);
  assert.equal((await a(`/api/jobs/${id}/notes/${history.id}`,{method:'PATCH',body:{body:'Подмена истории'}})).status,404);
  const other=(await addJob(a)).data.id;
  assert.equal((await a(`/api/jobs/${other}/notes/${note.id}`,{method:'PATCH',body:{body:'Неверная вакансия'}})).status,404);
  assert.equal((await a(path,{method:'PATCH',body:{body:'После редактирования\nВторая строка'}})).status,200);
  const notes=(await a('/api/state')).data.events.filter(e=>e.kind==='note');
  assert.equal(notes.length,1);assert.equal(notes[0].id,note.id);assert.equal(notes[0].body,'После редактирования\nВторая строка');
});

test('данные переживают перезапуск сервера',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'next-step-test-')),dbPath=join(dir,'test.sqlite');
  let server;
  t.after(async()=>{if(server?.listening)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
  async function boot(){server=createApp({dbPath}).server;await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;}
  let base=await boot();
  let res=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(credentials)});
  const cookie=res.headers.get('set-cookie').split(';')[0];
  await fetch(base+'/api/jobs',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(job)});
  await new Promise(r=>server.close(r));base=await boot();
  res=await fetch(base+'/api/state',{headers:{Cookie:cookie}});
  assert.equal(res.status,200);assert.equal((await res.json()).jobs[0].company,job.company);
});
