import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCareer } from './career.mjs';

const scrypt = promisify(scryptCallback);
const ROOT = dirname(fileURLToPath(import.meta.url));
const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected', 'closed'];
const FORMATS = ['', 'remote', 'office', 'hybrid'];
const LABELS = {saved:'Сохранена',applied:'Отклик отправлен',interview:'Интервью',offer:'Оффер',rejected:'Отказ',closed:'Закрыта мной'};
const hash = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const uid = () => randomUUID();
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const text = (value, max = 500, required = false) => {
  if (value !== undefined && value !== null && typeof value !== 'string') fail(400,'Ожидался текст.');
  const result = (value ?? '').trim();
  if (result.length > max) fail(400,`Слишком длинный текст: максимум ${max} символов.`);
  if (required && !result) fail(400,'Заполните обязательные поля.');
  return result;
};
function choice(value, values, fallback) {
  const result = value ?? fallback;
  if (!values.includes(result)) fail(400,'Недопустимое значение поля.');
  return result;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400,'Укажите дату.');
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value || value < '1900-01-01' || value > '2200-12-31') fail(400,'Некорректная дата.');
  return value;
}
function jobFields(body) {
  const result = {};
  for (const field of ['company','title']) result[field] = text(body[field],150,true);
  result.url = text(body.url,2000);
  if (result.url) {
    let u; try { u = new URL(result.url); } catch { fail(400,'Укажите полную ссылку, начиная с https://.'); }
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password) fail(400,'Допустима только обычная HTTP(S)-ссылка.');
  }
  result.description = text(body.description,30000);
  result.requirements = text(body.requirements,10000);
  result.location = text(body.location,150);
  result.work_format = choice(body.work_format,FORMATS,'');
  result.status = choice(body.status,STATUSES,'saved');
  for (const field of ['salary_min','salary_max']) {
    const value = body[field];
    if (value === '' || value === null || value === undefined) result[field] = null;
    else {
      if (!['number','string'].includes(typeof value)) fail(400,'Некорректная зарплата.');
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0 || num > 1e9) fail(400,'Некорректная зарплата.');
      result[field] = Math.round(num * 100) / 100;
    }
  }
  if (result.salary_min !== null && result.salary_max !== null && result.salary_min > result.salary_max) fail(400,'Нижняя граница зарплаты больше верхней.');
  result.currency = choice(body.currency,['BYN','RUB','USD','EUR'],'BYN');
  result.salary_period = choice(body.salary_period,['month','year','hour'],'month');
  result.salary_tax = choice(body.salary_tax,['unknown','net','gross'],'unknown');
  return result;
}

export function createApp({dbPath = process.env.DB_PATH || join(ROOT,'data','tracker.sqlite'), origin = process.env.APP_ORIGIN || '', secureCookie = process.env.COOKIE_SECURE === 'true'} = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)),{recursive:true});
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,is_demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,company TEXT NOT NULL,title TEXT NOT NULL,url TEXT NOT NULL,description TEXT NOT NULL,requirements TEXT NOT NULL,location TEXT NOT NULL,work_format TEXT NOT NULL,salary_min REAL,salary_max REAL,currency TEXT NOT NULL,salary_period TEXT NOT NULL,salary_tax TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,body TEXT NOT NULL,from_status TEXT,to_status TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,kind TEXT NOT NULL,due_date TEXT NOT NULL,due_time TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS jobs_owner ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS events_owner ON events(user_id,job_id);
    CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(user_id,due_date);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  const stmt = sql => db.prepare(sql);
  const transaction = fn => { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } };
  const publicUser = user => ({id:user.id,email:user.is_demo ? 'Демо-пространство' : user.email,demo:!!user.is_demo});
  const writeEvent = (userId,jobId,kind,body='',from=null,to=null) => stmt('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)').run(uid(),jobId,userId,kind,body,from,to,now());
  const insertJob = (userId,body) => {
    const fields = jobFields(body), id = uid(), timestamp = now();
    stmt(`INSERT INTO jobs(id,user_id,${Object.keys(fields).join(',')},created_at,updated_at) VALUES(${Array(Object.keys(fields).length+4).fill('?').join(',')})`).run(id,userId,...Object.values(fields),timestamp,timestamp);
    writeEvent(userId,id,'created','',null,fields.status);
    return id;
  };
  const ownJob = (id,userId) => { const row=stmt('SELECT * FROM jobs WHERE id=? AND user_id=?').get(id,userId); if(!row) fail(404,'Вакансия не найдена.'); return row; };
  const cleanup = () => {
    stmt('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    stmt('DELETE FROM users WHERE is_demo=1 AND id NOT IN (SELECT user_id FROM sessions)').run();
  };
  cleanup();
  const timer = setInterval(cleanup,60*60*1000); timer.unref();
  const rates = new Map();
  const limited = (key,max=30) => {
    const timestamp = Date.now();
    if(rates.size>1000) for(const [key,item] of rates) if(item.end < timestamp) rates.delete(key);
    const entry=rates.get(key);
    if (!entry || entry.end < timestamp) { rates.set(key,{count:1,end:timestamp+15*60*1000}); return; }
    if (++entry.count > max) fail(429,'Слишком много попыток. Попробуйте через 15 минут.');
  };
  const cookie = (value,age) => `tracker_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secureCookie?'; Secure':''}`;
  const makeSession = (res,user) => {
    const token=randomBytes(32).toString('hex'), age=user.is_demo?86400:604800;
    stmt('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,Date.now()+age*1000);
    res.setHeader('Set-Cookie',cookie(token,age));
  };
  const sessionToken = req => /(?:^|;\s*)tracker_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
  const userFor = req => {
    const token = sessionToken(req);
    const user = token && stmt('SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE token_hash=? AND expires_at>?').get(hash(token),Date.now());
    if(!user) fail(401,'Войдите в аккаунт.');
    return user;
  };
  async function bodyOf(req) {
    if (!(req.headers['content-type']||'').startsWith('application/json')) fail(415,'Ожидается application/json.');
    const chunks=[];let length=0;
    for await (const part of req) { length+=part.length; if(length>150000) fail(413,'Слишком большой запрос.'); chunks.push(part); }
    let parsed; try { parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400,'Некорректный JSON.'); }
    if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) fail(400,'Ожидается объект.');
    return parsed;
  }
  const send = (res,data,status=200) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };
  function seed(userId) {
    const day = delta => { const d=new Date(); d.setDate(d.getDate()+delta); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const samples = [
      ['Линия','Frontend-разработчик','interview','remote',3500,5000],
      ['Пиксель','AI Product Developer','applied','hybrid',4000,6000],
      ['Маяк','Разработчик веб-приложений','saved','remote',3000,4500],
      ['Контур Лаб','JavaScript Developer','applied','office',3200,4800],
      ['Север','Junior Fullstack Developer','saved','hybrid',2500,3500],
      ['Орбита','Frontend Engineer','offer','remote',4500,6000],
      ['Форма','Веб-разработчик','rejected','office',2800,4000],
      ['Точка роста','Разработчик внутренних сервисов','closed','hybrid',3000,4200]
    ];
    samples.forEach((sample,index)=>{
      const [company,title,status,work_format,salary_min,salary_max]=sample;
      const id=insertJob(userId,{company,title,status:'saved',work_format,salary_min,salary_max,salary_tax:'net',location:'Минск',description:'Вымышленная вакансия для знакомства с трекером.\n\nЗадачи: создавать удобные веб-приложения, интегрировать API, работать с базой данных и улучшать пользовательские сценарии.\n\nКоманда ценит самостоятельность и законченные проекты.',requirements:'JavaScript, HTML/CSS, REST API, Git. Умение объяснять свои решения.'});
      if(status!=='saved') {
        const path = ['interview','offer'].includes(status) ? ['applied','interview',...(status==='offer'?['offer']:[])] : status==='rejected'?['applied','rejected']:[status];
        let prev='saved'; for(const stage of path) { writeEvent(userId,id,'status','',prev,stage); prev=stage; }
        stmt('UPDATE jobs SET status=? WHERE id=?').run(status,id);
      }
      if(index<4) {
        const names=['Подготовиться к техническому интервью','Уточнить статус отклика','Изучить продукт и отправить отклик','Обновить портфолио перед встречей'];
        stmt('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)').run(uid(),id,userId,names[index],index===0?'interview':'followup',day([0,-1,1,3][index]),index===0?'15:00':'',0,now());
      }
      if(index===0) writeEvent(userId,id,'note','Обсудить формат работы и задачи на первые три месяца. Подготовить демонстрацию проекта.');
    });
  }
  const career=createCareer(db,{text,fail,choice,bodyOf,send,ownJob});
  const server = http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('Cache-Control','no-store');
    try {
      if (!origin && !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host||'')) fail(403,'Для внешнего доступа настройте APP_ORIGIN.');
      const base=origin || `http://${req.headers.host}`;
      const url=new URL(req.url,base), path=url.pathname, method=req.method;
      if(path.startsWith('/api/') && !['GET','HEAD'].includes(method)) {
        if(req.headers.origin !== new URL(base).origin) fail(403,'Источник запроса не разрешён. Обновите страницу.');
      }
      if(path==='/api/health' && method==='GET') return send(res,{ok:true});
      if(path==='/api/auth/register' && method==='POST') {
        limited(`auth:${req.socket.remoteAddress}`);
        const body=await bodyOf(req), email=text(body.email,254,true).toLowerCase(), password=body.password;
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Проверьте email.');
        if(typeof password!=='string' || password.length<10 || password.length>200) fail(400,'Пароль должен содержать от 10 до 200 символов.');
        const salt=randomBytes(16).toString('hex'), passwordHash=(await scrypt(password,salt,64)).toString('hex');
        const user={id:uid(),email,is_demo:0};
        try { stmt('INSERT INTO users VALUES(?,?,?,?,?,?)').run(user.id,email,passwordHash,salt,0,now()); } catch(e) { if(e.code==='ERR_SQLITE_ERROR' && String(e.message).includes('UNIQUE')) fail(409,'Этот email уже зарегистрирован. Войдите в аккаунт.'); throw e; }
        makeSession(res,user); return send(res,{user:publicUser(user)},201);
      }
      if(path==='/api/auth/login' && method==='POST') {
        limited(`auth:${req.socket.remoteAddress}`);
        const body=await bodyOf(req), email=text(body.email,254,true).toLowerCase();
        if(typeof body.password!=='string'||body.password.length>200) fail(400,'Проверьте пароль.');
        const user=stmt('SELECT * FROM users WHERE email=? AND is_demo=0').get(email);
        const candidate=await scrypt(body.password,user?.salt||'dummy-salt',64);
        if(!user || !timingSafeEqual(candidate,Buffer.from(user.password_hash,'hex'))) fail(401,'Неверный email или пароль.');
        makeSession(res,user); return send(res,{user:publicUser(user)});
      }
      if(path==='/api/auth/demo' && method==='POST') {
        limited(`demo:${req.socket.remoteAddress}`,15);
        const user={id:uid(),email:`demo-${uid()}@example.invalid`,is_demo:1};
        transaction(()=>{ stmt('INSERT INTO users VALUES(?,?,?,?,?,?)').run(user.id,user.email,'','',1,now()); seed(user.id); });
        makeSession(res,user); return send(res,{user:publicUser(user)});
      }
      if(path==='/api/auth/logout' && method==='POST') {
        const token=sessionToken(req); if(token) stmt('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
        res.setHeader('Set-Cookie',cookie('',0)); return send(res,{ok:true});
      }
      if(path.startsWith('/api/')) {
        const user=userFor(req), userId=user.id;
        if(await career.handle(req,res,url,userId))return;
        if(path==='/api/me' && method==='GET') return send(res,{user:publicUser(user)});
        if(path==='/api/state' && method==='GET') return send(res,{user:publicUser(user),...career.snapshot(userId),jobs:stmt('SELECT * FROM jobs WHERE user_id=? ORDER BY updated_at DESC,rowid DESC').all(userId),tasks:stmt('SELECT * FROM tasks WHERE user_id=? ORDER BY due_date,due_time,created_at').all(userId),events:stmt('SELECT * FROM events WHERE user_id=? ORDER BY created_at DESC,rowid DESC').all(userId)});
        if(path==='/api/jobs' && method==='POST') {
          const body=await bodyOf(req), id=transaction(()=>insertJob(userId,body)); return send(res,{id},201);
        }
        const jobMatch=/^\/api\/jobs\/([^/]+)$/.exec(path);
        if(jobMatch) {
          const old=ownJob(jobMatch[1],userId);
          if(method==='GET') return send(res,{job:old});
          if(method==='PATCH') {
            const body=await bodyOf(req), fields=jobFields({...old,...body});
            transaction(()=>{
              stmt(`UPDATE jobs SET ${Object.keys(fields).map(k=>`${k}=?`).join(',')},updated_at=? WHERE id=? AND user_id=?`).run(...Object.values(fields),now(),old.id,userId);
              if(fields.status!==old.status) writeEvent(userId,old.id,'status','',old.status,fields.status);
            });
            return send(res,{ok:true});
          }
          if(method==='DELETE') { stmt('DELETE FROM jobs WHERE id=? AND user_id=?').run(old.id,userId); return send(res,{ok:true}); }
        }
        const editNoteMatch=/^\/api\/jobs\/([^/]+)\/notes\/([^/]+)$/.exec(path);
        if(editNoteMatch && method==='PATCH') {
          ownJob(editNoteMatch[1],userId);
          const note=stmt("SELECT id FROM events WHERE id=? AND job_id=? AND user_id=? AND kind='note'").get(editNoteMatch[2],editNoteMatch[1],userId);
          if(!note) fail(404,'Заметка не найдена.');
          const body=await bodyOf(req), content=text(body.body,10000,true);
          stmt("UPDATE events SET body=? WHERE id=? AND job_id=? AND user_id=? AND kind='note'").run(content,note.id,editNoteMatch[1],userId);
          return send(res,{ok:true});
        }
        const noteMatch=/^\/api\/jobs\/([^/]+)\/notes$/.exec(path);
        if(noteMatch && method==='POST') {
          ownJob(noteMatch[1],userId); const body=await bodyOf(req);
          writeEvent(userId,noteMatch[1],'note',text(body.body,10000,true)); return send(res,{ok:true},201);
        }
        if(path==='/api/tasks' && method==='POST') {
          const body=await bodyOf(req); ownJob(text(body.job_id,100,true),userId);
          const title=text(body.title,300,true), dueDate=date(body.due_date), dueTime=text(body.due_time,5);
          if(dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) fail(400,'Некорректное время.');
          const kind=choice(body.kind,['followup','interview','application','other'],'followup');
          const id=uid(); stmt('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)').run(id,body.job_id,userId,title,kind,dueDate,dueTime,0,now());
          return send(res,{id},201);
        }
        const taskMatch=/^\/api\/tasks\/([^/]+)$/.exec(path);
        if(taskMatch) {
          const task=stmt('SELECT * FROM tasks WHERE id=? AND user_id=?').get(taskMatch[1],userId); if(!task) fail(404,'Задача не найдена.');
          if(method==='PATCH') {
            const body=await bodyOf(req);
            if(typeof body.completed!=='boolean') fail(400,'Укажите состояние задачи.');
            stmt('UPDATE tasks SET completed=? WHERE id=? AND user_id=?').run(body.completed?1:0,task.id,userId); return send(res,{ok:true});
          }
          if(method==='DELETE') { stmt('DELETE FROM tasks WHERE id=? AND user_id=?').run(task.id,userId); return send(res,{ok:true}); }
        }
        if(path==='/api/export' && method==='GET') {
          const jobs=stmt('SELECT * FROM jobs WHERE user_id=?').all(userId);
          if(url.searchParams.get('format')==='csv') {
            const safe=value=>{ let v=String(value??''); if(/^[=+@\-\t\r\n]/.test(v)) v="'"+v; return '"'+v.replaceAll('"','""')+'"'; };
            const columns=['Компания','Должность','Этап','Ссылка','От','До','Валюта','Период','Налоги','Город','Формат','Добавлена'];
            const rows=jobs.map(j=>[j.company,j.title,LABELS[j.status],j.url,j.salary_min,j.salary_max,j.currency,j.salary_period,j.salary_tax,j.location,j.work_format,j.created_at]);
            res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="job-tracker.csv"'});
            return res.end('\uFEFF'+[columns,...rows].map(row=>row.map(safe).join(';')).join('\r\n'));
          }
          const strip=rows=>rows.map(({user_id,...row})=>row);
          res.setHeader('Content-Disposition','attachment; filename="job-tracker.json"');
          const extra=career.snapshot(userId);
          return send(res,{schemaVersion:2,exportedAt:now(),profile:strip([extra.profile])[0],resumes:strip(extra.resumes),projects:strip(extra.projects),letters:strip(extra.letters),jobs:strip(jobs),tasks:strip(stmt('SELECT * FROM tasks WHERE user_id=?').all(userId)),events:strip(stmt('SELECT * FROM events WHERE user_id=?').all(userId))});
        }
        fail(404,'Адрес API не найден.');
      }
      if(!['GET','HEAD'].includes(method)) fail(405,'Метод не поддерживается.');
      const files={'/':'index.html','/app.js':'app.js','/career.js':'career.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
      if(!files[path]) fail(404,'Страница не найдена.');
      const file=files[path], types={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml'};
      res.writeHead(200,{'Content-Type':`${types[file.split('.').pop()]}; charset=utf-8`});
      res.end(method==='HEAD'?undefined:readFileSync(join(ROOT,'public',file)));
    } catch(error) {
      const status=error.status||500;
      if(status===500) console.error('Request failed:',error.message);
      if(!res.headersSent) send(res,{error:status===500?'Не удалось выполнить запрос. Попробуйте ещё раз.':error.message},status);
      else res.end();
    }
  });
  server.on('close',()=>{clearInterval(timer);db.close();});
  return {server,db};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||4318);
  const {server}=createApp();
  server.listen(port,host,()=>console.log(`Следующий шаг: http://${host}:${port}`));
  const shutdown=()=>server.close(()=>process.exit(0));
  process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
}
