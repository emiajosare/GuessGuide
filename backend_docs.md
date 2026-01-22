
# Backend GuestGuide V9 - Soporte para Edición

Este código permite que el dueño actualice los datos de la propiedad directamente desde la aplicación.

### Instrucciones
1. Abre tu Google Sheet > **Extensiones > Apps Script**.
2. Reemplaza todo el código por el de abajo.
3. **Importante**: Dale a **Implementar > Nueva implementación** (Versión: Nueva).

```javascript
/**
 * GUESTGUIDE BACKEND V9 - UPDATE CAPABILITY
 */
const SPREADSHEET_ID = ''; // Si está vacío, usa el activo

function getSS() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== '') {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = getSS();
    const sheet = ss.getSheetByName('properties');
    if (!sheet) return createResponse({error: 'Hoja properties no encontrada'});
    const data = getSheetData(sheet);

    if (action === 'getPropertyById') {
      const propId = e.parameter.property_id;
      const result = data.find(p => String(getVal(p, 'property_id')) === String(propId));
      return createResponse(result || {error: 'ID no encontrado'});
    }

    if (action === 'getPropertyByReserva') {
      const code = e.parameter.codigo_reserva;
      const result = data.find(p => String(getVal(p, 'codigo_reserva')).toUpperCase() === String(code).toUpperCase());
      return createResponse(result || {error: 'Reserva no encontrada'});
    }
    return createResponse({error: 'Acción no válida'});
  } catch (err) {
    return createResponse({error: err.message});
  }
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    const ss = getSS();

    // ACCIÓN: REGISTRAR CHECK-IN/OUT
    if (action === 'registerCheck') {
      const checkSheet = ss.getSheetByName('checkins_checkouts');
      const propSheet = ss.getSheetByName('properties');
      const timestamp = new Date();
      const registroId = 'REG-' + timestamp.getTime();
      const propData = getSheetData(propSheet);
      const currentProp = propData.find(p => String(getVal(p, 'property_id')) === String(contents.property_id));
      const accesoCode = currentProp ? (getVal(currentProp, 'acceso-temp') || 'N/A') : 'N/A';

      if (checkSheet) {
        checkSheet.appendRow([
          registroId, contents.property_id, contents.codigo_reserva || 'N/A',
          contents.tipo, Utilities.formatDate(timestamp, "GMT-5", "yyyy-MM-dd HH:mm:ss"),
          contents.nombre_huesped || 'Anónimo', accesoCode 
        ]);
      }
      return createResponse({ registro_id: registroId, tipo: contents.tipo, acceso_temp: accesoCode, success: true });
    }

    // ACCIÓN: ACTUALIZAR DATOS DE PROPIEDAD (NUEVO V9)
    if (action === 'updateProperty') {
      const sheet = ss.getSheetByName('properties');
      const values = sheet.getDataRange().getValues();
      const headers = values[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
      const propIdCol = headers.indexOf('propertyid');
      
      let rowIdx = -1;
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][propIdCol]) === String(contents.property_id)) {
          rowIdx = i + 1;
          break;
        }
      }

      if (rowIdx === -1) return createResponse({error: 'Propiedad no encontrada para actualizar'});

      // Actualizar cada campo enviado que coincida con un header
      const updates = contents.updates;
      Object.keys(updates).forEach(key => {
        const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const colIdx = headers.indexOf(normKey);
        if (colIdx !== -1) {
          sheet.getRange(rowIdx, colIdx + 1).setValue(updates[key]);
        }
      });

      return createResponse({success: true, message: 'Propiedad actualizada correctamente'});
    }

    return createResponse({error: 'Acción POST no válida'});
  } catch (err) {
    return createResponse({error: err.message});
  }
}

function getVal(obj, key) {
  const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  const actualKey = Object.keys(obj).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normKey);
  return actualKey ? obj[actualKey] : null;
}

function getSheetData(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  const results = [];
  for (let i = 1; i < values.length; i++) {
    const item = {};
    headers.forEach((h, index) => item[h] = values[i][index]);
    if (String(values[i][0]).trim() !== "") results.push(item);
  }
  return results;
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```
