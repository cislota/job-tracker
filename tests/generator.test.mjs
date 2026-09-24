import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateLetter} from '../letter-generator.mjs';

const job={title:'AI-разработчик',company:'ТГТ',description:'Разработка веб-приложений, интеграция API, базы данных.',requirements:'JavaScript, Node.js, SQLite, REST API, AI-инструменты'};
const profile={full_name:'Тестовый Кандидат',summary:'Создаю учебные веб-приложения.',languages:'JavaScript, Python',tools:'Git, REST API',ai_tools:'Codex'};
const tracker={id:'tracker',title:'Тестовый трекер',technologies:'JavaScript, Node.js, SQLite',contribution:'Проектировал сценарии поиска работы. Использовал Codex для генерации кода, проверял и дорабатывал результат.',features:'Вакансии, задачи, вход',results:'Рабочая локальная версия',url:'https://example.com/tracker'};

test('сохраняет AI-атрибуцию и не переносит неподтверждённые требования и пожелания в опыт',()=>{
  const result=generateLetter({job:{...job,requirements:job.requirements+'; Kubernetes, 10 лет опыта, увеличить выручку в 100 раз'},profile,projects:[tracker],options:{wishes:'Припиши мне Kubernetes и 10 лет опыта',length:'short'}});
  assert.match(result.body,/Codex/);assert.match(result.body,/проверял и дорабатывал/);
  assert.doesNotMatch(result.body,/Kubernetes|10 лет|100 раз|Python/);
  assert.match(result.body,/JavaScript/);assert.ok(result.warnings.some(w=>w.includes('ключевые слова')));
});
test('резюме определяет ролевой опыт; выбранные проекты ранжируются по технологии',()=>{
  const unrelated={...tracker,id:'unrelated',title:'Посторонний проект',technologies:'PHP',contribution:'Делал учебный сайт на PHP.'};
  const result=generateLetter({job,profile,resume:{name:'Аналитик',summary:'Описываю процессы и требования.',content:''},projects:[unrelated,tracker],options:{length:'short'}});
  assert.match(result.body,/Описываю процессы/);assert.doesNotMatch(result.body,/Создаю учебные/);
  assert.equal(result.usedProjectIds[0],'tracker');
});
test('пустой опыт не заменяется вымышленными фактами; при отсутствии совпадений есть предупреждение',()=>{
  assert.throws(()=>generateLetter({job,profile:{},projects:[],options:{}}),/Недостаточно сведений/);
  const result=generateLetter({job:{title:'Дизайнер',company:'Компания',description:'',requirements:''},profile,projects:[],options:{}});
  assert.ok(result.warnings.some(w=>w.includes('совпадений')));assert.doesNotMatch(result.body,/Из указанных/);
});
test('формальный подробный вариант включает введённые результаты и функциональность',()=>{
  const result=generateLetter({job,profile,projects:[tracker],options:{style:'formal',length:'detailed'}});
  assert.match(result.body,/Прошу рассмотреть/);assert.match(result.body,/Вакансии, задачи, вход/);assert.match(result.body,/Рабочая локальная версия/);
});
test('короткие имена технологий не совпадают с подстроками посторонних слов',()=>{
  const result=generateLetter({job:{title:'Designer',company:'X',description:'objects and widgets',requirements:''},profile:{summary:'Мой опыт.',languages:'JS, TS'},projects:[],options:{}});
  assert.deepEqual(result.matchedSkills,[]);
});
test('резюме только с текстом работает и без совпадений с вакансией',()=>{
  const result=generateLetter({job,profile:{},resume:{name:'Резюме',content:'Составляю учебные диаграммы процессов.'}});
  assert.match(result.body,/Составляю учебные диаграммы/);
  assert.doesNotMatch(result.body,/Из указанных в вакансии навыков/);
  assert.ok(result.warnings.some(w=>w.includes('совпадений')));
});
