/**
 * @fileoverview Script de Google Apps Script (GAS) consolidado para manejar
 * la lógica de la aplicación web de gestión de usuarios y clientes.
 * Incluye funciones para inicio de sesión, registro, verificación y recuperación de contraseña.
 * * NOTA: Se ha añadido Logger.log() para facilitar la depuración en el entorno de GAS.
 */

// Clave secreta para la encriptación. ¡ADVERTENCIA: Reemplaza esto con una clave segura!
// Por ejemplo, una cadena larga y aleatoria. No la compartas.
const SECRET_KEY = 'YSP_1NOXQgYaJfS3OnCLhpFl0os2qXNTGzwx-yRaK3A39Kd4/';

/**
 * Función para cifrar una cadena de texto usando un algoritmo de hash.
 * @param {string} textToHash El texto a cifrar (ej. la contraseña).
 * @return {string} El hash del texto.
 */
function hashText(textToHash) {
  if (!textToHash) {
    return '';
  }
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, textToHash + SECRET_KEY);
  var hash = '';
  for (i = 0; i < digest.length; i++) {
    var byte = digest[i];
    if (byte < 0) byte += 256;
    var hex = byte.toString(16);
    if (hex.length == 1) hex = '0' + hex;
    hash += hex;
  }
  return hash;
}

/**
 * Función de "una sola ejecución" para migrar y cifrar los datos existentes
 * en la hoja de cálculo.
 * Solo necesitas ejecutar esta función una vez, manualmente, desde el editor de GAS.
 */
function hashExistingUserData() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME1);
    if (!sheet) {
      Logger.log('Hoja de cálculo "Usuarios" no encontrada.');
      return;
    }
    
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();
    var headers = values[0];
    
    var passwordCol = headers.indexOf('Usuario_Clave');
    var securityAnswerCol = headers.indexOf('Usuario_RespuestaSeg');
    
    if (passwordCol === -1 || securityAnswerCol === -1) {
      Logger.log('Faltan columnas de clave o respuesta de seguridad. No se puede cifrar.');
      return;
    }
    
    // Recorrer todas las filas, empezando desde la segunda (para omitir el encabezado)
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      
      // Cifrar la contraseña si no lo está ya
      var currentPassword = row[passwordCol];
      // Un hash SHA-256 tiene una longitud de 64 caracteres.
      if (currentPassword && currentPassword.length !== 64) {
        var hashedPassword = hashText(currentPassword);
        sheet.getRange(i + 1, passwordCol + 1).setValue(hashedPassword);
        Logger.log('Contraseña en la fila ' + (i + 1) + ' cifrada.');
      }
      
      // Cifrar la respuesta de seguridad si no lo está ya
      var currentSecurityAnswer = row[securityAnswerCol];
      if (currentSecurityAnswer && currentSecurityAnswer.length !== 64) {
        var hashedSecurityAnswer = hashText(currentSecurityAnswer);
        sheet.getRange(i + 1, securityAnswerCol + 1).setValue(hashedSecurityAnswer);
        Logger.log('Respuesta de seguridad en la fila ' + (i + 1) + ' cifrada.');
      }
    }
    
    Logger.log('Proceso de cifrado de datos completado.');
    
  } catch (error) {
    Logger.log('Error durante el cifrado de datos: ' + error.message);
  }
}

// ====================================================================
// FUNCIÓN PRINCIPAL DE SERVICIO WEB
// ====================================================================

/**
 * Función principal que recibe solicitudes HTTP POST del frontend.
 * @param {Object} e Objeto de evento de la solicitud POST.
 * @returns {Object} Un objeto ContentService que devuelve una respuesta JSON.
 */
function doPost(e) {
  // Configuración de la hoja de cálculo
  var SPREADSHEET_ID = '1s4N_pwkwPHMWXlNqcG9dQXm9_yg2jdKImkZdmghKIbs';
  var SHEET_NAME1 = 'Usuarios';

  var params = e.parameter;
  var action = params.action;
  
  // --- LOGGING INICIAL ---
  Logger.log('--- Nueva Solicitud POST ---');
  Logger.log('Acción: ' + action);
  Logger.log('Parámetros Recibidos: ' + JSON.stringify(params));
  // --- FIN LOGGING INICIAL ---

  // 1. Acceso y validación de la hoja de cálculo
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME1);
    if (!sheet) {
      return createJsonResponse(false, 'Hoja de cálculo "' + SHEET_NAME1 + '" no encontrada.');
    }
  } catch (error) {
    return createJsonResponse(false, 'Error al acceder a la hoja de cálculo: ' + error.message);
  }

  // 2. Obtener datos, encabezados e índices de columna
  var values = sheet.getDataRange().getValues();
  if (values.length === 0) {
    return createJsonResponse(false, 'La hoja de cálculo está vacía.');
  }
  
  var headers = values[0];

  // Identificar los índices de las columnas por su nombre de encabezado
  var userShopCol = headers.indexOf('Usuario_Tienda');
  var userShopIDCol = headers.indexOf('Usuario_Tienda_ID');
  var userEmailCol = headers.indexOf('Usuario_Correo');
  var passwordCol = headers.indexOf('Usuario_Clave');
  var userPhoneCol = headers.indexOf('Usuario_Telefono');
  var userNameCol = headers.indexOf('Usuario_Nombre');
  var userPerfilCol = headers.indexOf('Usuario_Perfil');
  var userIDCol = headers.indexOf('Usuario_ID');
  var userIdxCol = headers.indexOf('Usuario_Idx');
  var userStatusCol = headers.indexOf('Usuario_Estatus');
  var userPreguntaCol = headers.indexOf('Usuario_PreguntaSeg');
  var userRespuestaCol = headers.indexOf('Usuario_RespuestaSeg');
  var userLastUpdateCol = headers.indexOf('Usuario_LastUpdate');
  
  // INDICE DE COLUMNA CLAVE (PARA LA BÚSQUEDA FLEXIBLE Y UNICIDAD)
  var userIDCol = headers.indexOf('Usuario_ID'); 

  // 3. Validar que todas las columnas esenciales existan
  if (
    userEmailCol === -1 ||
    passwordCol === -1 ||
    userShopCol === -1 ||
    userShopIDCol === -1 ||
    userNameCol === -1 ||
    userIDCol === -1 ||
    userStatusCol === -1 ||
    userPreguntaCol === -1 ||
    userEmailCol === -1 ||
    userPhoneCol === -1 ||
    userRespuestaCol === -1
    // Otros campos pueden ser opcionales, pero estos son cruciales para el login/registro
  ) {
    var errorMsg = 'Faltan una o más columnas esenciales (e.g., "Usuario_Correo", "Usuario_Clave", "Usuario_Tienda", "Usuario_Nombre", "Usuario_ID").';
    Logger.log('Error: ' + errorMsg);
    return createJsonResponse(false, errorMsg);
  }

  // 4. Lógica principal basada en la acción recibida
  switch (action) {
    // ----------------------------------------------------------------
    // CASO 'LOGIN': Búsqueda flexible (Correo O ID) + Clave + Tienda
    // ----------------------------------------------------------------
case 'login':
      var userCredential = String(params.Usuario_Credencial || '').trim().toLowerCase(); // Correo o ID
      var password = String(params.Usuario_Clave || ''); 
      var appTienda = String(params.Usuario_Tienda || '').trim().toLowerCase();
      
      Logger.log('Intentando login con Credencial: ' + userCredential + ', Tienda: ' + appTienda);

      for (var i = 1; i < values.length; i++) {
        var row = values[i];
        var sheetUserEmail = String(row[userEmailCol] || '').trim().toLowerCase();
        var sheetUserID = String(row[userIDCol] || '').trim().toLowerCase(); 
        var sheetPassword = String(row[passwordCol] || '');
        var sheetAppTienda = String(row[userShopCol] || '').trim().toLowerCase();
        var sheetUserStatus = String(row[userStatusCol] || '').trim();
        
        // Criterio de Búsqueda Flexible: Correo O ID
        var credentialMatch = (sheetUserEmail === userCredential || sheetUserID === userCredential);

        // VALIDACIÓN DE CREDENCIAL Y TIENDA
        if (credentialMatch && sheetAppTienda === appTienda) {
          
          // Validación de Estatus (Activo)
          if (sheetUserStatus !== 'Activo') {
              Logger.log('Login fallido: Usuario inactivo (' + userCredential + '). Estatus: ' + sheetUserStatus);
              return createJsonResponse(false, 'Su cuenta se encuentra inactiva. Contacte o espere respuesta del administrador.');
          };

          // VALIDACIÓN DE CLAVE EN TEXTO PLANO
          if (sheetPassword === password) {
            
            // Recuperar datos del usuario para la respuesta
            var userData = {
              Usuario_Tienda: row[userShopCol] || '', 
              Usuario_Tienda_ID: row[userShopIDCol] || '', 
              Usuario_Nombre: row[userNameCol] || '',
              Usuario_Correo: row[userEmailCol] || '', // CRÍTICO: Correo Añadido
              Usuario_Telefono: row[userPhoneCol] || '', // CRÍTICO: Teléfono Añadido
              Usuario_Perfil: userPerfilCol !== -1 ? (row[userPerfilCol] || '') : '',
              Usuario_ID: row[userIDCol] || '',
              Usuario_PreguntaSeg: row[userPreguntaCol] || '',
              Usuario_RespuestaSeg: row[userRespuestaCol] || '',
              Usuario_Idx: userIdxCol !== -1 ? (row[userIdxCol] || '') : ''
            };
            
            Logger.log('Login exitoso. Datos del usuario: ' + JSON.stringify(userData));
            return createJsonResponse(true, 'Autenticación exitosa.', null, userData);
            
          } else {
            Logger.log('Login fallido: Contraseña incorrecta para ' + userCredential);
            return createJsonResponse(false, 'Contraseña incorrecta.');
          }
        }
      }
      
      Logger.log('Login fallido: Credencial (' + userCredential + ') no encontrada en la tienda ' + appTienda);
      return createJsonResponse(false, 'Credencial o Usuario no encontrado en esta tienda.');
      
    // ----------------------------------------------------------------
    // CASO 'FORGOTPASSWORD': Recuperación de contraseña
    // ----------------------------------------------------------------
    case 'forgotPassword':
      var userEmail = String(params.Usuario_Correo || '').trim().toLowerCase();
      var userPhone = formatPhoneNumber(String(params.Usuario_Telefono || ''));
      var appTienda = String(params.Usuario_Tienda || '').trim().toLowerCase();
      
      Logger.log('Intentando forgotPassword con Correo: ' + userEmail + ', Teléfono: ' + userPhone);

      // Define el índice de la columna de la contraseña.
      var userPasswordCol = passwordCol; 

      // Iterar sobre todos los valores para encontrar el usuario
      for (var i = 1; i < values.length; i++) {
        var row = values[i];
        var sheetUserEmail = String(row[userEmailCol] || '').trim().toLowerCase();
        var sheetUserPhone = formatPhoneNumber(String(row[userPhoneCol] || ''));
        var sheetAppTienda = String(row[userShopCol] || '').trim().toLowerCase();

        if (sheetUserEmail === userEmail && sheetAppTienda === appTienda) {
          if (sheetUserPhone === userPhone) {
            // Busca y guarda la contraseña existente
            var userPassword = row[userPasswordCol];
            
            Logger.log('Recuperación exitosa. Contraseña (hash o plano): ' + userPassword);
            return createJsonResponse(true, 'Recuperación de contraseña exitosa.', userPassword);
          } else {
            Logger.log('Recuperación fallida: Número de teléfono incorrecto para el usuario ' + userEmail);
            return createJsonResponse(false, 'Número de teléfono incorrecto.');
          }
        }
      }
      Logger.log('Recuperación fallida: Usuario no encontrado en la tienda ' + appTienda);
      return createJsonResponse(false, 'Usuario no encontrado en esta tienda.');

    // ----------------------------------------------------------------
    // CASO 'SIGNUP': Creación de usuario con validación de unicidad
    // ----------------------------------------------------------------
    case 'signup':
      var userEmail = String(params.Usuario_Correo || '').trim().toLowerCase();
      var userPhone = formatPhoneNumber(String(params.Usuario_Telefono || ''));
      var appTienda = String(params.Usuario_Tienda || '').trim().toLowerCase();
      var userID = String(params.Usuario_ID || '').trim().toLowerCase();
      var password = String(params.Usuario_Clave || '');
      
      Logger.log('Intentando registro con Correo: ' + userEmail + ', ID: ' + userID + ', Teléfono: ' + userPhone + ', Tienda: ' + appTienda);

      // --- VALIDACIONES DE DUPLICADOS ---
      
      var filteredValues = values.slice(1).filter(function (row) {
        return String(row[userShopCol] || '').trim().toLowerCase() === appTienda;
      });
      
      if (isDuplicate(filteredValues, userEmailCol, userEmail)) { 
        return createJsonResponse(false, 'El correo electrónico ya está registrado en esta tienda.');
      }
      
      if (isDuplicate(filteredValues, userIDCol, userID)) { 
        return createJsonResponse(false, 'El ID de usuario ya está registrado en esta tienda.');
      }

      if (userPhoneCol !== -1 && isDuplicate(filteredValues, userPhoneCol, userPhone)) {
        return createJsonResponse(false, 'El teléfono ya está registrado en esta tienda.');
      }

      // --- GENERACIÓN DE CAMPOS ADICIONALES ---
      
      // 1. UsuarioRegName: Si el parámetro no viene, se usa el Usuario_ID del nuevo usuario.
      var usuarioRegName = String(params.UsuarioRegName || '').trim();
      if (!usuarioRegName) {
          usuarioRegName = userID; // Si no hay registrador externo, el propio ID del usuario se registra
      }

      // 2. UsuarioRegDate: Formato dd/mm/yyyy hh:mm:ss
      var now = new Date();
      var usuarioRegDate = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");

      // 3. Crear la nueva fila de datos
      var rowDataMap = {};
      rowDataMap['Usuario_Tienda'] = String(params.Usuario_Tienda || '');
      rowDataMap['Usuario_Tienda_ID'] = String(params.Usuario_Tienda_ID || '');
      rowDataMap['Usuario_ID'] = userID;
      rowDataMap['Usuario_Nombre'] = toTitleCase(String(params.Usuario_Nombre || ''));
      rowDataMap['Usuario_Correo'] = userEmail;
      rowDataMap['Usuario_Telefono'] = userPhone;
      rowDataMap['Usuario_Clave'] = password;
      rowDataMap['Usuario_Idx'] = String(params.Usuario_Idx || '');
      rowDataMap['Usuario_PreguntaSeg'] = String(params.Usuario_PreguntaSeg || '');
      rowDataMap['Usuario_RespuestaSeg'] = String(params.Usuario_RespuestaSeg || '');
      rowDataMap['Usuario_Estatus'] = 'Pendiente'; 
      rowDataMap['Usuario_Perfil'] = 'Cliente'; 
      rowDataMap['Usuario_RegDate'] = usuarioRegDate; // **FECHA Y FORMATO CORREGIDOS**
      rowDataMap['Usuario_RegName'] = usuarioRegName; // **LÓGICA CORREGIDA**

      var newRow = [];
      // Llenar el array newRow en el orden de los encabezados
      for (var j = 0; j < headers.length; j++) {
          var header = headers[j];
          newRow.push(rowDataMap[header] !== undefined ? rowDataMap[header] : '');
      }

      var nextRow = sheet.getLastRow() + 1;
      var range = sheet.getRange(nextRow, 1, 1, newRow.length);
      range.setValues([newRow]);
      
      Logger.log('Registro exitoso en la fila: ' + nextRow);
      return createJsonResponse(true, 'Registro exitoso.');

    // ----------------------------------------------------------------
    // CASO 'EDITPROFILE': Actualización de datos del usuario
    // ----------------------------------------------------------------
    case 'editProfile':
        var userCurrentEmail = String(params.Usuario_Correo_Actual || '').trim().toLowerCase(); // Correo usado para encontrar el usuario
        var appTienda = String(params.Usuario_Tienda || '').trim().toLowerCase();
        
        // Nuevos valores a actualizar
        var newEmail = String(params.Usuario_Correo || '').trim().toLowerCase();
        var newPhone = formatPhoneNumber(String(params.Usuario_Telefono || ''));
        var newPassword = String(params.Usuario_Clave || '');
        var newPreguntaSeg = String(params.Usuario_PreguntaSeg || '');
        var newRespuestaSeg = String(params.Usuario_RespuestaSeg || '');
        
        Logger.log('Intentando editar perfil para Correo actual: ' + userCurrentEmail + ', Tienda: ' + appTienda);

        // 1. Encontrar la fila del usuario
        for (var i = 1; i < values.length; i++) {
            var row = values[i];
            var sheetUserEmail = String(row[userEmailCol] || '').trim().toLowerCase();
            var sheetAppTienda = String(row[userShopCol] || '').trim().toLowerCase();

            // **VALIDACIÓN:** Encontrar la fila por Correo Actual y Tienda
            if (sheetUserEmail === userCurrentEmail && sheetAppTienda === appTienda) {
                
                // 2. Opcional: Validar unicidad del nuevo correo si es diferente
                if (newEmail !== sheetUserEmail) {
                    // Filtrar por nuevo correo, excluyendo la fila actual (i)
                    var emailExists = values.slice(1).some(function(otherRow, index) {
                        return (i !== (index + 1) && String(otherRow[userEmailCol] || '').trim().toLowerCase() === newEmail);
                    });
                    if (emailExists) {
                        return createJsonResponse(false, 'El nuevo correo electrónico ya está registrado por otro usuario.');
                    }
                }

                // 3. Generar fecha de actualización
                var now = new Date();
                var lastUpdateDate = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");

                // 4. Aplicar cambios a la hoja de cálculo
                var rowToUpdate = i + 1; // Fila base 1 de la hoja
                
                // Columna de Correo
                sheet.getRange(rowToUpdate, userEmailCol + 1).setValue(newEmail);
                
                // Columna de Teléfono
                sheet.getRange(rowToUpdate, userPhoneCol + 1).setValue(newPhone);
                
                // Columna de Clave
                //sheet.getRange(rowToUpdate, passwordCol + 1).setValue(newPassword);
                
                // Columna de Pregunta
                sheet.getRange(rowToUpdate, userPreguntaCol + 1).setValue(newPreguntaSeg);
                
                // Columna de Respuesta
                sheet.getRange(rowToUpdate, userRespuestaCol + 1).setValue(newRespuestaSeg);
                
                // Columna de Última Actualización
                var userLastUpdateCol = headers.indexOf('Usuario_LastUpdate'); // Asegúrate de que este índice esté definido
                if (userLastUpdateCol !== -1) {
                    sheet.getRange(rowToUpdate, userLastUpdateCol + 1).setValue(lastUpdateDate);
                }
                
                Logger.log('Perfil actualizado exitosamente en la fila: ' + rowToUpdate);
                
                // Preparar nuevos datos para actualizar localStorage en el frontend
                var updatedUserData = {
                    Usuario_Tienda: appTienda,
                    Usuario_Tienda_ID: appTienda,
                    Usuario_Nombre: row[userNameCol] || '', // El nombre no cambia en este caso
                    Usuario_Perfil: userPerfilCol !== -1 ? (row[userPerfilCol] || '') : '',
                    Usuario_Idx: userIdxCol !== -1 ? (row[userIdxCol] || '') : '',
                    Usuario_Correo: newEmail, // IMPORTANTE: Enviar el nuevo correo
                    Usuario_PreguntaSeg: newPreguntaSeg,
                    Usuario_RespuestaSeg: newRespuestaSeg
                };

                return createJsonResponse(true, 'Perfil actualizado exitosamente.', null, updatedUserData);
            }
        }
        
        Logger.log('Edición fallida: Usuario (' + userCurrentEmail + ') no encontrado en la tienda ' + appTienda);
        return createJsonResponse(false, 'No se pudo encontrar al usuario para actualizar el perfil.');

    // ----------------------------------------------------------------
    // CASO 'UPDATEPASSWORD': Creación de nueva contraseña
    // ----------------------------------------------------------------
    case 'updatePassword':
      var userEmailToUpdate = String(params.Usuario_Correo || '').trim().toLowerCase();
      var appTienda = String(params.Usuario_Tienda || '').trim().toLowerCase();
      var newPasswordFromClient = params.newPassword;
      
      Logger.log('Intentando updatePassword para Correo: ' + userEmailToUpdate + ', Tienda: ' + appTienda);

      if (!userEmailToUpdate || !appTienda || !newPasswordFromClient) {
          var errorMsg = 'Datos incompletos para actualizar la contraseña.';
          Logger.log('Error: ' + errorMsg);
          return createJsonResponse(false, errorMsg);
      }

      // Generar la marca de tiempo de la actualización
      var now = new Date();
      var lastUpdateDate = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");

      for (var i = 1; i < values.length; i++) {
          var row = values[i];
          var sheetUserEmail = String(row[userEmailCol] || '').trim().toLowerCase();
          var sheetAppTienda = String(row[userShopCol] || '').trim().toLowerCase();

          // **VALIDACIÓN MULTICAMPO:** Correo + Tienda
          if (sheetUserEmail === userEmailToUpdate && sheetAppTienda === appTienda) {
              
              // 1. MODIFICACIÓN: Guardar la nueva contraseña
              sheet.getRange(i + 1, passwordCol + 1).setValue(newPasswordFromClient); 
              
              // 2. REGISTRO: Actualizar el campo Usuario_LastUpdate
              if (userLastUpdateCol !== -1) {
                sheet.getRange(i + 1, userLastUpdateCol + 1).setValue(lastUpdateDate);
              }

              // 3. RECUPERACIÓN DE DATOS para enviar al frontend
              var userData = {
                  Usuario_Tienda: row[userShopCol] || '',
                  Usuario_Nombre: row[userNameCol] || '',
                  Usuario_Perfil: userPerfilCol !== -1 ? (row[userPerfilCol] || '') : '',
                  Usuario_Idx: userIdxCol !== -1 ? (row[userIdxCol] || '') : ''
              };

              Logger.log('Contraseña y fecha de actualización guardadas en la fila: ' + (i + 1));
              return createJsonResponse(true, 'Contraseña actualizada exitosamente.', null, userData);
          }
      }
  }    
      Logger.log('Actualización fallida: Usuario (' + userEmailToUpdate + ') no encontrado en la tienda ' + appTienda);
      return createJsonResponse(false, 'No se pudo encontrar al usuario para actualizar la contraseña.');
}    

// ====================================================================
// FUNCIONES AUXILIARES
// ====================================================================

/**
 * Crea una respuesta JSON estándar para el servicio web.
 * @param {boolean} success Indica si la operación fue exitosa.
 * @param {string} message Mensaje de estado.
 * @param {string} errorCode Código de error (opcional).
 * @param {Object} data Datos a devolver (opcional).
 * @returns {Object} Objeto ContentService con la respuesta JSON.
 */
function createJsonResponse(success, message, newPassword, userData) {
  var result = {
    success: success,
    message: message
  };
  if (newPassword) {
    result.newPassword = newPassword;
  }
  if (userData) {
    result.userData = userData;
  }
  
  // --- LOGGING FINAL ---
  Logger.log('Respuesta JSON Enviada: ' + JSON.stringify(result));
  Logger.log('--- Fin Solicitud POST ---');
  // --- FIN LOGGING FINAL ---
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Crea cadena de carácteres de 5 digitos para ser usado.
 * @return {string} base para contraseña o Usuario_Idx.
 */
  // Nueva función para generar una contraseña aleatoria
function generateNewPassword() {
  var length = 5;
  var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  var result = '';
  for (var i = length; i > 0; --i) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Formatea un número de teléfono (sandbox: solo elimina espacios y guiones).
 * En producción, se usaría una librería de validación más robusta.
 * @param {string} phone El número de teléfono.
 * @returns {string} El número de teléfono formateado.
 */
function formatPhoneNumber(phone) {
  if (!phone) return '';
  return phone.replace(/[\s-]/g, '').trim();
}

/**
 * Convierte una cadena a formato Título (primera letra de cada palabra en mayúscula).
 * @param {string} str La cadena de texto.
 * @returns {string} La cadena en formato título.
 */
function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

/**
 * Verifica si un valor ya existe en una columna específica de un subconjunto de datos.
 * Nota: El conjunto de datos (data) ya debe haber excluido la fila de encabezados.
 * @param {Array<Array<any>>} data Los datos de la hoja (sin encabezados, ya filtrados por tienda).
 * @param {number} columnIndex El índice de la columna a verificar (basado en la matriz, no en el encabezado).
 * @param {string} value El valor a buscar (ya en minúsculas y limpio).
 * @returns {boolean} True si el valor es un duplicado, False en caso contrario.
 */
function isDuplicate(data, columnIndex, value) {
  // El índice de columna debe ser un índice válido de la matriz (0-basado)
  if (columnIndex < 0) return false;

  for (var i = 0; i < data.length; i++) {
    var cellValue = String(data[i][columnIndex] || '').trim().toLowerCase();
    if (cellValue === value) {
      return true; // Duplicado encontrado
    }
  }
  return false; // No es un duplicado
}

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'testConnection') {
    Logger.log('Solicitud GET: testConnection');
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Conexión exitosa al script de Google Apps.' })).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutput('Esta es una aplicación para POST. No hay nada para ver aquí.');
}
