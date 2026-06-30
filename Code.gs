/**
 * ============================================================
 * © 2026 GEG화성 (깊이 e끌림). All rights reserved.
 *
 * 본 코드는 「저작권법」의 보호를 받는 저작물입니다.
 * - 복제권(제16조)·공중송신권(제18조)·배포권(제20조)이
 *   저작권자에게 있습니다.
 * - 어떤 경로로 받은 이용자라도 코드의 무단 복제·재배포·
 *   재판매·리브랜딩은 허용되지 않습니다.
 * - 무단 이용 시 「저작권법」 제136조(5년 이하 징역 또는
 *   5천만 원 이하 벌금) 및 제125조(손해배상) 적용 대상이
 *   될 수 있습니다.
 * - 이용 문의: bacusiki777@gmail.com, for2102@jimj.kr
 * ============================================================
 */

// 빌드 서명
const _BUILD_SIG = 'GEGHS-DEEPE-2026';

// 출처 확인용 함수
function getBuildInfo() {
  return {
    sig: _BUILD_SIG,
    owner: 'GEG화성 (깊이 e끌림)',
    year: 2026
  };
}

// ============================================================
//  도형 모험 — 다각형의 둘레와 넓이
//  (Apps Script 백엔드 — 선생님 한 분 / 시트 한 개 = 본인 데이터)
// ------------------------------------------------------------
//  ▶ 1회 설치 (선생님)
//   1) 새 Google 스프레드시트를 만들어요.
//   2) 확장 프로그램 → Apps Script. 기본 코드를 모두 지우고 이 코드를 붙여넣어요.
//   3) 저장 → 위쪽 'initSheets' 함수를 한 번 실행해서 권한 승인 + 시트 자동 생성.
//   4) 배포 → 새 배포 → 유형: 웹 앱
//        • 실행 사용자: '나'
//        • 액세스 권한: '모든 사용자' (또는 '익명 사용자')  ← 꼭!
//   5) 발급된 .../exec URL을 도형 모험 앱 선생님 메뉴에 붙여넣어요.
//
//  ▶ 시트 구성 (initSheets 가 자동으로 만들어 줍니다)
//   - 사용 설명 : 선생님 안내 (메뉴 설명·자주 묻는 질문)
//   - 학생 명단 : 학생 명단 (A=번호, B=이름. B2 부터 한 줄에 한 명)
//   - 학습상태  : 학생별 학습 상태 (progress·stars·quiz 를 JSON 으로 저장)
//   - 활동기록  : 활동 기록 (자동 적재 — 점검·통계용)
//
//  ▶ 데이터 모델
//   '학습상태' 시트: [student, className, progress, stars, quiz, updated]
//     - progress: { unitId: { stepId: { done:true, at:ISO } } }
//     - quiz:     { unitId: { score, total, at:ISO } }
//
//  ▶ 통신 방식
//   웹 브라우저에서 다른 사이트로 바로 데이터 요청이 차단되는 경우가 있어,
//   응답을 콜백 함수 호출 형태로 보냅니다(브라우저가 안전하게 받아갈 수 있음).
// ============================================================

const APP_VERSION = '2026.05';
const SHEETS = {
  GUIDE:    '사용 설명',
  STUDENTS: '학생 명단',
  STATE:    '학습상태',
  LOG:      '활동기록'
};
// 옛 탭 이름이 있으면 새 탭 이름으로 자동 이름 변경
const LEGACY_SHEET_NAMES = {
  GUIDE:    ['guide', '가이드', '사용법'],
  STUDENTS: ['students', '학생명단'],
  STATE:    ['state'],
  LOG:      ['log']
};

// ---------- 라우터 (GET — 콜백 응답 우선) ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  const callback = p.callback || '';
  const action = p.action || 'ping';

  try {
    ensureSheets_();
    let result;
    switch (action) {
      case 'ping':     result = { ok: true, version: APP_VERSION, at: new Date().toISOString() }; break;
      case 'students': result = { ok: true, list: getStudents_() }; break;
      case 'state':    result = { ok: true, state: getState_(p.student || '') }; break;
      case 'save':     result = { ok: true, saved: saveState_(p) }; break;
      case 'stats':    result = { ok: true, rows: getStats_(p.className || '') }; break;
      default:         result = { ok: false, err: 'unknown action: ' + action };
    }
    return jsonp_(callback, result);
  } catch (err) {
    return jsonp_(callback, { ok: false, err: String(err) });
  }
}

// ---------- POST (예전 클라이언트와 호환용) ----------
function doPost(e) {
  try {
    ensureSheets_();
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'save' && body.payload) {
      const p = body.payload;
      saveState_({
        student: p.student || '',
        className: p.className || '',
        type: p.type || '',
        unitId: p.unitId || '',
        stepId: p.stepId || '',
        score: p.score || '',
        total: p.total || '',
        delta: p.delta || ''
      });
    } else if (body.action === 'log') {
      const p = body.payload || {};
      appendLog_(p);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, err: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ---------- 응답 도우미 (콜백이 있으면 콜백 호출 형태로) ----------
function jsonp_(callback, payload) {
  const json = JSON.stringify(payload);
  if (callback) {
    const safe = callback.replace(/[^A-Za-z0-9_]/g, '');
    return ContentService.createTextOutput(safe + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  학생 / 상태 조회
// ============================================================
function getStudents_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.STUDENTS);
  if (!sh || sh.getLastRow() < 2) return [];
  const lastRow = sh.getLastRow();
  let names = sh.getRange(2, 2, lastRow - 1, 1).getValues().flat().map(String).map(s => s.trim()).filter(Boolean);
  if (!names.length) {
    // 폴백: A열 (옛 단일 칸 레이아웃, A1='이름' 인 경우)
    names = sh.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String).map(s => s.trim()).filter(Boolean);
  }
  // 안내용 자리표시자(학생1, 학생2, …) 는 자동으로 걸러냄
  return names.filter(n => !/^학생\d+$/.test(n));
}

function getState_(student) {
  if (!student) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.STATE);
  const row = findStateRow_(sh, student);
  if (row < 0) return { progress: {}, stars: 0, quiz: {} };
  const values = sh.getRange(row, 1, 1, 6).getValues()[0];
  return {
    student:   values[0] || '',
    className: values[1] || '',
    progress:  parseJson_(values[2], {}),
    stars:     Number(values[3]) || 0,
    quiz:      parseJson_(values[4], {}),
    updated:   values[5] || ''
  };
}

function getStats_(className) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.LOG);
  if (!sh || sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  if (!className) return rows;
  return rows.filter(r => String(r[1]) === className);
}

// ============================================================
//  상태 저장 (병합 갱신)
// ============================================================
function saveState_(p) {
  const student = p.student || '';
  if (!student) throw new Error('student is required');
  const className = p.className || '';
  const type = p.type || '';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.STATE);
  let row = findStateRow_(sh, student);
  let progress = {}, stars = 0, quiz = {};
  if (row > 0) {
    const v = sh.getRange(row, 1, 1, 6).getValues()[0];
    progress = parseJson_(v[2], {});
    stars    = Number(v[3]) || 0;
    quiz     = parseJson_(v[4], {});
  }

  if (type === 'stepDone' && p.unitId && p.stepId) {
    progress[p.unitId] = progress[p.unitId] || {};
    progress[p.unitId][p.stepId] = { done: true, at: new Date().toISOString() };
  } else if (type === 'stars') {
    stars += Number(p.delta) || 0;
  } else if (type === 'quiz' && p.unitId) {
    const prev = quiz[p.unitId];
    const sc = Number(p.score) || 0, tot = Number(p.total) || 0;
    if (!prev || prev.score < sc) {
      quiz[p.unitId] = { score: sc, total: tot, at: new Date().toISOString() };
    }
  } else if (type === 'reset') {
    progress = {}; stars = 0; quiz = {};
  } else if (type === 'full' && p.data) {
    const data = parseJson_(p.data, {});
    if (data.progress) progress = data.progress;
    if (typeof data.stars === 'number') stars = data.stars;
    if (data.quiz) quiz = data.quiz;
  }

  const updated = new Date().toISOString();
  const rowData = [student, className, JSON.stringify(progress), stars, JSON.stringify(quiz), updated];
  if (row > 0) {
    sh.getRange(row, 1, 1, 6).setValues([rowData]);
  } else {
    sh.appendRow(rowData);
  }

  appendLog_({
    at: updated,
    className,
    student,
    unitId: p.unitId || '',
    stepId: p.stepId || '',
    type,
    score: p.score || '',
    total: p.total || ''
  });

  return { type, student };
}

function findStateRow_(sh, student) {
  if (!sh || sh.getLastRow() < 2) return -1;
  const names = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat();
  const idx = names.findIndex(n => String(n) === student);
  return idx < 0 ? -1 : idx + 2;
}

function appendLog_(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.LOG);
  sh.appendRow([
    p.at || new Date().toISOString(),
    p.className || '',
    p.student || '',
    p.unitId || '',
    p.stepId || '',
    p.type || '',
    p.score || '',
    p.total || ''
  ]);
}

function parseJson_(s, d) {
  if (!s) return d;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { return d; }
}

// 옛 레이아웃(A1='이름', 학생 이름이 A2..An) → 새 레이아웃(A=번호, B=이름) 으로 한 번에 이전
function migrateStudentsLayout_(sh) {
  if (!sh) return;
  const a1 = String(sh.getRange(1, 1).getValue() || '').trim();
  const b1 = String(sh.getRange(1, 2).getValue() || '').trim();
  if (b1) return;
  if (a1 !== '이름') return;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    sh.getRange(1, 1).setValue('번호');
    sh.getRange(1, 2).setValue('이름');
    return;
  }
  const names = sh.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
  const cleaned = names.map(s => s.trim()).filter(Boolean);
  sh.getRange(2, 1, lastRow - 1, 2).clearContent();
  sh.getRange(1, 1).setValue('번호');
  sh.getRange(1, 2).setValue('이름');
  if (cleaned.length) {
    const rows = cleaned.map((n, i) => [i + 1, n]);
    sh.getRange(2, 1, rows.length, 2).setValues(rows);
  }
}

// 이전 버전이 심어둔 5명 샘플 이름 정확 일치 시에만 삭제 (오인 삭제 방지)
function cleanupSampleStudents_(sh) {
  if (!sh || sh.getLastRow() < 2) return;
  const SAMPLE = ['홍길동','김민준','이서연','박지호','최예린'];
  const last = sh.getLastRow();
  ['A','B'].forEach(col => {
    const range = sh.getRange((col === 'A' ? 'A2:A' : 'B2:B') + last);
    const values = range.getValues().flat().map(String);
    const head5 = values.slice(0, 5);
    const intact = head5.length === 5 && head5.every((v, i) => v === SAMPLE[i]);
    if (intact) {
      const colIdx = col === 'A' ? 1 : 2;
      sh.getRange(2, colIdx, 5, 1).clearContent();
    }
  });
}

function clearSampleStudents() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.STUDENTS);
  if (!sh) { SpreadsheetApp.getUi().alert('"학생 명단" 탭이 없어요. 먼저 initSheets 를 실행하세요.'); return; }
  cleanupSampleStudents_(sh);
  SpreadsheetApp.getUi().alert('샘플 이름(홍길동·김민준·이서연·박지호·최예린)이 있다면 정리했어요.\n실제 학생 이름을 B 열에 적어 주세요.');
}

// ============================================================
//  시트 자동 생성 / 안내
// ============================================================
function initSheets() { ensureSheets_(true); }

function ensureSheets_(forceGuide) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 옛 탭이 있다면 새 한글 탭 이름으로 자동 변경
  Object.keys(LEGACY_SHEET_NAMES).forEach(key => {
    const oldList = LEGACY_SHEET_NAMES[key];
    const newName = SHEETS[key];
    oldList.forEach(oldName => {
      if (oldName === newName) return;
      const oldSh = ss.getSheetByName(oldName);
      const newSh = ss.getSheetByName(newName);
      if (oldSh && !newSh) { try { oldSh.setName(newName); } catch (e) {} }
    });
  });

  // 학생 명단 — A: 번호, B: 이름
  let students = ss.getSheetByName(SHEETS.STUDENTS);
  if (!students) {
    students = ss.insertSheet(SHEETS.STUDENTS);
    students.getRange(1, 1).setValue('번호').setFontWeight('bold').setBackground('#FFE5BA').setHorizontalAlignment('center');
    students.getRange(1, 2).setValue('이름').setFontWeight('bold').setBackground('#FFE5BA');
    students.setColumnWidth(1, 70);
    students.setColumnWidth(2, 220);
    students.setFrozenRows(1);
  } else {
    migrateStudentsLayout_(students);
    cleanupSampleStudents_(students);
    students.getRange(1, 1).setValue('번호').setFontWeight('bold').setBackground('#FFE5BA').setHorizontalAlignment('center');
    students.getRange(1, 2).setValue('이름').setFontWeight('bold').setBackground('#FFE5BA');
    if (students.getColumnWidth(1) < 60) students.setColumnWidth(1, 70);
    if (students.getColumnWidth(2) < 160) students.setColumnWidth(2, 220);
    students.setFrozenRows(1);
  }
  // B 열에 실제 이름이 하나도 없으면 자리표시자(학생1~학생30) 사전 입력
  (function fillPlaceholders() {
    const lr = students.getLastRow();
    const hasName = lr >= 2 && students.getRange(2, 2, lr - 1, 1).getValues().flat().some(v => String(v).trim());
    if (hasName) return;
    const ph = [];
    for (let i = 1; i <= 30; i++) ph.push([i, '학생' + i]);
    students.getRange(2, 1, ph.length, 2).setValues(ph);
  })();

  // 학습상태
  let stateSh = ss.getSheetByName(SHEETS.STATE);
  if (!stateSh) {
    stateSh = ss.insertSheet(SHEETS.STATE);
    const headers = ['student', 'className', 'progress(JSON)', 'stars', 'quiz(JSON)', 'updated'];
    stateSh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#FFE5BA');
    stateSh.setColumnWidth(1, 120);
    stateSh.setColumnWidth(2, 100);
    stateSh.setColumnWidth(3, 360);
    stateSh.setColumnWidth(4, 70);
    stateSh.setColumnWidth(5, 280);
    stateSh.setColumnWidth(6, 180);
    stateSh.setFrozenRows(1);
  }

  // 활동기록
  let log = ss.getSheetByName(SHEETS.LOG);
  if (!log) {
    log = ss.insertSheet(SHEETS.LOG);
    const headers = ['at', 'className', 'student', 'unitId', 'stepId', 'type', 'score', 'total'];
    log.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#FFE5BA');
    log.setFrozenRows(1);
  }

  // 사용 설명 — 옛 안내 탭(있다면 둘 다)을 모두 삭제하고 항상 새로 만든다(forceGuide)
  const legacyGuideNames = ['guide', '가이드', '📘 사용법', '사용법'];
  legacyGuideNames.forEach(n => {
    if (n === SHEETS.GUIDE) return;
    const old = ss.getSheetByName(n);
    if (old) { try { ss.deleteSheet(old); } catch (e) {} }
  });
  let guide = ss.getSheetByName(SHEETS.GUIDE);
  if (forceGuide && guide) {
    try {
      ss.deleteSheet(guide);
      guide = null;
    } catch (e) {
      const tmp = ss.insertSheet('__tmp_guide__');
      try {
        ss.deleteSheet(guide);
        tmp.setName(SHEETS.GUIDE);
        guide = tmp;
      } catch (e2) {
        guide.clear();
        try { ss.deleteSheet(tmp); } catch (e3) {}
      }
    }
  }
  if (!guide) guide = ss.insertSheet(SHEETS.GUIDE);
  if (guide.getLastRow() === 0) writeGuide_(guide);
  ss.setActiveSheet(guide);
  ss.moveActiveSheet(1);
}

function writeGuide_(sh) {
  // 섹션 구조 — items 안 항목은 사용자가 추가/삭제해도 자동으로 번호가 다시 매겨짐
  const sections = [
    {
      title: '처음 한 번 설치',
      items: [
        '확장 프로그램 → Apps Script 에서 Code.gs 를 저장합니다.',
        '함수 칸에서 initSheets 를 선택해 실행합니다. 권한 허용 안내가 뜨면 모두 허용합니다.',
        '배포 → 새 배포 → 유형: 웹 앱 을 선택합니다. 실행 사용자는 "나", 액세스 권한은 "모든 사용자" 로 둡니다.',
        '발급된 .../exec 주소를 도형 모험 앱의 선생님 메뉴에 붙여넣고 "연결하기" 를 누릅니다.',
        '선생님 메뉴 안의 "학생용 주소" 를 복사해 학생에게 보내면, 학생 화면에서는 선생님 메뉴가 보이지 않게 됩니다.'
      ]
    },
    {
      title: '학생 명단 등록',
      items: [
        '"학생 명단" 탭의 A 열은 번호, B 열에 학생 이름을 한 줄에 한 명씩 적어 주세요.',
        '처음에는 "학생1"~"학생30" 자리표시자가 채워져 있습니다. 실제 이름으로 바꿔 적으면 앱 첫 화면에 그 이름이 보입니다.',
        '자리표시자(학생1, 학생2 ...)는 앱이 자동으로 걸러내므로 따로 지우지 않아도 됩니다.'
      ]
    },
    {
      title: '상태와 기록 보기',
      items: [
        '"학습상태" 탭에는 학생별 진행·별·퀴즈 결과가 자동으로 저장됩니다.',
        '"활동기록" 탭에는 모든 학습 이벤트가 시간순으로 한 줄씩 쌓입니다.'
      ]
    },
    {
      title: '코드 업데이트',
      items: [
        '새 버전의 Code.gs 를 붙여넣고 저장한 뒤에는 반드시 "배포 → 새 배포" 를 다시 만들어야 새 주소가 적용됩니다.',
        '주소가 바뀌면 앱 선생님 메뉴에서 새 주소를 다시 붙여넣고 "연결하기" 를 누르세요.'
      ]
    },
    {
      title: '자주 묻는 질문',
      items: [
        'Q. 학생이 "연결 실패" 라고 나와요. — 액세스 권한이 "모든 사용자" 인지, 주소 끝이 /exec 인지 확인하세요.',
        'Q. 다른 선생님과 데이터가 섞일까요? — 안 섞입니다. 각 선생님이 자신의 시트만 사용합니다.',
        'Q. 학생이 인터넷 연결 없이도 풀 수 있나요? — 시트와 연결되지 않은 데모 모드는 학생 기기 안에 진행을 저장하고 이어풀기를 지원합니다.'
      ]
    },
    {
      title: "'도형 모험' 메뉴",
      items: [
        '시트 초기화 / 보강 — 빠진 탭을 자동으로 만듭니다.',
        '학생 명단 열기 — "학생 명단" 탭으로 이동합니다.',
        '샘플 이름 정리 — 자동 생성된 샘플 이름을 한 번에 비웁니다.',
        '사용 설명 다시 만들기 — 이 안내문을 새로 씁니다.',
        '통계 빠른 보기 — 단원별 평균 정답률을 한 번에 봅니다.',
        '웹 앱 배포 확인 — 현재 시각·버전을 알려 줍니다.'
      ]
    }
  ];

  const rows = [];
  rows.push(['사용 설명']);
  rows.push(['']);
  rows.push(['데이터나 설정을 변경할 때는 앱 화면이 아니라 해당 시트 탭에서 직접 수정하세요. 탭 이름은 코드에 연결되어 있으므로 삭제하거나 변경하지 마세요.']);
  rows.push(['']);
  const sectionStartRows = [];
  sections.forEach((sec, si) => {
    sectionStartRows.push(rows.length + 1);
    rows.push([(si + 1) + '. ' + sec.title]);
    sec.items.forEach((it, ii) => {
      rows.push(['    ' + (ii + 1) + ') ' + it]);
    });
    rows.push(['']);
  });

  sh.getRange(1, 1, rows.length, 1).setValues(rows);

  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor('#2A2540').setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.getRange(1, 1).setBorder(false, false, true, false, false, false, '#7048E8', SpreadsheetApp.BorderStyle.SOLID_THICK);
  sh.getRange(3, 1).setBackground('#FFF8E1').setFontColor('#5D4037').setFontStyle('italic');
  sectionStartRows.forEach(r => {
    sh.getRange(r, 1).setFontWeight('bold').setBackground('#EBE3FF').setFontColor('#2A2540');
  });
  sh.getRange(1, 1, rows.length, 1).setWrap(true).setVerticalAlignment('top');
  sh.getRange(1, 1, rows.length, 1).setBorder(true, true, true, true, true, true, '#E0D9C0', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 760);
}

// ============================================================
//  메뉴 ('도형 모험')
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("'도형 모험'")
    .addItem('시트 초기화 / 보강', 'initSheets')
    .addItem('학생 명단 열기', 'menuOpenStudents_')
    .addItem('샘플 이름 정리(홍길동·김민준 등)', 'clearSampleStudents')
    .addItem('사용 설명 다시 만들기', 'menuRebuildGuide_')
    .addSeparator()
    .addItem('통계 빠른 보기', 'menuQuickStats_')
    .addItem('웹 앱 배포 확인', 'menuPing_')
    .addToUi();
}

function menuOpenStudents_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets_();
  const sh = ss.getSheetByName(SHEETS.STUDENTS);
  ss.setActiveSheet(sh);
}

function menuRebuildGuide_() {
  ensureSheets_(true);
  SpreadsheetApp.getUi().alert("'사용 설명' 탭을 새로 만들었어요.");
}

function menuPing_() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('연결 확인', '버전: ' + APP_VERSION + '\n현재 시각: ' + new Date().toISOString() + '\n\n웹 앱 주소는 [배포] 화면에서 확인하세요.', ui.ButtonSet.OK);
}

function menuQuickStats_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS.LOG);
  if (!sh || sh.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('아직 기록이 없어요.');
    return;
  }
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const byUnit = {};
  rows.forEach(r => {
    if (r[5] !== 'quiz') return;
    const unit = r[3]; const score = Number(r[6]) || 0; const total = Number(r[7]) || 0;
    if (!total) return;
    byUnit[unit] = byUnit[unit] || { sum: 0, n: 0 };
    byUnit[unit].sum += score / total; byUnit[unit].n++;
  });
  let msg = '단원별 평균 정답률\n────────────────\n';
  Object.keys(byUnit).forEach(u => {
    const s = byUnit[u];
    msg += '  ' + u + '  ' + Math.round(s.sum / s.n * 100) + '%  (' + s.n + '명 응시)\n';
  });
  SpreadsheetApp.getUi().alert('통계 빠른 보기', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}
