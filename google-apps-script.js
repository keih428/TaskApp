/**
 * Google Apps Script Web App for TaskApp
 * 
 * このスクリプトをGoogle Apps Scriptにデプロイして、Webアプリとして公開してください。
 * 
 * セットアップ手順:
 * 1. Google Sheetsでスプレッドシートを開く
 * 2. 「拡張機能」→「Apps Script」を選択
 * 3. このコードをコピー＆ペースト
 * 4. 「デプロイ」→「新しいデプロイ」を選択
 * 5. 種類：ウェブアプリ
 * 6. 次のユーザーとして実行：自分
 * 7. アクセスできるユーザー：全員
 * 8. デプロイURLをコピーしてTaskAppに設定
 */

// スプレッドシートのシート名
const ACTIVE_SHEET_NAME = 'Active';
const ARCHIVE_SHEET_NAME = 'Archive';

/**
 * GETリクエスト - タスクデータの取得
 */
function doGet(e) {
  try {
    const sheet = getOrCreateActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行を除いてタスクデータを取得
    if (data.length <= 1) {
      return createJsonResponse({ tasks: [] });
    }
    
    const tasks = data.slice(1).map(row => ({
      id: row[0],
      name: row[1],
      deadline: row[2],
      registration: row[3],
      important: row[4] === true || row[4] === 'TRUE' || row[4] === 'true',
      urgent: row[5] === true || row[5] === 'TRUE' || row[5] === 'true',
      details: row[6] || ''
    })).filter(task => task.id && task.name && task.deadline);
    
    return createJsonResponse({ tasks: tasks });
  } catch (error) {
    return createJsonResponse({ error: error.toString() }, 500);
  }
}

/**
 * POSTリクエスト - タスクの追加・更新・削除
 */
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    
    switch (action) {
      case 'save':
        return saveTask(params.task);
      case 'delete':
        return deleteTask(params.taskId);
      case 'archive':
        return archiveTask(params.taskId);
      case 'sync':
        return doGet(e);
      default:
        return createJsonResponse({ error: 'Invalid action' }, 400);
    }
  } catch (error) {
    return createJsonResponse({ error: error.toString() }, 500);
  }
}

/**
 * タスクの保存（追加または更新）
 */
function saveTask(task) {
  const sheet = getOrCreateActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  // タスクIDで既存のタスクを検索
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === task.id) {
      rowIndex = i + 1; // スプレッドシートは1始まり
      break;
    }
  }
  
  const rowData = [
    task.id,
    task.name,
    task.deadline,
    task.registration,
    task.important,
    task.urgent,
    task.details || ''
  ];
  
  if (rowIndex > 0) {
    // 更新
    sheet.getRange(rowIndex, 1, 1, 7).setValues([rowData]);
  } else {
    // 新規追加
    sheet.appendRow(rowData);
  }
  
  return createJsonResponse({ success: true, task: task });
}

/**
 * タスクの削除
 */
function deleteTask(taskId) {
  const sheet = getOrCreateActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  // タスクIDで既存のタスクを検索
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === taskId) {
      sheet.deleteRow(i + 1); // スプレッドシートは1始まり
      return createJsonResponse({ success: true });
    }
  }
  
  return createJsonResponse({ error: 'Task not found' }, 404);
}

/**
 * タスクのアーカイブ（ActiveシートからArchiveシートへ移動）
 */
function archiveTask(taskId) {
  const activeSheet = getOrCreateActiveSheet();
  const archiveSheet = getOrCreateArchiveSheet();
  const data = activeSheet.getDataRange().getValues();
  
  // タスクIDで既存のタスクを検索
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === taskId) {
      // タスクデータを取得
      const taskData = data[i];
      
      // 完了日時を追加（日本時間）
      const completedAt = Utilities.formatDate(
        new Date(), 
        'Asia/Tokyo', 
        'yyyy-MM-dd HH:mm:ss'
      );
      
      // Archiveシートにタスクを追加（完了日時を含む）
      const archiveRowData = [...taskData, completedAt];
      archiveSheet.appendRow(archiveRowData);
      
      // Activeシートから削除
      activeSheet.deleteRow(i + 1); // スプレッドシートは1始まり
      
      return createJsonResponse({ success: true, completedAt: completedAt });
    }
  }
  
  return createJsonResponse({ error: 'Task not found' }, 404);
}

/**
 * Activeシートの取得または作成
 */
function getOrCreateActiveSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(ACTIVE_SHEET_NAME);
  
  if (!sheet) {
    // シートが存在しない場合は作成
    sheet = spreadsheet.insertSheet(ACTIVE_SHEET_NAME);
    
    // ヘッダー行を設定
    const headers = ['ID', 'タスク名', '期限', '登録日', '重要', '緊急', '詳細'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // ヘッダー行のスタイル設定
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    
    // 列幅の調整
    sheet.setColumnWidth(1, 150); // ID
    sheet.setColumnWidth(2, 200); // タスク名
    sheet.setColumnWidth(3, 100); // 期限
    sheet.setColumnWidth(4, 100); // 登録日
    sheet.setColumnWidth(5, 80);  // 重要
    sheet.setColumnWidth(6, 80);  // 緊急
    sheet.setColumnWidth(7, 300); // 詳細
  }
  
  return sheet;
}

/**
 * Archiveシートの取得または作成
 */
function getOrCreateArchiveSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(ARCHIVE_SHEET_NAME);
  
  if (!sheet) {
    // シートが存在しない場合は作成
    sheet = spreadsheet.insertSheet(ARCHIVE_SHEET_NAME);
    
    // ヘッダー行を設定（完了日時列を追加）
    const headers = ['ID', 'タスク名', '期限', '登録日', '重要', '緊急', '詳細', '完了日時'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // ヘッダー行のスタイル設定
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#34a853');
    headerRange.setFontColor('#ffffff');
    
    // 列幅の調整
    sheet.setColumnWidth(1, 150); // ID
    sheet.setColumnWidth(2, 200); // タスク名
    sheet.setColumnWidth(3, 100); // 期限
    sheet.setColumnWidth(4, 100); // 登録日
    sheet.setColumnWidth(5, 80);  // 重要
    sheet.setColumnWidth(6, 80);  // 緊急
    sheet.setColumnWidth(7, 300); // 詳細
    sheet.setColumnWidth(8, 150); // 完了日時
  }
  
  return sheet;
}

/**
 * JSON レスポンスの作成
 * Note: Google Apps Script Web Apps don't support custom HTTP status codes
 * The statusCode parameter is kept for consistency but not used
 */
function createJsonResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
