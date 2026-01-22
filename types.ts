
export type Language = 'es' | 'en';

export interface Property {
  property_id: string;
  codigo_reserva: string;
  nombre_apartamento: string;
  ciudad: string;
  direccion: string;
  foto_portada_url: string;
  wifi_ssid: string;
  wifi_password: string;
  num_habitaciones: number;
  num_banos: number;
  capacidad_personas: number;
  descripcion_corta: string;
  reglas: string;
  guia_uso_json: string; 
  recomendaciones_zona_json: string; 
  whatsapp_number: string;
  phone_number: string;
  host_name: string;      
  host_photo_url: string; 
  acceso_temp?: string; // Campo para la clave temporal desde la propiedad
}

export interface GuiaUso {
  [key: string]: string;
}

export interface Recomendacion {
  nombre: string;
  tipo: string;
  descripcion: string;
  url_mapa: string;
  foto_url?: string;
  direccion?: string;
  telefono?: string;
}

export type CheckType = 'checkin' | 'checkout';

export interface CheckRecord {
  registro_id: string;
  property_id: string;
  codigo_reserva?: string;
  tipo: CheckType;
  fecha_hora: string;
  nombre_huesped?: string;
  notas?: string;
  acceso_temp?: string; 
}

export interface AppTexts {
  welcome: string;
  enter_code: string;
  continue: string;
  wifi: string;
  checkin_checkout: string;
  rules: string;
  guide: string;
  area: string;
  contact: string;
  error_not_found: string;
  loading: string;
  copy_pw: string;
  copied: string;
  show_pw: string;
  hide_pw: string;
  register_checkin: string;
  register_checkout: string;
  guest_name: string;
  optional: string;
  checkin_instructions: string;
  checkout_instructions: string;
  whatsapp_host: string;
  call_host: string;
  emergency_title: string;
  admin_info: string;
  language_label: string;
  success_check: string;
  server_error: string;
  critical_error: string;
  about_place: string;
  rooms: string;
  baths: string;
  guests_cap: string;
  access_code_title: string;
  access_code_desc: string;
  // Admin Panel Keys
  admin_panel_title: string;
  admin_login_title: string;
  admin_master_key: string;
  admin_authenticate: string;
  admin_search_booking: string;
  admin_return_home: string;
  admin_edit_active: string;
  admin_hint: string;
  admin_access_info: string;
  admin_booking_label: string;
  admin_door_label: string;
  admin_property_info: string;
  admin_commercial_name: string;
  admin_address_label: string;
  admin_short_desc_label: string;
  admin_cover_url_label: string;
  admin_host_url_label: string;
  admin_wifi_label: string;
  admin_ssid_label: string;
  admin_password_label: string;
  admin_guide_label: string;
  admin_simple_format: string;
  admin_guide_placeholder: string;
  admin_rules_label: string;
  admin_rules_placeholder: string;
  admin_area_generator: string;
  admin_area_hint: string;
  admin_generate_recs: string;
  admin_searching: string;
  admin_publish_changes: string;
  admin_publishing: string;
  admin_contact_label: string;
  admin_host_name_label: string;
}
