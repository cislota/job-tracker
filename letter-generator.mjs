// Deterministic, local generator. Vacancy text and wishes are search data,
// never instructions or a source of claims about the applicant.
const aliases = [
  ['javascript', 'js', 'джаваскрипт'], ['typescript', 'ts'],
  ['node.js', 'nodejs', 'node js'], ['react', 'react.js', 'reactjs'],
  ['postgresql', 'postgres', 'постгрес'], ['sqlite', 'sqlite3'],
  ['rest api', 'rest', 'restful'], ['html', 'html5'], ['css', 'css3'],
  ['git', 'github', 'gitlab'], ['ai', 'ии', 'искусственный интеллект'],
  ['база данных', 'базы данных', 'базами данных', 'database', 'databases'],
  ['системный анализ', 'системного анализа', 'system analysis'],
];
const normalize = value => String(value || '').toLowerCase().replaceAll('ё','е');
function hasTerm(haystack, term) {
  const escaped=normalize(term).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,'u').test(normalize(haystack));
}
function matches(haystack, term) {
  const group=aliases.find(items=>items.includes(normalize(term)));
  return (group || [term]).some(item=>hasTerm(haystack,item));
}
export const skillList = value => [...new Set(String(value || '').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean))];
const fragments = text => String(text || '').split(/\n+|(?<=[!?]|\.)\s+(?=[А-ЯA-Z])/u).map(s=>s.replace(/^[-•]\s*/,'').trim()).filter(Boolean);
function snippet(text,limit=380) {
  const value=fragments(text)[0] || '';
  if(value.length<=limit)return value.replace(/[.!?]+$/,'');
  const cut=value.slice(0,limit), boundary=cut.lastIndexOf(' ');
  return cut.slice(0,boundary>limit/2?boundary:limit).replace(/[,;:]+$/,'')+'…';
}
function score(text, keywords) { return keywords.reduce((sum,term)=>sum+(matches(text,term)?1:0),0); }
function contributionText(text,detailed) {
  const lines=fragments(text);
  // Keep AI attribution even when it is in a later sentence. Dropping it
  // would misrepresent the way the project was implemented.
  const attribution=lines.filter(line=>/(?:\b(?:ai|codex|claude|cursor|windsurf|copilot|bolt)\b|\bИИ\b|искусственн|нейросет)/iu.test(line)||/(?:^|[^\p{L}])ии(?:$|[^\p{L}])/iu.test(line));
  const first=snippet(lines[0]||'',detailed?700:420);
  return [...new Set([first,...attribution.map(line=>line.replace(/[.!?]+$/,''))])].filter(Boolean).join('. ');
}

export function generateLetter({job,profile={},resume=null,projects=[],options={}}) {
  const detailed=options.length==='detailed', formal=options.style==='formal';
  const vacancy=`${job.title}\n${job.description}\n${job.requirements}`;
  const wishes=options.wishes||'';
  const ownSkills=skillList(['languages','frameworks','databases','tools','analysis','ai_tools'].map(k=>profile[k]).join(','));
  const allTerms=[...new Set([...ownSkills,...projects.flatMap(p=>skillList(p.technologies))])];
  const matched=allTerms.filter(term=>matches(vacancy,term));
  const warnings=[], evidence=[];
  if(!job.description && !job.requirements)warnings.push('Описание вакансии пустое: подбор ограничен названием должности.');
  if(!matched.length)warnings.push('Явных совпадений навыков с вакансией не найдено. Выбранные факты добавлены без утверждения, что они соответствуют требованиям.');
  if(wishes)warnings.push('Пожелания учитываются только как ключевые слова для приоритета фактов. Произвольные инструкции шаблон не выполняет.');
  const skillEvidence=ownSkills.filter(term=>matches(vacancy,term)).slice(0,detailed?6:4);
  const keywords=[...matched,...allTerms.filter(term=>matches(wishes,term))];
  const ranked=projects.map((project,index)=>({project,index,value:score(project.technologies,matched)*3+score(`${project.title} ${project.description} ${project.contribution} ${project.features}`,keywords)}))
    .sort((a,b)=>b.value-a.value||a.index-b.index).slice(0,detailed?3:2).map(x=>x.project);
  const intro = formal
    ? `Здравствуйте!\n\nПрошу рассмотреть мою кандидатуру на должность «${job.title}» в компании «${job.company}».`
    : `Здравствуйте!\n\nМеня заинтересовала вакансия «${job.title}» в компании «${job.company}».`;
  const paragraphs=[intro];
  // The selected resume overrides the general summary; unselected resumes
  // are never supplied to this function.
  const summary=resume?.summary || profile.summary;
  if(summary) {
    const used=snippet(summary,detailed?650:350);
    paragraphs.push(`${used}.`);
    evidence.push({kind:resume?'resume':'profile',label:resume?resume.name:'Краткий опыт',text:used});
  }
  if(skillEvidence.length) {
    paragraphs.push(`Из указанных в вакансии навыков у меня есть ${skillEvidence.join(', ')}.`);
    evidence.push({kind:'skills',label:'Совпавшие навыки',text:skillEvidence.join(', ')});
  }
  for(const project of ranked) {
    const contribution=contributionText(project.contribution,detailed);
    paragraphs.push(`Проект «${project.title}»: мой вклад — ${contribution}.`);
    evidence.push({kind:'project',id:project.id,label:project.title,text:contribution});
    if(detailed) {
      if(project.features)paragraphs.push(`Реализованная функциональность проекта: ${snippet(project.features,500)}.`);
      if(project.results)paragraphs.push(`Результат проекта: ${snippet(project.results,400)}.`);
    }
  }
  if(resume?.content && (detailed || !summary && !ranked.length)) {
    const candidates=fragments(resume.content).map((line,index)=>({line,index,value:score(line,keywords)}))
      .sort((a,b)=>b.value-a.value||a.index-b.index);
    const fact=candidates.find(item=>item.value>0 && !summary?.includes(item.line)) || (!evidence.length ? candidates[0] : null);
    if(fact) {
      const used=snippet(fact.line,500);paragraphs.push(`${used}.`);
      evidence.push({kind:'resume',label:resume.name,text:used});
    }
  }
  if(!evidence.length) {
    const err=new Error('Недостаточно сведений для письма. Заполните краткое описание опыта в профиле или резюме либо выберите проект с личным вкладом.');
    err.status=400;throw err;
  }
  paragraphs.push(formal
    ? 'Готов обсудить, как мой опыт может быть полезен вашей команде, и подробнее рассказать о выполненных задачах.'
    : 'Буду рад обсудить задачи команды и показать результаты своей работы.');
  paragraphs.push(formal?'Благодарю за рассмотрение моей кандидатуры.':'Спасибо за внимание к моему отклику.');
  const links=[profile.github_url,profile.portfolio_url,...ranked.map(p=>p.url)].filter(Boolean);
  if(links.length)paragraphs.push(`Портфолио: ${[...new Set(links)].slice(0,detailed?4:2).join(' · ')}`);
  const signature=[profile.full_name,profile.contacts].filter(Boolean).join('\n');
  if(signature)paragraphs.push(signature);
  return {body:paragraphs.join('\n\n'),evidence,warnings,matchedSkills:matched,usedProjectIds:ranked.map(p=>p.id),method:'template-v1'};
}
