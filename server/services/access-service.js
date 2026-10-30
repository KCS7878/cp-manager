// 접속 코드 인증 + 학생 읽기 전용 화면 데이터 서비스.
import { getDb, transaction } from '../db/connection.js';
import { uniqueCode } from '../db/migrate.js';
import { getStudentBalance, getLedger } from './ledger-service.js';
import { analyzeExams, listExams } from './exam-service.js';
import { listLessons } from './lesson-service.js';
import { listInventory, listProductsForStudent } from './shop-service.js';
import { getRanking } from './ranking-service.js';
import { NotFoundError, ValidationError } from '../lib/validation.js';

// 총관리자 코드. 환경변수(CP_FULL_ADMIN_CODE)로 재정의 가능, 미설정 시 기본값.
function fullAdminCode() {
  const envCode = (typeof process !== 'undefined' && process.env && process.env.CP_FULL_ADMIN_CODE)
    || (globalThis.__CP_FULL_ADMIN_CODE);
  return (envCode || 'FULL_ADMIN').trim().toUpperCase();
}

/**
 * 총관리자 권한 검증. admin 전용 엔드포인트에서 호출한다.
 * 요청 헤더 x-admin-code 가 총관리자 코드와 일치하지 않으면 403.
 * (프런트에서 버튼을 숨겨도 API 직접 호출로 우회되는 것을 막는다.)
 */
export function assertAdmin(req) {
  const code = String(readHeader(req, 'x-admin-code') || '').trim().toUpperCase();
  if (!code || code !== fullAdminCode()) {
    const err = new ValidationError('이 기능은 총관리자만 사용할 수 있습니다.');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }
}

// 로컬 Node(http): req.headers 는 일반 객체(소문자 키).
// Cloudflare Workers: request.headers 는 Headers 객체 → .get() 필요.
// 두 환경을 모두 지원한다.
function readHeader(req, name) {
  if (!req || !req.headers) return null;
  const hs = req.headers;
  if (typeof hs.get === 'function') return hs.get(name);
  const lower = name.toLowerCase();
  return hs[lower] ?? hs[name] ?? null;
}

/**
 * 접속 코드로 역할 판별.
 * @returns { role: 'admin'|'teacher'|'student', ... }
 */
export async function resolveAccessCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) throw new ValidationError('접속 코드를 입력해 주세요.');

  // 총관리자 (숨겨진 코드)
  if (code === fullAdminCode()) {
    return { role: 'admin' };
  }

  const db = getDb();
  const teacher = await db.get('SELECT * FROM teachers WHERE access_code = ?', [code]);
  if (teacher) {
    return { role: 'teacher', teacher: { id: teacher.id, name: teacher.name, color: teacher.color } };
  }
  const student = await db.get('SELECT * FROM students WHERE access_code = ? AND archived = 0', [code]);
  if (student) {
    return { role: 'student', student: { id: student.id, name: student.name, teacher_id: student.teacher_id } };
  }
  throw new NotFoundError('해당 코드를 찾을 수 없습니다. 코드를 다시 확인해 주세요.');
}

/** 총관리자: 전체 강사 목록 (학생 수 + 코드 포함) */
export async function adminListTeachers() {
  const db = getDb();
  const rows = await db.all(
    `SELECT t.id, t.name, t.color, t.access_code,
       (SELECT COUNT(*) FROM students s WHERE s.teacher_id = t.id AND s.archived = 0) AS student_count
     FROM teachers t ORDER BY t.id`,
    []
  );
  return rows;
}

/** 강사 코드 조회 (관리자 화면에서 공유용) */
export async function getTeacherCode(teacherId) {
  const db = getDb();
  const t = await db.get('SELECT access_code FROM teachers WHERE id = ?', [teacherId]);
  if (!t) throw new NotFoundError('강사를 찾을 수 없습니다.');
  // 코드가 없으면 즉시 발급
  if (!t.access_code) {
    return transaction(async (tx) => {
      const code = await uniqueCode(tx, 'T', 'teachers');
      await tx.run('UPDATE teachers SET access_code = ? WHERE id = ?', [code, teacherId]);
      return code;
    });
  }
  return t.access_code;
}

/** 학생 코드 조회 (관리자 화면에서 학생에게 공유용) */
export async function getStudentCode(studentId) {
  const db = getDb();
  const s = await db.get('SELECT access_code FROM students WHERE id = ?', [studentId]);
  if (!s) throw new NotFoundError('학생을 찾을 수 없습니다.');
  if (!s.access_code) {
    return transaction(async (tx) => {
      const code = await uniqueCode(tx, 'S', 'students');
      await tx.run('UPDATE students SET access_code = ? WHERE id = ?', [code, studentId]);
      return code;
    });
  }
  return s.access_code;
}

/** 코드 재발급 */
export async function regenerateCode(kind, id) {
  return transaction(async (db) => {
    if (kind === 'teacher') {
      const code = await uniqueCode(db, 'T', 'teachers');
      await db.run('UPDATE teachers SET access_code = ? WHERE id = ?', [code, id]);
      return { code };
    } else if (kind === 'student') {
      const code = await uniqueCode(db, 'S', 'students');
      await db.run('UPDATE students SET access_code = ? WHERE id = ?', [code, id]);
      return { code };
    }
    throw new ValidationError('잘못된 대상입니다.');
  });
}

/**
 * 학생 읽기 전용 화면 데이터.
 * 본인 CP·정보·단어추세·시험분석·인벤토리 + 본인이 포함된 랭킹(내 위치 강조).
 * 민감 정보(다른 학생 상세, 편집용 필드)는 제외.
 */
export async function getStudentPublicView(studentId) {
  const db = getDb();
  const s = await db.get('SELECT * FROM students WHERE id = ? AND archived = 0', [studentId]);
  if (!s) throw new NotFoundError('학생을 찾을 수 없습니다.');
  const teacher = await db.get('SELECT name FROM teachers WHERE id = ?', [s.teacher_id]);

  const bal = await getStudentBalance(db, studentId);
  const lessons = await listLessons(studentId);
  const exams = await listExams(studentId);
  const examAnalysis = await analyzeExams(studentId);
  // 학생이 직접 제출한 점수 목록(대기/승인 상태 표시용). 최근순 일부만.
  const mySubmittedExams = exams
    .filter((e) => e.submitted_by === 'student')
    .slice(0, 20)
    .map((e) => ({
      id: e.id, exam_type: e.exam_type, exam_name: e.exam_name, exam_date: e.exam_date,
      score: e.score, grade: e.grade, status: e.status,
    }));
  const inventory = await listInventory(studentId);
  const ledger = await getLedger(db, studentId, 100);
  const products = await listProductsForStudent(s.teacher_id, studentId); // 상점 (판매중, 학생 적용가)

  // 랭킹(누적·이번달 둘 다) — 본인 teacher 범위 전체
  const cumulative = await getRanking(s.teacher_id, { basis: 'cumulative', filter: {} });
  const monthly = await getRanking(s.teacher_id, { basis: 'monthly', filter: {} });
  const myCumRank = (cumulative.rows.find((r) => r.student_id === studentId) || {});
  const myMonRank = (monthly.rows.find((r) => r.student_id === studentId) || {});

  // 단어시험 추세
  const wordLessons = lessons.filter((l) => l.word_status === 'taken' && l.word_score != null);
  const wordTrend = wordLessons.slice(-10).map((l) => ({ date: l.lesson_date, score: l.word_score, range: l.word_range, deadlineMet: !!l.deadline_met }));

  return {
    student: {
      id: s.id, name: s.name, school: s.school, grade: s.grade, class_name: s.class_name,
      subject: s.subject, teacher: teacher ? teacher.name : null,
      mock_goal_type: s.mock_goal_type, mock_goal_value: s.mock_goal_value,
      exam_goal_type: s.exam_goal_type, exam_goal_value: s.exam_goal_value,
    },
    cp: { available: bal.available, pending: bal.pending, cumulative: bal.cumulative },
    ledger, // 최근 지급 내역 (읽기 전용)
    wordTrend,
    examAnalysis,
    mySubmittedExams, // 학생이 제출한 점수(대기/승인)
    teacherId: s.teacher_id,
    inventory,
    products: products.map((p) => ({ id: p.id, name: p.name, description: p.description, image_url: p.image_url, effective_cp: p.effective_cp, price_krw: p.price_krw })),
    ranking: {
      cumulative: {
        myRank: myCumRank.rank || null, myCp: myCumRank.cp ?? bal.cumulative,
        total: cumulative.rows.length,
        top: cumulative.rows.slice(0, 10).map(publicRankRow),
      },
      monthly: {
        myRank: myMonRank.rank || null, myCp: myMonRank.cp ?? 0,
        monthKey: monthly.monthKey, total: monthly.rows.length,
        top: monthly.rows.slice(0, 10).map(publicRankRow),
      },
    },
  };
}

// 랭킹 행에서 공개 가능한 최소 정보만 (다른 학생 이름은 표시하되 상세는 제외)
function publicRankRow(r) {
  return { rank: r.rank, name: r.name, grade: r.grade, class_name: r.class_name, cp: r.cp, symbols: r.symbols };
}
