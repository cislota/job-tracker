import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';

async function fixture(t, dbPath = ':memory:') {
  const { server, db } = createApp({ dbPath });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return async (path, method = 'GET', body) => {
      const res = await fetch(base + '/api' + path, {
        method,
        headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      return { status: res.status, data: await res.json() };
    };
  }
  const a = client(),
    b = client();
  await a('/auth/register', 'POST', {
    email: 'career-a@example.com',
    password: 'career-test-password',
  });
  await b('/auth/register', 'POST', {
    email: 'career-b@example.com',
    password: 'career-test-password',
  });
  return { a, b, db };
}
const project = {
  title: 'Тестовый трекер',
  technologies: 'JavaScript, Node.js, SQLite',
  description: 'Учебный проект',
  contribution: 'Проектирование и проверка кода с использованием Codex.',
  results: 'Работает локально',
  features: 'API, задачи, заметки',
  url: 'https://example.com',
};
async function seed(a) {
  assert.equal(
    (
      await a('/profile', 'PUT', {
        full_name: 'Тестовый Соискатель',
        summary: 'Разрабатываю учебные приложения.',
        languages: 'JavaScript',
        databases: 'SQLite',
      })
    ).status,
    200,
  );
  const resume = (
    await a('/resumes', 'POST', {
      name: 'Разработчик',
      summary: 'Создаю веб-приложения.',
      content: 'Работа с Node.js и SQLite.',
    })
  ).data;
  const p = (await a('/projects', 'POST', project)).data;
  const j = (
    await a('/jobs', 'POST', {
      company: 'ТГТ',
      title: 'AI-разработчик',
      description: 'Создание веб-приложений с AI. Интеграция API и баз данных.',
      requirements: 'JavaScript, Node.js, SQLite',
    })
  ).data;
  return {
    resume,
    p,
    j,
    options: {
      resume_id: resume.id,
      project_ids: [p.id],
      style: 'natural',
      length: 'short',
      wishes: '',
    },
  };
}
test('профиль, резюме, проекты, генерация и неизменяемые версии письма', async (t) => {
  const { a } = await fixture(t),
    { resume, p, j, options } = await seed(a);
  const generated = await a(`/jobs/${j.id}/letters/generate`, 'POST', options);
  assert.equal(generated.status, 200);
  assert.match(generated.data.body, /Codex/);
  assert.match(generated.data.body, /ТГТ/);
  assert.equal((await a('/state')).data.letters.length, 0);
  let saved = await a(`/jobs/${j.id}/letters`, 'POST', { body: generated.data.body, options });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.version, 1);
  assert.equal(
    (await a('/projects/' + p.id, 'PUT', { ...project, contribution: 'Изменённый вклад.' })).status,
    200,
  );
  saved = await a(`/jobs/${j.id}/letters`, 'POST', { body: 'Отредактированное письмо', options });
  assert.equal(saved.data.version, 2);
  await a('/resumes/' + resume.id, 'DELETE');
  await a('/projects/' + p.id, 'DELETE');
  const letters = (await a(`/jobs/${j.id}/letters`)).data.letters;
  assert.equal(letters.length, 2);
  assert.match(letters[1].source.projects[0].contribution, /Codex/);
  assert.equal(letters[1].source.resume.name, 'Разработчик');
  const exported = (await a('/export')).data;
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.letters.length, 2);
  assert.equal(exported.profile.full_name, 'Тестовый Соискатель');
  assert.equal(exported.profile.user_id, undefined);
  await a('/jobs/' + j.id, 'DELETE');
  assert.equal((await a('/state')).data.letters.length, 0);
});
test('профиль и материалы изолированы: нельзя подставить чужие id при генерации и сохранении', async (t) => {
  const { a, b } = await fixture(t),
    { resume, p, j, options } = await seed(a);
  const otherJob = (await b('/jobs', 'POST', { company: 'B', title: 'Private' })).data.id;
  assert.equal((await b('/profile')).data.profile.full_name, '');
  for (const [type, id] of [
    ['resumes', resume.id],
    ['projects', p.id],
  ]) {
    assert.equal((await b(`/${type}/${id}`, 'PUT', {})).status, 404);
    assert.equal((await b(`/${type}/${id}`, 'DELETE')).status, 404);
  }
  assert.equal((await b(`/jobs/${j.id}/letters`)).status, 404);
  assert.equal((await b(`/jobs/${j.id}/letters/generate`, 'POST', {})).status, 404);
  assert.equal((await b(`/jobs/${otherJob}/letters/generate`, 'POST', options)).status, 404);
  assert.equal(
    (await b(`/jobs/${otherJob}/letters`, 'POST', { body: 'Чужой текст', options })).status,
    404,
  );
  const state = (await b('/state')).data;
  assert.equal(state.projects.length, 0);
  assert.equal(state.resumes.length, 0);
  assert.equal(state.letters.length, 0);
});
test('валидация ссылок, пустого опыта, параметров и писем', async (t) => {
  const { a } = await fixture(t);
  assert.equal((await a('/profile', 'PUT', { github_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await a('/resumes', 'POST', { name: 'Пустое' })).status, 400);
  assert.equal((await a('/projects', 'POST', { title: 'Нет вклада' })).status, 400);
  const j = (await a('/jobs', 'POST', { company: 'Test', title: 'Developer' })).data;
  assert.equal((await a(`/jobs/${j.id}/letters/generate`, 'POST', {})).status, 400);
  for (const options of [
    { project_ids: 'bad' },
    { style: 'bad' },
    { length: 'bad' },
    { project_ids: Array(21).fill('x') },
  ])
    assert.equal((await a(`/jobs/${j.id}/letters/generate`, 'POST', options)).status, 400);
  assert.equal(
    (await a(`/jobs/${j.id}/letters`, 'POST', { body: '   ', options: {} })).status,
    400,
  );
  assert.equal(
    (await a(`/jobs/${j.id}/letters`, 'POST', { body: 'Ручной текст', options: {} })).status,
    201,
  );
});
test('добавление новых таблиц сохраняет существующую базу и повторно открывается', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'career-migration-')),
    path = join(dir, 'old.sqlite');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const old = new DatabaseSync(path);
  old.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,is_demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL); INSERT INTO users VALUES('existing','existing@example.com','hash','salt',0,'2026-09-01')",
  );
  old.close();
  const first = createApp({ dbPath: path });
  assert.equal(
    first.db.prepare('SELECT email FROM users WHERE id=?').get('existing').email,
    'existing@example.com',
  );
  first.db
    .prepare('INSERT INTO profiles(user_id,full_name,updated_at) VALUES(?,?,?)')
    .run('existing', 'Сохранённое имя', '2026-09-24');
  // Start and close to execute the application's normal DB cleanup lifecycle.
  await new Promise((r) => first.server.listen(0, '127.0.0.1', r));
  await new Promise((r) => first.server.close(r));
  const second = createApp({ dbPath: path });
  assert.equal(
    second.db.prepare('SELECT full_name FROM profiles').get().full_name,
    'Сохранённое имя',
  );
  await new Promise((r) => second.server.listen(0, '127.0.0.1', r));
  await new Promise((r) => second.server.close(r));
});
