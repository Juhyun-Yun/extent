// ============================================================
//  도형 모험 — 다각형의 둘레와 넓이 (Apps Script 백엔드)
// ------------------------------------------------------------
//  사용 방법
//  1) 학생 명단이 들어 있는 Google 스프레드시트 열기
//  2) 확장 프로그램 → Apps Script
//  3) 이 파일(Code.gs) 내용을 통째로 붙여넣기 → 저장(Ctrl+S)
//  4) 배포 → 새 배포 → 유형: 웹 앱
//       - 다음 사용자로 실행: 나
//       - 액세스 권한이 있는 사용자: 모든 사용자  ← 꼭!
//  5) 발급된 웹 앱 URL을 도형 모험 앱 ⚙ 설정에 붙여넣기
//
//  필요한 시트
//   - students : A1=헤더(예: "이름"), A2부터 학생 이름 한 줄에 한 명
//   - log      : 없으면 자동 생성됨. 활동 기록이 자동 적재됨.
// ============================================================

// ---------- GET 요청 처리 ----------
// ?action=students  → students 시트의 이름 목록을 JSON 배열로 반환
// ?action=stats&class=반이름 → log 시트의 행들을 JSON으로 반환
// 그 외 → "OK" 텍스트 반환 (연결 확인용)
function doGet(e) {
  const action = (e && e.parameter ? e.parameter.action : '') || '';
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'students') {
    const sh = ss.getSheetByName('students');
    const list = sh
      ? sh.getRange('A2:A').getValues().flat().filter(String)
      : [];
    return ContentService
      .createTextOutput(JSON.stringify(list))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'stats') {
    const sh = ss.getSheetByName('log');
    const rows = sh ? sh.getDataRange().getValues() : [];
    return ContentService
      .createTextOutput(JSON.stringify({ rows: rows.slice(1) }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput('OK');
}

// ---------- POST 요청 처리 ----------
// 활동 로그를 log 시트에 한 줄씩 추가
// body: { action:'log', payload:{ at, className, student, unitId, stepId, type, score, total } }
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    let sh = ss.getSheetByName('log');
    if (!sh) sh = ss.insertSheet('log');

    // 헤더가 비어 있으면 한 번만 생성
    if (sh.getLastRow() === 0) {
      sh.appendRow(['at', 'class', 'student', 'unitId', 'stepId', 'type', 'score', 'total']);
    }

    const p = body.payload || {};
    sh.appendRow([
      p.at        || '',
      p.className || '',
      p.student   || '',
      p.unitId    || '',
      p.stepId    || '',
      p.type      || '',
      p.score     || '',
      p.total     || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, err: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
