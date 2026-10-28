#!/usr/bin/env python3
"""Extract numbered textbook problems into a private One Problem import file.

Text extraction is deliberately conservative. Editorial material is not appended to
statements; chapter-specific corrections and figure crops live in an ignored JSON
review file supplied with --overrides.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import fitz


PROBLEM = re.compile(r"\bProblem\s+(\d+)\.\s*")
FIGURE = re.compile(r"\bFigure\s+(\d+)\b", re.IGNORECASE)
STOP = re.compile(r"^(?:Solution|Comment)\.\s|^§\s*\d+\.")
INLINE_STOP = re.compile(r"\b(?:Solution|Comment)\.\s")


@dataclass
class Line:
    text: str
    page: int
    x: float
    y: float


def require_ignored(path: Path) -> None:
    """Keep private inputs and outputs outside Vite's public build inputs."""
    book_directory = Path(__file__).resolve().parent.parent / "books"
    try:
        path.resolve().relative_to(book_directory)
    except ValueError as error:
        raise ValueError(f"Private files inside this project must stay under books/: {path}") from error
    result = subprocess.run(
        ["git", "check-ignore", "-q", str(path.resolve())],
        cwd=Path(__file__).resolve().parent.parent,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"Private file must be covered by .gitignore: {path}")


def read_lines(pdf: fitz.Document, first_page: int, last_page: int) -> list[Line]:
    if not (1 <= first_page <= last_page <= len(pdf)):
        raise ValueError(f"Page range must be within PDF pages 1–{len(pdf)}")
    lines = []
    for page_number in range(first_page, last_page + 1):
        page = pdf[page_number - 1]
        page_lines = []
        for block in page.get_text("dict")["blocks"]:
            for item in block.get("lines", []):
                text = "".join(span["text"] for span in item["spans"]).strip()
                if text:
                    page_lines.append(Line(text, page_number, item["bbox"][0], item["bbox"][1]))
        lines.extend(sorted(page_lines, key=lambda item: (item.y, item.x)))
    return lines


def join_lines(parts: list[str]) -> str:
    result = ""
    for part in parts:
        if not result:
            result = part
        elif result.endswith("-") and part[:1].islower():
            result = result[:-1] + part
        else:
            result += " " + part
    return re.sub(r"\s+", " ", result).strip()


def extract_candidates(lines: list[Line]) -> tuple[list[dict], list[dict]]:
    problems: list[dict] = []
    excluded: list[dict] = []
    active: dict | None = None
    base_x: float | None = None

    for line in lines:
        text = line.text
        if (line.y < 22 and not PROBLEM.search(text)) or re.fullmatch(r"FIGURE\s+\d+", text, re.IGNORECASE):
            continue
        matches = list(PROBLEM.finditer(text))
        if matches:
            if active and matches[0].start():
                active["parts"].append(text[: matches[0].start()].strip())
            for index, match in enumerate(matches):
                end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
                active = {"number": int(match.group(1)), "sourcePage": line.page, "parts": []}
                problems.append(active)
                body = text[match.end() : end].strip()
                inline_stop = INLINE_STOP.search(body)
                if inline_stop:
                    body = body[: inline_stop.start()].strip()
                if body:
                    active["parts"].append(body)
                if inline_stop:
                    active = None
                base_x = line.x
            continue
        if active is None:
            continue
        if STOP.match(text) or (text.startswith("§") and re.search(r"\d", text)):
            active = None
            continue
        inline_stop = INLINE_STOP.search(text)
        if inline_stop:
            preceding = text[: inline_stop.start()].strip()
            if preceding:
                active["parts"].append(preceding)
            active = None
            continue
        # A new indented paragraph after a complete sentence normally begins
        # editorial prose. The report retains its first line for review.
        if base_x is not None and line.x > base_x + 7 and active["parts"] and active["parts"][-1].endswith((".", "?", "!")):
            excluded.append({"afterProblem": active["number"], "page": line.page, "text": text})
            active = None
            continue
        active["parts"].append(text)

    for problem in problems:
        problem["statement"] = join_lines(problem.pop("parts"))
    return problems, excluded


def apply_overrides(problem: dict, override: dict) -> None:
    statement = problem["statement"]
    for old, new in override.get("replace", []):
        if old not in statement:
            raise ValueError(f"Problem {problem['number']}: replacement text missing: {old!r}")
        statement = statement.replace(old, new)
    if "prepend" in override:
        statement = override["prepend"].strip() + " " + statement
    if "append" in override:
        statement += " " + override["append"].strip()
    problem["statement"] = statement


def format_math(statement: str) -> str:
    parts = re.split(r"(\$[^$]*\$)", statement)
    return "".join(
        part if index % 2 else re.sub(r"\b(\d+)\s*[x×]\s*(\d+)\b", lambda m: f"${m[1]} \\times {m[2]}$", part)
        for index, part in enumerate(parts)
    )


def embed_figure(pdf: fitz.Document, spec: dict, figures_dir: Path) -> dict:
    page_number = spec["page"]
    rect = fitz.Rect(spec["rect"])
    if not (1 <= page_number <= len(pdf)) or rect.is_empty or not pdf[page_number - 1].rect.contains(rect):
        raise ValueError(f"Invalid figure crop on PDF page {page_number}: {rect}")
    image = pdf[page_number - 1].get_pixmap(matrix=fitz.Matrix(4, 4), clip=rect, alpha=False).tobytes("png")
    figures_dir.mkdir(parents=True, exist_ok=True)
    (figures_dir / f"figure-{spec['number']}.png").write_bytes(image)
    return {
        "src": "data:image/png;base64," + base64.b64encode(image).decode("ascii"),
        "alt": spec["alt"],
        "caption": spec["caption"],
    }


def validate(problems: list[dict], first: int, last: int) -> list[str]:
    issues = []
    numbers = [p["number"] for p in problems]
    if numbers != list(range(first, last + 1)):
        issues.append(f"Problem numbers are not exactly {first}–{last} in order: {numbers}")
    ids = [p["id"] for p in problems]
    if len(ids) != len(set(ids)):
        issues.append("Duplicate problem IDs")
    for problem in problems:
        number = problem["number"]
        statement = problem["statement"]
        if not statement.strip() or len(statement.strip()) < 12:
            issues.append(f"Problem {number}: empty or malformed statement")
        if re.search(r"\b(?:Solution|Comment)\.\s", statement):
            issues.append(f"Problem {number}: possible solution/commentary in statement")
        if len(re.findall(r"(?<!\\)\$", statement)) % 2:
            issues.append(f"Problem {number}: unmatched LaTeX delimiter")
        for ref in set(FIGURE.findall(statement)):
            if not problem.get("figure") or problem["figure"]["caption"].lower() != f"figure {ref}".lower():
                issues.append(f"Problem {number}: missing referenced Figure {ref}")
        if "figure" in problem and not problem["figure"]["src"].startswith("data:image/png;base64,"):
            issues.append(f"Problem {number}: invalid embedded diagram")
    return issues


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--chapter-number", type=int, required=True)
    parser.add_argument("--chapter-name", required=True)
    parser.add_argument("--id-prefix", required=True)
    parser.add_argument("--pages", required=True, help="Inclusive 1-based PDF page range, e.g. 19-23")
    parser.add_argument("--first-problem", type=int, required=True)
    parser.add_argument("--last-problem", type=int, required=True)
    parser.add_argument("--overrides", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--figures-dir", type=Path, required=True)
    args = parser.parse_args()

    try:
        args.pdf.resolve().relative_to(Path(__file__).resolve().parent.parent)
    except ValueError:
        pass
    else:
        require_ignored(args.pdf)
    for private_path in [args.output, args.report, args.figures_dir, args.overrides]:
        if private_path is not None:
            require_ignored(private_path)
    match = re.fullmatch(r"(\d+)-(\d+)", args.pages)
    if not match:
        parser.error("--pages must be FIRST-LAST, using 1-based PDF page numbers")
    first_page, last_page = map(int, match.groups())
    overrides = json.loads(args.overrides.read_text()) if args.overrides else {}
    per_problem = overrides.get("problems", {})
    verified = set(overrides.get("verified", []))

    with fitz.open(args.pdf) as pdf:
        candidates, excluded = extract_candidates(read_lines(pdf, first_page, last_page))
        problems = []
        for candidate in candidates:
            number = candidate["number"]
            if number < args.first_problem or number > args.last_problem:
                continue
            problem = {
                "id": f"{args.id_prefix}-{number}",
                "chapter": args.chapter_name,
                "chapterNumber": args.chapter_number,
                "number": number,
                "sourcePage": candidate["sourcePage"],
                "statement": candidate["statement"],
                "hints": [],
                "solution": None,
            }
            override = per_problem.get(str(number), {})
            apply_overrides(problem, override)
            problem["statement"] = format_math(problem["statement"])
            if "figure" in override:
                problem["figure"] = embed_figure(pdf, override["figure"], args.figures_dir)
            problems.append(problem)

    issues = validate(problems, args.first_problem, args.last_problem)
    for problem in problems:
        if problem["number"] not in verified:
            issues.append(f"Problem {problem['number']}: statement needs visual review against the PDF")
    report = {
        "pdf": str(args.pdf),
        "pdfPages": [first_page, last_page],
        "chapter": args.chapter_name,
        "problemCount": len(problems),
        "issues": issues,
        "verifiedProblemNumbers": sorted(verified),
        "overrideProblemNumbers": sorted(int(number) for number in per_problem),
        "reviewNotes": overrides.get("reviewNotes", []),
        "draftProblems": [
            {"number": problem["number"], "sourcePage": problem["sourcePage"], "statement": problem["statement"]}
            for problem in candidates if args.first_problem <= problem["number"] <= args.last_problem
        ],
        "excludedParagraphStarts": excluded,
        "figureReferences": {
            str(problem["number"]): FIGURE.findall(problem["statement"])
            for problem in problems if FIGURE.search(problem["statement"])
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    if issues:
        raise SystemExit(f"Extraction needs review: {len(issues)} issue(s). See {args.report}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    collection = {"format": "one-problem-collection", "version": 1, "problems": problems}
    args.output.write_text(json.dumps(collection, indent=2, ensure_ascii=False) + "\n")
    subprocess.run(
        ["node", "scripts/validate-extracted-collection.mjs", str(args.output)],
        cwd=Path(__file__).resolve().parent.parent,
        check=True,
    )
    print(f"Exported {len(problems)} problems to {args.output}; review report: {args.report}")


if __name__ == "__main__":
    main()
