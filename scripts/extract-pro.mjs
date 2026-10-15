import ts from 'typescript';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Data literals only: never eval, import, or run the supplied user script. */
export function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || property.name.kind === ts.SyntaxKind.ComputedPropertyName) throw new Error('Unsupported dynamic data');
      const key = property.name.text;
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe data key');
      value[key] = literal(property.initializer);
    }
    return value;
  }
  throw new Error('Only literal data can be extracted');
}

export function extractPro(source, sourceName) {
  const wanted = new Set(['SPLASH_CHARACTERS', 'STU_HEAD', 'STU_FIELDS', 'MAP_COORD', 'MAP_PLACES', 'MAP_INTROS', 'MAP_BODY_HTML', 'REV_DEFAULT_LIST']);
  const ast = ts.createSourceFile(sourceName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const data = {}, positions = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && wanted.has(node.name.text)) {
      if (!node.initializer) throw new Error('Missing data initializer');
      data[node.name.text] = literal(node.initializer);
      positions[node.name.text] = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!Array.isArray(data.SPLASH_CHARACTERS) || !data.MAP_COORD || !Array.isArray(data.MAP_PLACES)) throw new Error('Expected source data not found');
  const characters = data.SPLASH_CHARACTERS.map(c => ({ id: `pro-${c.no}`, ...c }));
  const places = data.MAP_PLACES.map((p, i) => ({ id: `place-${i+1}`, ...p, intro: data.MAP_INTROS?.[p.name] || '' }));
  const worldText = String(data.MAP_BODY_HTML || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    version: 1, source: { fileName: sourceName, sha256: createHash('sha256').update(source).digest('hex'), declarations: positions },
    characters, world: { coordinate: data.MAP_COORD, greeting: data.STU_HEAD || [], departments: data.STU_FIELDS?.find(f => f.k==='faction')?.opts || [], sourceText: worldText },
    studentFields: data.STU_FIELDS || [], places, eventPool: data.REV_DEFAULT_LIST || [],
    missing: ['完整世界书与触发规则', '角色第一性别的明确字段', '初始好感度及增减规则', '实时内心想法', '正式 MVU 变量定义与更新协议', '初始在场角色名单'],
    mappingNotes: ['角色 sex 值为 Alpha/Beta/Omega，按同文件 STU_FIELDS 的 sex2 定义映射为第二性别；不将其作为第一性别。', '事件池是可选剧情素材，未作为已经发生的事实或世界规则启用。']
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const input = process.argv[2]; if (!input) throw new Error('Provide the source JS path');
  const source = await readFile(input, 'utf8');
  const data = extractPro(source, input.split(/[\\/]/).at(-1));
  const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  await mkdir(resolve(project, 'server/private'), { recursive: true });
  await writeFile(resolve(project, 'server/private/extracted-pro.json'), JSON.stringify(data, null, 2));
  const report = `# pro 插件资料提取记录\n\n来源：${data.source.fileName}\nSHA-256：${data.source.sha256}\n\n- ${data.characters.length} 名角色，保留原文姓名、sex、头衔、精神力／精神体、标签、简介、语录。\n- ${data.world.departments.length} 个院系，${data.places.length} 条地点／活动资料。\n- ${data.eventPool.length} 条事件素材：仅归档，不自动触发，不认定为已发生事实。\n- 迎新文案、学生表单定义、地图坐标与页面原有世界观文字。\n\n## 原文件位置\n${Object.entries(data.source.declarations).map(([name,line])=>`- ${name}：第 ${line} 行`).join('\n')}\n\n## 映射与缺失\n${[...data.mappingNotes,...data.missing.map(s=>`未提供：${s}`)].map(s=>`- ${s}`).join('\n')}\n\n原脚本未执行；资料通过 TypeScript AST 的纯数据字面量解析获得。私有资料存放在 server/private，不进入 dist 或网页静态目录。\n`;
  await writeFile(resolve(project, 'docs/EXTRACTION.md'), report);
  process.stdout.write(JSON.stringify({ characters: charactersCount(data), departments: data.world.departments.length, places: data.places.length, events: data.eventPool.length, worldTextCharacters: data.world.sourceText.length, declarations: data.source.declarations })+'\n');
}
function charactersCount(data) { return data.characters.length; }
