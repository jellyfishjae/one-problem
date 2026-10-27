import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bookDirectory = path.join(projectRoot, 'books')
const sourcePath = path.join(bookDirectory, 'chapter-zero-problems.json')
const outputPath = path.join(bookDirectory, 'exports', 'chapter-zero-import.json')
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

const source = JSON.parse(await readFile(sourcePath, 'utf8'))
if (
  !Array.isArray(source) ||
  source.length !== 25 ||
  !source.every((problem, index) =>
    problem.id === `chapter-zero-${index + 1}` &&
    problem.number === index + 1 &&
    problem.chapter === 'Chapter Zero')
) {
  throw new Error('The private Chapter Zero source must contain Problems 1–25 in order.')
}

const problems = await Promise.all(source.map(async (problem) => {
  if (!problem.figure) return problem

  const imagePath = path.resolve(bookDirectory, problem.figure.src)
  if (!imagePath.startsWith(`${bookDirectory}${path.sep}`)) {
    throw new Error('Diagram paths must stay inside books/.')
  }
  const extension = path.extname(imagePath).toLowerCase()
  const imageType = extension === '.svg' ? 'image/png' : imageTypes[extension]
  if (!imageType) throw new Error('Diagrams must be SVG, PNG, JPEG, or WebP images.')

  const sourceImage = await readFile(imagePath)
  const image = extension === '.svg'
    ? await sharp(sourceImage).flatten({ background: '#ffffff' }).png().toBuffer()
    : sourceImage
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
