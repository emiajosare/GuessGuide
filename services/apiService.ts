
import { Property, CheckRecord, CheckType } from '../types';
import { MOCK_PROPERTIES } from '../constants';

const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbx5XZVcY0NzYRNe1VdWeVt9l3JJpuN-Gow8z6O-VW2Vk3sRyjHIASZ3A9F3j9Pd9SZn5Q/exec';

async function safeJsonFetch(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, {
      ...options,
      mode: 'cors',
      redirect: 'follow' 
    });
    
    const text = await response.text();
    console.log("[API DEBUG] Raw response:", text);

    if (!text || text.includes('<!DOCTYPE')) {
      return { error: "Invalid response from server (HTML instead of JSON)" };
    }

    return JSON.parse(text);
  } catch (error) {
    console.error("[API ERROR]", error);
    return { error: "Network error" };
  }
}

export const apiService = {
  getPropertyById: async (property_id: string): Promise<Property | null> => {
    const data = await safeJsonFetch(`${API_BASE_URL}?action=getPropertyById&property_id=${encodeURIComponent(property_id)}`);
    if (!data || data.error) return MOCK_PROPERTIES.find(p => p.property_id === property_id) || null;
    return { ...data, acceso_temp: data['acceso-temp'] || data.acceso_temp };
  },

  getPropertyByCode: async (codigo_reserva: string): Promise<Property | null> => {
    const data = await safeJsonFetch(`${API_BASE_URL}?action=getPropertyByReserva&codigo_reserva=${encodeURIComponent(codigo_reserva)}`);
    if (!data || data.error) return MOCK_PROPERTIES.find(p => p.codigo_reserva.toUpperCase() === codigo_reserva.toUpperCase()) || null;
    return { ...data, acceso_temp: data['acceso-temp'] || data.acceso_temp };
  },

  registerCheck: async (data: { property_id: string; codigo_reserva?: string; tipo: CheckType; nombre_huesped?: string; }): Promise<CheckRecord | null> => {
    const result = await safeJsonFetch(API_BASE_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'registerCheck', ...data })
    });
    
    if (result && !result.error) {
      return {
        ...result,
        tipo: result.tipo || data.tipo
      };
    }
    return null;
  },

  updateProperty: async (property_id: string, updates: Partial<Property>): Promise<boolean> => {
    const result = await safeJsonFetch(API_BASE_URL, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'updateProperty', 
        property_id, 
        updates 
      })
    });
    return !!(result && result.success);
  }
};
