"""Normalization engine for the PDF journal importer.

Ported faithfully from the legacy parser. Pure logic (regex + dictionaries +
fuzzy matching) — turns the "garbage" out of a PDF table into canonical grades,
attendance markers, and class/subject names before they touch the DB.
"""

from __future__ import annotations

import re
import unicodedata
from abc import ABC, abstractmethod
from difflib import SequenceMatcher
from typing import List, Optional

from app.services.parsers.dtos import ParsedGradeRaw, ParsingPreviewResponse

# ---------------------------------------------------------------------------
# Normalization dictionaries
# ---------------------------------------------------------------------------

# Attendance / special markers → canonical code
ATTENDANCE_ALIASES: dict[str, str] = {
    # Absence / unexcused
    'н': 'Н', 'нн': 'Н', 'нб': 'Н', 'н.': 'Н',
    'неяв': 'Н', 'неявка': 'Н', 'прогул': 'Н', 'отсут': 'Н',
    'отсутствовал': 'Н', 'отсутствовала': 'Н',
    'не явился': 'Н', 'не явилась': 'Н',
    'нп': 'Н',
    # Excused
    'у': 'У', 'уп': 'У', 'у.п': 'У', 'у.п.': 'У',
    'уваж': 'У', 'уважит': 'У', 'уважительная': 'У',
    # Illness / certificate
    'б': 'Б', 'бол': 'Б', 'болен': 'Б', 'больна': 'Б',
    'болезнь': 'Б', 'спр': 'Б', 'справка': 'Б', 'спр.': 'Б',
    # Pass
    'з': 'ЗАЧ', 'зач': 'ЗАЧ', 'зач.': 'ЗАЧ',
    'зачет': 'ЗАЧ', 'зачёт': 'ЗАЧ', 'зачтено': 'ЗАЧ',
    'зач-но': 'ЗАЧ', 'зач/но': 'ЗАЧ',
    'пройд': 'ЗАЧ', 'сдал': 'ЗАЧ', 'сдала': 'ЗАЧ',
    '+': 'ЗАЧ',
    # Fail
    'нз': 'Н/З', 'н/з': 'Н/З', 'незач': 'Н/З',
    'незачёт': 'Н/З', 'незачет': 'Н/З', 'не зач': 'Н/З',
    'н/а': 'Н/З', 'на': 'Н/З', 'непройд': 'Н/З',
    'нзач': 'Н/З', 'не сдал': 'Н/З', '-з': 'Н/З',
    # Exemption
    'осв': 'ОСВ', 'освоб': 'ОСВ', 'освобожден': 'ОСВ',
    'освобождён': 'ОСВ', 'осв.': 'ОСВ',
    'лфк': 'ОСВ', 'сг': 'ОСВ', 'сп': 'ОСВ',
    # Dot / debt
    '.': 'точка', 'долг': 'точка',
}

# Cell values to ignore entirely
IGNORE_CELL_VALUES: set[str] = {
    '', '-', '–', '—', '−',
    'none', 'null', 'nan', 'n/a',
    'нд', 'н/д', 'не выставлена', 'не выст', 'нет оценки',
    '/', '//', '\\', '|', '*',
    'x', 'х',
}

# Header acronyms that are NOT work types
SKIP_ACRONYMS: set[str] = {
    'дата', 'число', 'месяц', 'год', 'дни',
    'итог', 'итоговая', 'итого', 'итоговое',
    'за год', 'за четверть', 'годовая', 'годовое',
    'пром', 'промежуточная', 'средн', 'средняя', 'среднее',
    'четверть', 'полугодие', 'полуг', 'триместр', 'семестр',
    'аттестация', 'аттест',
    'оценка', 'отметка', 'балл', 'тип', 'вид работы', 'п/п', '№',
    'ф.и.о', 'фио', 'фамилия', 'имя', 'ученик', 'ученица',
    'i', 'ii', 'iii', 'iv', 'v', 'vi',
}

# Subject abbreviations → full name (for subject_matches). Order matters.
SUBJECT_ALIASES: list[tuple[str, str]] = [
    ('физ ра',          'физическая культура'),
    ('физра',           'физическая культура'),
    ('фк',              'физическая культура'),
    ('физ культ',       'физическая культура'),
    ('физвоспитание',   'физическая культура'),
    ('рус яз',          'русский язык'),
    ('рус язык',        'русский язык'),
    ('рус',             'русский язык'),
    ('лит ра',          'литература'),
    ('лит',             'литература'),
    ('матем',           'математика'),
    ('мат',             'математика'),
    ('алг',             'алгебра'),
    ('геом',            'геометрия'),
    ('ин яз',                            'иностранный язык'),
    ('иняз',                             'иностранный язык'),
    ('иностранный язык (английский)',    'английский язык'),
    ('иностранный язык (англ)',          'английский язык'),
    ('иностранный язык (английский яз)', 'английский язык'),
    ('иностранный язык',                 'английский язык'),
    ('иностр яз',                        'английский язык'),
    ('англ яз',                          'английский язык'),
    ('анг яз',                           'английский язык'),
    ('англ',                             'английский язык'),
    ('english',                          'английский язык'),
    ('иностранный язык (немецкий)',       'немецкий язык'),
    ('нем яз',                           'немецкий язык'),
    ('нем',                              'немецкий язык'),
    ('deutsch',                          'немецкий язык'),
    ('иностранный язык (французский)',    'французский язык'),
    ('фран яз',                          'французский язык'),
    ('фран',                             'французский язык'),
    ('francais',                         'французский язык'),
    ('китайский яз',                     'китайский язык'),
    ('кит яз',                           'китайский язык'),
    ('обж',             'основы безопасности жизнедеятельности'),
    ('информ',          'информатика'),
    ('инф',             'информатика'),
    ('ист',             'история'),
    ('обществ',         'обществознание'),
    ('обш',             'обществознание'),
    ('bio',             'биология'),
    ('хим',             'химия'),
    ('физ',             'физика'),
    ('изо',             'изобразительное искусство'),
    ('труд',            'технология'),
    ('тех',             'технология'),
    ('муз',             'музыка'),
]


# ---------------------------------------------------------------------------
# Regexes (compiled once)
# ---------------------------------------------------------------------------
_DATE_RE = re.compile(r'^\d{1,2}[.\-/]\d{1,2}(?:[.\-/]\d{2,4})?$')
_ROMAN_QUARTER_RE = re.compile(
    r'^(?:i{1,3}|iv|vi{0,3}|ix)\s*(четв|полуг|кварт|кв\.?|п/г\.?)?$', re.I
)
_QUARTER_PREFIX_RE = re.compile(
    r'^(?:\d+|i{1,3}|iv)\s*(?:четв|полуг|кварт|полугодие|четверть|кв\.?|п/г\.?)', re.I
)
_RESULT_WORD_RE = re.compile(r'(итог|годов|год\.|промеж|аттест|средн)', re.I)
_PURE_NUMBER_RE = re.compile(r'^\d+$')
_VALID_GRADE_RE = re.compile(r'^[1-5]$')


def _strip_accents(text: str) -> str:
    return ''.join(
        c for c in unicodedata.normalize('NFD', text)
        if unicodedata.category(c) != 'Mn'
    )


def _replace_yo(text: str) -> str:
    return text.replace('ё', 'е').replace('Ё', 'Е')


class NormalizationEngine:
    """Turns any "garbage" out of a PDF into a canonical form before comparison."""

    @staticmethod
    def normalize_text(text: str) -> str:
        if not text:
            return ''
        t = _replace_yo(text.lower())
        t = _strip_accents(t)
        t = re.sub(r'[ \t\r\n]+', ' ', t)
        return ' '.join(t.split())

    @staticmethod
    def normalize_class_name(raw_name: str) -> str:
        if not raw_name:
            return ''
        s = NormalizationEngine.normalize_text(raw_name)
        s = re.sub(r'[«»\"\'\(\)\-]', '', s)
        s = re.sub(r'\b(основной|общий|класс|группа|подгруппа)\b', '', s)
        s = re.sub(r'\b0+(\d)', r'\1', s)
        s = s.replace(' ', '')
        match = re.search(r'(\d+[а-яa-z])', s)
        return match.group(1) if match else s.strip()

    @staticmethod
    def normalize_subject_name(raw_name: str) -> str:
        if not raw_name:
            return ''
        s = NormalizationEngine.normalize_text(raw_name)
        s = re.sub(r'\.', ' ', s)
        s = re.sub(r'[«»\"\'\(\)\-_/]', ' ', s)
        return ' '.join(s.split())

    @staticmethod
    def normalize_student_name(full_name: str) -> str:
        if not full_name:
            return ''
        s = NormalizationEngine.normalize_text(full_name)
        s = re.sub(r'(?<=[а-яa-z])\.(?=[а-яa-z])', ' ', s)
        s = s.replace('.', '')
        tokens = s.split()
        if len(tokens) > 1:
            tokens = [tokens[0]] + [t for t in tokens[1:] if len(t) > 1]
        return ' '.join(tokens)

    @staticmethod
    def fuzzy_match(a: str, b: str, threshold: float = 0.82) -> bool:
        if not a or not b:
            return False
        return SequenceMatcher(None, a, b).ratio() >= threshold

    @staticmethod
    def subject_matches(file_subject: str, db_subject: str) -> bool:
        norm_file = NormalizationEngine.normalize_subject_name(file_subject)
        norm_db = NormalizationEngine.normalize_subject_name(db_subject)

        if not norm_file or not norm_db:
            return True

        if norm_file == norm_db:
            return True

        if norm_db.startswith(norm_file) or norm_file.startswith(norm_db):
            return True

        words_f = norm_file.split()
        words_d = norm_db.split()
        min_len = min(len(words_f), len(words_d))
        if min_len > 0:
            hits = sum(
                1 for wf, wd in zip(words_f, words_d)
                if wd.startswith(wf) or wf.startswith(wd) or wf == wd
            )
            if hits == min_len:
                return True

        def _resolve_canonical(norm_term: str) -> str | None:
            for alias, canonical in SUBJECT_ALIASES:
                norm_alias = NormalizationEngine.normalize_subject_name(alias)
                norm_canon = NormalizationEngine.normalize_subject_name(canonical)
                if norm_term == norm_alias or norm_term == norm_canon:
                    return norm_canon
            return None

        for alias, canonical in SUBJECT_ALIASES:
            norm_alias = NormalizationEngine.normalize_subject_name(alias)
            norm_canonical = NormalizationEngine.normalize_subject_name(canonical)
            matches_alias = (norm_file == norm_alias or norm_db == norm_alias)
            matches_canon = (norm_file == norm_canonical or norm_db == norm_canonical)
            if matches_alias and matches_canon:
                return True

        canon_file = _resolve_canonical(norm_file)
        canon_db = _resolve_canonical(norm_db)
        if canon_file and canon_db and canon_file == canon_db:
            return True

        set_f = set(words_f)
        set_d = set(words_d)
        if set_d:
            if len(set_f & set_d) / len(set_d) >= 0.5:
                return True

        return NormalizationEngine.fuzzy_match(norm_file, norm_db, threshold=0.82)

    @staticmethod
    def is_skip_acronym(acronym: str) -> bool:
        if not acronym:
            return True
        s = NormalizationEngine.normalize_text(acronym)
        if not s:
            return True
        if _DATE_RE.match(acronym.strip()):
            return True
        if _PURE_NUMBER_RE.match(s.replace(' ', '')):
            return True
        if s in SKIP_ACRONYMS:
            return True
        if _ROMAN_QUARTER_RE.match(s):
            return True
        if _QUARTER_PREFIX_RE.match(s):
            return True
        if _RESULT_WORD_RE.search(s):
            return True
        return False

    @staticmethod
    def split_grades(
        cell_text: str,
        date: str,
        acronym: str,
        student_name: str,
    ) -> List[ParsedGradeRaw]:
        if not cell_text:
            return []

        raw = str(cell_text).strip()
        if raw.lower() in IGNORE_CELL_VALUES:
            return []

        text = NormalizationEngine.normalize_text(raw)
        if not text:
            return []

        results: List[ParsedGradeRaw] = []

        # Step 0: whole-cell dictionary check BEFORE splitting (н/з, н/а, …)
        if text in ATTENDANCE_ALIASES:
            results.append(ParsedGradeRaw(
                student_name=student_name, date=date, acronym=acronym,
                attendance_mark=ATTENDANCE_ALIASES[text], original_cell_text=raw,
            ))
            return results

        # Strip parenthetical comments: «5(к/р)» → «5»
        text = re.sub(r'\(.*?\)', '', text).strip()
        # Replace separators with spaces
        text = re.sub(r'[/\\|]', ' ', text)

        tokens = text.split()

        for token in tokens:
            token = token.strip('.,;:')
            if not token or token in IGNORE_CELL_VALUES:
                continue

            grade_val: Optional[int] = None
            attendance: Optional[str] = None

            if _VALID_GRADE_RE.match(token):
                grade_val = int(token)
            elif token in ATTENDANCE_ALIASES:
                attendance = ATTENDANCE_ALIASES[token]
            else:
                grade_chars = [c for c in token if c.isdigit() and c in '12345']
                letter_part = re.sub(r'[0-9]', '', token)
                attend_marks: list[str] = []

                if letter_part in ATTENDANCE_ALIASES:
                    attend_marks = [ATTENDANCE_ALIASES[letter_part]]
                elif letter_part:
                    for c in letter_part:
                        if c in ATTENDANCE_ALIASES:
                            attend_marks.append(ATTENDANCE_ALIASES[c])

                if grade_chars:
                    results.append(ParsedGradeRaw(
                        student_name=student_name, date=date, acronym=acronym,
                        grade_value=int(grade_chars[0]), original_cell_text=raw,
                    ))
                for mark in attend_marks:
                    results.append(ParsedGradeRaw(
                        student_name=student_name, date=date, acronym=acronym,
                        attendance_mark=mark, original_cell_text=raw,
                    ))
                continue

            if grade_val is not None or attendance is not None:
                results.append(ParsedGradeRaw(
                    student_name=student_name, date=date, acronym=acronym,
                    grade_value=grade_val, attendance_mark=attendance,
                    original_cell_text=raw,
                ))

        return results


class BaseJournalParser(ABC):
    @abstractmethod
    def parse_preview(self, file_bytes: bytes) -> ParsingPreviewResponse:
        """Read file, extract grades + preview context, no DB interactions."""
        ...
