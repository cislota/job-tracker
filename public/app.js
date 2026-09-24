import { createCareerUI } from './career.js';
const themeToggle = document.querySelector('#theme-toggle');
const themeStorageKey = 'next-step-theme';
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.title = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#121b19' : '#183b36';
}
let savedTheme = 'light';
try { savedTheme = localStorage.getItem(themeStorageKey) || 'light'; } catch { /* Storage may be unavailable in private browsing. */ }
applyTheme(savedTheme);
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(themeStorageKey, next); } catch { /* The switch still works without persistence. */ }
});
window.addEventListener('storage', event => {
  if (event.key === themeStorageKey) applyTheme(event.newValue || 'light');
});

const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
const toastEl=document.querySelector('#toast');
const statuses={saved:'Сохранена',applied:'Отклик отправлен',interview:'Интервью',offer:'Оффер',rejected:'Отказ',closed:'Закрыта мной'};
const formats={'':'Не указан',remote:'Удалённо',office:'В офисе',hybrid:'Гибрид'};
const taskKinds={followup:'Связаться',interview:'Интервью',application:'Откликнуться',other:'Другое'};
const icons={
 profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 arrow:'<path d="M7 17 17 7M7 7h10v10"/>',
 today:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 5h3"/>',
 jobs:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12a21 21 0 0 0 18 0m-9 0v4"/>',
 chart:'<path d="M4 3v17h17M9 15V9m5 6V5m5 10v-7"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 back:'<path d="m11 5-7 7 7 7M4 12h16"/>',
 edit:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z"/>',
 down:'<path d="m7 10 5 5 5-5"/>',
 export:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 logout:'<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h12"/>',
 list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
 board:'<rect x="3" y="4" width="7" height="16" rx="2"/><rect x="14" y="4" width="7" height="11" rx="2"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
 sparkle:'<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>'
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.arrow}</svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDate=(delta=0)=>{const d=new Date();d.setDate(d.getDate()+delta);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateLabel=d=>new Intl.DateTimeFormat('ru',{day:'numeric',month:'short'}).format(new Date(`${d}T12:00:00`));
const fullDate=d=>new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(d));
const number=n=>new Intl.NumberFormat('ru').format(n);
const plural=(n,one,few,many)=>n%10===1&&n%100!==11?one:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?few:many;
const state={user:null,jobs:[],tasks:[],events:[],route:'today',query:'',status:'',format:'',view:'list',authMode:'register'};
let returnFocus=null,toastTimer;
function toast(message){toastEl.textContent=message;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),4000);}
async function api(path,options={}) {
  let res; try {res=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});}catch{throw new Error('Нет связи с сервером. Данные формы сохранены на экране. Попробуйте ещё раз.');}
  let data;try{data=await res.json();}catch{throw new Error('Не удалось прочитать ответ сервера.');}
  if(!res.ok){const err=new Error(data.error||'Не удалось выполнить запрос.');err.status=res.status;throw err;}return data;
}
async function refresh(){const data=await api('/state');Object.assign(state,data);}
function route(){const value=location.hash.slice(1);state.route=value||'today';render();}
const statusBadge=s=>`<span class="badge status-${s}"><span></span>${statuses[s]}</span>`;
function salary(job){const min=job.salary_min,max=job.salary_max;if(min===null&&max===null)return 'Зарплата не указана';const value=min!==null&&max!==null?`${number(min)}–${number(max)}`:min!==null?`от ${number(min)}`:`до ${number(max)}`;return `${value} ${job.currency} / ${ {month:'мес.',year:'год',hour:'час'}[job.salary_period]}`;}
const activeJobs=()=>state.jobs.filter(j=>['saved','applied','interview'].includes(j.status));
function stats(){let applied=0,interview=0,offer=0;for(const j of state.jobs){const stages=new Set([j.status,...state.events.filter(e=>e.job_id===j.id&&e.to_status).map(e=>e.to_status)]);if([...stages].some(s=>['applied','interview','offer','rejected'].includes(s)))applied++;if(stages.has('interview')||stages.has('offer'))interview++;if(stages.has('offer'))offer++;}return {applied,interview,offer};}
const options=(values,selected)=>Object.entries(values).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${esc(label)}</option>`).join('');

function auth(){
  const login=state.authMode==='login';
  app.innerHTML=`<main class="auth"><section class="auth-story"><a class="brand" href="#today"><span class="brand-icon">${icon('arrow')}</span><span>Следующий<br>шаг<span class="brand-dot">.</span></span></a><div class="story-body"><span class="eyebrow light">ВАША КАРЬЕРА. ВАШ ТЕМП.</span><h1>Хорошая работа<br>начинается<br>со следующего<br><em>шага.</em></h1><p>Вакансии, отклики и интервью — в одном месте.<br>Чтобы держать фокус на возможностях.</p><div class="story-path"><span>${icon('check')} Сохранить</span><i></i><span>${icon('check')} Откликнуться</span><i></i><span>${icon('arrow')} Получить оффер</span></div></div><span class="story-footer">Меньше хаоса. Больше ясности.</span></section><section class="auth-side"><div class="auth-box"><span class="eyebrow">ЛИЧНЫЙ ТРЕКЕР ПОИСКА РАБОТЫ</span><h2>${login?'С возвращением':'Начните с чистого листа'}</h2><p class="muted">${login?'Ваши вакансии и планы уже ждут.':'Создайте своё пространство для следующего карьерного шага.'}</p><div class="auth-tabs"><button data-action="auth-mode" data-mode="register" class="${login?'':'selected'}">Регистрация</button><button data-action="auth-mode" data-mode="login" class="${login?'selected':''}">Вход</button></div><form id="auth-form"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label><label>Пароль<input name="password" type="password" autocomplete="${login?'current-password':'new-password'}" required minlength="${login?1:10}" maxlength="200" placeholder="${login?'Введите пароль':'Не менее 10 символов'}"></label><div class="form-error" role="alert"></div><button class="button primary wide" type="submit">${login?'Войти':'Создать аккаунт'} ${icon('arrow')}</button></form><p class="auth-note">Данные хранятся на сервере этого трекера. Восстановление пароля по email пока недоступно.</p><div class="divider"><span>сначала познакомиться</span></div><button class="button demo-button wide" data-action="demo">${icon('sparkle')} Посмотреть демо</button><p class="auth-note centered">Отдельное пространство с вымышленными вакансиями.<br>Без регистрации. Доступно 24 часа.</p></div><span class="auth-bottom">${icon('shield')} Личный поиск. Спокойный процесс.</span></section></main>`;
}

function shell(content,title,subtitle){
  const navRoute=state.route.startsWith('job/')?'jobs':state.route;
  app.innerHTML=`<div class="shell"><aside class="sidebar"><a class="brand" href="#today"><span class="brand-icon">${icon('arrow')}</span><span>Следующий<br>шаг<span class="brand-dot">.</span></span></a><span class="nav-caption">МОЁ ПРОСТРАНСТВО</span><nav aria-label="Основная навигация">${[['today','Сегодня','today'],['jobs','Вакансии','jobs'],['overview','Обзор','chart'],['profile','Мой профиль','profile']].map(([r,label,i])=>`<a href="#${r}" class="nav-link ${navRoute===r?'active':''}" ${navRoute===r?'aria-current="page"':''}>${icon(i)}<span>${label}</span>${r==='jobs'?`<small>${state.jobs.length}</small>`:''}</a>`).join('')}</nav><div class="sidebar-note"><span class="note-star">✳</span><p>Каждый отклик —<br>ещё одна возможность.</p><span>Двигайтесь в своём темпе.</span></div><div class="account"><span class="avatar">${state.user.demo?'Д':esc(state.user.email[0].toUpperCase())}</span><div><strong>${state.user.demo?'Демо-режим':'Личный аккаунт'}</strong><span title="${esc(state.user.email)}">${esc(state.user.email)}</span></div><button class="icon-button" data-action="logout" title="Выйти" aria-label="Выйти">${icon('logout')}</button></div></aside><main class="main">${state.user.demo?`<div class="demo-banner">${icon('sparkle')} <span>Демо-режим · вымышленные вакансии, изменения не затронут ваш аккаунт</span><button data-action="leave-demo">Создать свой аккаунт ${icon('arrow')}</button></div>`:''}<header class="page-header"><div><span class="eyebrow">${state.route==='today'?new Intl.DateTimeFormat('ru',{weekday:'long',day:'numeric',month:'long'}).format(new Date()):'ЛИЧНЫЙ ТРЕКЕР'}</span><h1>${title}</h1><p>${subtitle}</p></div><button class="button primary" data-action="add-job">${icon('plus')} Добавить вакансию</button></header>${content}<footer class="page-footer"><span>Следующий шаг</span><span>Всё важное для вашего поиска.</span></footer></main></div>`;
}
function empty(title,body,button='Добавить вакансию',action='add-job'){return `<div class="empty"><div class="empty-icon">${icon('arrow')}</div><h3>${title}</h3><p>${body}</p>${button?`<button class="button secondary" data-action="${action}">${icon('plus')}${button}</button>`:''}</div>`;}
function taskRow(task,{details=false}={}){
  const job=state.jobs.find(j=>j.id===task.job_id),today=localDate(),overdue=task.due_date<today&&!task.completed;
  const relative=task.due_date===today?'Сегодня':task.due_date===localDate(1)?'Завтра':dateLabel(task.due_date);
  return `<div class="task-row ${task.completed?'completed':''}"><button class="task-check ${task.completed?'checked':''}" data-action="toggle-task" data-id="${task.id}" aria-label="${task.completed?'Вернуть задачу':'Выполнить задачу'}: ${esc(task.title)}">${task.completed?icon('check'):''}</button><div class="task-copy"><strong>${esc(task.title)}</strong>${!details?`<a href="#job/${task.job_id}">${esc(job?.company||'')} <span>·</span> ${esc(job?.title||'')}</a>`:`<span>${taskKinds[task.kind]}</span>`}</div><div class="task-date ${overdue?'overdue':''}">${icon('clock')}<span>${overdue?'Просрочено · ':''}${relative}${task.due_time?`<small>${task.due_time}</small>`:''}</span></div>${details?`<button class="icon-button" data-action="delete-task" data-id="${task.id}" aria-label="Удалить задачу: ${esc(task.title)}">${icon('trash')}</button>`:''}</div>`;
}
function metric(label,value,sub,cls='',i='arrow'){return `<article class="metric ${cls}"><div class="metric-top"><span>${label}</span>${icon(i)}</div><strong>${value}</strong><span class="metric-sub">${sub}</span></article>`;}
function companyMark(j){const palette=['mint','lavender','peach','blue'];const index=[...j.company].reduce((n,c)=>n+c.charCodeAt(0),0)%4;return `<span class="company-mark ${palette[index]}">${esc(j.company.slice(0,1).toUpperCase())}</span>`;}
function compactJob(j){return `<a class="compact-job" href="#job/${j.id}">${companyMark(j)}<div><strong>${esc(j.title)}</strong><span>${esc(j.company)} · ${formats[j.work_format]}</span></div>${statusBadge(j.status)}${icon('arrow')}</a>`;}
function upcomingList(upcoming,expanded=false){return `${upcoming.length?upcoming.map(t=>`<a class="upcoming-item" href="#job/${t.job_id}" ${expanded?'data-action="open-upcoming-job"':''}><span class="date-tile"><b>${Number(t.due_date.slice(8))}</b><span>${new Intl.DateTimeFormat('ru',{month:'short'}).format(new Date(`${t.due_date}T12:00:00`)).replace('.','')}</span></span><div><strong>${esc(t.title)}</strong><span>${esc(state.jobs.find(j=>j.id===t.job_id)?.company)}${t.due_time?' · '+t.due_time:''}</span></div></a>`).join(''):`<div class="small-empty">Будущие действия появятся здесь.<br>Назначьте дату в карточке вакансии.</div>`}`;}
function upcomingDialog(){const upcoming=state.tasks.filter(t=>!t.completed&&t.due_date>localDate());openDialog(`${dialogTop('ЗАПЛАНИРОВАННЫЕ ДЕЙСТВИЯ','На горизонте · '+upcoming.length)}<div class="upcoming-dialog-list">${upcomingList(upcoming,true)}</div>`);}
function todayPage(){
  const today=localDate(),pending=state.tasks.filter(t=>!t.completed),due=pending.filter(t=>t.due_date<=today),upcoming=pending.filter(t=>t.due_date>today),s=stats();
  const overdue=pending.filter(t=>t.due_date<today).length;
  const content=`<section class="hero-strip"><div><span class="eyebrow">ОДИН ШАГ ЗА ДРУГИМ</span><h2>${due.length?'Сегодня есть куда двигаться.':'Освободите место для возможностей.'}</h2><p>${due.length?`У вас ${due.length} ${plural(due.length,'дело','дела','дел')} на сегодня${overdue?`, включая ${overdue} ${plural(overdue,'просроченное','просроченных','просроченных')}`:''}. Начните с одного.`:'Сохраните интересную вакансию и запланируйте следующий шаг.'}</p></div><div class="hero-art" aria-hidden="true"><span></span><span></span><span>${icon('arrow')}</span></div></section><section class="metrics">${metric('Активные вакансии',activeJobs().length,'В процессе поиска','','jobs')}${metric('Отклики',s.applied,'За всё время','','arrow')}${metric('Дошли до интервью',s.interview,'Уникальные вакансии','','today')}${metric('Офферы',s.offer,'Новые возможности','accent','sparkle')}</section><div class="dashboard-grid"><section class="panel"><div class="section-heading"><div><h2>Ваши следующие шаги <span class="count">${due.length}</span></h2><p>Сегодня и то, что стоит наверстать</p></div><button class="text-button" data-action="add-task">${icon('plus')} Действие</button></div><div class="dashboard-scroll" tabindex="0" role="region" aria-label="Действия на сегодня">${due.length?due.map(t=>taskRow(t)).join(''):empty('На сегодня всё спокойно','Запланируйте отклик или подготовку к интервью.','Добавить действие','add-task')}</div><div class="panel-foot">${icon('check')} Выполненные действия сохраняются в карточке вакансии.</div></section><section class="panel upcoming"><div class="section-heading"><div><h2>На горизонте <span class="count">${upcoming.length}</span></h2><p>Все будущие запланированные действия</p></div><button class="text-button" data-action="expand-upcoming" aria-label="Развернуть запланированные действия">${icon('arrow')} Развернуть</button></div><div class="dashboard-scroll" tabindex="0" role="region" aria-label="Будущие действия">${upcomingList(upcoming)}</div></section></div><section class="panel recent"><div class="section-heading"><div><h2>Недавние вакансии</h2><p>Вернитесь к тому, что вас заинтересовало</p></div><a class="text-button" href="#jobs">Все вакансии ${icon('arrow')}</a></div>${state.jobs.length?state.jobs.slice(0,4).map(compactJob).join(''):empty('Ваш поиск начинается здесь','Добавьте первую вакансию — остальные шаги станут понятнее.')}</section>`;
  shell(content,'Сегодня','Держите фокус на том, что приближает вас к новой работе.');
}
function filteredJobs(){const q=state.query.toLocaleLowerCase('ru');return state.jobs.filter(j=>(!state.status||j.status===state.status)&&(!state.format||j.work_format===state.format)&&(!q||`${j.company} ${j.title} ${j.description} ${j.requirements}`.toLocaleLowerCase('ru').includes(q)));}
function notesWidget(job) {
  const notes=state.events.filter(e=>e.job_id===job.id&&e.kind==='note');
  return `<details class="job-notes"><summary aria-label="Заметки: ${esc(job.company)}, ${notes.length}">${icon('list')}<span>Заметки</span><span class="count">${notes.length}</span>${icon('down')}</summary><div class="notes-popover"><h3>Заметки · ${esc(job.company)}</h3>${notes.length?notes.map(note=>`<article class="note-preview"><time>${fullDate(note.created_at)}</time><p>${esc(note.body)}</p><a class="text-button" href="#job/${job.id}?note=${note.id}">${icon('edit')} Редактировать</a></article>`).join(''):`<p class="muted">Заметок пока нет.</p><a class="text-button" href="#job/${job.id}?note=new">${icon('plus')} Добавить заметку</a>`}</div></details>`;
}
function notesSection(jobId,notes) {
  const noteId=new URLSearchParams(state.route.split('?')[1]||'').get('note');
  const editing=notes.find(n=>n.id===noteId);
  return `<section class="panel detail-section" id="notes-section"><h2>Мои заметки <span class="count">${notes.length}</span></h2><form id="note-form" data-id="${jobId}" data-note-id="${editing?.id||''}"><label for="note-body">${editing?'Редактирование заметки':'Новая заметка'}</label><textarea id="note-body" name="body" rows="4" maxlength="10000" placeholder="Что обсудили, что важно уточнить, ваши впечатления…" required>${esc(editing?.body||'')}</textarea><div class="form-error" role="alert"></div><div class="note-form-actions"><button type="submit" class="button secondary">${editing?'Сохранить изменения':'Сохранить заметку'}</button>${editing?`<a class="text-button" href="#job/${jobId}">Отмена</a>`:''}</div></form><div class="notes">${notes.map(e=>`<article class="note"><div class="note-heading"><time>${fullDate(e.created_at)}</time><a class="text-button" href="#job/${jobId}?note=${e.id}">${icon('edit')} Редактировать</a></div><p>${esc(e.body)}</p></article>`).join('')}</div></section>`;
}
function jobsContent(){
  const jobs=filteredJobs();
  if(!state.jobs.length)return empty('Сохраните первую возможность','Добавьте вакансию по ссылке и вставьте её описание.');
  if(!jobs.length)return empty('Ничего не найдено','Измените запрос или сбросьте фильтры.','Сбросить фильтры','reset-filters');
  if(state.view==='board')return `<div class="board">${Object.entries(statuses).map(([s,label])=>{const group=jobs.filter(j=>j.status===s);return `<section class="board-column"><h3><span class="status-dot status-${s}"></span>${label}<small>${group.length}</small></h3><div class="board-items">${group.map(j=>`<article class="board-card"><a href="#job/${j.id}">${companyMark(j)}<span class="board-company">${esc(j.company)}</span><h3>${esc(j.title)}</h3><p>${salary(j)}</p></a><label class="sr-only" for="stage-${j.id}">Этап вакансии ${esc(j.title)}</label><select id="stage-${j.id}" data-change="status" data-id="${j.id}">${options(statuses,j.status)}</select>${notesWidget(j)}</article>`).join('')||'<span class="board-empty">Пока нет вакансий</span>'}</div></section>`;}).join('')}</div>`;
  return `<div class="job-list">${jobs.map(j=>{const task=state.tasks.find(t=>t.job_id===j.id&&!t.completed);return `<article class="job-card">${companyMark(j)}<div class="job-info"><a href="#job/${j.id}"><span class="company-name">${esc(j.company)}</span><h2>${esc(j.title)}</h2></a><div class="job-meta"><span>${icon('pin')}${esc(j.location)||'Город не указан'}</span><span>${formats[j.work_format]}</span></div></div><div class="job-pay"><strong>${salary(j)}</strong><span>${{net:'На руки',gross:'До вычета налогов',unknown:'Налоги не уточнены'}[j.salary_tax]}</span></div><div class="job-stage">${statusBadge(j.status)}${task?`<span class="next-action ${task.due_date<localDate()?'overdue':''}">${icon('clock')}${dateLabel(task.due_date)} · ${esc(task.title)}</span>`:'<span class="next-action">Следующий шаг не назначен</span>'}</div>${notesWidget(j)}<a class="icon-button" href="#job/${j.id}" aria-label="Открыть: ${esc(j.title)}">${icon('arrow')}</a></article>`;}).join('')}</div>`;
}
function jobsPage(){shell(`<div class="filter-bar"><label class="search-box">${icon('search')}<input id="job-search" type="search" placeholder="Должность, компания или ключевое слово" aria-label="Поиск вакансий" value="${esc(state.query)}"></label><select id="filter-status" aria-label="Фильтр по этапу"><option value="">Все этапы</option>${options(statuses,state.status)}</select><select id="filter-format" aria-label="Фильтр по формату"><option value="">Любой формат</option>${options({remote:'Удалённо',office:'В офисе',hybrid:'Гибрид'},state.format)}</select><div class="view-switch" aria-label="Вид вакансий"><button data-action="view" data-view="list" aria-pressed="${state.view==='list'}" aria-label="Список" title="Список">${icon('list')}</button><button data-action="view" data-view="board" aria-pressed="${state.view==='board'}" aria-label="Доска" title="Доска">${icon('board')}</button></div></div><div class="results-info"><span id="results-count">Найдено: ${filteredJobs().length}</span><span>Сначала недавно обновлённые</span></div><div id="jobs-content">${jobsContent()}</div>`,'Вакансии','Все возможности — от первого интереса до оффера.');}
function updateJobResults(){document.querySelector('#jobs-content').innerHTML=jobsContent();document.querySelector('#results-count').textContent=`Найдено: ${filteredJobs().length}`;}
function detailPage(id){
  const j=state.jobs.find(j=>j.id===id);if(!j){shell(empty('Вакансия не найдена','Возможно, она была удалена.','К вакансиям','go-jobs'),'Карточка вакансии','');return;}
  const tasks=state.tasks.filter(t=>t.job_id===id),events=state.events.filter(e=>e.job_id===id),notes=events.filter(e=>e.kind==='note');
  const content=`<a class="back-link" href="#jobs">${icon('back')} Все вакансии</a><section class="detail-header panel">${companyMark(j)}<div class="detail-title"><span>${esc(j.company)}</span><h2>${esc(j.title)}</h2><p>${icon('pin')}${esc(j.location)||'Город не указан'} · ${formats[j.work_format]}</p></div><div class="detail-header-actions"><button class="button secondary" data-action="edit-job" data-id="${id}">${icon('edit')} Изменить</button><button class="icon-button danger" data-action="delete-job" data-id="${id}" aria-label="Удалить вакансию">${icon('trash')}</button></div></section><div class="detail-grid"><div><section class="panel"><div class="section-heading"><div><h2>Следующие действия</h2><p>Отклики, встречи и напоминания</p></div><button class="text-button" data-action="add-task" data-id="${id}">${icon('plus')} Добавить</button></div>${tasks.length?tasks.map(t=>taskRow(t,{details:true})).join(''):empty('Какой следующий шаг?','Назначьте действие, чтобы не потерять эту возможность.','Добавить действие','add-task')}</section><section class="panel detail-section"><h2>Описание вакансии</h2><div class="prose">${esc(j.description)||'<span class="muted">Описание пока не добавлено.</span>'}</div>${j.requirements?`<h3>Ключевые требования</h3><div class="prose">${esc(j.requirements)}</div>`:''}</section>${notesSection(id,notes)}${careerUI.letterSection(id)}</div><aside><section class="panel detail-section"><span class="eyebrow">ТЕКУЩИЙ ЭТАП</span><label class="sr-only" for="detail-status">Этап вакансии</label><select id="detail-status" data-change="status" data-id="${id}" class="stage-select">${options(statuses,j.status)}</select><div class="detail-fact"><span>Зарплата</span><strong>${salary(j)}</strong><small>${{net:'На руки',gross:'До вычета налогов',unknown:'Налоговый режим не указан'}[j.salary_tax]}</small></div><div class="detail-fact"><span>Добавлена</span><strong>${dateLabel(j.created_at.slice(0,10))}</strong></div>${j.url?`<a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer" class="button secondary wide">Открыть оригинал ${icon('arrow')}</a>`:'<p class="muted">Ссылка на оригинал не добавлена.</p>'}</section><section class="panel detail-section"><h2>История</h2><ol class="timeline">${events.filter(e=>e.kind!=='note').map(e=>`<li><span class="timeline-dot"></span><strong>${e.kind==='created'?'Вакансия добавлена':`${statuses[e.from_status]} → ${statuses[e.to_status]}`}</strong><time>${fullDate(e.created_at)}</time></li>`).join('')}</ol></section></aside></div>`;
  shell(content,'Карточка вакансии','Контекст, история и следующий шаг в одном месте.');
  if(new URLSearchParams(state.route.split('?')[1]||'').has('note')) requestAnimationFrame(()=>{
    document.querySelector('#note-body')?.focus({preventScroll:true});
    document.querySelector('#notes-section')?.scrollIntoView({block:'start'});
  });
}
function overviewPage(){const s=stats(),total=state.jobs.length,conversion=s.applied?Math.round(s.interview/s.applied*100):0;
  shell(`<section class="metrics">${metric('Всего вакансий',total,'Сохранено за всё время','','jobs')}${metric('Отправлены отклики',s.applied,'По истории этапов','','arrow')}${metric('Отклик → интервью',`${conversion}%`,`${s.interview} из ${s.applied} вакансий`,'','chart')}${metric('Получены офферы',s.offer,'По истории этапов','accent','sparkle')}</section><div class="overview-grid"><section class="panel detail-section"><h2>Где вы сейчас</h2><p class="muted">Распределение вакансий по текущим этапам</p><div class="stage-chart">${Object.entries(statuses).map(([key,label])=>{const n=state.jobs.filter(j=>j.status===key).length;return `<div class="chart-row"><div><span class="status-dot status-${key}"></span><span>${label}</span><strong>${n}</strong></div><progress class="progress-${key}" value="${n}" max="${Math.max(total,1)}" aria-label="${label}: ${n}"></progress></div>`;}).join('')}</div></section><section class="panel detail-section"><h2>Путь к офферу</h2><p class="muted">Самый высокий достигнутый этап каждой вакансии</p><div class="funnel">${[['Сохранены',total],['Отклики',s.applied],['Интервью',s.interview],['Офферы',s.offer]].map(([label,n],i)=>`<div class="funnel-row"><span class="funnel-step">0${i+1}</span><span>${label}</span><strong>${n}</strong></div>`).join('')}</div><p class="method-note">Отклики учитывают вакансии, достигшие этапа отклика, интервью, оффера или отказа. Интервью включают офферы. Возврат на предыдущий этап не стирает результат. Это показатели ваших записей, а не подтверждённые ответы работодателей.</p></section></div><section class="export-panel"><div class="export-icon">${icon('export')}</div><div><h2>Ваши данные всегда с вами</h2><p>JSON — полная выгрузка записей. CSV — список вакансий для таблиц.</p></div><div class="export-buttons"><a class="button secondary" href="/api/export" download>Скачать JSON</a><a class="button secondary" href="/api/export?format=csv" download>Скачать CSV</a></div></section>`,'Обзор','Посмотрите на поиск целиком и выберите следующий шаг.');
}
function render(){if(!state.user)return auth();if(state.route==='today')todayPage();else if(state.route==='jobs')jobsPage();else if(state.route==='overview')overviewPage();else if(state.route==='profile')careerUI.profilePage();else if(state.route.startsWith('job/'))detailPage(state.route.slice(4).split('?')[0]);else{state.route='today';todayPage();}}
function openDialog(html){returnFocus=document.activeElement;dialog.innerHTML=html;dialog.showModal();setTimeout(()=>dialog.querySelector('input,select,textarea,button')?.focus(),0);}
function closeDialog(){dialog.close();if(returnFocus?.isConnected)returnFocus.focus();else document.querySelector('[data-action="add-job"]')?.focus();}
const dialogTop=(eyebrow,title)=>`<div class="dialog-heading"><div><span class="eyebrow">${eyebrow}</span><h2 id="dialog-title">${title}</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Закрыть">${icon('close')}</button></div>`;
function jobForm(id){
  const j=state.jobs.find(j=>j.id===id)||{status:'saved',currency:'BYN',salary_period:'month',salary_tax:'unknown',work_format:''};
  openDialog(`${dialogTop(id?'КАРТОЧКА ВАКАНСИИ':'НОВАЯ ВОЗМОЖНОСТЬ',id?'Редактировать вакансию':'Добавить вакансию')}<form id="job-form" data-id="${id||''}"><div class="form-grid"><label>Компания <span>*</span><input name="company" required maxlength="150" value="${esc(j.company)}" placeholder="Название компании"></label><label>Должность <span>*</span><input name="title" required maxlength="150" value="${esc(j.title)}" placeholder="Например, Frontend-разработчик"></label><label class="full">Ссылка на вакансию<input name="url" type="url" maxlength="2000" value="${esc(j.url)}" placeholder="https://…"></label><label>Этап<select name="status">${options(statuses,j.status)}</select></label><label>Формат работы<select name="work_format">${options(formats,j.work_format)}</select></label><label class="full">Город или страна<input name="location" maxlength="150" value="${esc(j.location)}" placeholder="Например, Минск"></label><label>Зарплата от<input name="salary_min" type="number" min="0" max="1000000000" step="0.01" value="${j.salary_min??''}" placeholder="Не указана"></label><label>Зарплата до<input name="salary_max" type="number" min="0" max="1000000000" step="0.01" value="${j.salary_max??''}" placeholder="Не указана"></label><div class="full salary-options"><label>Валюта<select name="currency">${options({BYN:'BYN',RUB:'RUB',USD:'USD',EUR:'EUR'},j.currency)}</select></label><label>Период<select name="salary_period">${options({month:'За месяц',year:'За год',hour:'За час'},j.salary_period)}</select></label><label>Налоги<select name="salary_tax">${options({unknown:'Не уточнены',net:'На руки',gross:'До вычета'},j.salary_tax)}</select></label></div><label class="full">Описание вакансии<textarea name="description" rows="5" maxlength="30000" placeholder="Вставьте текст вакансии: задачи, требования и условия…">${esc(j.description)}</textarea></label><label class="full">Ключевые требования<textarea name="requirements" rows="2" maxlength="10000" placeholder="Что важно для этой роли">${esc(j.requirements)}</textarea></label></div><p class="form-hint">${icon('sparkle')} AI-разбор появится после подключения API. Сейчас поля заполняются вручную.</p><div class="form-error" role="alert"></div><div class="dialog-footer"><button class="button secondary" type="button" data-action="close-dialog">Отмена</button><button class="button primary" type="submit">${id?'Сохранить изменения':'Сохранить вакансию'} ${icon('check')}</button></div></form>`);
}
function taskForm(id){
  if(!state.jobs.length){toast('Сначала добавьте вакансию, к которой относится действие.');return jobForm();}
  const current=id||(state.route.startsWith('job/')?state.route.slice(4).split('?')[0]:'');
  openDialog(`${dialogTop('ЗАПЛАНИРОВАТЬ','Следующее действие')}<form id="task-form"><label>Вакансия<select name="job_id">${state.jobs.map(j=>`<option value="${j.id}" ${current===j.id?'selected':''}>${esc(j.company)} · ${esc(j.title)}</option>`).join('')}</select></label><label>Что нужно сделать <span>*</span><input name="title" required maxlength="300" placeholder="Например, подготовиться к интервью"></label><div class="form-grid"><label>Тип действия<select name="kind">${options(taskKinds,'followup')}</select></label><label>Дата <span>*</span><input name="due_date" type="date" min="1900-01-01" max="2200-12-31" value="${localDate()}" required></label><label>Время · необязательно<input name="due_time" type="time"></label></div><p class="form-hint">Время указывается в вашем местном часовом поясе. Напоминание появится внутри трекера.</p><div class="form-error" role="alert"></div><div class="dialog-footer"><button type="button" class="button secondary" data-action="close-dialog">Отмена</button><button type="submit" class="button primary">Запланировать ${icon('check')}</button></div></form>`);
}
function deleteDialog(type,id){const job=state.jobs.find(j=>j.id===id),task=state.tasks.find(t=>t.id===id);openDialog(`${dialogTop('УДАЛЕНИЕ',type==='job'?'Удалить вакансию?':'Удалить действие?')}<p>${esc(type==='job'?`${job.company} · ${job.title}`:task.title)}</p><p class="muted">${type==='job'?'Связанные заметки, задачи и история тоже будут удалены.':'Действие исчезнет из карточки вакансии.'} Это действие нельзя отменить.</p><div class="form-error" role="alert"></div><div class="dialog-footer"><button class="button secondary" data-action="close-dialog">Отмена</button><button class="button destructive" data-action="confirm-delete" data-type="${type}" data-id="${id}">Удалить</button></div>`);}
async function mutation(path,options,message){await api(path,options);await refresh();render();if(message)toast(message);}

document.addEventListener('click',async event=>{
  // Clicking an already-selected note does not fire hashchange. Return to
  // its editor explicitly, without re-rendering and losing unsaved text.
  const noteLink=event.target.closest('a[href^="#job/"]');
  if(noteLink && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button===0) {
    const target=noteLink.getAttribute('href');
    if(target===location.hash && new URLSearchParams(target.split('?')[1]||'').has('note')) {
      event.preventDefault();
      document.querySelector('#note-body')?.focus({preventScroll:true});
      document.querySelector('#notes-section')?.scrollIntoView({block:'start'});
      return;
    }
  }
  const el=event.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
  if(el.disabled)return;
  try{
    if(action==='auth-mode'){state.authMode=el.dataset.mode;auth();}
    if(action==='demo'){el.disabled=true;const data=await api('/auth/demo',{method:'POST',body:{}});state.user=data.user;await refresh();location.hash='today';state.route='today';render();}
    if(action==='logout'||action==='leave-demo'){el.disabled=true;await api('/auth/logout',{method:'POST',body:{}});careerUI.clear();state.user=null;state.jobs=[];state.tasks=[];state.events=[];state.query='';state.status='';state.format='';state.authMode=action==='leave-demo'?'register':'login';auth();}
    if(action==='expand-upcoming')upcomingDialog();
    if(action==='open-upcoming-job')closeDialog();
    if(action==='add-job')jobForm();
    if(action==='edit-job')jobForm(el.dataset.id);
    if(action==='close-dialog')closeDialog();
    if(action==='add-task')taskForm(el.dataset.id);
    if(action==='toggle-task'){el.disabled=true;const t=state.tasks.find(t=>t.id===el.dataset.id);await mutation(`/tasks/${t.id}`,{method:'PATCH',body:{completed:!t.completed}},t.completed?'Действие снова запланировано':'Готово. Ещё один шаг сделан.');}
    if(action==='delete-job'||action==='delete-task')deleteDialog(action==='delete-job'?'job':'task',el.dataset.id);
    if(action==='confirm-delete'){el.disabled=true;await api(`/${el.dataset.type==='job'?'jobs':'tasks'}/${el.dataset.id}`,{method:'DELETE'});await refresh();closeDialog();if(el.dataset.type==='job'){state.route='jobs';location.hash='jobs';}render();toast('Удалено');}
    if(action==='view'){state.view=el.dataset.view;jobsPage();}
    if(action==='reset-filters'){state.query='';state.status='';state.format='';jobsPage();}
    if(action==='go-jobs')location.hash='jobs';
  }catch(error){if(dialog.open){dialog.querySelector('.form-error').textContent=error.message;}else toast(error.message);}finally{if(el.isConnected)el.disabled=false;}
});
document.addEventListener('input',event=>{if(event.target.id==='job-search'){state.query=event.target.value;updateJobResults();}});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.id==='filter-status'){state.status=el.value;updateJobResults();}
  if(el.id==='filter-format'){state.format=el.value;updateJobResults();}
  if(el.dataset.change==='status'){const previous=state.jobs.find(j=>j.id===el.dataset.id).status;el.disabled=true;try{await mutation(`/jobs/${el.dataset.id}`,{method:'PATCH',body:{status:el.value}},'Этап обновлён');}catch(e){el.value=previous;toast(e.message);}finally{if(el.isConnected)el.disabled=false;}}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['auth-form','job-form','task-form','note-form'].includes(form.id))return;event.preventDefault();
  const button=form.querySelector('[type="submit"]'),errorEl=form.querySelector('.form-error');button.disabled=true;errorEl.textContent='';
  const body=Object.fromEntries(new FormData(form));
  try{
    if(form.id==='auth-form'){const data=await api(`/auth/${state.authMode}`,{method:'POST',body});state.user=data.user;await refresh();state.route='today';location.hash='today';render();}
    if(form.id==='job-form'){const id=form.dataset.id;const result=await api(id?`/jobs/${id}`:'/jobs',{method:id?'PATCH':'POST',body});await refresh();closeDialog();state.route=`job/${id||result.id}`;location.hash=state.route;render();toast(id?'Изменения сохранены':'Вакансия сохранена. Назначьте следующий шаг.');}
    if(form.id==='task-form'){await api('/tasks',{method:'POST',body});await refresh();closeDialog();render();toast('Следующий шаг запланирован');}
    if(form.id==='note-form'){
      const noteId=form.dataset.noteId;
      await api(`/jobs/${form.dataset.id}/notes${noteId?'/'+noteId:''}`,{method:noteId?'PATCH':'POST',body});
      await refresh();
      render();
      toast(noteId?'Изменения заметки сохранены':'Заметка сохранена');
    }
  }catch(error){errorEl.textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}
});
dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
window.addEventListener('hashchange',route);
async function init(){try{await refresh();state.route=location.hash.slice(1)||'today';render();}catch(e){if(e.status===401)auth();else{app.innerHTML=`<main class="startup-error">${empty('Не удалось открыть трекер',esc(e.message),'','')}<button class="button primary" id="retry-start">Попробовать ещё раз</button></main>`;document.querySelector('#retry-start').addEventListener('click',init);}}}
const careerUI=createCareerUI({state,api,refresh,render,shell,esc,icon,fullDate,openDialog,closeDialog,dialogTop,toast});
init();
