import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import 'fake-indexeddb/auto'
import ts from 'typescript'

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
}

function transpile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

const collectionUrl = moduleUrl(transpile('../src/collection.ts'))
const progressUrl = moduleUrl(transpile('../src/progress.ts').replace("from './collection.ts'", `from '${collectionUrl}'`))
const { importCollection, loadLibrary } = await import(collectionUrl)
const {
  groupChapters, navigateSelection, NOTES_KEY_PREFIX, restoreSelection, saveSelection, selectProgressChapter,
} = await import(progressUrl)

const problem = (id, chapter, chapterNumber, number, statement = `Original problem ${number}.`) => ({
  id, chapter, chapterNumber, number, statement, hints: [], solution: null,
})
const collection = (problems) => ({ format: 'one-problem-collection', version: 1, problems })
const zero = collection([
  problem('chapter-zero-1', 'Chapter Zero', 0, 1),
  problem('chapter-zero-2', 'Chapter Zero', 0, 2),
  problem('chapter-zero-3', 'Chapter Zero', 0, 3),
])
const one = collection([
  problem('chapter-one-1', 'Chapter 1: Parity', 1, 1),
  problem('chapter-one-2', 'Chapter 1: Parity', 1, 2),
])

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('one-problem')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function createLegacyDatabase(value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('one-problem', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('collections')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('collections', 'readwrite')
      transaction.objectStore('collections').put(value, 'active')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onabort = () => reject(transaction.error)
    }
  })
}

function inspectDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('one-problem', 2)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(['collections', 'library'], 'readonly')
      const legacy = transaction.objectStore('collections').get('active')
      const library = transaction.objectStore('library').get('problems')
      transaction.oncomplete = () => {
        database.close()
        resolve({ legacy: legacy.result, library: library.result })
      }
      transaction.onabort = () => reject(transaction.error)
    }
  })
}

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('v1 active collection migrates without deleting its original record or position', async () => {
  await deleteDatabase()
  await createLegacyDatabase(zero)
  const library = await loadLibrary()
  assert.deepEqual(library?.problems.map((item) => item.id), zero.problems.map((item) => item.id))
  const stored = await inspectDatabase()
  assert.deepEqual(stored.legacy, zero)
  assert.deepEqual(stored.library, zero)

  const storage = memoryStorage()
  storage.setItem('one-problem:current-problem', 'chapter-zero-2')
  const selection = restoreSelection(groupChapters(library.problems), 'imported', storage)
  assert.equal(selection.currentIndex, 1)
})

test('imports merge chapters by ID, reimports update, and failures are atomic', async () => {
  await deleteDatabase()
  await importCollection(zero)
  await importCollection(one)
  let library = await loadLibrary()
  assert.equal(library.problems.length, 5)
  assert.deepEqual(groupChapters(library.problems).map((chapter) => chapter.problems.length), [3, 2])

  const updated = collection(zero.problems.map((item) => item.number === 2
    ? { ...item, statement: 'A revised original problem.' }
    : item))
  await importCollection(updated)
  library = await loadLibrary()
  assert.equal(library.problems.length, 5)
  assert.equal(library.problems.find((item) => item.id === 'chapter-zero-2').statement, 'A revised original problem.')

  await assert.rejects(importCollection(collection([{ ...zero.problems[0], statement: '' }])))
  await assert.rejects(importCollection(collection([{ ...zero.problems[0], chapter: 'Different chapter' }])))
  assert.deepEqual(await loadLibrary(), library)
})

test('chapter positions and notes survive switches, refresh, and database reopening', async () => {
  await deleteDatabase()
  await importCollection(zero)
  const library = await importCollection(one)
  const chapters = groupChapters(library.problems)
  const storage = memoryStorage()
  let selection = restoreSelection(chapters, 'imported', storage)
  selection = navigateSelection(selection, chapters, 2)
  storage.setItem(`${NOTES_KEY_PREFIX}chapter-zero-3`, 'Zero note')

  selection = selectProgressChapter(selection, chapters, chapters[1].key)
  selection = navigateSelection(selection, chapters, 1)
  saveSelection(selection, chapters, 'imported', storage)
  storage.setItem(`${NOTES_KEY_PREFIX}chapter-one-2`, 'One note')
  selection = selectProgressChapter(selection, chapters, chapters[0].key)
  assert.equal(selection.currentIndex, 2)
  selection = selectProgressChapter(selection, chapters, chapters[1].key)
  assert.equal(selection.currentIndex, 1)

  const reopened = await loadLibrary()
  const restored = restoreSelection(groupChapters(reopened.problems), 'imported', storage)
  assert.equal(restored.chapterKey, chapters[1].key)
  assert.equal(restored.currentIndex, 1)
  assert.equal(selectProgressChapter(restored, chapters, chapters[0].key).currentIndex, 2)
  assert.equal(storage.getItem(`${NOTES_KEY_PREFIX}chapter-zero-3`), 'Zero note')
  assert.equal(storage.getItem(`${NOTES_KEY_PREFIX}chapter-one-2`), 'One note')
  assert.equal(navigateSelection(restored, chapters, 1).currentIndex, 1)
})

const privateFiles = ['books/exports/chapter-zero-import.json', 'books/exports/chapter-one-import.json']
test('private Chapter Zero and Chapter 1 exports merge to 57 problems', {
  skip: privateFiles.some((path) => !existsSync(path)),
}, async () => {
  await deleteDatabase()
  const [chapterZero, chapterOne] = privateFiles.map((path) => JSON.parse(readFileSync(path, 'utf8')))
  await createLegacyDatabase(chapterZero)
  await importCollection(chapterOne)
  await importCollection(chapterZero)
  const library = await loadLibrary()
  assert.deepEqual(groupChapters(library.problems).map((chapter) => chapter.problems.length), [25, 32])
  assert.equal(new Set(library.problems.map((item) => item.id)).size, 57)
  assert.equal((await inspectDatabase()).legacy.problems.length, 25)
})
