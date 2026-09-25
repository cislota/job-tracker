import { randomUUID } from 'node:crypto';
import { generateLetter } from './letter-generator.mjs';

const PROFILE = {
  full_name: 150,
  target_role: 150,
  summary: 5000,
  contacts: 1000,
  github_url: 2000,
  portfolio_url: 2000,
  languages: 2000,
  frameworks: 2000,
  databases: 2000,
  tools: 2000,
  analysis: 2000,
  ai_tools: 2000,
};
const RESUME = { name: 150, target_role: 150, summary: 5000, content: 20000 };
const PROJECT = {
  title: 150,
  description: 3000,
  technologies: 2000,
  features: 5000,
  contribution: 5000,
  results: 3000,
  url: 2000,
};
const now = () => new Date().toISOString();

export function createCareer(db, { text, fail, choice, bodyOf, send, ownJob }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,${Object.keys(
      PROFILE,
    )
      .map((k) => `${k} TEXT NOT NULL DEFAULT ''`)
      .join(',')},updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS resumes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,${Object.keys(
      RESUME,
    )
      .map((k) => `${k} TEXT NOT NULL`)
      .join(',')},created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portfolio_projects(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,${Object.keys(
      PROJECT,
    )
      .map((k) => `${k} TEXT NOT NULL`)
      .join(',')},created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cover_letters(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,version INTEGER NOT NULL,body TEXT NOT NULL,options_json TEXT NOT NULL,source_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(job_id,version));
    CREATE INDEX IF NOT EXISTS resumes_owner ON resumes(user_id);
    CREATE INDEX IF NOT EXISTS portfolio_projects_owner ON portfolio_projects(user_id);
    CREATE INDEX IF NOT EXISTS letters_owner_job ON cover_letters(user_id,job_id);
  `);
  const stmt = (sql) => db.prepare(sql);
  function fields(body, schema, required = []) {
    const result = {};
    for (const [key, limit] of Object.entries(schema))
      result[key] = text(body[key], limit, required.includes(key));
    for (const key of ['url', 'github_url', 'portfolio_url'])
      if (result[key]) {
        let url;
        try {
          url = new URL(result[key]);
        } catch {
          fail(400, 'Укажите полную HTTP(S)-ссылку.');
        }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
          fail(400, 'Допустима только HTTP(S)-ссылка без логина и пароля.');
      }
    return result;
  }
  const profile = (userId) =>
    stmt('SELECT * FROM profiles WHERE user_id=?').get(userId) ||
    Object.fromEntries(Object.keys(PROFILE).map((k) => [k, '']));
  const own = (table, id, userId) => {
    const row = stmt(`SELECT * FROM ${table} WHERE id=? AND user_id=?`).get(id, userId);
    if (!row) fail(404, 'Запись не найдена.');
    return row;
  };
  const decode = (row) => {
    const { options_json, source_json, ...rest } = row;
    return { ...rest, options: JSON.parse(options_json), source: JSON.parse(source_json) };
  };
  function snapshot(userId) {
    return {
      profile: profile(userId),
      resumes: stmt(
        'SELECT * FROM resumes WHERE user_id=? ORDER BY updated_at DESC,rowid DESC',
      ).all(userId),
      projects: stmt(
        'SELECT * FROM portfolio_projects WHERE user_id=? ORDER BY updated_at DESC,rowid DESC',
      ).all(userId),
      letters: stmt('SELECT * FROM cover_letters WHERE user_id=? ORDER BY version DESC')
        .all(userId)
        .map(decode),
    };
  }
  function input(userId, jobId, body) {
    const job = ownJob(jobId, userId);
    const options = {
      resume_id: text(body.resume_id, 100),
      project_ids: body.project_ids ?? [],
      style: choice(body.style, ['natural', 'formal'], 'natural'),
      length: choice(body.length, ['short', 'detailed'], 'short'),
      wishes: text(body.wishes, 2000),
    };
    if (
      !Array.isArray(options.project_ids) ||
      options.project_ids.length > 20 ||
      options.project_ids.some((id) => typeof id !== 'string' || id.length > 100)
    )
      fail(400, 'Выберите до 20 проектов.');
    options.project_ids = [...new Set(options.project_ids)];
    const resume = options.resume_id ? own('resumes', options.resume_id, userId) : null;
    const projects = options.project_ids.map((id) => own('portfolio_projects', id, userId));
    if (projects.some((p) => !p.contribution.trim()))
      fail(400, 'У выбранного проекта не заполнен личный вклад.');
    return { job, profile: profile(userId), resume, projects, options };
  }
  async function handle(req, res, url, userId) {
    const path = url.pathname,
      method = req.method;
    if (path === '/api/profile') {
      if (method === 'GET') {
        send(res, { profile: profile(userId) });
        return true;
      }
      if (method === 'PUT') {
        const values = fields(await bodyOf(req), PROFILE),
          keys = Object.keys(values);
        stmt(
          `INSERT INTO profiles(user_id,${keys.join(',')},updated_at) VALUES(${Array(keys.length + 2).fill('?')}) ON CONFLICT(user_id) DO UPDATE SET ${keys.map((k) => `${k}=excluded.${k}`).join(',')},updated_at=excluded.updated_at`,
        ).run(userId, ...Object.values(values), now());
        send(res, { ok: true });
        return true;
      }
    }
    const collection = /^\/api\/(resumes|projects)(?:\/([^/]+))?$/.exec(path);
    if (collection) {
      const type = collection[1],
        table = type === 'resumes' ? 'resumes' : 'portfolio_projects',
        schema = type === 'resumes' ? RESUME : PROJECT,
        id = collection[2];
      if (method === 'GET' && !id) {
        send(res, {
          items: stmt(`SELECT * FROM ${table} WHERE user_id=? ORDER BY updated_at DESC`).all(
            userId,
          ),
        });
        return true;
      }
      const previous = id ? own(table, id, userId) : null;
      if (method === 'DELETE' && id) {
        stmt(`DELETE FROM ${table} WHERE id=? AND user_id=?`).run(id, userId);
        send(res, { ok: true });
        return true;
      }
      if ((method === 'POST' && !id) || (method === 'PUT' && id)) {
        const values = fields(
          await bodyOf(req),
          schema,
          type === 'resumes' ? ['name'] : ['title', 'contribution'],
        );
        if (type === 'resumes' && !values.summary && !values.content)
          fail(400, 'Добавьте краткое описание или текст резюме.');
        const keys = Object.keys(values),
          timestamp = now();
        if (previous)
          stmt(
            `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')},updated_at=? WHERE id=? AND user_id=?`,
          ).run(...Object.values(values), timestamp, id, userId);
        else {
          const count = stmt(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id=?`).get(
            userId,
          ).count;
          if (count >= 100) fail(400, 'Достигнут лимит: 100 записей в разделе.');
          const createdId = randomUUID();
          stmt(
            `INSERT INTO ${table}(id,user_id,${keys.join(',')},created_at,updated_at) VALUES(${Array(keys.length + 4).fill('?')})`,
          ).run(createdId, userId, ...Object.values(values), timestamp, timestamp);
          send(res, { id: createdId }, 201);
          return true;
        }
        send(res, { id }, 200);
        return true;
      }
    }
    const letterRoute = /^\/api\/jobs\/([^/]+)\/letters(?:\/(generate))?$/.exec(path);
    if (letterRoute) {
      const jobId = letterRoute[1];
      ownJob(jobId, userId);
      if (method === 'GET' && !letterRoute[2]) {
        send(res, {
          letters: stmt(
            'SELECT * FROM cover_letters WHERE job_id=? AND user_id=? ORDER BY version DESC',
          )
            .all(jobId, userId)
            .map(decode),
        });
        return true;
      }
      if (method === 'POST') {
        const body = await bodyOf(req);
        if (letterRoute[2] === 'generate') {
          const context = input(userId, jobId, body);
          send(res, { ...generateLetter(context), options: context.options });
          return true;
        }
        // Saved versions are immutable: editing always creates a new version.
        // Snapshot documents inputs at save time, not a claim that every
        // sentence in a manually edited letter is supported by these inputs.
        const context = input(userId, jobId, body.options || {}),
          content = text(body.body, 20000, true);
        const id = randomUUID(),
          version = stmt(
            'SELECT COALESCE(MAX(version),0)+1 AS next FROM cover_letters WHERE job_id=?',
          ).get(jobId).next;
        if (version > 200) fail(400, 'Достигнут лимит: 200 версий письма для вакансии.');
        const clean = (row) =>
          row
            ? Object.fromEntries(
                Object.entries(row).filter(
                  ([key]) => !['user_id', 'salt', 'password_hash'].includes(key),
                ),
              )
            : null;
        const source = {
          profile: clean(context.profile),
          resume: clean(context.resume),
          projects: context.projects.map(clean),
          job: {
            title: context.job.title,
            company: context.job.company,
            description: context.job.description,
            requirements: context.job.requirements,
          },
          capturedAt: now(),
        };
        stmt('INSERT INTO cover_letters VALUES(?,?,?,?,?,?,?,?)').run(
          id,
          userId,
          jobId,
          version,
          content,
          JSON.stringify(context.options),
          JSON.stringify(source),
          now(),
        );
        send(res, { id, version }, 201);
        return true;
      }
    }
    return false;
  }
  return { handle, snapshot };
}
