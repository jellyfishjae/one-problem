# Private PDF extraction

The extractor reads a PDF with PyMuPDF and writes a self-contained version 1 collection compatible with the app's existing importer. It does not modify the app or public build. It finds `Problem N.` markers anywhere in a line, joins wrapped lines, and stops at solution/comment headings or a new indented paragraph. Its review report keeps the draft statements and the first lines of excluded paragraphs, because textbook layout can make a shared setup or definition look like commentary. Run `npm install` in the project first if its Node dependencies are not installed; the final validator uses the app's TypeScript importer and KaTeX.

Install Python dependencies in a virtual environment outside the repository:

```sh
python3 -m venv /tmp/one-problem-extraction-venv
/tmp/one-problem-extraction-venv/bin/pip install -r scripts/requirements-extraction.txt
```

For the locally reviewed Chapter 1 source:

```sh
/tmp/one-problem-extraction-venv/bin/python scripts/extract_problems.py \
  --pdf 'books/russian math circles.pdf' \
  --chapter-number 1 --chapter-name 'Chapter 1: Parity' \
  --id-prefix chapter-one --pages 19-23 \
  --first-problem 1 --last-problem 32 \
  --overrides books/chapter-one/review-overrides.json \
  --output books/exports/chapter-one-import.json \
  --report books/chapter-one/review-report.json \
  --figures-dir books/chapter-one/figures
```

The `books/chapter-one/review-overrides.json` file is private and ignored by Git. The export has 32 problems in book order. Each problem uses `chapter-one-N` as its stable ID and stores its **PDF page** in `sourcePage`. Hints are empty and solutions are null. Figures 6 and 7 are exact PNG crops embedded as data URLs. The extractor then invokes `scripts/validate-extracted-collection.mjs`, which calls the same TypeScript importer validation as the app and checks numbering, diagrams, and inline math with KaTeX. The separate Chapter Zero export remains intact.

## Another chapter

Use the same command with a new inclusive PDF page range, chapter name and number, ID prefix, expected first and last problem numbers, and private output/report/figure paths under `books/`. Start without `--overrides`. The command writes a private review report and stops because every statement requires visual verification. Compare `draftProblems` with the rendered PDF. Review `excludedParagraphStarts` for definitions or shared setup that should be included. Review all mathematical symbols, numbering, page breaks, and every figure reference.

Create an ignored overrides JSON with `verified` (the problem numbers checked visually) and optional `problems` entries. Each entry may contain exact `replace` pairs for extraction corrections, `prepend`/`append` text for a verified shared setup or definition, and a `figure` crop. Crop coordinates are PDF points `[left, top, right, bottom]`; `page` is the 1-based PDF page, even if the figure is on a later page than its problem. Example with original placeholder content:

```json
{
  "verified": [1],
  "problems": {
    "1": {
      "replace": [["triangel", "triangle"]],
      "figure": {
        "number": 1,
        "page": 4,
        "rect": [80, 120, 260, 230],
        "alt": "Two labeled triangles",
        "caption": "Figure 1"
      }
    }
  }
}
```

The extractor converts dimensions such as `2 x 3` to `$2 \\times 3$`. Use `$...$` in overrides for other needed notation. The validation command can also be run separately:

```sh
node scripts/validate-extracted-collection.mjs books/exports/chapter-one-import.json
```

Keep the PDF, override files, cropped figures, report, and collection in ignored `books/`. The extractor rejects private paths outside `books/` or paths that are not ignored. Inspect the report's `issues` list before importing. An unresolved issue prevents creation of the import file. The multi-chapter importer merges this Chapter 1 file into the local library and preserves existing notes by stable problem ID. After updating the public app, the iPhone can import the private file without bundling it into the deployment.
