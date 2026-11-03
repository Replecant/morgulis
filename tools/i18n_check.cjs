// Проверка перевода: находит все строки с кириллицей в src/*.ts и index.html и сверяет со словарём
// src/lang/en.json. Запуск: node tools/i18n_check.cjs [missing.json] — список строк без перевода.
// Строки — как есть,
// шаблоны `…${x}…` — как ключи с {0}, {1}… К репликам диалогов прикладывает говорящего (s: '…').
const ts = require('typescript');
const fs = require('fs'), path = require('path');
const path0 = require('path'), root = path0.join(__dirname, '..', 'src');
const CYR = /[А-Яа-яЁё]/;
const out = new Map(); // key -> {key, files:Set, ctx:Set, pattern}
const add = (key, file, ctx, pattern) => {
  if (!CYR.test(key)) return;
  let e = out.get(key); if (!e) out.set(key, e = { key, files: new Set(), ctx: new Set(), pattern });
  e.files.add(file); if (ctx) e.ctx.add(ctx);
};
for (const f of fs.readdirSync(root).filter((f) => f.endsWith('.ts'))) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const speakerOf = (node) => { // ближайший объект с полем s: '…'
    for (let p = node.parent; p; p = p.parent) if (ts.isObjectLiteralExpression(p)) {
      const s = p.properties.find((q) => q.name && q.name.getText() === 's' && q.initializer && ts.isStringLiteral(q.initializer));
      if (s) return 'говорит: ' + s.initializer.text;
    }
    return '';
  };
  const visit = (n) => {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) add(n.text, f, speakerOf(n), false);
    else if (ts.isTemplateExpression(n)) {
      let k = n.head.text; n.templateSpans.forEach((sp, i) => { k += `{${i}}` + sp.literal.text; });
      add(k, f, speakerOf(n), true);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const html = fs.readFileSync(path0.join(__dirname, '..', 'index.html'), 'utf8');
for (const m of html.matchAll(/>([^<>]*[А-Яа-яЁё][^<>]*)</g)) add(m[1].trim(), 'index.html', '', false);
for (const m of html.matchAll(/(?:title|placeholder|content)="([^"]*[А-Яа-яЁё][^"]*)"/g)) add(m[1], 'index.html', '', false);
const list = [...out.values()].map((e) => ({ key: e.key, files: [...e.files].join(','), ctx: [...e.ctx].slice(0, 2).join('; ') }));
// сверка со словарём: какие русские строки ещё без английского перевода
const en = JSON.parse(fs.readFileSync(path0.join(__dirname, '..', 'src', 'lang', 'en.json'), 'utf8'));
const miss = list.filter((x) => !(x.key in en));
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(miss, null, 1));
console.log(`строк с кириллицей: ${list.length}, без перевода: ${miss.length}`);
for (const x of miss.slice(0, 50)) console.log('  ' + JSON.stringify(x.key) + '  (' + x.files + ')');
