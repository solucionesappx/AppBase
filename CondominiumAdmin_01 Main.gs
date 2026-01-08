/**
 * @fileoverview Google Apps Script para leer y registrar datos de/en una hoja de cálculo.
 * Proporciona una función que lee la información de una tabla a partir del
 * ID del documento y el nombre de la hoja, utilizando los valores de la
 * primera fila como claves para los objetos JSON.
 */
/**
 * @fileoverview Google Apps Script para leer datos de una hoja de cálculo.
 * [Versión con Optimización de Rendimiento y Configuración Dinámica]
 */

/**
 * CONFIGURACIÓN GLOBAL
 */
const DATA_SS_ID = '1tREeWG6QugdcGFfC8uy3vSG7Q6DSjVpuVBEtdR094eQ'; 
const CONFIG_SS_ID = '1s4N_pwkwPHMWXlNqcG9dQXm9_yg2jdKImkZdmghKIbs'; 
const CONFIG_SHEET_NAME = 'ConfigViewTB';

/**
 * Manejador de peticiones GET.
 */
function doGet(e) {
  try {
    // 1. CAPTURA DE PARÁMETROS
    const tableName = e.parameter.tableName || e.parameter.sheet;
    const userTienda = e.parameter.userTienda || 'DEFAULT';
    const ignoreVisibility = e.parameter.ignoreVisibility === 'true'; 
    
    if (!tableName) throw new Error("Parámetro 'tableName' no recibido.");

    // 2. ACCESO A LOS LIBROS (SISTEMA HÍBRIDO)
    let ss;
    try {
      // Intento 1: Vía rápida (Spreadsheet activo)
      ss = SpreadsheetApp.getActiveSpreadsheet();
      // Si el script es 'Standalone', ss será null, forzamos error para ir al catch
      if (!ss) throw new Error("No active SS"); 
    } catch (err) {
      // Intento 2: Vía segura (Por ID)
      // Asegúrate de que DATA_SS_ID esté definido globalmente
      ss = SpreadsheetApp.openById(DATA_SS_ID);
    }

    // Configuración: Si está en el mismo libro que los datos, usamos 'ss'
    const ssConfig = (typeof CONFIG_SS_ID !== 'undefined' && CONFIG_SS_ID !== DATA_SS_ID) 
                     ? SpreadsheetApp.openById(CONFIG_SS_ID) 
                     : ss;

    const configSheet = ssConfig.getSheetByName(CONFIG_SHEET_NAME);
    const dataSheet = ss.getSheetByName(tableName);

    // Validaciones de existencia
    if (!dataSheet) throw new Error("La tabla '" + tableName + "' no existe en el archivo.");
    if (!configSheet) throw new Error("La hoja de configuración '" + CONFIG_SHEET_NAME + "' no existe.");

    // 3. PROCESAMIENTO DE CONFIGURACIÓN (ConfigViewTB)
    const configRows = configSheet.getDataRange().getValues().slice(1);
    const configMap = {};
    const availableTables = [];
    const rawConfigForFrontend = []; 

    configRows.forEach(row => {
      const appTienda = String(row[0]).trim();
      const nombreTabla = String(row[1]).trim();
      
      if (appTienda === userTienda) {
        if (!availableTables.includes(nombreTabla)) availableTables.push(nombreTabla);
        
        if (nombreTabla === tableName) {
          const headerOriginal = String(row[2]).trim();
          const configObj = {
            ID_Columna: headerOriginal,
            Tabla: nombreTabla,
            Nombre_Encabezado: String(row[3] || "").trim(),
            Visible_Encabezado: String(row[4] || "").trim(),
            Alineacion: String(row[5] || "left").trim()
          };
          configMap[headerOriginal] = configObj;
          rawConfigForFrontend.push(configObj);
        }
      }
    });

    // 4. PROCESAMIENTO DE DATOS Y COLUMNAS
    const fullData = dataSheet.getDataRange().getValues();
    if (fullData.length === 0) throw new Error("La tabla de datos está vacía.");
    
    const originalHeaders = fullData[0];
    const tablePrefix = tableName.split('_')[0].toUpperCase();

    const finalHeaders = [];
    const finalDisplayMap = {};
    const finalAlignMap = {};
    const colIndexesToFetch = [];

    originalHeaders.forEach((headerName, index) => {
      const cleanH = String(headerName).trim();
      const config = configMap[cleanH];
      const isPK = cleanH.toUpperCase() === `${tablePrefix}ID`;

      // REGLA DE FILTRADO DINÁMICO
      const shouldInclude = ignoreVisibility || (config && config.Visible_Encabezado !== "") || isPK;

      if (shouldInclude) {
        finalHeaders.push(cleanH);
        finalDisplayMap[cleanH] = (config && config.Nombre_Encabezado) ? config.Nombre_Encabezado : cleanH;
        finalAlignMap[cleanH] = (config && (config.Alineacion || 'left')).toLowerCase();
        colIndexesToFetch.push(index);
      }
    });

    // 5. CONSTRUCCIÓN DE LA RESPUESTA JSON
    const data = fullData.slice(1).map(row => {
      const obj = {};
      colIndexesToFetch.forEach((colIdx, i) => {
        obj[finalHeaders[i]] = row[colIdx];
      });
      return obj;
    });

    return createJsonResponse({
      success: true,
      data: data,
      columnOrder: finalHeaders,
      displayMap: finalDisplayMap,
      alignMap: finalAlignMap,
      config: rawConfigForFrontend, 
      availableTables: availableTables
    });

  } catch (err) {
    console.error("Error crítico en doGet: " + err.toString());
    return createJsonResponse({ 
      success: false, 
      error: err.toString(),
      message: "Fallo en la sincronización de datos."
    });
  }
}

/**
 * Lee metadatos de ConfigViewTB sin interferir con la data principal.
 */
function getTableConfigMetadata(tableName) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG_SS_ID);
    const sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
    if (!sheet) return { success: false, message: "Hoja de configuración no hallada." };

    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const config = values.slice(1)
      .map(row => {
        let obj = {};
        headers.forEach((h, i) => obj[h.trim()] = row[i]);
        return obj;
      })
      .filter(c => String(c.Tabla).trim().toUpperCase() === String(tableName).trim().toUpperCase());
    
    return { success: true, config: config };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Función estable para leer datos de cualquier tabla.
 */
/**
 * Función estable para leer datos y listar tablas disponibles.
 */
function readTableData(tableName) {
  try {
    const ssData = SpreadsheetApp.openById(DATA_SS_ID);
    const ssConfig = SpreadsheetApp.openById(CONFIG_SS_ID);
    
    // 1. Obtener todas las hojas para el selector
    const availableTables = ssData.getSheets()
      .map(s => s.getName())
      .filter(name => !name.includes('Config') && name !== 'Logs');

    // 2. Obtener los Datos de la Tabla
    const sheet = ssData.getSheetByName(tableName);
    if (!sheet) return { success: false, message: "No existe: " + tableName, availableTables: availableTables };
    
    const rawData = sheet.getDataRange().getValues();
    const headers = rawData[0];
    const jsonData = rawData.slice(1).map(row => {
      let obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });

    // 3. OBTENER CONFIGURACIÓN (ConfigViewTB) - Crucial para los nombres amigables
    const configSheet = ssConfig.getSheetByName(CONFIG_SHEET_NAME);
    let configData = [];
    if (configSheet) {
      const cValues = configSheet.getDataRange().getValues();
      const cHeaders = cValues[0];
      configData = cValues.slice(1)
        .map(row => {
          let obj = {};
          cHeaders.forEach((h, i) => obj[h.trim()] = row[i]);
          return obj;
        })
        // Filtramos para enviar solo la configuración de la tabla actual
        .filter(c => String(c.Tabla).trim().toUpperCase() === String(tableName).trim().toUpperCase());
    }

    return { 
      success: true, 
      data: jsonData, 
      config: configData, // <--- AQUÍ SE ENVÍA EL rawConfig QUE EL FRONTEND NECESITA
      availableTables: availableTables 
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getUniqueColumnValues(tableName, columnName) {
  try {
    const ss = SpreadsheetApp.openById(DATA_SS_ID);
    const sheet = ss.getSheetByName(tableName);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const colIndex = headers.indexOf(columnName);
    if (colIndex === -1) return { success: false, message: "Columna no hallada." };

    const rawValues = data.slice(1)
      .map(row => row[colIndex])
      .filter(cell => cell !== "" && cell !== null && cell !== undefined);

    const uniqueValues = [...new Set(rawValues)].sort((a, b) => 
      String(a).localeCompare(String(b), undefined, { numeric: true })
    );

    return { success: true, data: uniqueValues };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const params = e.parameter;
    
    // VALIDACIÓN DE PARÁMETROS CRÍTICOS
    if (!params.TABLA_DESTINO || !params.CAMPO_CLAVE) {
      return createJsonResponse({ 
        success: false, 
        message: "Error de protocolo: Faltan parámetros críticos (TABLA_DESTINO o CAMPO_CLAVE)." 
      });
    }

    const action = params.action;
    
    if (action === "registerDynamicDataTD") {
      return handleDynamicDataTD(params, "REGISTER");
    } 
    else if (action === "editDynamicDataTD") {
      return handleDynamicDataTD(params, "EDIT");
    }
    
    return createJsonResponse({ success: false, message: "Acción no reconocida." });

  } catch (err) {
    return createJsonResponse({ success: false, message: "Error en Servidor: " + err.toString() });
  }
}

/**
 * Ejecuta esta función manualmente una vez para actualizar la columna TD101_NOMBRE_C
 */
function ejecutarActualizacionManualNombres() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('TD101_BASIC');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // Localizar índices de columnas
  const idx1 = headers.indexOf('TD101NOMBRE1');
  const idx2 = headers.indexOf('TD101NOMBRE2');
  const idxC = headers.indexOf('TD101NOMBREC');

  if (idx1 === -1 || idx2 === -1 || idxC === -1) {
    Logger.log("Error: No se encontraron las columnas necesarias.");
    return;
  }

  const updates = [];

  // Procesar cada fila (saltando el encabezado)
  for (let i = 1; i < data.length; i++) {
    const val1 = data[i][idx1];
    const val2 = data[i][idx2];

    const n1Procesado = transformarNombreEspecial(val1, false);
    const n2Procesado = transformarNombreEspecial(val2, true);
    
    const nombreCombinado = (n1Procesado + " " + n2Procesado).trim();
    
    // Guardamos la actualización para la celda específica [fila, columna]
    // i + 1 porque las filas en Sheets empiezan en 1
    // idxC + 1 porque las columnas empiezan en 1
    sheet.getRange(i + 1, idxC + 1).setValue(nombreCombinado);
  }
  
  Logger.log("Proceso completado con éxito.");
}

/**
 * Tu lógica de transformación con excepciones
 */
function transformarNombreEspecial(valor, esNombre2) {
  if (!valor) return "";
  let str = String(valor).trim();
  
  // Regla especial para apóstrofe en apellidos (Ej: O'connor)
  if (esNombre2 && str.includes("'")) {
    return str.split("'").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("'");
  }

  let partes = str.split(/\s+/);
  if (partes.length === 0) return "";

  const conectores = ["de", "del", "los", "la", "las"];
  let resultado = "";
  let i = 0;

  // Primer nombre
  resultado += partes[i].charAt(0).toUpperCase() + partes[i].slice(1).toLowerCase();
  i++;

  // Conectores e inicial
  while (i < partes.length) {
    let palabraActual = partes[i].toLowerCase();
    if (conectores.includes(palabraActual)) {
      resultado += " " + palabraActual;
      i++;
    } else {
      resultado += " " + partes[i].charAt(0).toUpperCase() + ".";
      break; 
    }
  }
  return resultado;
}
