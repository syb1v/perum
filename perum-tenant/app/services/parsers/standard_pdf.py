"""Standard school-journal PDF parser (ported from legacy, closure workaround
cleaned up).

Reads a PDF grade sheet via pdfplumber with a fallback ladder of table
strategies. One broken page does not abort the whole import — it is skipped with
a warning. Header text yields the class/subject; the first date-row + the
acronym-row below it define the columns; remaining rows are students.
"""

from __future__ import annotations

import io
import logging
from typing import Dict, List, Optional

import pdfplumber

from app.services.parsers.base import BaseJournalParser, NormalizationEngine, _DATE_RE
from app.services.parsers.dtos import ParsedGradeRaw, ParsingPreviewResponse

logger = logging.getLogger("perum.tenant.pdf_parser")

import re  # noqa: E402

_CLASS_PATTERNS = [
    re.compile(r'(?i)классный\s+журнал\s+(\d+[- ]*[а-яa-z«»"\'\(]+)'),
    re.compile(r'(?i)класс\s*[:\-]?\s*(\d+[- ]*[а-яa-z«»"\'\(]+)'),
    re.compile(r'(?i)(\d{1,2}\s*[а-яa-z«»]{1,3})(?:\s|$|\()'),
]
_SUBJECT_PATTERNS = [
    re.compile(r'(?i)предмет\s*[:\-]?\s*([А-Яа-яA-Za-z][А-Яа-яA-Za-z\s\-]{2,40})'),
    re.compile(r'(?i)дисциплина\s*[:\-]?\s*([А-Яа-яA-Za-z][А-Яа-яA-Za-z\s\-]{2,40})'),
    re.compile(r'(?i)учебный\s+предмет\s*[:\-]?\s*([А-Яа-яA-Za-z][А-Яа-яA-Za-z\s\-]{2,40})'),
]
_MIN_DATE_COUNT = 1


def _extract_class_subject(text: str):
    class_raw = subject_raw = None
    for pat in _CLASS_PATTERNS:
        m = pat.search(text)
        if m:
            class_raw = m.group(1).strip()
            break
    for pat in _SUBJECT_PATTERNS:
        m = pat.search(text)
        if m:
            candidate = re.split(r'[\d\n\r,;]', m.group(1).strip())[0].strip()
            if len(candidate) >= 3:
                subject_raw = candidate
                break
    return class_raw, subject_raw


def _find_date_row(table: list) -> int:
    best_idx, best_count = -1, 0
    for i, row in enumerate(table):
        if not row:
            continue
        count = sum(1 for cell in row if cell and _DATE_RE.match(str(cell).strip()))
        if count >= _MIN_DATE_COUNT and count > best_count:
            best_count, best_idx = count, i
    return best_idx


def _extract_student_name(first_cell: str) -> Optional[str]:
    if not first_cell:
        return None
    cell = re.sub(r'^\d+[\.\)]\s*', '', str(first_cell).strip()).strip()
    cell = re.sub(r'[\r\n]+', ' ', cell).strip()
    if not cell or len(cell) < 3:
        return None
    if re.match(r'^\d+\s', cell):
        cell = re.sub(r'^\d+\s+', '', cell).strip()
    if not cell or len(cell) < 3:
        return None
    return cell


def extract_table_grades(table: list) -> tuple[list[ParsedGradeRaw], set, set, set]:
    """Turn one raw table (list of rows) into grades + the acronym/date/name sets.

    Pulled out of page handling so it can be unit-tested with a synthetic table
    (no real PDF needed). Returns (grades, acronyms, dates, student_names).
    Empty result if the table has no recognisable date row / columns.
    """
    grades: list[ParsedGradeRaw] = []
    acronyms: set = set()
    dates: set = set()
    names: set = set()

    date_row_idx = _find_date_row(table)
    if date_row_idx == -1 or date_row_idx + 1 >= len(table):
        return grades, acronyms, dates, names

    dates_row = table[date_row_idx]
    acronyms_row = table[date_row_idx + 1]

    valid_cols: Dict[int, tuple] = {}
    for col_idx, cell_value in enumerate(dates_row):
        if not cell_value:
            continue
        cell_str = str(cell_value).strip()
        if not _DATE_RE.match(cell_str):
            continue
        raw_acronym = ""
        if col_idx < len(acronyms_row) and acronyms_row[col_idx]:
            raw_acronym = str(acronyms_row[col_idx]).strip()
        if NormalizationEngine.is_skip_acronym(raw_acronym):
            if not raw_acronym:
                raw_acronym = "Д/З"
            else:
                continue
        valid_cols[col_idx] = (cell_str, raw_acronym)
        acronyms.add(NormalizationEngine.normalize_text(raw_acronym))
        dates.add(cell_str)

    if not valid_cols:
        return grades, acronyms, dates, names

    for row_idx in range(date_row_idx + 2, len(table)):
        row = table[row_idx]
        if not row:
            continue
        name = _extract_student_name(row[0] if row else "")
        if not name:
            continue
        names.add(name)
        for col_idx, (date_str, acronym) in valid_cols.items():
            if col_idx >= len(row) or not row[col_idx]:
                continue
            cell_text = str(row[col_idx]).strip()
            if not cell_text:
                continue
            grades.extend(
                NormalizationEngine.split_grades(
                    cell_text=cell_text, date=date_str, acronym=acronym, student_name=name
                )
            )

    return grades, acronyms, dates, names


class StandardPdfParser(BaseJournalParser):
    STRATEGIES = [
        {"vertical_strategy": "lines", "horizontal_strategy": "lines"},
        {"vertical_strategy": "text", "horizontal_strategy": "text"},
        {"vertical_strategy": "lines", "horizontal_strategy": "text"},
        {"vertical_strategy": "text", "horizontal_strategy": "lines"},
    ]

    def parse_preview(self, file_bytes: bytes) -> ParsingPreviewResponse:
        total_grades: List[ParsedGradeRaw] = []
        unique_acronyms: set = set()
        unique_dates: set = set()
        student_names: set = set()
        validation_errors: List[str] = []
        self._class_raw: Optional[str] = None
        self._subject_raw: Optional[str] = None

        try:
            pdf = pdfplumber.open(io.BytesIO(file_bytes))
        except Exception as exc:
            logger.error("[PDF Parser] cannot open PDF: %s", exc)
            raise ValueError(f"Не удалось открыть PDF-файл. Возможно, файл повреждён: {exc}")

        with pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                try:
                    self._process_page(
                        page, page_num, total_grades, unique_acronyms,
                        unique_dates, student_names,
                    )
                except Exception as exc:
                    msg = f"Страница {page_num} пропущена из-за ошибки: {exc}"
                    logger.warning("[PDF Parser] %s", msg)
                    validation_errors.append(msg)
                    continue

        return ParsingPreviewResponse(
            subject_raw_name=self._subject_raw,
            class_raw_name=self._class_raw,
            unique_acronyms=sorted(unique_acronyms),
            unique_dates=sorted(unique_dates),
            student_names=sorted(student_names),
            preview_grades=total_grades,
            total_grades_found=len(total_grades),
            validation_errors=validation_errors,
        )

    def _process_page(
        self, page, page_num, total_grades, unique_acronyms, unique_dates, student_names
    ):
        text = page.extract_text() or ""
        c_raw, s_raw = _extract_class_subject(text)
        if c_raw and not self._class_raw:
            self._class_raw = c_raw
        if s_raw and not self._subject_raw:
            self._subject_raw = s_raw

        table = None
        for strategy in self.STRATEGIES:
            try:
                tables = page.extract_tables(table_settings=strategy)
            except Exception:
                continue
            if tables and len(tables[0]) > 2:
                table = tables[0]
                break
        if table is None:
            return

        grades, acronyms, dates, names = extract_table_grades(table)
        total_grades.extend(grades)
        unique_acronyms.update(acronyms)
        unique_dates.update(dates)
        student_names.update(names)
