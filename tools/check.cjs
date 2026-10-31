// 記事を確かめる。教訓（LESSONS.md）のうち機械で確かめられるものを rules/check-rules.json に足していく
// 使い方: node tools/check.cjs 記事.md
// 確かめること
//   - 言い回し: rules/check-rules.json の patterns（正規表現）
//   - 装飾の量: 枠（:::note）と太字の数（L018）
//   - 主語の連続: 「私は」で始まる文が 3 文以上続く箇所（L023）
// 付録（<details> の中）、front matter、コードブロックは言い回しの検査から除く
// error が 1 件でもあれば終了コード 1 で終わる。warn は表示だけ
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('使い方: node tools/check.cjs 記事.md');
  process.exit(2);
}
const rules = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'rules', 'check-rules.json'), 'utf8'));
const lines = fs.readFileSync(path.resolve(file), 'utf8').replace(/\r\n/g, '\n').split('\n');
const out = [];
const add = (level, no, id, msg) => out.push({ level, no, id, msg });

// 検査する行に印を付ける。行番号を保つため、除く行は空にする
const body = [];
let inFront = lines[0] === '---';
let inCode = false;
let inDetails = false;
lines.forEach((line, i) => {
  if (inFront) {
    if (i > 0 && line === '---') inFront = false;
    body.push('');
    return;
  }
  if (/^```/.test(line)) inCode = !inCode;
  if (/<details>/.test(line)) inDetails = true;
  const skip = inCode || inDetails || /^```/.test(line);
  if (/<\/details>/.test(line)) inDetails = false;
  body.push(skip ? '' : line);
});

// 言い回し。投稿用メモは front matter の外にあれば必ず見つける
for (const p of rules.patterns) {
  const re = new RegExp(p.regex, 'u');
  body.forEach((line, i) => {
    const m = line.replace(/`[^`]*`/g, '').replace(/https?:\/\/\S+/g, '').match(re);
    if (m) add(p.level || 'warn', i + 1, p.id, `${p.message}（「${m[0]}」）`);
  });
}

// 装飾の量
const notes = body.filter((l) => /^:::note/.test(l)).length;
if (notes > rules.maxNotes) add('warn', '-', 'B005', `枠が ${notes} 個ある。記事全体で ${rules.maxNotes} 個までを目安にする（L018）`);
const bold = body.filter((l) => !l.startsWith('|')).join('\n').match(/\*\*[^*\n]+\*\*/g) || [];
if (bold.length > rules.maxBold) add('warn', '-', 'B006', `太字が ${bold.length} か所ある。${rules.maxBold} か所までを目安にする（L018）`);

// 同じ主語の連続
let run = 0;
let start = 0;
body.forEach((line, i) => {
  const sentences = line.replace(/^[-*\d.\s]+/, '').split('。').map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    if (s.startsWith('私は')) {
      if (run === 0) start = i + 1;
      run += 1;
      if (run === 3) add('warn', start, 'B007', '「私は」で始まる文が 3 文以上続いている。文のつながりを読み直す（L023）');
    } else {
      run = 0;
    }
  }
});

out.sort((a, b) => (a.no === '-' ? 1e9 : a.no) - (b.no === '-' ? 1e9 : b.no));
for (const o of out) console.log(`${o.level === 'error' ? 'ERROR' : 'warn '} line ${o.no} [${o.id}] ${o.msg}`);
const errors = out.filter((o) => o.level === 'error').length;
console.log(`${errors} error, ${out.length - errors} warn`);
process.exitCode = errors ? 1 : 0;
