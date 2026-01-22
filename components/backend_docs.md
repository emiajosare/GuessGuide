
# Código del Backend (Google Apps Script)

Crea un nuevo proyecto en [script.google.com](https://script.google.com/), pega este código y **publícalo como Aplicación Web** (Acceso: "Anyone").

```javascript
/**
 * BACKEND PARA GUESTGUIDE
 * Maneja lectura de propiedades y registro de Check-ins/outs
 */

const SPREADSHEET_ID = 'TU_ID_DE_GOOGLE_SHEET_AQUI';

function doGet(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('properties');
  const data = getSheetData(sheet);

  if (action === 'getPropertyById') {
    const propId = e.parameter.property_id;
    const result = data.find(p => String(p.property_id) === String(propId));
    return createResponse(result || {error: 'Not found'});
  }

  if (action === 'getPropertyByReserva') {
    const code = e.parameter.codigo_reserva;
    const result = data.find(p => String(p.codigo_reserva).toUpperCase() === String(code).toUpperCase());
    return createResponse(result || {error: 'Not found'});
  }

  return createResponse({error: 'Invalid action'});
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    
    if (action === 'registerCheck') {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const checkSheet = ss.getSheetByName('checkins_checkouts');
      const propSheet = ss.getSheetByName('properties');
      
      const timestamp = new Date();
      const registroId = 'REG-' + timestamp.getTime();
      
      // Obtener acceso_temp de la hoja de propiedades para el retorno
      const propData = getSheetData(propSheet);
      const currentProp = propData.find(p => String(p.property_id) === String(contents.property_id));
      const accesoCode = currentProp ? currentProp['acceso-temp'] || 'N/A' : 'N/A';

      // Asegúrate de que el orden de las columnas coincida con tu hoja
      // registro_id | property_id | codigo_reserva | tipo | fecha_hora | nombre_huesped | acceso-temp
      checkSheet.appendRow([
        registroId,
        contents.property_id,
        contents.codigo_reserva,
        contents.tipo,
        Utilities.formatDate(timestamp, "GMT-5", "yyyy-MM-dd HH:mm:ss"),
        contents.nombre_huesped || 'Anónimo',
        accesoCode // Guardamos el código que le mostramos al huésped
      ]);
      
      return createResponse({
        registro_id: registroId,
        tipo: contents.tipo,
        fecha_hora: Utilities.formatDate(timestamp, "GMT-5", "yyyy-MM-dd HH:mm:ss"),
        acceso_temp: accesoCode,
        success: true
      });
    }
  } catch (err) {
    return createResponse({error: err.toString(), success: false});
  }
}

function getSheetData(sheet) {
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    headers.forEach((h, index) => {
      obj[h] = rows[i][index];
    });
    data.push(obj);
  }
  return data;
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Estructura de las Hojas de Excel

### 1. Hoja ropert`pies`
Añade una columna al final llamada `acceso-temp` donde pondrás el código de la puerta.

### 2. Hoja `checkins_checkouts`
Asegúrate de que la hoja tenga estas cabeceras en la Fila 1:
1. `registro_id`
2. `property_id`
3. `codigo_reserva`
4. `tipo`
5. `fecha_hora`
6. `nombre_huesped`
7. `acceso-temp` (Nueva columna)
