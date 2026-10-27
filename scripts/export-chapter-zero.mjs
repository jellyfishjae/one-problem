import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bookDirectory = path.join(projectRoot, 'books')
const sourcePath = path.join(bookDirectory, 'chapter-zero-problems.json')
const outputPath = path.join(bookDirectory, 'exports', 'chapter-zero-import.json')
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

const source = JSON.parse(await readFile(sourcePath, 'utf8'))
if (!Array.isArray(source) || source.length === 0) {
  throw new Error('The private Chapter Zero source must contain an ordered problem array.')
}

const problems = await Promise.all(source.map(async (problem) => {
  if (!problem.figure) return problem

  const imagePath = path.resolve(bookDirectory, problem.figure.src)
  if (!imagePath.startsWith(`${bookDirectory}${path.sep}`)) {
    throw new Error('Diagram paths must stay inside books/.')
  }
  const imageType = imageTypes[path.extname(imagePath).toLowerCase()]
  if (!imageType) throw new Error('Diagrams must be PNG, JPEG, or WebP images.')

  const image = await readFile(imagePath)
  return {
    ...problem,
    figure: {
      ...problem.figure,
      src: `data:${imageType};base64,${image.toString('base64')}`,
    },
  }
}))

const collection = { format: 'one-problem-collection', version: 1, problems }
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(collection, null, 2)}\n`)
console.log(`Exported ${problems.length} problems to ${outputPath}`)
