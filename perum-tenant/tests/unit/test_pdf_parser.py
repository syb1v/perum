"""Unit tests for the PDF grade-import logic.

We have no sample journal PDF to verify against, so these tests exercise the
pure logic where the parsing intelligence actually lives: the normalization
engine (cell → grades/markers), the header/name/date extractors, the full
table → grades pipeline (with a synthetic table), and the importer's date
parsing. The thin pdfplumber glue (page → table) is not covered here.
"""

from app.modules.grade_import.service import _parse_date
from app.services.parsers.base import NormalizationEngine as NE
from app.services.parsers.standard_pdf import (
    _extract_class_subject,
    _extract_student_name,
    _find_date_row,
    extract_table_grades,
)


# ---- split_grades: the cell-content parser ----
def test_split_simple_grade():
    out = NE.split_grades("5", "15.01", "К/Р", "Иванов Иван")
    assert len(out) == 1 and out[0].grade_value == 5 and out[0].attendance_mark is None


def test_split_two_grades_space():
    out = NE.split_grades("4 5", "15.01", "ОТВ", "Иванов Иван")
    assert [g.grade_value for g in out] == [4, 5]


def test_split_two_grades_slash():
    out = NE.split_grades("5/4", "15.01", "ОТВ", "Иванов Иван")
    assert [g.grade_value for g in out] == [5, 4]


def test_split_grade_with_comment():
    out = NE.split_grades("5(к.р)", "15.01", "ОТВ", "Иванов Иван")
    assert [g.grade_value for g in out] == [5]


def test_split_grade_plus_absence():
    out = NE.split_grades("5н", "15.01", "ОТВ", "Иванов Иван")
    vals = {(g.grade_value, g.attendance_mark) for g in out}
    assert (5, None) in vals and (None, "Н") in vals


def test_split_pass_marker():
    out = NE.split_grades("зач.", "15.01", "ОТВ", "Иванов Иван")
    assert len(out) == 1 and out[0].attendance_mark == "ЗАЧ"


def test_split_fail_marker_before_slash():
    # 'н/з' must be recognised as Н/З, not split on '/'
    out = NE.split_grades("н/з", "15.01", "ОТВ", "Иванов Иван")
    assert len(out) == 1 and out[0].attendance_mark == "Н/З"


def test_split_empty_dash():
    assert NE.split_grades("-", "15.01", "ОТВ", "Иванов Иван") == []
    assert NE.split_grades("", "15.01", "ОТВ", "Иванов Иван") == []


def test_split_absence_n():
    out = NE.split_grades("н", "15.01", "ОТВ", "Иванов Иван")
    assert len(out) == 1 and out[0].attendance_mark == "Н"


# ---- is_skip_acronym: header vs work-type ----
def test_skip_headers():
    for s in ["дата", "Итог", "I четверть", "годовая", "5", "№", "ФИО"]:
        assert NE.is_skip_acronym(s) is True, s


def test_work_type_acronyms_not_skipped():
    for s in ["К/Р", "С/Р", "ОТВ", "Д/З", "Тест"]:
        assert NE.is_skip_acronym(s) is False, s


# ---- subject_matches ----
def test_subject_match_abbrev():
    assert NE.subject_matches("рус яз", "Русский язык") is True
    assert NE.subject_matches("физ-ра", "Физическая культура") is True
    assert NE.subject_matches("Математика", "математика") is True


def test_subject_mismatch():
    assert NE.subject_matches("Математика", "Физика") is False


# ---- student name normalization & extraction ----
def test_student_name_strips_initials():
    # Single-letter initials are dropped; multi-char given/patronymic names stay.
    assert NE.normalize_student_name("Иванов И.И.") == "иванов"
    assert NE.normalize_student_name("Иванов Иван Иванович") == "иванов иван иванович"
    # The importer bridges these via a last-name-only key (len > 3), so a file
    # row "Иванов И.И." (→ "иванов") matches a DB "Иванов Иван" by last name.
    assert NE.normalize_student_name("Иванов Иван").split()[0] == "иванов"


def test_extract_student_name_strips_number():
    assert _extract_student_name("1. Иванов Иван") == "Иванов Иван"
    assert _extract_student_name("12) Петров Пётр") == "Петров Пётр"
    assert _extract_student_name("Сидоров Семён") == "Сидоров Семён"
    assert _extract_student_name("") is None


def test_fuzzy_no_false_substring():
    # 'Иванов' vs 'Иванова' should not be an exact match but close
    assert NE.fuzzy_match("иванов", "иванова", threshold=0.95) is False


# ---- header extraction ----
def test_extract_class_subject():
    text = "Классный журнал 5А\nПредмет: Математика\nучитель ..."
    cls, subj = _extract_class_subject(text)
    assert cls and cls.startswith("5")
    assert subj == "Математика"


# ---- date row + full table pipeline ----
def test_find_date_row():
    table = [
        ["ФИО", "тип", "тип"],
        ["", "15.01", "16.01"],
        ["", "К/Р", "ОТВ"],
        ["1. Иванов Иван", "5", "4"],
    ]
    assert _find_date_row(table) == 1


def test_extract_table_grades_full():
    table = [
        ["№ ФИО", "15.01", "16.01", "Итог"],
        ["", "К/Р", "ОТВ", "за четверть"],
        ["1. Иванов Иван", "5", "4 5", "5"],
        ["2. Петрова Анна", "н", "3/4", "4"],
    ]
    grades, acronyms, dates, names = extract_table_grades(table)
    assert names == {"Иванов Иван", "Петрова Анна"}
    assert dates == {"15.01", "16.01"}            # 'Итог' column excluded
    # Иванов: 5 (К/Р, 15.01), 4 and 5 (ОТВ, 16.01); Петрова: Н (15.01), 3 and 4 (16.01)
    iv = [g for g in grades if g.student_name == "Иванов Иван"]
    assert sorted(g.grade_value for g in iv if g.grade_value) == [4, 5, 5]
    pet = [g for g in grades if g.student_name == "Петрова Анна"]
    assert any(g.attendance_mark == "Н" for g in pet)
    assert sorted(g.grade_value for g in pet if g.grade_value) == [3, 4]


# ---- importer date parsing ----
def test_parse_date_full():
    d = _parse_date("15.01.2026")
    assert (d.day, d.month, d.year) == (15, 1, 2026)


def test_parse_date_two_digit_year():
    d = _parse_date("15.01.26")
    assert d.year == 2026


def test_parse_date_no_year_infers():
    d = _parse_date("15.01")
    assert d is not None and (d.month, d.day) == (1, 15)


def test_parse_date_invalid():
    assert _parse_date("notadate") is None
