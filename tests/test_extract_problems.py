import sys
import tempfile
import unittest
from pathlib import Path

import fitz

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from extract_problems import extract_candidates, format_math, read_lines, require_ignored, validate  # noqa: E402


class ExtractProblemsTests(unittest.TestCase):
    def test_markers_need_not_begin_a_line_or_page(self):
        with tempfile.TemporaryDirectory() as directory:
            pdf_path = Path(directory) / "sample.pdf"
            pdf = fitz.open()
            first = pdf.new_page()
            first.insert_text((72, 100), "Intro. Problem 1. Find the first value. Problem 2. Find")
            first.insert_text((72, 115), "the second value?")
            second = pdf.new_page()
            second.insert_text((72, 100), "Solution. This is a worked answer.")
            second.insert_text((72, 120), "Problem 3. Find the third value.")
            pdf.save(pdf_path)
            pdf.close()

            with fitz.open(pdf_path) as document:
                problems, _ = extract_candidates(read_lines(document, 1, 2))

        self.assertEqual([p["number"] for p in problems], [1, 2, 3])
        self.assertEqual(problems[0]["statement"], "Find the first value.")
        self.assertEqual(problems[1]["statement"], "Find the second value?")
        self.assertEqual(problems[2]["sourcePage"], 2)
        self.assertNotIn("worked answer", str(problems))

    def test_validation_detects_sequence_ids_statements_latex_and_figures(self):
        problems = [
            {"id": "same", "number": 1, "statement": "Where is Figure 2?"},
            {"id": "same", "number": 3, "statement": "Bad $\\frac{1"},
            {"id": "third", "number": 4, "statement": " "},
        ]
        issues = validate(problems, 1, 4)
        self.assertTrue(any("numbers are not exactly" in issue for issue in issues))
        self.assertTrue(any("Duplicate" in issue for issue in issues))
        self.assertTrue(any("empty or malformed" in issue for issue in issues))
        self.assertTrue(any("missing referenced Figure" in issue for issue in issues))
        self.assertTrue(any("unmatched LaTeX" in issue for issue in issues))

    def test_math_formatter_preserves_existing_latex(self):
        self.assertEqual(format_math("A 2 x 3 grid and $a \\times b$."), "A $2 \\times 3$ grid and $a \\times b$.")

    def test_public_build_path_is_rejected_even_if_ignored(self):
        with self.assertRaises(ValueError):
            require_ignored(Path("public/book-assets/private.json"))


if __name__ == "__main__":
    unittest.main()
