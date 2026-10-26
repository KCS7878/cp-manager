import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countToScore,
  computeWordCp,
  computeAttendanceCp,
  computeLessonLedgerEntries,
  mergeRules,
  DEFAULT_RULES,
} from '../server/lib/cp-engine.js';

test('countToScore: 개수제 환산', () => {
  assert.equal(countToScore(50, 0), 100);
  assert.equal(countToScore(50, 10), 80);
  assert.equal(countToScore(50, 50), 0);
  assert.equal(countToScore(0, 0), 0);
  assert.equal(countToScore(30, 3), 90);
});

test('computeWordCp: 기한 내 통과 +10', () => {
  const r = computeWordCp(DEFAULT_RULES, {
    word_status: 'taken',
    word_score: 85,
    deadline_met: 1,
  });
  assert.equal(r.amount, 10);
});

test('computeWordCp: 만점 통과 +15', () => {
  const r = computeWordCp(DEFAULT_RULES, {
    word_status: 'taken',
    word_score: 100,
    deadline_met: 1,
  });
  assert.equal(r.amount, 15);
});

test('computeWordCp: 기한 이후 통과 -5', () => {
  const r = computeWordCp(DEFAULT_RULES, {
    word_status: 'taken',
    word_score: 90,
    deadline_met: 0,
  });
  assert.equal(r.amount, -5);
});

test('computeWordCp: 미응시 -10', () => {
  const r = computeWordCp(DEFAULT_RULES, { word_status: 'noshow' });
  assert.equal(r.amount, -10);
});

test('computeWordCp: 시험없음/기타 0', () => {
  assert.equal(computeWordCp(DEFAULT_RULES, { word_status: 'none' }).amount, 0);
  assert.equal(computeWordCp(DEFAULT_RULES, { word_status: 'etc' }).amount, 0);
});

test('computeWordCp: 기한 내 미통과 0 (패널티 없음)', () => {
  const r = computeWordCp(DEFAULT_RULES, {
    word_status: 'taken',
    word_score: 70,
    deadline_met: 1,
  });
  assert.equal(r.amount, 0);
});

test('computeWordCp: 기한 초과 미통과 -5', () => {
  const r = computeWordCp(DEFAULT_RULES, {
    word_status: 'taken',
    word_score: 70,
    deadline_met: 0,
  });
  assert.equal(r.amount, -5);
});

test('computeAttendanceCp: 인정 범위 내 지각 0', () => {
  const r = computeAttendanceCp(DEFAULT_RULES, {
    attendance: 'late',
    late_minutes: 5,
  });
  assert.equal(r.amount, 0);
});

test('computeAttendanceCp: 기준 초과 1분당 -1', () => {
  const r = computeAttendanceCp(DEFAULT_RULES, {
    attendance: 'late',
    late_minutes: 12,
  });
  assert.equal(r.amount, -7); // (12-5)*1
});

test('computeAttendanceCp: 출석/결석은 지각 CP 없음', () => {
  assert.equal(
    computeAttendanceCp(DEFAULT_RULES, { attendance: 'present' }).amount,
    0
  );
  assert.equal(
    computeAttendanceCp(DEFAULT_RULES, { attendance: 'absent' }).amount,
    0
  );
});

test('computeLessonLedgerEntries: 지각+단어 복합', () => {
  const entries = computeLessonLedgerEntries(DEFAULT_RULES, {
    attendance: 'late',
    late_minutes: 10,
    word_status: 'taken',
    word_score: 100,
    deadline_met: 1,
    attendance_only: 0,
  });
  const total = entries.reduce((a, e) => a + e.amount, 0);
  assert.equal(total, -5 + 15); // 지각 초과5분 -5, 만점 +15
});

test('computeLessonLedgerEntries: attendance_only면 단어 제외', () => {
  const entries = computeLessonLedgerEntries(DEFAULT_RULES, {
    attendance: 'late',
    late_minutes: 10,
    word_status: 'taken',
    word_score: 100,
    deadline_met: 1,
    attendance_only: 1,
  });
  const total = entries.reduce((a, e) => a + e.amount, 0);
  assert.equal(total, -5);
});

test('mergeRules: 학생 예외 override', () => {
  const merged = mergeRules(DEFAULT_RULES, {
    student_id: 1,
    word_pass_score: 90,
    pass_in_time_cp: null,
    updated_at: 'x',
  });
  assert.equal(merged.word_pass_score, 90);
  assert.equal(merged.pass_in_time_cp, 10); // null이므로 override 안됨
});
