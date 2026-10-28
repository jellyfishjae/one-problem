import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import katex from 'katex'
import sharp from 'sharp'
import ts from 'typescript'

const [collectionPath, sourcePath = 'src/collection.ts'] = process.argv.slice(2)
if (!collectionPath) {
  console.error('Usage: node scripts/validate-extracted-collection.mjs COLLECTION.json')
  process.exit(2)
}

const source = await readFile(sourcePath, 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
const { validateCollection } = await import(moduleUrl)
const raw = JSON.parse(await readFile(collectionPath, 'utf8'))
const collection = validateCollection(raw)
const problems = collection.problems

const issues = []
const byChapter = new Map()
for (const problem of problems) {
  const chapter = problem.chapterNumber ?? problem.chapter
  if (!byChapter.has(chapter)) byChapter.set(chapter, [])
  byChapter.get(chapter).push(problem.number)

  if (problem.statement.trim().length < 12) issues.push(`${problem.id}: short statement`)
  const segments = problem.statement.split(/(\$[^$]+\$)/g)
  if (problem.statement.replace(/\$[^$]+\$/g, '').includes('$')) {
    issues.push(`${problem.id}: unbalanced LaTeX delimiters`)
  }
  for (const segment of segments) {
    if (!segment.startsWith('$') || !segment.endsWith('$')) continue
    try {
      katex.renderToString(segment.slice(1, -1), { throwOnError: true })
    } catch (error) {
      issues.push(`${problem.id}: invalid LaTeX: ${error.message}`)
    }
  }

  for (const [, number] of problem.statement.matchAll(/\bFigure\s+(\d+)\b/gi)) {
    if (!problem.figure || problem.figure.caption.toLowerCase() !== `figure ${number}`) {
      issues.push(`${problem.id}: missing Figure ${number}`)
    }
  }
  if (problem.figure) {
    const bytes = Buffer.from(problem.figure.src.split(',')[1], 'base64')
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      issues.push(`${problem.id}: figure is not a valid PNG`)
    } else {
      try {
        await sharp(bytes).raw().toBuffer()
      } catch (error) {
        issues.push(`${problem.id}: figure cannot be decoded: ${error.message}`)
      }
    }
  }
}
for (const [chapter, numbers] of byChapter) {
  if (numbers.some((number, index) => index && number !== numbers[index - 1] + 1)) {
    issues.push(`Chapter ${chapter}: problem numbering is not sequential`)
  }
}
if (issues.length) {
  for (const issue of issues) console.error(issue)
  process.exit(1)
}
console.log(`Validated ${problems.length} problems against the app importer, LaTeX renderer, and figures: ${pathToFileURL(collectionPath).href}`)
