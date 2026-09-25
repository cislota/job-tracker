export function createCareerUI({
  state,
  api,
  refresh,
  render,
  shell,
  esc,
  icon,
  fullDate,
  openDialog,
  closeDialog,
  dialogTop,
  toast,
}) {
  const drafts = new Map();
  const field = (name, label, value = '', max = 150, rows = 0, required = false, type = 'text') =>
    /* HTML */ `<label
      >${label}${required ? ' *' : ''}${rows
        ? /* HTML */ `<textarea
            name="${name}"
            maxlength="${max}"
            rows="${rows}"
            ${required ? 'required' : ''}
          >
${esc(value)}</textarea
          >`
        : /* HTML */ `<input
            name="${name}"
            type="${type}"
            maxlength="${max}"
            value="${esc(value)}"
            ${required ? 'required' : ''}
          />`}</label
    >`;
  const action = (name, label, id = '', classes = 'button secondary') =>
    /* HTML */ `<button type="button" class="${classes}" data-career="${name}" data-id="${id}">
      ${label}
    </button>`;
  const formFooter = (label) =>
    /* HTML */ `<div class="form-error" role="alert"></div>
      <div class="dialog-footer">
        <button type="button" class="button secondary" data-action="close-dialog">Отмена</button
        ><button class="button primary" type="submit">${label}</button>
      </div>`;

  function growSkillField(field) {
    field.style.height = 'auto';
    const style = getComputedStyle(field);
    field.style.height = `${field.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`;
  }
  function growSkills() {
    document.querySelectorAll('#profile-form [data-auto-grow]').forEach(growSkillField);
  }
  window.addEventListener('resize', growSkills);
  document.fonts?.ready.then(growSkills);

  function profilePage() {
    const p = state.profile || {},
      resumes = state.resumes || [],
      projects = state.projects || [];
    const skills = [
      ['languages', 'Языки программирования'],
      ['frameworks', 'Фреймворки и библиотеки'],
      ['databases', 'Базы данных'],
      ['tools', 'Инструменты разработки'],
      ['analysis', 'Системный анализ'],
      ['ai_tools', 'ИИ-инструменты'],
    ];
    shell(
      /* HTML */ `<div class="career-intro">
          <span>${icon('shield')}</span>
          <div>
            <strong>Ваш опыт — основа каждого письма</strong>
            <p>
              Сохраняйте только фактические сведения. Генератор работает локально, без AI API;
              данные не отправляются внешним сервисам.
            </p>
          </div>
        </div>
        <div class="profile-grid">
          <section class="panel detail-section">
            <h2>Общая информация</h2>
            <form id="profile-form" data-career-form="profile">
              <div class="form-grid">
                ${field('full_name', 'Имя и фамилия', p.full_name)}${field(
                  'target_role',
                  'Желаемая должность',
                  p.target_role,
                )}
                <div class="full">
                  ${field('summary', 'Кратко о профессиональном опыте', p.summary, 5000, 4)}${field(
                    'contacts',
                    'Контактные данные для подписи',
                    p.contacts,
                    1000,
                    2,
                  )}
                </div>
                ${field(
                  'github_url',
                  'Ссылка на GitHub',
                  p.github_url,
                  2000,
                  0,
                  false,
                  'url',
                )}${field(
                  'portfolio_url',
                  'Ссылка на портфолио',
                  p.portfolio_url,
                  2000,
                  0,
                  false,
                  'url',
                )}
              </div>
              <h3>Навыки</h3>
              <p class="muted career-hint">
                Перечисляйте через запятую: это поможет найти совпадения с вакансией.
              </p>
              <div class="form-grid">
                ${skills
                  .map(([key, label]) =>
                    field(key, label, p[key], 2000, 2).replace(
                      '<textarea ',
                      '<textarea data-auto-grow ',
                    ),
                  )
                  .join('')}
              </div>
              <div class="form-error" role="alert"></div>
              <button type="submit" class="button primary">Сохранить профиль</button>
            </form>
          </section>
          <div>
            <section class="panel detail-section">
              <div class="career-section-heading">
                <h2>Версии резюме <span class="count">${resumes.length}</span></h2>
                ${action('add-resume', `${icon('plus')} Добавить`, '', 'text-button')}
              </div>
              <p class="muted career-hint">
                Например, разработчик и системный аналитик. В первой версии резюме хранится как
                текст.
              </p>
              ${resumes.length
                ? resumes
                    .map(
                      (r) =>
                        /* HTML */ `<article class="career-card">
                          <h3>${esc(r.name)}</h3>
                          <span class="muted">${esc(r.target_role) || 'Должность не указана'}</span>
                          <p>
                            ${esc((r.summary || r.content).slice(0, 180))}${(r.summary || r.content)
                              .length > 180
                              ? '…'
                              : ''}
                          </p>
                          <div class="career-card-actions">
                            ${action('edit-resume', 'Изменить', r.id, 'text-button')}${action(
                              'delete-resume',
                              'Удалить',
                              r.id,
                              'text-button danger',
                            )}
                          </div>
                        </article>`,
                    )
                    .join('')
                : '<p class="career-empty">Добавьте первое резюме, чтобы выбирать его для письма.</p>'}
            </section>
            <section class="panel detail-section">
              <div class="career-section-heading">
                <h2>Мои проекты <span class="count">${projects.length}</span></h2>
                ${action('add-project', `${icon('plus')} Добавить`, '', 'text-button')}
              </div>
              <p class="muted career-hint">
                Опишите именно свой вклад. Если использовали AI-агентов, укажите, какие задачи
                выполняли с их помощью.
              </p>
              ${projects.length
                ? projects
                    .map(
                      (p) =>
                        /* HTML */ `<article class="career-card">
                          <h3>${esc(p.title)}</h3>
                          <span class="career-technologies">${esc(p.technologies)}</span>
                          <p>
                            ${esc(p.description.slice(0, 180))}${p.description.length > 180
                              ? '…'
                              : ''}
                          </p>
                          <details>
                            <summary>Личный вклад</summary>
                            <p class="prose">${esc(p.contribution)}</p>
                          </details>
                          <div class="career-card-actions">
                            ${action('edit-project', 'Изменить', p.id, 'text-button')}${action(
                              'delete-project',
                              'Удалить',
                              p.id,
                              'text-button danger',
                            )}
                          </div>
                        </article>`,
                    )
                    .join('')
                : '<p class="career-empty">Пока нет проектов. Названия из примеров не добавляются автоматически.</p>'}
            </section>
          </div>
        </div>`,
      'Мой профиль',
      'Опыт, резюме и проекты для персональных откликов.',
    );
    growSkills();
  }

  function resumeForm(id) {
    const r = state.resumes.find((r) => r.id === id) || {};
    openDialog(
      `${dialogTop('ВЕРСИЯ РЕЗЮМЕ', id ? 'Изменить резюме' : 'Добавить резюме')}<form data-career-form="resume" data-id="${id || ''}">${field('name', 'Название версии', r.name, 150, 0, true)}${field('target_role', 'Целевая должность', r.target_role)}${field('summary', 'Краткий опыт для этой роли', r.summary, 5000, 3)}${field('content', 'Текст резюме', r.content, 20000, 8)}<p class="form-hint">Заполните краткий опыт или текст резюме. Краткий опыт выбранной версии имеет приоритет над общим описанием в профиле.</p>${formFooter('Сохранить резюме')}</form>`,
    );
  }
  function projectForm(id) {
    const p = state.projects.find((p) => p.id === id) || {};
    openDialog(
      `${dialogTop('ПОРТФОЛИО', id ? 'Изменить проект' : 'Добавить проект')}<form data-career-form="project" data-id="${id || ''}">${field('title', 'Название проекта', p.title, 150, 0, true)}${field('description', 'Краткое описание', p.description, 3000, 3)}${field('technologies', 'Технологии через запятую', p.technologies, 2000)}${field('features', 'Реализованная функциональность', p.features, 5000, 3)}${field('contribution', 'Мой личный вклад', p.contribution, 5000, 4, true)}<p class="form-hint">Текст используется в письме. Укажите реальную роль и применение AI-инструментов, не приписывайте себе чужую работу.</p>${field('results', 'Результаты работы', p.results, 3000, 3)}${field('url', 'Ссылка на GitHub или приложение', p.url, 2000, 0, false, 'url')}${formFooter('Сохранить проект')}</form>`,
    );
  }
  function draftFor(id) {
    if (!drafts.has(id))
      drafts.set(id, {
        body: '',
        options: { resume_id: '', project_ids: [], style: 'natural', length: 'short', wishes: '' },
        evidence: [],
        warnings: [],
        dirty: false,
        baseVersion: null,
      });
    return drafts.get(id);
  }
  function optionsFrom(form) {
    const data = new FormData(form);
    return {
      resume_id: data.get('resume_id') || '',
      project_ids: data.getAll('project_ids'),
      style: data.get('style'),
      length: data.get('length'),
      wishes: data.get('wishes') || '',
    };
  }
  function letterSection(jobId) {
    const d = draftFor(jobId),
      o = d.options,
      resumes = state.resumes || [],
      projects = state.projects || [],
      letters = (state.letters || []).filter((l) => l.job_id === jobId);
    const missingResume = o.resume_id && !resumes.some((r) => r.id === o.resume_id);
    const missingProjects = o.project_ids.filter((id) => !projects.some((p) => p.id === id));
    return /* HTML */ `<section class="panel detail-section letter-section" id="letter-section">
      <div class="career-section-heading">
        <div>
          <span class="eyebrow">ПОДГОТОВКА ОТКЛИКА</span>
          <h2>Сопроводительное письмо</h2>
        </div>
        ${icon('edit')}
      </div>
      <p class="muted career-hint">
        Соберите черновик из своего опыта и требований вакансии.
        <a href="#profile" class="text-button">Мой профиль ${icon('arrow')}</a>
      </p>
      <details class="letter-settings" ${!d.body ? 'open' : ''}>
        <summary>Параметры письма</summary>
        <form data-career-form="generate" data-id="${jobId}">
          <label
            >Версия резюме<select name="resume_id">
              <option value="">Общий профиль</option>
              ${missingResume
                ? /* HTML */ `<option value="${esc(o.resume_id)}" selected>
                    Резюме удалено — выберите другое
                  </option>`
                : ''}${resumes
                .map(
                  (r) =>
                    /* HTML */ `<option value="${r.id}" ${o.resume_id === r.id ? 'selected' : ''}>
                      ${esc(r.name)}
                    </option>`,
                )
                .join('')}
            </select></label
          >
          <fieldset class="project-picker">
            <legend>Проекты для письма</legend>
            ${projects.length
              ? projects
                  .map(
                    (p) =>
                      /* HTML */ `<label
                        ><input
                          type="checkbox"
                          name="project_ids"
                          value="${p.id}"
                          ${o.project_ids.includes(p.id) ? 'checked' : ''}
                        /><span>${esc(p.title)}<small>${esc(p.technologies)}</small></span></label
                      >`,
                  )
                  .join('')
              : '<p class="muted">Добавьте проекты в разделе «Мой профиль» или составьте письмо из резюме.</p>'}
          </fieldset>
          ${missingProjects.length
            ? '<p class="form-hint">Часть проектов из этой версии удалена. Выберите доступные проекты перед генерацией или сохранением.</p>'
            : ''}
          <div class="form-grid">
            <label
              >Стиль<select name="style">
                <option value="natural" ${o.style === 'natural' ? 'selected' : ''}>
                  Естественный
                </option>
                <option value="formal" ${o.style === 'formal' ? 'selected' : ''}>Формальный</option>
              </select></label
            ><label
              >Объём<select name="length">
                <option value="short" ${o.length === 'short' ? 'selected' : ''}>
                  Короткое · около 5–7 предложений
                </option>
                <option value="detailed" ${o.length === 'detailed' ? 'selected' : ''}>
                  Подробное
                </option>
              </select></label
            >
          </div>
          <label
            >Дополнительные пожелания<textarea
              name="wishes"
              rows="2"
              maxlength="2000"
              placeholder="Например: акцент на Node.js, SQLite и AI-инструментах"
            >
${esc(o.wishes)}</textarea
            >
          </label>
          <p class="form-hint">
            Без AI API: пожелания задают ключевые слова для выбора фактов. Шаблон не понимает
            произвольные инструкции и не переписывает опыт по смыслу.
          </p>
          <div class="form-error" role="alert"></div>
          <button class="button primary" type="submit">
            ${d.body ? 'Сгенерировать повторно' : 'Составить письмо'}
          </button>
        </form>
      </details>
      <div class="letter-editor">
        <label for="letter-body-${jobId}"
          >Текст письма
          <span class="letter-status"
            >${d.dirty
              ? '· не сохранён'
              : d.baseVersion
                ? '· версия ' + d.baseVersion
                : '· черновик'}</span
          ></label
        ><textarea
          id="letter-body-${jobId}"
          data-letter-body="${jobId}"
          rows="12"
          maxlength="20000"
          placeholder="Здесь появится письмо. Можно также написать его вручную."
        >
${esc(d.body)}</textarea
        >
        <p class="form-hint">
          Проверьте факты и формулировки перед отправкой. Каждое сохранение создаёт новую версию.
        </p>
        <div class="form-error letter-error" role="alert"></div>
        <div class="letter-actions">
          ${action(
            'save-letter',
            `${icon('check')} Сохранить версию`,
            jobId,
            'button primary',
          )}${action('copy-letter', 'Скопировать', jobId)}<span class="letter-character-count"
            >${d.body.length} знаков</span
          >
        </div>
      </div>
      ${d.evidence.length || d.warnings.length
        ? /* HTML */ `<details class="letter-evidence">
            <summary>Какие факты использованы</summary>
            ${d.evidence
              .map(
                (e) =>
                  /* HTML */ `<div>
                    <strong>${esc(e.label)}</strong>
                    <p>${esc(e.text)}</p>
                  </div>`,
              )
              .join('')}${d.warnings
              .map((w) => /* HTML */ `<p class="form-hint">${esc(w)}</p>`)
              .join('')}
            <p class="form-hint">
              Список относится к последней генерации; ручные правки не проверяются автоматически.
            </p>
          </details>`
        : ''}
      <div class="letter-history">
        <h3>Сохранённые версии <span class="count">${letters.length}</span></h3>
        ${letters.length
          ? letters
              .map(
                (l) =>
                  /* HTML */ `<article class="letter-version">
                    <div>
                      <strong>Версия ${l.version}</strong><time>${fullDate(l.created_at)}</time
                      ><small
                        >${l.source.resume ? esc(l.source.resume.name) : 'Общий профиль'} ·
                        ${l.options.style === 'formal' ? 'Формальный' : 'Естественный'}</small
                      >
                    </div>
                    ${action('load-letter', 'Открыть', l.id, 'text-button')}
                  </article>`,
              )
              .join('')
          : '<p class="muted">Версий пока нет. Сохраните готовый текст к этой вакансии.</p>'}
      </div>
    </section>`;
  }
  function replaceSection(jobId) {
    const section = document.querySelector('#letter-section');
    if (!section) return;
    section.outerHTML = letterSection(jobId);
  }
  function deletion(type, id) {
    const collection = type === 'resume' ? state.resumes : state.projects,
      item = collection.find((x) => x.id === id);
    openDialog(
      `${dialogTop('МОЙ ПРОФИЛЬ', type === 'resume' ? 'Удалить резюме?' : 'Удалить проект?')}<p>${esc(item.name || item.title)}</p><p class="muted">Сохранённые письма останутся вместе со снимками использованных данных.</p><div class="form-error" role="alert"></div><div class="dialog-footer"><button class="button secondary" data-action="close-dialog">Отмена</button>${action('confirm-delete-' + type, 'Удалить', id, 'button destructive')}</div>`,
    );
  }
  async function generate(jobId, options) {
    const result = await api(`/jobs/${jobId}/letters/generate`, { method: 'POST', body: options });
    drafts.set(jobId, { ...result, options: result.options, dirty: true, baseVersion: null });
    replaceSection(jobId);
    document.querySelector(`[data-letter-body="${jobId}"]`)?.focus({ preventScroll: true });
    toast('Черновик готов. Проверьте текст и сохраните версию.');
  }
  function confirmReplace(jobId, options) {
    openDialog(
      `${dialogTop('ЧЕРНОВИК', 'Заменить несохранённый текст?')}<p class="muted">Текущие правки ещё не сохранены. Новая генерация заменит их.</p><div class="form-error" role="alert"></div><div class="dialog-footer"><button class="button secondary" data-action="close-dialog">Отмена</button>${action('confirm-generate', 'Сгенерировать заново', jobId, 'button primary')}</div>`,
    );
    document.querySelector('[data-career="confirm-generate"]').generationOptions = options;
  }
  document.addEventListener('input', (event) => {
    if (event.target.matches('#profile-form [data-auto-grow]')) growSkillField(event.target);
    const id = event.target.dataset.letterBody;
    if (id) {
      const d = draftFor(id);
      d.body = event.target.value;
      d.dirty = true;
      document.querySelector('.letter-character-count').textContent = `${d.body.length} знаков`;
      document.querySelector('.letter-status').textContent = '· не сохранён';
    }
    const form = event.target.closest('[data-career-form="generate"]');
    if (form) draftFor(form.dataset.id).options = optionsFrom(form);
  });
  window.addEventListener('beforeunload', (event) => {
    if ([...drafts.values()].some((d) => d.dirty && d.body)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!form.dataset.careerForm) return;
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]'),
      error = form.querySelector('.form-error');
    submit.disabled = true;
    error.textContent = '';
    const body = Object.fromEntries(new FormData(form)),
      type = form.dataset.careerForm,
      id = form.dataset.id;
    try {
      if (type === 'generate') {
        const o = optionsFrom(form),
          d = draftFor(id);
        d.options = o;
        if (d.body && d.dirty) confirmReplace(id, o);
        else await generate(id, o);
      } else {
        const endpoint =
          type === 'profile'
            ? '/profile'
            : `/${type === 'resume' ? 'resumes' : 'projects'}${id ? '/' + id : ''}`;
        await api(endpoint, { method: type === 'profile' || id ? 'PUT' : 'POST', body });
        await refresh();
        if (type !== 'profile') closeDialog();
        render();
        toast('Сохранено');
      }
    } catch (e) {
      error.textContent = e.message;
    } finally {
      if (submit.isConnected) submit.disabled = false;
    }
  });
  document.addEventListener('click', async (event) => {
    const el = event.target.closest('[data-career]');
    if (!el || el.disabled) return;
    const command = el.dataset.career,
      id = el.dataset.id;
    try {
      if (command === 'add-resume' || command === 'edit-resume') resumeForm(id);
      if (command === 'add-project' || command === 'edit-project') projectForm(id);
      if (command === 'delete-resume' || command === 'delete-project')
        deletion(command.slice(7), id);
      if (command.startsWith('confirm-delete-')) {
        el.disabled = true;
        await api(`/${command.endsWith('resume') ? 'resumes' : 'projects'}/${id}`, {
          method: 'DELETE',
        });
        await refresh();
        closeDialog();
        render();
        toast('Запись удалена');
      }
      if (command === 'confirm-generate') {
        el.disabled = true;
        await generate(id, el.generationOptions);
        closeDialog();
      }
      if (command === 'save-letter') {
        const d = draftFor(id);
        if (!d.body.trim()) throw new Error('Сначала составьте или напишите письмо.');
        el.disabled = true;
        const form = document.querySelector('[data-career-form="generate"]');
        d.options = optionsFrom(form);
        const result = await api(`/jobs/${id}/letters`, {
          method: 'POST',
          body: { body: d.body, options: d.options },
        });
        d.dirty = false;
        d.baseVersion = result.version;
        await refresh();
        replaceSection(id);
        toast(`Сохранена версия ${result.version}`);
      }
      if (command === 'load-letter') {
        const letter = state.letters.find((l) => l.id === id),
          d = draftFor(letter.job_id);
        if (d.body && d.dirty) {
          openDialog(
            `${dialogTop('ИСТОРИЯ ПИСЕМ', 'Открыть сохранённую версию?')}<p class="muted">Несохранённый черновик будет заменён текстом версии ${letter.version}.</p><div class="form-error" role="alert"></div><div class="dialog-footer"><button class="button secondary" data-action="close-dialog">Отмена</button>${action('confirm-load', 'Открыть версию', id, 'button primary')}</div>`,
          );
        } else load(letter);
      }
      if (command === 'confirm-load') {
        load(state.letters.find((l) => l.id === id));
        closeDialog();
      }
      if (command === 'copy-letter') {
        const d = draftFor(id);
        if (!d.body.trim()) throw new Error('Сначала составьте или напишите письмо.');
        try {
          await navigator.clipboard.writeText(d.body);
          toast('Письмо скопировано');
        } catch {
          const textarea = document.querySelector(`[data-letter-body="${id}"]`);
          textarea.focus();
          textarea.select();
          toast('Текст выделен. Нажмите Ctrl+C или выберите «Копировать».');
        }
      }
    } catch (e) {
      const error =
        document.querySelector('dialog[open] .form-error') ||
        document.querySelector('.letter-error');
      if (error) error.textContent = e.message;
      else toast(e.message);
    } finally {
      if (el.isConnected) el.disabled = false;
    }
  });
  function load(letter) {
    drafts.set(letter.job_id, {
      body: letter.body,
      options: structuredClone(letter.options),
      evidence: [],
      warnings: [],
      dirty: false,
      baseVersion: letter.version,
    });
    replaceSection(letter.job_id);
    document.querySelector(`[data-letter-body="${letter.job_id}"]`)?.focus({ preventScroll: true });
  }
  function clear() {
    drafts.clear();
    state.profile = {};
    state.resumes = [];
    state.projects = [];
    state.letters = [];
  }
  return { profilePage, letterSection, clear };
}
