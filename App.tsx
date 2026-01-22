
import React, { useState, useEffect } from 'react';
import { Property, CheckRecord, Recomendacion, GuiaUso, CheckType, Language } from './types';
import { apiService } from './services/apiService';
import { DICTIONARY } from './constants';
import Layout from './components/Layout';
import { GoogleGenAI } from "@google/genai";

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

enum View {
  LOGIN,
  HOME,
  WIFI,
  CHECK_IN_OUT,
  RULES,
  GUIDE,
  AREA,
  CONTACT,
  ADMIN
}

const DEFAULT_COVER = "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=2070&auto=format&fit=crop";
// Minimalist housing image for login
const LOGIN_BG = "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=2070&auto=format&fit=crop";

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.LOGIN);
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingCode, setBookingCode] = useState('');
  
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('guestguide_lang');
    if (saved === 'es' || saved === 'en') return saved as Language;
    const browserLang = navigator.language.split('-')[0];
    return (browserLang === 'en' || browserLang === 'es') ? (browserLang as Language) : 'es';
  });
  
  const [huespedName, setHuespedName] = useState('');
  const [lastRecord, setLastRecord] = useState<CheckRecord | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Admin states
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  
  const [guideSimpleText, setGuideSimpleText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Restaurantes']);
  const [isSearching, setIsSearching] = useState(false);

  const categories = [
    { id: 'Restaurantes', label: 'Restaurantes' },
    { id: 'Supermercados', label: 'Supermercados' },
    { id: 'Farmacias', label: 'Farmacias' },
    { id: 'Atracciones Turísticas', label: 'Atracciones' },
    { id: 'Compras y Servicios', label: 'Compras' }
  ];

  const T = DICTIONARY[language];

  useEffect(() => {
    localStorage.setItem('guestguide_lang', language);
  }, [language]);

  const safeJsonParse = <T,>(jsonString: string | undefined | null, fallback: T): T => {
    if (!jsonString || typeof jsonString !== 'string' || jsonString.trim() === '') return fallback;
    try { return JSON.parse(jsonString) as T; } catch (e) { return fallback; }
  };

  const jsonToSimpleText = (jsonStr: string): string => {
    const data = safeJsonParse<Record<string, string>>(jsonStr, {});
    return Object.entries(data).map(([title, desc]) => `${title}:${desc}`).join('\n');
  };

  const simpleTextToJson = (text: string): string => {
    const lines = text.split('\n');
    const result: Record<string, string> = {};
    lines.forEach(line => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex !== -1) {
        const title = line.substring(0, separatorIndex).trim();
        const desc = line.substring(separatorIndex + 1).trim();
        if (title && desc) result[title] = desc;
      }
    });
    return JSON.stringify(result);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const propId = urlParams.get('property_id');
    const initialize = async () => {
      if (propId) {
        try {
          const data = await apiService.getPropertyById(propId);
          if (data) { 
            setProperty(data); 
            setCurrentView(View.HOME); 
          }
          else { setError(T.error_not_found); }
        } catch (e) { setError('Error loading data'); }
      }
      setLoading(false);
    };
    initialize();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getPropertyByCode(bookingCode);
      if (data) { setProperty(data); setCurrentView(View.HOME); }
      else { setError(T.error_not_found); }
    } catch (e) { setError('Error connecting'); } finally { setLoading(false); }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPass.trim()) return;
    setLoading(true);
    try {
      const data = await apiService.getPropertyById(adminPass);
      if (data) {
        setProperty(data);
        const editing = {...data};
        if (!editing.foto_portada_url) editing.foto_portada_url = DEFAULT_COVER;
        setEditingProperty(editing);
        setGuideSimpleText(jsonToSimpleText(data.guia_uso_json || '{}'));
        setAdminAuth(true);
      } else { setAdminError('ID error'); }
    } catch (e) { setAdminError('Error'); } finally { setLoading(false); }
  };

  const handleGenerateRecommendations = async () => {
    if (!editingProperty || selectedCategories.length === 0) return;
    setIsSearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Act as a local expert in ${editingProperty.ciudad}. Find EXACTLY ONE real, high-quality place for EACH of these categories: ${selectedCategories.join(', ')}. 
      Format: JSON array with keys: nombre, tipo, descripcion, direccion, telefono, foto_url. 
      CRITICAL: Return specific real places and original photos. Language: Spanish.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
      });
      const text = response.text || "";
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        const rawRecs = JSON.parse(jsonMatch[0]);
        const finalRecs = rawRecs.map((r: any) => ({ 
          ...r, 
          url_mapa: `https://www.google.com/maps/search/${encodeURIComponent(r.nombre + ' ' + editingProperty.ciudad)}` 
        }));
        setEditingProperty({ ...editingProperty, recomendaciones_zona_json: JSON.stringify(finalRecs) });
      }
    } catch (e) { alert('Error generating'); } finally { setIsSearching(false); }
  };

  const handleSaveAdmin = async () => {
    if (!editingProperty || !property) return;
    setIsSaving(true);
    try {
      const updated = { ...editingProperty, guia_uso_json: simpleTextToJson(guideSimpleText) };
      const success = await apiService.updateProperty(property.property_id, updated);
      if (success) { 
        setProperty(updated); 
        setCurrentView(View.HOME); 
        setAdminAuth(false);
      }
    } catch (e) { alert('Error saving'); } finally { setIsSaving(false); }
  };

  const toggleCategory = (catId: string) => {
    setSelectedCategories(prev => prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId].slice(0, 5));
  };

  const handleBack = () => { setCopySuccess(false); setLastRecord(null); setCurrentView(View.HOME); };
  const handleAction = (v: View) => { setCurrentView(v); };

  const handleCopyPassword = (pw: string) => {
    navigator.clipboard.writeText(pw).then(() => { setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); });
  };

  const handleCheckAction = async (tipo: CheckType) => {
    if (!property) return;
    setLoading(true);
    try {
      const result = await apiService.registerCheck({ 
        property_id: property.property_id, 
        codigo_reserva: property.codigo_reserva, 
        tipo, 
        nombre_huesped: huespedName || undefined 
      });
      if (result) setLastRecord(result);
      else setLastRecord({ 
        registro_id: 'local-'+Date.now(), 
        property_id: property.property_id, 
        tipo, 
        fecha_hora: new Date().toISOString(), 
        nombre_huesped: huespedName, 
        acceso_temp: property.acceso_temp 
      });
    } finally { setLoading(false); }
  };

  if (loading && currentView === View.LOGIN) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="animate-spin h-10 w-10 border-4 border-sky-600 border-t-transparent rounded-full mb-4"></div>
        <p className="text-slate-400 text-sm font-medium">{T.loading}</p>
      </div>
    );
  }

  // --- VISTA LOGIN ---
  if (currentView === View.LOGIN) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative bg-slate-100 overflow-hidden">
        {/* Background Minimalist Image */}
        <div className="absolute inset-0 z-0">
          <img src={LOGIN_BG} className="w-full h-full object-cover filter brightness-[0.7]" alt="Minimalist Housing" />
          <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/20 to-transparent"></div>
        </div>

        {/* Floating Language Switcher */}
        <div className="absolute top-6 right-6 z-50 flex bg-black/30 backdrop-blur-xl rounded-2xl p-1 border border-white/10">
          <button 
            onClick={() => setLanguage('es')}
            className={`px-4 py-2 text-[10px] font-black rounded-xl transition-all ${language === 'es' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/60 hover:text-white'}`}
          >ES</button>
          <button 
            onClick={() => setLanguage('en')}
            className={`px-4 py-2 text-[10px] font-black rounded-xl transition-all ${language === 'en' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/60 hover:text-white'}`}
          >EN</button>
        </div>

        <div className="w-full max-w-sm px-6 z-10 space-y-12">
          <div className="text-center space-y-4">
            <h1 className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl">GuestGuide</h1>
            <p className="text-white/80 font-bold uppercase text-[12px] tracking-[0.4em] drop-shadow-md">{T.welcome}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-3xl p-10 rounded-[4rem] shadow-2xl border border-white/20">
            <form onSubmit={handleLogin} className="space-y-8">
              <div className="space-y-3 text-center">
                <label className="block text-[11px] font-black uppercase tracking-widest text-white/90">{T.enter_code}</label>
                <input 
                  type="text" 
                  value={bookingCode} 
                  onChange={(e) => setBookingCode(e.target.value)} 
                  placeholder="CODE-123" 
                  className="w-full px-8 py-6 rounded-3xl bg-white border-none shadow-2xl focus:ring-4 focus:ring-sky-500/50 outline-none uppercase font-black text-2xl text-slate-900 placeholder:text-slate-300 transition-all text-center tracking-[0.2em]" 
                />
              </div>
              <button className="w-full bg-sky-600 hover:bg-sky-500 text-white py-6 rounded-3xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-sky-900/40 active:scale-[0.98] transition-all">
                {T.continue}
              </button>
            </form>
          </div>

          <div className="text-center">
            <button onClick={() => setCurrentView(View.ADMIN)} className="text-white/40 hover:text-white text-[10px] font-black uppercase tracking-[0.2em] transition-colors flex items-center justify-center mx-auto group">
              <i className="fa-solid fa-lock mr-3 group-hover:scale-110 transition-transform"></i>{T.admin_login_title}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- VISTA ADMIN ---
  if (currentView === View.ADMIN) {
    if (!adminAuth) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-white">
          <div className="w-full max-w-xs space-y-8 text-center">
            <i className="fa-solid fa-user-shield text-7xl text-sky-500 mb-4"></i>
            <h2 className="text-3xl font-black tracking-tight">{T.admin_login_title}</h2>
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">{T.admin_master_key}</label>
                <input 
                  type="password" 
                  value={adminPass} 
                  onChange={(e) => setAdminPass(e.target.value)} 
                  className="w-full p-6 bg-slate-800 border border-slate-700 rounded-[2rem] text-center font-black text-2xl tracking-widest outline-none focus:border-sky-500 transition-all" 
                  placeholder="ID" 
                />
              </div>
              <button className="w-full bg-sky-600 hover:bg-sky-500 py-6 rounded-[2rem] font-black uppercase tracking-widest transition-all shadow-xl">
                {T.admin_authenticate}
              </button>
            </form>
            <button onClick={() => setCurrentView(View.LOGIN)} className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">{T.admin_return_home}</button>
          </div>
        </div>
      );
    }
    return (
      <Layout title={T.admin_panel_title} lang={language} onLanguageChange={setLanguage} onBack={() => {setAdminAuth(false); setCurrentView(View.LOGIN)}}>
        <div className="relative min-h-screen">
          {/* Background default from property cover photo as requested */}
          <div 
            className="fixed inset-0 opacity-[0.05] pointer-events-none bg-center bg-cover bg-fixed"
            style={{ backgroundImage: `url(${editingProperty?.foto_portada_url || DEFAULT_COVER})` }}
          />
          
          <div className="relative z-10 p-6 space-y-8 pb-40">
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2.5rem] flex items-center shadow-sm">
              <i className="fa-solid fa-circle-check text-emerald-500 text-2xl mr-4"></i>
              <div>
                <span className="text-emerald-800 text-[10px] font-black uppercase block tracking-widest">{T.admin_edit_active}</span>
                <p className="text-emerald-600 text-[11px] font-bold">{editingProperty?.nombre_apartamento}</p>
              </div>
            </div>

            {/* DATOS GENERALES */}
            <section className="bg-white/80 backdrop-blur-lg p-8 rounded-[3rem] shadow-sm space-y-6 border border-slate-100">
              <h3 className="font-black uppercase text-[10px] text-slate-400 tracking-[0.2em] flex items-center border-b border-slate-50 pb-4">
                <i className="fa-solid fa-building mr-3 text-sky-600"></i>{T.admin_property_info}
              </h3>
              <div className="grid gap-6">
                <AdminField label="Nombre Apartamento" value={editingProperty?.nombre_apartamento} onChange={v => setEditingProperty({...editingProperty!, nombre_apartamento: v})} />
                <AdminField label="Nombre del Anfitrión" value={editingProperty?.host_name} onChange={v => setEditingProperty({...editingProperty!, host_name: v})} />
                <div className="grid grid-cols-2 gap-4">
                  <AdminField label="Ciudad" value={editingProperty?.ciudad} onChange={v => setEditingProperty({...editingProperty!, ciudad: v})} />
                  <AdminField label="Dirección" value={editingProperty?.direccion} onChange={v => setEditingProperty({...editingProperty!, direccion: v})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Descripción Corta</label>
                  <textarea value={editingProperty?.descripcion_corta} onChange={e => setEditingProperty({...editingProperty!, descripcion_corta: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl text-sm border-2 border-transparent focus:border-sky-500 focus:bg-white outline-none h-24 transition-all shadow-sm" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <AdminField label="Hab." type="number" value={editingProperty?.num_habitaciones?.toString()} onChange={v => setEditingProperty({...editingProperty!, num_habitaciones: parseInt(v) || 0})} />
                  <AdminField label="Baños" type="number" value={editingProperty?.num_banos?.toString()} onChange={v => setEditingProperty({...editingProperty!, num_banos: parseInt(v) || 0})} />
                  <AdminField label="Cap." type="number" value={editingProperty?.capacidad_personas?.toString()} onChange={v => setEditingProperty({...editingProperty!, capacidad_personas: parseInt(v) || 0})} />
                </div>
              </div>
            </section>

            {/* WIFI & CONTACTO */}
            <section className="bg-white/80 backdrop-blur-lg p-8 rounded-[3rem] shadow-sm space-y-6 border border-slate-100">
              <h3 className="font-black uppercase text-[10px] text-slate-400 tracking-[0.2em] flex items-center border-b border-slate-50 pb-4">
                <i className="fa-solid fa-wifi mr-3 text-blue-600"></i>WiFi & Contacto
              </h3>
              <div className="grid gap-6">
                <div className="grid grid-cols-2 gap-4">
                  <AdminField label="Red (SSID)" value={editingProperty?.wifi_ssid} onChange={v => setEditingProperty({...editingProperty!, wifi_ssid: v})} />
                  <AdminField label="Clave" value={editingProperty?.wifi_password} onChange={v => setEditingProperty({...editingProperty!, wifi_password: v})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <AdminField label="WhatsApp" value={editingProperty?.whatsapp_number} onChange={v => setEditingProperty({...editingProperty!, whatsapp_number: v})} />
                  <AdminField label="Teléfono" value={editingProperty?.phone_number} onChange={v => setEditingProperty({...editingProperty!, phone_number: v})} />
                </div>
              </div>
            </section>

            {/* GUÍA & REGLAS */}
            <section className="bg-white/80 backdrop-blur-lg p-8 rounded-[3rem] shadow-sm space-y-6 border border-slate-100">
              <h3 className="font-black uppercase text-[10px] text-slate-400 tracking-[0.2em] flex items-center border-b border-slate-50 pb-4">
                <i className="fa-solid fa-book-open mr-3 text-amber-600"></i>{T.admin_guide_label}
              </h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Reglas de convivencia</label>
                  <textarea value={editingProperty?.reglas} onChange={e => setEditingProperty({...editingProperty!, reglas: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl text-sm border-2 border-transparent focus:border-sky-500 focus:bg-white outline-none h-40 transition-all shadow-sm" placeholder="Regla 1..." />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Guía (Título:Descripción)</label>
                  <textarea value={guideSimpleText} onChange={e => setGuideSimpleText(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl text-sm border-2 border-transparent focus:border-sky-500 focus:bg-white outline-none h-40 font-mono transition-all shadow-sm" placeholder="TV:Usa el control negro..." />
                  <p className="text-[9px] text-slate-400 italic px-2">Escribe cada ítem en una nueva línea con el formato Título:Descripción.</p>
                </div>
              </div>
            </section>

            {/* MULTIMEDIA */}
            <section className="bg-white/80 backdrop-blur-lg p-8 rounded-[3rem] shadow-sm space-y-6 border border-slate-100">
              <h3 className="font-black uppercase text-[10px] text-slate-400 tracking-[0.2em] flex items-center border-b border-slate-50 pb-4">
                <i className="fa-solid fa-photo-film mr-3 text-emerald-600"></i>Multimedia
              </h3>
              <div className="space-y-6">
                <AdminField label="URL Foto Portada" value={editingProperty?.foto_portada_url} onChange={v => setEditingProperty({...editingProperty!, foto_portada_url: v})} />
                <AdminField label="URL Foto Anfitrión" value={editingProperty?.host_photo_url} onChange={v => setEditingProperty({...editingProperty!, host_photo_url: v})} />
              </div>
            </section>

            {/* RECOMENDACIONES */}
            <section className="bg-white/80 backdrop-blur-lg p-8 rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
              <h3 className="font-black uppercase text-[10px] text-slate-400 tracking-[0.2em] mb-6 flex items-center border-b border-slate-50 pb-4">
                <i className="fa-solid fa-wand-magic-sparkles mr-3 text-purple-600"></i>{T.admin_area_generator}
              </h3>
              <div className="flex flex-wrap gap-2 mb-8">
                {categories.map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => toggleCategory(c.id)} 
                    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${selectedCategories.includes(c.id) ? 'bg-purple-600 border-purple-600 text-white shadow-lg' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button 
                onClick={handleGenerateRecommendations} 
                disabled={isSearching}
                className="w-full bg-slate-900 hover:bg-purple-700 text-white py-6 rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl transition-all disabled:opacity-50"
              >
                {isSearching ? <><i className="fa-solid fa-spinner animate-spin mr-3"></i>{T.admin_searching}</> : <><i className="fa-solid fa-magnifying-glass mr-3"></i>{T.admin_generate_recs}</>}
              </button>
            </section>

            <button 
              onClick={handleSaveAdmin} 
              disabled={isSaving}
              className="fixed bottom-8 left-8 right-8 max-w-sm mx-auto bg-sky-600 hover:bg-sky-500 text-white py-7 rounded-[2.5rem] font-black uppercase tracking-[0.2em] shadow-[0_20px_50px_rgba(2,132,199,0.3)] z-[150] active:scale-[0.98] transition-all"
            >
              {isSaving ? <><i className="fa-solid fa-spinner animate-spin mr-3"></i>{T.admin_publishing}</> : <><i className="fa-solid fa-cloud-arrow-up mr-3"></i>{T.admin_publish_changes}</>}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // --- VISTA HOME (HUÉSPED) ---
  if (currentView === View.HOME && property) {
    return (
      <Layout title={property.nombre_apartamento} lang={language} onLanguageChange={setLanguage}>
        <div className="h-72 overflow-hidden relative">
          <img src={property.foto_portada_url || DEFAULT_COVER} className="w-full h-full object-cover" alt="Property" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent flex flex-col justify-end p-8">
            <span className="text-sky-400 font-black uppercase text-[10px] tracking-[0.3em] mb-2">{property.ciudad}</span>
            <h2 className="text-white text-3xl font-black leading-tight mb-2 drop-shadow-lg">{property.nombre_apartamento}</h2>
            <p className="text-white/80 text-xs truncate flex items-center"><i className="fa-solid fa-location-dot mr-3 text-sky-500"></i>{property.direccion}</p>
          </div>
        </div>
        
        <div className="p-8">
          <div className="grid grid-cols-3 gap-5 mb-10">
            <InfoCard icon="bed" value={property.num_habitaciones} label={T.rooms} />
            <InfoCard icon="bath" value={property.num_banos} label={T.baths} />
            <InfoCard icon="users" value={property.capacidad_personas} label={T.guests_cap} />
          </div>

          <div className="bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100 mb-10">
             <p className="text-slate-600 text-sm leading-relaxed italic text-center">"{property.descripcion_corta}"</p>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <MenuAction icon="wifi" label={T.wifi} onClick={() => handleAction(View.WIFI)} color="bg-blue-50" iconColor="text-blue-600" />
            <MenuAction icon="clipboard-check" label={T.checkin_checkout} onClick={() => handleAction(View.CHECK_IN_OUT)} color="bg-emerald-50" iconColor="text-emerald-600" />
            <MenuAction icon="book-open" label={T.guide} onClick={() => handleAction(View.GUIDE)} color="bg-amber-50" iconColor="text-amber-600" />
            <MenuAction icon="scale-balanced" label={T.rules} onClick={() => handleAction(View.RULES)} color="bg-orange-50" iconColor="text-orange-600" />
            <MenuAction icon="map-location-dot" label={T.area} onClick={() => handleAction(View.AREA)} color="bg-purple-50" iconColor="text-purple-600" />
            <MenuAction icon="headset" label={T.contact} onClick={() => handleAction(View.CONTACT)} color="bg-pink-50" iconColor="text-pink-600" />
          </div>
        </div>
      </Layout>
    );
  }

  // --- VISTA WIFI ---
  if (currentView === View.WIFI && property) {
    const wifiQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`WIFI:S:${property.wifi_ssid};T:WPA;P:${property.wifi_password};;`)}`;
    return (
      <Layout title={T.wifi} onBack={handleBack} lang={language} onLanguageChange={setLanguage}>
        <div className="p-8 space-y-8">
          <div className="bg-gradient-to-br from-sky-600 to-blue-700 rounded-[3rem] p-10 text-white text-center shadow-2xl">
            <div className="w-20 h-20 bg-white/20 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 backdrop-blur-lg">
              <i className="fa-solid fa-wifi text-4xl"></i>
            </div>
            <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Red / Network</p>
            <h3 className="text-3xl font-black tracking-tight">{property.wifi_ssid}</h3>
          </div>
          
          <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-100 text-center space-y-8">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">{T.wifi}</p>
              <code className="text-4xl font-mono font-black text-slate-900 block tracking-wider">{property.wifi_password}</code>
            </div>
            <button 
              onClick={() => handleCopyPassword(property.wifi_password)} 
              className={`w-full py-6 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] transition-all shadow-xl ${copySuccess ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white'}`}
            >
              {copySuccess ? <><i className="fa-solid fa-check mr-3"></i>{T.copied}</> : <><i className="fa-solid fa-copy mr-3"></i>{T.copy_pw}</>}
            </button>
          </div>

          <div className="bg-white rounded-[3rem] p-12 shadow-sm border border-slate-100 text-center flex flex-col items-center">
            <div className="p-6 bg-slate-50 rounded-[3rem] border border-slate-100 mb-8 shadow-inner">
              <img src={wifiQrUrl} className="w-48 h-48 mix-blend-multiply" alt="WIFI QR" />
            </div>
            <h4 className="font-black text-slate-900 text-lg mb-3 tracking-tight">Escaneo Rápido</h4>
            <p className="text-xs text-slate-400 leading-relaxed px-6">Usa tu cámara para conectarte automáticamente sin escribir la clave.</p>
          </div>
        </div>
      </Layout>
    );
  }

  // --- VISTA REGLAS ---
  if (currentView === View.RULES && property) {
    const rulesList = property.reglas ? property.reglas.split('\n').filter(r => r.trim() !== '') : [];
    return (
      <Layout title={T.rules} onBack={handleBack} lang={language} onLanguageChange={setLanguage}>
        <div className="p-8">
          <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 space-y-10">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-orange-50 text-orange-500 rounded-[1.5rem] flex items-center justify-center text-2xl">
                <i className="fa-solid fa-scale-balanced"></i>
              </div>
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Normas de la casa</h3>
            </div>
            <div className="space-y-6">
              {rulesList.length > 0 ? rulesList.map((r, i) => (
                <div key={i} className="flex gap-6 items-start group">
                  <span className="bg-slate-50 text-slate-400 w-10 h-10 rounded-2xl flex items-center justify-center text-[12px] font-black shrink-0 border border-slate-100 group-hover:bg-orange-500 group-hover:text-white group-hover:border-orange-500 transition-all">{i+1}</span>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed pt-2 transition-colors group-hover:text-slate-900">{r}</p>
                </div>
              )) : <p className="text-slate-400 text-sm italic py-10 text-center">No hay reglas definidas.</p>}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // --- VISTA GUÍA ---
  if (currentView === View.GUIDE && property) {
    const guideData = safeJsonParse(property.guia_uso_json, {});
    return (
      <Layout title={T.guide} onBack={handleBack} lang={language} onLanguageChange={setLanguage}>
        <div className="p-8 space-y-6">
          <div className="bg-amber-50 border border-amber-100 p-6 rounded-[2rem] mb-6 flex items-center shadow-sm">
            <i className="fa-solid fa-lightbulb text-amber-500 text-2xl mr-5"></i>
            <p className="text-amber-800 text-xs font-bold leading-relaxed">Información útil para facilitar tu estancia en el apartamento.</p>
          </div>
          {Object.entries(guideData).length > 0 ? Object.entries(guideData).map(([title, content], i) => (
            <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group">
              <div className="flex items-center gap-4 mb-4">
                <span className="w-2 h-8 bg-amber-400 rounded-full group-hover:scale-y-110 transition-transform"></span>
                <h4 className="font-black text-slate-900 text-base uppercase tracking-wider">{title as string}</h4>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed pl-6 border-l border-slate-100">{content as string}</p>
            </div>
          )) : (
            <div className="text-center py-32 space-y-6">
              <i className="fa-solid fa-book-open text-slate-100 text-9xl"></i>
              <p className="text-slate-400 font-bold tracking-widest uppercase text-[10px]">No hay guías disponibles</p>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // --- VISTA CONTACTO ---
  if (currentView === View.CONTACT && property) {
    const wa = String(property.whatsapp_number).replace(/\D/g, '');
    return (
      <Layout title={T.contact} onBack={handleBack} lang={language} onLanguageChange={setLanguage}>
        <div className="p-8 space-y-10">
          <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-xl flex flex-col items-center text-center">
            <div className="relative mb-8">
              <img src={property.host_photo_url || `https://ui-avatars.com/api/?name=${property.host_name}&background=db2777&color=fff`} className="w-40 h-40 rounded-[3rem] object-cover shadow-2xl border-8 border-white" alt="Host" />
              <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white w-12 h-12 rounded-[1.5rem] flex items-center justify-center border-4 border-white shadow-lg animate-bounce">
                <i className="fa-solid fa-check text-base"></i>
              </div>
            </div>
            <h4 className="font-black text-3xl text-slate-900 tracking-tight">{property.host_name}</h4>
            <span className="bg-pink-100 text-pink-600 px-6 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mt-3">Anfitrión Destacado</span>
          </div>
          
          <div className="grid gap-5">
            <ContactLink href={`https://wa.me/${wa}`} icon="whatsapp" label="WhatsApp" subLabel={property.whatsapp_number} color="bg-emerald-50" iconColor="text-emerald-500" />
            <ContactLink href={`tel:${property.phone_number}`} icon="phone" label="Llamar" subLabel={property.phone_number} color="bg-sky-50" iconColor="text-sky-500" />
          </div>
        </div>
      </Layout>
    );
  }

  // --- VISTA CHECK-IN/OUT ---
  if (currentView === View.CHECK_IN_OUT && property) {
    return (
      <Layout title={T.checkin_checkout} onBack={handleBack} lang={language} onLanguageChange={setLanguage}>
        <div className="p-8 space-y-8">
          <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-xl">
            <label className="text-[10px] font-black uppercase text-slate-400 mb-4 block tracking-[0.3em] ml-2">{T.guest_name}</label>
            <input 
              value={huespedName} 
              onChange={e => setHuespedName(e.target.value)} 
              className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black text-slate-900 focus:ring-4 focus:ring-emerald-500/20 transition-all text-center text-xl placeholder:text-slate-300" 
              placeholder="Ej: Sofía García" 
            />
          </div>
          
          {lastRecord && (
            <div className="bg-emerald-600 p-10 rounded-[3.5rem] text-white shadow-2xl shadow-emerald-200 animate-in slide-in-from-bottom duration-500 border border-white/20">
              <div className="flex items-center gap-5 mb-6">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner">
                  <i className="fa-solid fa-check-double text-2xl"></i>
                </div>
                <h3 className="font-black uppercase tracking-widest text-base">{T.success_check}</h3>
              </div>
              {lastRecord.acceso_temp && (
                <div className="bg-white text-slate-900 p-8 rounded-[2.5rem] text-center space-y-3 shadow-inner">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">{T.access_code_title}</p>
                  <div className="text-5xl font-mono font-black tracking-[0.3em] py-2 text-emerald-600">{lastRecord.acceso_temp}</div>
                  <p className="text-[10px] text-slate-400 font-bold pt-2 px-6">{T.access_code_desc}</p>
                </div>
              )}
            </div>
          )}
          
          <div className="grid gap-6">
            <CheckActionBtn icon="door-open" title="Check-in" label={T.register_checkin} desc={T.checkin_instructions} color="text-sky-600" bgColor="bg-sky-50" onClick={() => handleCheckAction('checkin')} />
            <CheckActionBtn icon="door-closed" title="Check-out" label={T.register_checkout} desc={T.checkout_instructions} color="text-slate-700" bgColor="bg-slate-50" onClick={() => handleCheckAction('checkout')} />
          </div>
        </div>
      </Layout>
    );
  }

  // --- VISTA ÁREA ---
  if (currentView === View.AREA && property) {
    const rawRecs = safeJsonParse<Recomendacion[]>(property.recomendaciones_zona_json, []);
    const seen = new Set<string>();
    const recommendations = rawRecs.filter(rec => {
      if (!seen.has(rec.tipo)) {
        seen.add(rec.tipo);
        return true;
      }
      return false;
    });
    
    return (
      <Layout title={T.area} onBack={handleBack} lang={language} onLanguageChange={setLanguage}>
        <div className="p-8 space-y-8 pb-20">
          {recommendations.length > 0 ? recommendations.map((rec: Recomendacion, i: number) => {
            const dynamicImg = `https://loremflickr.com/800/600/${encodeURIComponent(rec.nombre.split(' ')[0])},${rec.tipo.toLowerCase()}?lock=${i + 200}`;
            return (
              <div key={i} className="bg-white rounded-[3.5rem] overflow-hidden shadow-2xl shadow-slate-200 border border-slate-100 transform transition-all hover:scale-[1.01]">
                <div className="h-56 relative">
                  <img 
                    src={rec.foto_url || dynamicImg} 
                    className="w-full h-full object-cover" 
                    alt={rec.nombre}
                    onError={(e) => (e.target as any).src = dynamicImg} 
                  />
                  <div className="absolute top-6 left-6">
                    <span className="bg-white/90 backdrop-blur-md px-5 py-2 rounded-2xl text-[10px] font-black text-sky-700 uppercase tracking-widest shadow-xl">
                      {rec.tipo}
                    </span>
                  </div>
                </div>
                <div className="p-8 space-y-6">
                  <div>
                    <h4 className="text-2xl font-black text-slate-900 leading-tight mb-3">{rec.nombre}</h4>
                    <p className="text-slate-500 text-sm leading-relaxed line-clamp-3 font-medium">{rec.descripcion}</p>
                  </div>
                  
                  <div className="pt-6 border-t border-slate-50 space-y-3">
                    {rec.direccion && (
                      <div className="flex items-center gap-4 text-[11px] text-slate-400 font-bold">
                        <i className="fa-solid fa-location-dot text-sky-500 w-5 text-center text-base"></i>
                        <span className="truncate">{rec.direccion}</span>
                      </div>
                    )}
                    {rec.telefono && (
                      <a href={`tel:${rec.telefono}`} className="flex items-center gap-4 text-[11px] text-emerald-600 font-black hover:text-emerald-700 transition-colors">
                        <i className="fa-solid fa-phone text-emerald-500 w-5 text-center text-base"></i>
                        <span>{rec.telefono}</span>
                      </a>
                    )}
                  </div>
                  
                  <a href={rec.url_mapa} target="_blank" rel="noreferrer" className="w-full bg-slate-900 hover:bg-sky-600 text-white py-5 rounded-[2rem] block text-center font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all">
                    <i className="fa-solid fa-map-location-dot mr-3"></i>Cómo llegar
                  </a>
                </div>
              </div>
            );
          }) : (
            <div className="text-center py-40 space-y-6">
              <i className="fa-solid fa-map-pin text-slate-100 text-[10rem] animate-pulse"></i>
              <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Sin recomendaciones por ahora</p>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  return null;
};

// --- HELPER COMPONENTS ---

const AdminField: React.FC<{ label: string, value?: string, onChange: (v: string) => void, type?: string }> = ({ label, value, onChange, type = 'text' }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{label}</label>
    <input 
      type={type} 
      value={value || ''} 
      onChange={e => onChange(e.target.value)} 
      className="w-full p-5 bg-slate-50/50 rounded-2xl font-bold border-2 border-transparent focus:border-sky-500 focus:bg-white outline-none text-sm transition-all shadow-sm text-slate-900" 
      placeholder={label} 
    />
  </div>
);

const InfoCard: React.FC<{ icon: string, value: any, label: string }> = ({ icon, value, label }) => (
  <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 text-center shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-all">
    <i className={`fa-solid fa-${icon} text-sky-500 text-lg mb-3`}></i>
    <p className="text-base font-black text-slate-900 tracking-tight">{value}</p>
    <p className="text-[9px] uppercase text-slate-400 font-black tracking-widest mt-1">{label}</p>
  </div>
);

const MenuAction: React.FC<{ icon: string, label: string, onClick: () => void, color: string, iconColor: string }> = ({ icon, label, onClick, color, iconColor }) => (
  <button 
    onClick={onClick} 
    className={`flex flex-col items-center justify-center p-8 ${color} rounded-[3rem] transition-all hover:shadow-2xl active:scale-95 group relative overflow-hidden shadow-sm`}
  >
    <div className={`w-14 h-14 ${color.replace('50', '200')} rounded-[1.5rem] flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-sm`}>
      <i className={`fa-solid fa-${icon} ${iconColor} text-2xl`}></i>
    </div>
    <span className={`text-[10px] font-black uppercase tracking-widest text-center leading-tight ${iconColor}`}>{label}</span>
  </button>
);

const ContactLink: React.FC<{ href: string, icon: string, label: string, subLabel: string, color: string, iconColor: string }> = ({ href, icon, label, subLabel, color, iconColor }) => (
  <a href={href} target="_blank" rel="noreferrer" className={`${color} hover:shadow-xl p-8 rounded-[2.5rem] border-2 border-transparent hover:border-white transition-all flex items-center justify-between group`}>
    <div className="flex items-center gap-6">
      <div className={`w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center shadow-md ${iconColor} group-hover:scale-110 transition-transform`}>
        <i className={`fa-solid ${icon === 'whatsapp' ? 'fa-brands fa-whatsapp' : 'fa-solid fa-phone'} text-3xl`}></i>
      </div>
      <div>
        <p className="font-black text-base uppercase tracking-widest text-slate-900">{label}</p>
        <p className={`text-[11px] ${iconColor} font-black mt-1`}>{subLabel}</p>
      </div>
    </div>
    <i className="fa-solid fa-chevron-right text-slate-300 group-hover:translate-x-1 transition-transform"></i>
  </a>
);

const CheckActionBtn: React.FC<{ icon: string, title: string, label: string, desc: string, color: string, bgColor: string, onClick: () => void }> = ({ icon, title, label, desc, color, bgColor, onClick }) => (
  <button 
    onClick={onClick} 
    className={`bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-xl text-left hover:ring-4 hover:ring-sky-500/10 transition-all group`}
  >
    <div className="flex justify-between items-start mb-6">
      <div className={`w-16 h-16 ${bgColor} ${color} rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 transition-transform`}>
        <i className={`fa-solid fa-${icon} text-2xl`}></i>
      </div>
      <span className={`${color} text-[10px] font-black uppercase tracking-[0.3em] mt-2`}>{label}</span>
    </div>
    <h3 className="font-black text-3xl text-slate-900 mb-2 tracking-tight">{title}</h3>
    <p className="text-slate-400 text-sm leading-relaxed font-medium">{desc}</p>
  </button>
);

export default App;
