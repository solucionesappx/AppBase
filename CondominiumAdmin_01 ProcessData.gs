/**
 * Manejador Unificado para Registro y Edición TD101.
 */
function handleDynamicDataTD(params, mode) {
  const ss = SpreadsheetApp.openById(DATA_SS_ID);
  const sheet = ss.getSheetByName(params.TABLA_DESTINO);
  
  if (!sheet) {
    return createJsonResponse({ success: false, message: 'Tabla no encontrada: ' + params.TABLA_DESTINO });
  }

  const fullData = sheet.getDataRange().getValues();
  const headers = fullData[0];
  const timestamp = Utilities.formatDate(new Date(), "GMT-4", "dd/MM/yyyy HH:mm:ss");
  
  // 1. Identificación de Prefijo y Campos Clave
  // Extrae "TD101" de "TD101_BASIC" o similares
  const prefixMatch = params.TABLA_DESTINO.match(/^[A-Z]+\d+/);
  // const tablePrefix = prefixMatch ? prefixMatch[0].toUpperCase() : "TD101";
  const tablePrefix = params.TABLA_DESTINO.split('_')[0].toUpperCase();
  const campoClave = params.CAMPO_CLAVE || `${tablePrefix}ID`;
  const campoIdNombre = `${tablePrefix}IDNOMBRE`;
  const campoLoc = `${tablePrefix}LOC`;
  
  const idColIndex = headers.indexOf(campoClave);
  const idNombreIndex = headers.indexOf(campoIdNombre);
  const locIndex = headers.indexOf(campoLoc);

  if (idColIndex === -1) {
    return createJsonResponse({ success: false, message: 'Error estructural: No se halló la columna ' + campoClave });
  }

  let rowIndex = -1;
  let newGeneratedId = null;

  // --- LÓGICA DE REGISTRO NUEVO ---
  if (mode === "REGISTER") {
    // A. Validar Duplicados (Identidad + Localidad)
    const nuevoIdNombre = String(params[campoIdNombre] || '').trim().toUpperCase();
    const nuevoLoc = String(params[campoLoc] || '').trim().toUpperCase();

    const existeDuplicado = fullData.slice(1).some(row => 
      String(row[idNombreIndex]).trim().toUpperCase() === nuevoIdNombre &&
      String(row[locIndex]).trim().toUpperCase() === nuevoLoc
    );

    if (existeDuplicado) {
      return createJsonResponse({ 
        success: false, 
        message: `La Identidad ${nuevoIdNombre} ya existe para el Local ${nuevoLoc}.` 
      });
    }

    // B. Generar Correlativo
    try {
      newGeneratedId = generateNextIDInternal(fullData, tablePrefix);
    } catch (e) {
      return createJsonResponse({ success: false, message: 'Error correlativo: ' + e.message });
    }
  } 
  // --- LÓGICA DE EDICIÓN ---
  else {
    const rawIdValue = params[campoClave] || params.ID_VALUE; // Respaldo de valor
    // Limpieza crítica: convertimos a número puro eliminando puntos de miles
    const valorAValidar = Number(String(rawIdValue).replace(/[.,\s]/g, ''));

    if (isNaN(valorAValidar)) {
      return createJsonResponse({ success: false, message: 'ID no válido para búsqueda numérica.' });
    }

    // Búsqueda en la columna ID
    for (let i = 1; i < fullData.length; i++) {
      const cellValue = Number(String(fullData[i][idColIndex]).replace(/[.,\s]/g, ''));
      if (cellValue === valorAValidar) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return createJsonResponse({ success: false, message: `Registro ID ${valorAValidar} no encontrado.` });
    }
  }

  // --- 2. PREPARACIÓN DE LA FILA DE DATOS ---
  const rowValues = (mode === "EDIT") ? fullData[rowIndex - 1] : new Array(headers.length).fill("");

  headers.forEach((header, index) => {
    const cleanH = header.trim();
    
    // Asignación de ID (Solo en creación)
    if (cleanH === campoClave && mode === "REGISTER") {
      rowValues[index] = newGeneratedId;
    }
    // Auditoría: Usuario
    else if (cleanH === `${tablePrefix}RegistroUser`) {
      rowValues[index] = params[cleanH] || params.currentUser || "SISTEMA"; 
    }
    // Auditoría: Fecha
    else if (cleanH === `${tablePrefix}RegistroData`) {
      rowValues[index] = timestamp;
    }
    // Datos del formulario
    else if (params[cleanH] !== undefined) {
      let val = params[cleanH];
      
      // Si el valor parece un número (y no es un campo de texto largo), lo guardamos como número
      if (typeof val === "string" && val !== "" && !isNaN(val.replace(/[.,\s]/g, ''))) {
          // Solo convertimos si no es el campo de Identidad Nombre (que puede ser numérico pero es texto)
          if (cleanH !== campoIdNombre) {
            val = Number(val.replace(/[.,\s]/g, ''));
          }
      }
      rowValues[index] = val;
    }
  });

  // --- 3. ESCRITURA EN HOJA ---
  try {
    if (mode === "REGISTER") {
      sheet.appendRow(rowValues);
    } else {
      sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
    }
  } catch (e) {
    return createJsonResponse({ success: false, message: 'Error al escribir en la hoja: ' + e.toString() });
  }

  // Responder con los datos actualizados para sincronizar Frontend
  const responseObj = {};
  headers.forEach((h, i) => responseObj[h.trim()] = rowValues[i]);

  return createJsonResponse({ 
    success: true, 
    message: mode === "EDIT" ? 'Registro actualizado.' : 'Registro creado con ID ' + newGeneratedId,
    data: responseObj 
  });
}

/**
 * Calcula el siguiente ID basado en los rangos definidos por prefijo.
 * Limpia puntos y formatos antes de procesar.
 */
function generateNextIDInternal(fullData, prefix) {
  // 1. Definir rango (ej: TD101 -> inicial 1011001)
  // Usamos el número del prefijo (ej: 101) + 1001
  const numericPrefix = prefix.replace(/\D/g, ""); // Extrae "101" de "TD101"
  const rangeStart = parseInt(numericPrefix + "1001");
  const rangeEnd = parseInt(numericPrefix + "9999");
  
  console.log("Generando ID para prefijo: " + prefix + " (Rango: " + rangeStart + " - " + rangeEnd + ")");

  // 2. Extraer IDs de la primera columna (índice 0)
  const ids = fullData.slice(1).map(row => {
    if (!row[0]) return null;
    // Limpiar puntos, espacios y convertir a número
    const cleanId = String(row[0]).replace(/[.,\s]/g, "");
    const numId = parseInt(cleanId);
    return isNaN(numId) ? null : numId;
  }).filter(id => id !== null);

  // 3. Filtrar IDs que pertenecen a este rango específico
  const validIds = ids.filter(id => id >= rangeStart && id <= rangeEnd);

  // 4. Calcular el máximo
  if (validIds.length === 0) {
    return rangeStart;
  }

  const maxId = Math.max(...validIds);
  const nextId = maxId + 1;

  if (nextId > rangeEnd) {
    throw new Error("Rango de IDs agotado para el prefijo " + prefix);
  }

  return nextId;
}

