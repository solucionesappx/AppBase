/**
 * CONFIGURACIÓN GLOBAL
 */ 
// Diccionario de IDs de Documentos de Datos por Tienda
const DATA_SS_MAP = {
  'ULTRA_DHO': '1GEr1V2EzAm1vpGNTmKHMGYGuv3mM2F8eH-kbot-1qX8',
  'CondominiumAdmin': '1tREeWG6QugdcGFfC8uy3vSG7Q6DSjVpuVBEtdR094eQ'
};

const CONFIG_SPREADSHEET_ID = '1s4N_pwkwPHMWXlNqcG9dQXm9_yg2jdKImkZdmghKIbs'; 
const CONFIG_SHEET_NAME = 'ConfigViewTB'; 
const USER_CONFIG_SHEET = 'ConfigView';   
const DEFAULT_LIMIT = 20; 

/**
 * Función selectora dinámica de base de datos
 */
function getDataSpreadsheetId(userTienda) {
  return DATA_SS_MAP[userTienda] || DATA_SS_MAP['CondominiumAdmin'];
}

/**
 * Función principal: Maneja todas las peticiones GET
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const userTienda = e.parameter.userTienda || 'DEFAULT';
    const userProfile = e.parameter.userProfile || 'INVITADO';
    const userId = e.parameter.userId;
    const userName = e.parameter.userName;
    const tableName = e.parameter.tableName || e.parameter.targetSheet;
    const isFullLoad = e.parameter.fullLoad === 'true';

    // 1. ACCIÓN: OBTENER LISTA DE TABLAS PERMITIDAS
    if (action === 'getAvailableTables') {
      return createJsonResponse(getAvailableTables(userTienda));
    }

    // 2. ACCIÓN: GUARDAR CONFIGURACIÓN PERSONALIZADA
    if (action === 'saveTableConfig') {
      return saveTableConfig(userId, userName, tableName, e.parameter.configData);
    }

    // 3. ACCIÓN: OBTENER CONFIGURACIÓN PERSONALIZADA
    if (action === 'getTableConfig') {
      return getTableConfig(userId, tableName);
    }

    // 4. ACCIÓN POR DEFECTO: LEER DATOS
    if (!tableName) {
      return createJsonResponse({ error: "Falta el parámetro 'tableName'" }, 400);
    }

    // --- SEGURIDAD ---
    const REQUIRED_PROFILE = 'Admin';
    if (userProfile !== REQUIRED_PROFILE) {
      return createJsonResponse({ error: `Acceso denegado. Perfil ${REQUIRED_PROFILE} requerido.`, status: 403 });
    }

    // --- CONEXIÓN DINÁMICA A LOS DATOS ---
    const activeDataId = getDataSpreadsheetId(userTienda);
    const ss = SpreadsheetApp.openById(activeDataId);
    const sheet = ss.getSheetByName(tableName);
    
    if (!sheet) {
      return createJsonResponse({ error: `La tabla '${tableName}' no existe en el documento seleccionado.` }, 404);
    }

    // --- PROCESAR MAPEO ---
    const { keyMap, visibilityMap } = getConfigMap(userTienda, tableName);
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow < 1) return createJsonResponse({ data: [], columnOrder: [] });

    const originalHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    const finalHeaders = [];        
    const finalDisplayMap = {};     
    const columnsToProcess = [];    

    originalHeaders.forEach((name, index) => {
      const cleanKey = String(name).trim().replace(/[^a-zA-Z0-9_]/g, '');
      const isVisible = visibilityMap.hasOwnProperty(name) ? visibilityMap[name] : true; 

      if (cleanKey && isVisible) {
        finalHeaders.push(cleanKey);
        finalDisplayMap[cleanKey] = keyMap[name] || name;
        columnsToProcess.push(index); 
      }
    });

    // --- LÓGICA DE FILAS ---
    const totalDataRows = lastRow > 1 ? lastRow - 1 : 0;
    const rowsToFetch = isFullLoad ? totalDataRows : Math.min(totalDataRows, DEFAULT_LIMIT);

    let data = [];
    if (totalDataRows > 0 && rowsToFetch > 0) {
      const startRow = isFullLoad ? 2 : Math.max(2, (lastRow - rowsToFetch) + 1);
      const values = sheet.getRange(startRow, 1, rowsToFetch, lastCol).getValues();
      
      data = values.map(row => {
        const obj = {};
        columnsToProcess.forEach((colIdx, i) => {
          obj[finalHeaders[i]] = row[colIdx];
        });
        return obj;
      }).reverse();
    }

    return createJsonResponse({
      data: data,
      columnOrder: finalHeaders,
      displayMap: finalDisplayMap,
      dbUsed: userTienda, // Informamos al frontend qué base de datos se consultó
      pagination: { 
        totalRows: totalDataRows, 
        fetchedRows: data.length,
        type: isFullLoad ? "FULL" : "PREVIEW" 
      }
    });

  } catch (err) {
    return createJsonResponse({ error: err.toString() }, 500);
  }
}

/**
 * Persistencia de configuración personalizada
 */
function saveTableConfig(userId, userName, tableName, configData) {
  const ss = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(USER_CONFIG_SHEET) || ss.insertSheet(USER_CONFIG_SHEET);
  
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == userId && data[i][2] == tableName) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 2).setValue(userName);
    sheet.getRange(foundRow, 4).setValue(configData);
  } else {
    sheet.appendRow([userId, userName, tableName, configData]);
  }
  
  return createJsonResponse({ success: true });
}

function getTableConfig(userId, tableName) {
  const ss = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(USER_CONFIG_SHEET);
  if (!sheet) return createJsonResponse([]);
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == userId && data[i][2] == tableName) {
      return createJsonResponse(JSON.parse(data[i][3]));
    }
  }
  return createJsonResponse([]);
}

/**
 * Soporte para Mapeo
 */
function getAvailableTables(userTienda) {
  const ssConfig = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID);
  const sheet = ssConfig.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues().slice(1);
  const tableNames = new Set();
  rows.forEach(row => {
    if (String(row[0]).trim() === userTienda && row[1]) {
      tableNames.add(String(row[1]).trim());
    }
  });
  return Array.from(tableNames);
}

function getConfigMap(userTienda, sheetName) {
  const ssConfig = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID);
  const sheet = ssConfig.getSheetByName(CONFIG_SHEET_NAME);
  const keyMap = {};
  const visibilityMap = {};
  if (sheet) {
    const rows = sheet.getDataRange().getValues().slice(1);
    rows.forEach(row => {
      if (String(row[0]).trim() === userTienda && String(row[1]).trim() === sheetName) {
        const originalHeader = String(row[2]).trim();
        keyMap[originalHeader] = String(row[3] || originalHeader).trim();
        visibilityMap[originalHeader] = !!row[4];
      }
    });
  }
  return { keyMap, visibilityMap };
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
