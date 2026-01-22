
import React, { useState, useEffect } from 'react';
import { Property, CheckRecord, Recomendacion, CheckType, Language } from './types';
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
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleGenerateRecommendations = async () => {
    if (!editingProperty || selectedCategories.length === 0) return;
    setIsSearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Act as a local expert in ${editingProperty.ciudad}. Find EXACTLY ONE real, high-quality place for EACH of these categories: ${selectedCategories.join(', ')}. 
      Format: JSON array with keys: nombre, tipo, descripcion, direccion, telefono, foto_url. 
      CRITICAL: Return real places. Language: Spanish.`;
      
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
        <p className="text-slate-400 text-sm font-black tracking-widest uppercase">GUESTGUIDE</p>
      </div>
    );
  }

  // --- VISTA LOGIN ---
  if (currentView === View.LOGIN) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative bg-slate-100 overflow-hidden">
        <div className="absolute inset-0 z-0 scale-105 transform">
          <img src={LOGIN_BG} className="w-full h-full object-cover filter brightness-[0.7] blur-[1px]" alt="Background" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70"></div>
        </div>

        {/* Floating Language Switcher */}
        <div className="absolute top-8 right-8 z-50 flex bg-white/10 backdrop-blur-2xl rounded-2xl p-1.5 border border-white/20 shadow-2xl">
          <button 
            onClick={() => setLanguage('es')}
            className={`px-5 py-2.5 text-[11px] font-black rounded-xl transition-all ${language === 'es' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/60 hover:text-white'}`}
          >ES</button>
          <button 
            onClick={() => setLanguage('en')}
            className={`px-5 py-2.5 text-[11px] font-black rounded-xl transition-all ${language === 'en' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/60 hover:text-white'}`}
          >EN</button>
        </div>

        <div className="w-full max-w-sm px-8 z-10 space-y-12 animate-in fade-in slide-in-from-bottom duration-1000">
          <div className="text-center space-y-4">
            <h1 className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl">GuestGuide</h1>
            <div className="h-1.5 w-20 bg-sky-500 mx-auto rounded-full shadow-lg shadow-sky-500/50"></div>
            <p className="text-white/90 font-bold uppercase text-[12px] tracking-[0.4em] drop-shadow-md">{T.welcome}</p>
          </div>

          <div className="bg-white/15 backdrop-blur-3xl p-10 rounded-[4rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-white/20">
            <form onSubmit={handleLogin} className="space-y-10">
              <div className="space-y-4 text-center">
                <label className="block text-[11px] font-black uppercase tracking-[0.3em] text-white/90">{T.enter_code}</label>
                <input 
                  type="text" 
                  value={bookingCode} 
                  onChange={(e) => setBookingCode(e.target.value)} 
                  placeholder="ID-XYZ" 
                  className="w-full px-8 py-7 rounded-[2.5rem] bg-white border-none shadow-2xl focus:ring-8 focus:ring-sky-500/30 outline-none uppercase font-black text-2xl text-slate-900 placeholder:text-slate-200 transition-all text-center tracking-[0.2em]" 
                />
              </div>
              <button className="w-full bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white py-7 rounded-[2.5rem] font-black uppercase tracking-[0.2em] shadow-2xl shadow-sky-900/40 active:scale-[0.97] transition-all transform hover:-translate-y-1">
                {T.continue}
              </button>
            </form>
          </div>

          <button onClick={() => setCurrentView(View.ADMIN)} className="text-white/40 hover:text-white text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center mx-auto group">
            <i className="fa-solid fa-lock-open mr-3 group-hover:scale-125 transition-transform text-sky-400/50"></i>{T.admin_login_title}
          </button>
        </div>
      </div>
    );
  }

  // --- VISTA HOME ---
  if (currentView === View.HOME && property) {
    return (
      <Layout title={property.nombre_apartamento} lang={language} onLanguageChange={setLanguage}>
        <div className="h-80 overflow-hidden relative group">
          <img src={property.foto_portada_url || DEFAULT_COVER} className="w-full h-full object-cover transform transition-transform duration-[20s] group-hover:scale-110" alt="Hero" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent flex flex-col justify-end p-10">
            <div className="flex items-center gap-3 mb-4 animate-in fade-in slide-in-from-left duration-700">
              <span className="w-1.5 h-6 bg-sky-500 rounded-full"></span>
              <span className="text-sky-400 font-black uppercase text-[11px] tracking-[0.3em]">{property.ciudad}</span>
            </div>
            <h2 className="text-white text-4xl font-black leading-tight mb-4 drop-shadow-2xl">{property.nombre_apartamento}</h2>
            <p className="text-white/60 text-xs truncate flex items-center bg-white/5 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/10 w-fit">
              <i className="fa-solid fa-location-dot mr-3 text-sky-500"></i>{property.direccion}
            </p>
          </div>
        </div>
        
        <div className="p-8 -mt-10 relative z-20 bg-gray-50 rounded-t-[4.5rem] shadow-inner">
          <div className="grid grid-cols-3 gap-6 mb-12">
            <StatCard icon="bed" value={property.num_habitaciones} label={T.rooms} color="text-sky-600" bg="bg-sky-50" />
            <StatCard icon="bath" value={property.num_banos} label={T.baths} color="text-indigo-600" bg="bg-indigo-50" />
            <StatCard icon="users" value={property.capacidad_personas} label={T.guests_cap} color="text-emerald-600" bg="bg-emerald-50" />
          </div>

          <div className="bg-white p-8 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 mb-12 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
            <p className="text-slate-600 text-sm leading-relaxed italic text-center relative z-10">"{property.descripcion_corta}"</p>
          </div>

          <div className="grid grid-cols-2 gap-6 pb-12">
            <QuickActionBtn icon="wifi" label={T.wifi} onClick={() => handleAction(View.WIFI)} color="from-blue-500 to-blue-600" />
            <QuickActionBtn icon="calendar-check" label={T.checkin_checkout} onClick={() => handleAction(View.CHECK_IN_OUT)} color="from-emerald-500 to-emerald-600" />
            <QuickActionBtn icon="book-open-reader" label={T.guide} onClick={() => handleAction(View.GUIDE)} color="from-amber-500 to-amber-600" />
            <QuickActionBtn icon="gavel" label={T.rules} onClick={() => handleAction(View.RULES)} color="from-orange-500 to-orange-600" />
            <QuickActionBtn icon="map-location-dot" label={T.area} onClick={() => handleAction(View.AREA)} color="from-purple-500 to-purple-600" />
            <QuickActionBtn icon="headset" label={T.contact} onClick={() => handleAction(View.CONTACT)} color="from-pink-500 to-pink-600" />
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
        <div className="p-8 space-y-10 animate-in fade-in duration-500">
          <div className="bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-800 rounded-[3.5rem] p-12 text-white text-center shadow-[0_32px_64px_-16px_rgba(2,132,199,0.4)] relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.1),transparent)]"></div>
            <div className="w-24 h-24 bg-white/10 backdrop-blur-2xl rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-2xl border border-white/20 group-hover:scale-110 transition-transform">
              <i className="fa-solid fa-wifi text-4xl"></i>
            </div>
            <p className="text-white/60 text-[11px] font-black uppercase tracking-[0.4em] mb-3">Red / Network</p>
            <h3 className="text-4xl font-black tracking-tight">{property.wifi_ssid}</h3>
          </div>
          
          <div className="bg-white rounded-[3.5rem] p-12 shadow-2xl shadow-slate-200/50 border border-slate-100 text-center space-y-10">
            <div className="space-y-4">
              <p className="text-[11px] font-black uppercase text-slate-400 tracking-[0.4em]">{T.wifi}</p>
              <code className="text-4xl font-mono font-black text-slate-900 block tracking-[0.15em] bg-slate-50 py-7 rounded-[2.5rem] border border-slate-100 shadow-inner">{property.wifi_password}</code>
            </div>
            <button 
              onClick={() => handleCopyPassword(property.wifi_password)} 
              className={`w-full py-7 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.25em] transition-all shadow-2xl active:scale-95 ${copySuccess ? 'bg-emerald-500 text-white' : 'bg-slate-950 text-white'}`}
            >
              {copySuccess ? <><i className="fa-solid fa-check-circle mr-3"></i>¡COPIADO!</> : <><i className="fa-solid fa-copy mr-3"></i>COPIAR CLAVE</>}
            </button>
          </div>

          <div className="bg-white rounded-[3.5rem] p-12 shadow-sm border border-slate-100 text-center flex flex-col items-center">
            <div className="p-8 bg-white rounded-[3rem] border border-slate-200 mb-10 shadow-inner group transition-all hover:border-sky-300">
              <img src={wifiQrUrl} className="w-56 h-56 transform transition-transform group-hover:scale-105" alt="WIFI QR" />
            </div>
            <h4 className="font-black text-slate-900 text-xl mb-4 tracking-tight">Acceso Rápido</h4>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">Escanea el código con tu cámara para conectarte automáticamente.</p>
          </div>
        </div>
      </Layout>
    );
  }

  // --- VISTA REGLAS (CORREGIDA) ---
  if (currentView === View.RULES && property) {
    const rulesList = property.reglas ? property.reglas.split('\n').filter(r => r.trim() !== '') : [];
    return (
      <Layout title={T.rules} onBack={handleBack} lang={language} onLanguageChange={setLanguage}>
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
          <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-2xl shadow-slate-200/50 space-y-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-16 -mt-16"></div>
            <div className="flex items-center gap-6 relative z-10">
              <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-[1.75rem] flex items-center justify-center text-3xl shadow-sm">
                <i className="fa-solid fa-scale-balanced"></i>
              </div>
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Reglas de la casa</h3>
            </div>
            <div className="space-y-8 relative z-10">
              {rulesList.length > 0 ? rulesList.map((r, i) => (
                <div key={i} className="flex gap-6 items-start group">
                  <span className="bg-slate-50 text-slate-400 w-12 h-12 rounded-[1.25rem] flex items-center justify-center text-[13px] font-black shrink-0 border border-slate-100 group-hover:bg-orange-500 group-hover:text-white group-hover:border-orange-500 transition-all shadow-sm">{i+1}</span>
                  <p className="text-slate-600 text-[15px] font-medium leading-relaxed pt-3 group-hover:text-slate-950 transition-colors">{r}</p>
                </div>
              )) : (
                <div className="text-center py-10">
                  <i className="fa-solid fa-circle-info text-slate-200 text-6xl mb-4"></i>
                  <p className="text-slate-400 font-medium">No se han definido reglas específicas.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // --- VISTA CHECK-IN/OUT ---
  if (currentView === View.CHECK_IN_OUT && property) {
    return (
      <Layout title={T.checkin_checkout} onBack={handleBack} lang={language} onLanguageChange={setLanguage}>
        <div className="p-8 space-y-10 animate-in fade-in duration-500">
          <div className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-2xl shadow-slate-200/50 relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/5 rounded-full"></div>
            <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block tracking-[0.4em] ml-2">¿Cuál es tu nombre?</label>
            <div className="relative">
              <i className="fa-solid fa-user-circle absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 text-2xl"></i>
              <input 
                value={huespedName} 
                onChange={e => setHuespedName(e.target.value)} 
                className="w-full pl-16 pr-8 py-7 bg-slate-50 border-none rounded-[2.5rem] font-black text-slate-900 focus:ring-8 focus:ring-emerald-500/10 transition-all text-xl shadow-inner placeholder:text-slate-300" 
                placeholder="Ej: Juan Pérez" 
              />
            </div>
          </div>
          
          {lastRecord && (
            <div className="animate-in slide-in-from-bottom duration-700">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-12 rounded-[4.5rem] text-white shadow-[0_32px_64px_-16px_rgba(16,185,129,0.5)] border border-white/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_0%,rgba(255,255,255,0.15),transparent)]"></div>
                <div className="flex items-center gap-6 mb-10 relative z-10">
                  <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center backdrop-blur-md shadow-2xl border border-white/20">
                    <i className="fa-solid fa-key-skeleton text-3xl"></i>
                  </div>
                  <h3 className="font-black uppercase tracking-[0.25em] text-lg">Acceso Temporal Por una unica Ves</h3>
                </div>
                {lastRecord.acceso_temp && (
                  <div className="bg-white/10 backdrop-blur-3xl p-10 rounded-[3.5rem] text-center space-y-6 shadow-2xl border border-white/20 relative z-10">
                    <div className="text-6xl font-mono font-black tracking-[0.35em] text-white py-4 drop-shadow-2xl">{lastRecord.acceso_temp}</div>
                    <div className="h-0.5 w-16 bg-white/30 mx-auto rounded-full"></div>
                    <p className="text-[14px] text-white/90 font-bold leading-relaxed px-4">
                      Usa este código para abrir la cerradura inteligente durante tu estancia.
                    </p>
                  </div>
                )}
                <div className="mt-10 flex justify-center relative z-10">
                  <span className="bg-white/95 text-emerald-700 px-10 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-3 animate-pulse">
                    <i className="fa-solid fa-check-circle text-sm"></i> REGISTRO EXITOSO
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <div className="grid gap-8">
            <CheckActionCard icon="door-open" title="Check-in" label="LLEGADA" desc={T.checkin_instructions} color="text-sky-600" bg="bg-sky-50" onClick={() => handleCheckAction('checkin')} />
            <CheckActionCard icon="door-closed" title="Check-out" label="SALIDA" desc={T.checkout_instructions} color="text-slate-800" bg="bg-slate-50" onClick={() => handleCheckAction('checkout')} />
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
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
          <div className="bg-amber-500/10 border border-amber-500/20 p-8 rounded-[3rem] mb-10 flex items-center backdrop-blur-sm shadow-sm">
            <i className="fa-solid fa-sparkles text-amber-500 text-3xl mr-6 animate-bounce"></i>
            <p className="text-amber-900 text-[13px] font-bold leading-relaxed">Información clave para facilitar tu estancia en el apartamento.</p>
          </div>
          {Object.entries(guideData).length > 0 ? Object.entries(guideData).map(([title, content], i) => (
            <div key={i} className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-xl hover:shadow-2xl transition-all group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-amber-400/20 group-hover:bg-amber-400 transition-colors"></div>
              <div className="flex items-center gap-5 mb-6">
                <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
                  <i className="fa-solid fa-info-circle text-2xl"></i>
                </div>
                <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight">{title as string}</h4>
              </div>
              <p className="text-slate-500 text-[15px] leading-relaxed font-medium pl-2">{content as string}</p>
            </div>
          )) : (
            <div className="text-center py-40 space-y-6">
              <i className="fa-solid fa-book-open text-slate-100 text-[10rem]"></i>
              <p className="text-slate-400 font-black uppercase tracking-widest text-xs">No hay guías disponibles</p>
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
        <div className="p-8 space-y-12 pb-20 animate-in fade-in duration-500">
          <div className="bg-white p-12 rounded-[4.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 flex flex-col items-center text-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-56 h-56 bg-pink-500/5 rounded-full -mr-28 -mt-28 group-hover:scale-125 transition-transform duration-1000"></div>
            <div className="relative mb-10">
              <div className="absolute inset-0 bg-pink-500/20 blur-[40px] rounded-full group-hover:blur-[60px] transition-all"></div>
              <img src={property.host_photo_url || `https://ui-avatars.com/api/?name=${property.host_name}&background=db2777&color=fff`} className="w-52 h-52 rounded-[4rem] object-cover shadow-2xl border-8 border-white relative z-10" alt="Host" />
              <div className="absolute -bottom-3 -right-3 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white w-16 h-16 rounded-[1.75rem] flex items-center justify-center border-4 border-white shadow-xl z-20 animate-bounce">
                <i className="fa-solid fa-user-check text-2xl"></i>
              </div>
            </div>
            <h4 className="font-black text-4xl text-slate-950 tracking-tight mb-4">{property.host_name}</h4>
            <div className="flex items-center gap-3 bg-pink-50 text-pink-600 px-8 py-2.5 rounded-full border border-pink-100 shadow-sm">
               <span className="w-2.5 h-2.5 bg-pink-500 rounded-full animate-ping"></span>
               <span className="text-[11px] font-black uppercase tracking-[0.3em]">Host Verificado</span>
            </div>
          </div>
          
          <div className="grid gap-6">
            <ContactActionBtn href={`https://wa.me/${wa}`} icon="fa-brands fa-whatsapp" label="Chatea con nosotros" subLabel="WhatsApp" color="bg-emerald-500" iconColor="text-emerald-500" />
            <ContactActionBtn href={`tel:${property.phone_number}`} icon="fa-solid fa-phone-volume" label="Llamada Directa" subLabel="Soporte 24/7" color="bg-sky-500" iconColor="text-sky-500" />
          </div>
        </div>
      </Layout>
    );
  }

  // --- VISTA RECOMENDACIONES ---
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
        <div className="p-8 space-y-10 pb-32 animate-in fade-in duration-500">
          {recommendations.length > 0 ? recommendations.map((rec: Recomendacion, i: number) => {
            const dynamicImg = `https://loremflickr.com/800/600/${encodeURIComponent(rec.nombre.split(' ')[0])},${rec.tipo.toLowerCase()}?lock=${i + 400}`;
            return (
              <div key={i} className="bg-white rounded-[4rem] overflow-hidden shadow-[0_32px_64px_-24px_rgba(0,0,0,0.15)] border border-slate-100 group transition-all hover:scale-[1.02] hover:shadow-2xl">
                <div className="h-64 relative overflow-hidden">
                  <img src={rec.foto_url || dynamicImg} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-[12s] ease-out" alt={rec.nombre} onError={(e) => (e.target as any).src = dynamicImg} />
                  <div className="absolute top-6 left-6">
                    <span className="bg-white/90 backdrop-blur-xl px-7 py-2.5 rounded-2xl text-[10px] font-black text-sky-700 uppercase tracking-widest shadow-2xl border border-white/20">
                      {rec.tipo}
                    </span>
                  </div>
                </div>
                <div className="p-10 space-y-8">
                  <div className="space-y-4">
                    <h4 className="text-3xl font-black text-slate-950 leading-tight tracking-tight">{rec.nombre}</h4>
                    <p className="text-slate-500 text-[15px] leading-relaxed font-medium line-clamp-4">{rec.descripcion}</p>
                  </div>
                  
                  <div className="pt-8 border-t border-slate-50 space-y-5">
                    {rec.direccion && (
                      <div className="flex items-center gap-5 text-slate-400 font-bold text-xs">
                        <div className="w-12 h-12 bg-slate-50 rounded-[1.25rem] flex items-center justify-center text-sky-500 shadow-sm"><i className="fa-solid fa-map-pin text-xl"></i></div>
                        <span className="truncate">{rec.direccion}</span>
                      </div>
                    )}
                    {rec.telefono && (
                      <a href={`tel:${rec.telefono}`} className="flex items-center gap-5 text-emerald-600 font-black text-xs group/tel">
                        <div className="w-12 h-12 bg-emerald-50 rounded-[1.25rem] flex items-center justify-center text-emerald-500 group-hover/tel:bg-emerald-500 group-hover/tel:text-white transition-all shadow-sm"><i className="fa-solid fa-phone-flip text-xl"></i></div>
                        <span>{rec.telefono}</span>
                      </a>
                    )}
                  </div>
                  
                  <a href={rec.url_mapa} target="_blank" rel="noreferrer" className="w-full bg-slate-950 text-white py-6 rounded-[2.5rem] block text-center font-black text-xs uppercase tracking-[0.35em] shadow-2xl active:scale-[0.98] transition-all transform hover:-translate-y-1">
                    <i className="fa-solid fa-diamond-turn-right mr-3 text-sky-400"></i>COMO LLEGAR
                  </a>
                </div>
              </div>
            );
          }) : (
            <div className="text-center py-40 space-y-10 animate-pulse">
              <i className="fa-solid fa-location-arrow text-slate-100 text-[12rem]"></i>
              <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-xs">Explora el entorno...</p>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // --- VISTA ADMIN (RESTORED) ---
  if (currentView === View.ADMIN) {
    if (!adminAuth) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-slate-950 text-white overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(14,165,233,0.12),transparent)] pointer-events-none"></div>
          <div className="w-full max-w-sm space-y-12 text-center relative z-10 animate-in fade-in zoom-in duration-1000">
            <div className="w-28 h-28 bg-sky-500/10 border border-sky-500/20 rounded-[3rem] flex items-center justify-center mx-auto shadow-2xl animate-pulse">
              <i className="fa-solid fa-fingerprint text-6xl text-sky-500"></i>
            </div>
            <div className="space-y-3">
              <h2 className="text-4xl font-black tracking-tight">{T.admin_panel_title}</h2>
              <p className="text-slate-500 text-[11px] font-black uppercase tracking-[0.4em]">Propiedad Segura</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-8">
              <input 
                type="password" 
                value={adminPass} 
                onChange={(e) => setAdminPass(e.target.value)} 
                className="w-full p-8 bg-slate-900/50 border border-slate-800 rounded-[2.5rem] text-center font-black text-3xl tracking-[0.4em] outline-none focus:border-sky-500 focus:bg-slate-900 transition-all shadow-inner" 
                placeholder="ID" 
              />
              <button className="w-full bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-500 hover:to-sky-600 py-7 rounded-[2.5rem] font-black uppercase tracking-[0.25em] transition-all shadow-2xl shadow-sky-900/20 active:scale-95">
                {T.admin_authenticate}
              </button>
            </form>
            <button onClick={() => setCurrentView(View.LOGIN)} className="text-slate-600 hover:text-white text-xs font-black uppercase tracking-[0.4em] transition-colors">{T.admin_return_home}</button>
          </div>
        </div>
      );
    }
    return (
      <Layout title={T.admin_panel_title} lang={language} onLanguageChange={setLanguage} onBack={() => {setAdminAuth(false); setCurrentView(View.LOGIN)}}>
        <div className="relative min-h-screen pb-48">
          <div className="fixed inset-0 opacity-[0.05] pointer-events-none bg-center bg-cover bg-fixed" style={{ backgroundImage: `url(${editingProperty?.foto_portada_url || DEFAULT_COVER})` }} />
          <div className="relative z-10 p-6 space-y-8">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-[3.5rem] flex items-center shadow-sm backdrop-blur-md">
              <div className="w-14 h-14 bg-emerald-500 rounded-[1.25rem] flex items-center justify-center mr-6 shadow-xl shadow-emerald-500/20">
                <i className="fa-solid fa-wand-magic-sparkles text-white text-xl"></i>
              </div>
              <div>
                <span className="text-emerald-800 text-[11px] font-black uppercase block tracking-widest">{T.admin_edit_active}</span>
                <p className="text-emerald-700 text-sm font-bold">{editingProperty?.nombre_apartamento}</p>
              </div>
            </div>

            <AdminSection icon="building" color="text-sky-600" title={T.admin_property_info}>
              <AdminInputField label="Nombre Apartamento" value={editingProperty?.nombre_apartamento} onChange={v => setEditingProperty({...editingProperty!, nombre_apartamento: v})} />
              <AdminInputField label="Anfitrión" value={editingProperty?.host_name} onChange={v => setEditingProperty({...editingProperty!, host_name: v})} />
              <div className="grid grid-cols-2 gap-5">
                <AdminInputField label="Ciudad" value={editingProperty?.ciudad} onChange={v => setEditingProperty({...editingProperty!, ciudad: v})} />
                <AdminInputField label="Dirección" value={editingProperty?.direccion} onChange={v => setEditingProperty({...editingProperty!, direccion: v})} />
              </div>
              <div className="space-y-3">
                <label className="text-[11px] font-black uppercase text-slate-400 ml-2 tracking-widest">Descripción</label>
                <textarea value={editingProperty?.descripcion_corta} onChange={e => setEditingProperty({...editingProperty!, descripcion_corta: e.target.value})} className="w-full p-6 bg-slate-50 rounded-[2rem] text-sm border-2 border-transparent focus:border-sky-500 focus:bg-white outline-none h-32 transition-all shadow-sm" />
              </div>
              <div className="grid grid-cols-3 gap-5">
                <AdminInputField label="Hab." type="number" value={editingProperty?.num_habitaciones?.toString()} onChange={v => setEditingProperty({...editingProperty!, num_habitaciones: parseInt(v) || 0})} />
                <AdminInputField label="Baños" type="number" value={editingProperty?.num_banos?.toString()} onChange={v => setEditingProperty({...editingProperty!, num_banos: parseInt(v) || 0})} />
                <AdminInputField label="Cap." type="number" value={editingProperty?.capacidad_personas?.toString()} onChange={v => setEditingProperty({...editingProperty!, capacidad_personas: parseInt(v) || 0})} />
              </div>
            </AdminSection>

            <AdminSection icon="wifi" color="text-blue-600" title="Conectividad">
              <div className="grid grid-cols-2 gap-5">
                <AdminInputField label="SSID (WiFi)" value={editingProperty?.wifi_ssid} onChange={v => setEditingProperty({...editingProperty!, wifi_ssid: v})} />
                <AdminInputField label="Password" value={editingProperty?.wifi_password} onChange={v => setEditingProperty({...editingProperty!, wifi_password: v})} />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <AdminInputField label="WhatsApp" value={editingProperty?.whatsapp_number} onChange={v => setEditingProperty({...editingProperty!, whatsapp_number: v})} />
                <AdminInputField label="Teléfono" value={editingProperty?.phone_number} onChange={v => setEditingProperty({...editingProperty!, phone_number: v})} />
              </div>
            </AdminSection>

            <AdminSection icon="book-bookmark" color="text-amber-600" title="Contenido">
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[11px] font-black uppercase text-slate-400 ml-2 tracking-widest">Reglas (Una por línea)</label>
                  <textarea value={editingProperty?.reglas} onChange={e => setEditingProperty({...editingProperty!, reglas: e.target.value})} className="w-full p-6 bg-slate-50 rounded-[2rem] text-sm border-2 border-transparent focus:border-sky-500 h-48 outline-none transition-all shadow-sm" />
                </div>
                <div className="space-y-3">
                  <label className="text-[11px] font-black uppercase text-slate-400 ml-2 tracking-widest">Guía (Título:Descripción)</label>
                  <textarea value={guideSimpleText} onChange={e => setGuideSimpleText(e.target.value)} className="w-full p-6 bg-slate-50 rounded-[2rem] text-sm border-2 border-transparent focus:border-sky-500 h-48 font-mono outline-none transition-all shadow-sm" />
                </div>
              </div>
            </AdminSection>

            <button 
              onClick={handleSaveAdmin} 
              disabled={isSaving} 
              className="fixed bottom-12 left-8 right-8 max-w-sm mx-auto bg-slate-950 text-white py-8 rounded-[3rem] font-black uppercase tracking-[0.35em] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)] z-[150] active:scale-95 transition-all flex items-center justify-center"
            >
              {isSaving ? <i className="fa-solid fa-spinner animate-spin text-2xl"></i> : <><i className="fa-solid fa-check-double mr-4 text-xl"></i>ACTUALIZAR GUÍA</>}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return null;
};

// --- HELPER COMPONENTS ---

const AdminSection: React.FC<{ icon: string, color: string, title: string, children: React.ReactNode }> = ({ icon, color, title, children }) => (
  <section className="bg-white/85 backdrop-blur-2xl p-10 rounded-[4rem] shadow-2xl shadow-slate-200/50 space-y-10 border border-slate-100 relative overflow-hidden group">
    <div className="flex items-center gap-5 border-b border-slate-100 pb-8 relative z-10">
      <div className={`w-14 h-14 ${color.replace('text', 'bg').replace('600', '100')} ${color} rounded-[1.5rem] flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform`}>
        <i className={`fa-solid fa-${icon}`}></i>
      </div>
      <h3 className="font-black uppercase text-[12px] text-slate-900 tracking-[0.4em]">{title}</h3>
    </div>
    <div className="space-y-8 relative z-10">{children}</div>
  </section>
);

const AdminInputField: React.FC<{ label: string, value?: string, onChange: (v: string) => void, type?: string }> = ({ label, value, onChange, type = 'text' }) => (
  <div className="space-y-3">
    <label className="text-[11px] font-black uppercase text-slate-400 ml-2 tracking-widest">{label}</label>
    <input 
      type={type} 
      value={value || ''} 
      onChange={e => onChange(e.target.value)} 
      className="w-full p-6 bg-slate-50/70 border-2 border-transparent focus:border-sky-500 focus:bg-white rounded-[1.75rem] outline-none font-bold text-sm text-slate-900 transition-all shadow-sm" 
      placeholder={label} 
    />
  </div>
);

const StatCard: React.FC<{ icon: string, value: any, label: string, color: string, bg: string }> = ({ icon, value, label, color, bg }) => (
  <div className="bg-white p-8 rounded-[3rem] border border-slate-100 text-center shadow-2xl shadow-slate-200/40 group hover:shadow-2xl transition-all">
    <div className={`w-14 h-14 ${bg} ${color} rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 shadow-sm group-hover:scale-110 transition-transform`}>
      <i className={`fa-solid fa-${icon} text-xl`}></i>
    </div>
    <p className="text-2xl font-black text-slate-950 tracking-tighter">{value}</p>
    <p className="text-[10px] uppercase text-slate-400 font-black tracking-[0.2em] mt-2">{label}</p>
  </div>
);

const QuickActionBtn: React.FC<{ icon: string, label: string, onClick: () => void, color: string }> = ({ icon, label, onClick, color }) => (
  <button 
    onClick={onClick} 
    className={`flex flex-col items-center justify-center p-10 bg-white rounded-[3.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 transition-all hover:shadow-2xl active:scale-95 group relative overflow-hidden`}
  >
    <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-[0.03] transition-opacity`}></div>
    <div className={`w-16 h-16 bg-gradient-to-br ${color} rounded-[1.75rem] flex items-center justify-center mb-6 shadow-2xl shadow-slate-200 group-hover:scale-110 transition-transform`}>
      <i className={`fa-solid fa-${icon} text-white text-3xl`}></i>
    </div>
    <span className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-900 text-center leading-tight group-hover:text-sky-600 transition-colors">{label}</span>
  </button>
);

const ContactActionBtn: React.FC<{ href: string, icon: string, label: string, subLabel: string, color: string, iconColor: string }> = ({ href, icon, label, subLabel, color, iconColor }) => (
  <a href={href} target="_blank" rel="noreferrer" className="bg-white hover:bg-slate-50 p-10 rounded-[4rem] border border-slate-100 shadow-2xl shadow-slate-200 transition-all flex items-center justify-between group">
    <div className="flex items-center gap-8">
      <div className={`w-20 h-20 ${color} rounded-[2rem] flex items-center justify-center text-white text-4xl shadow-2xl shadow-emerald-900/10 group-hover:scale-110 transition-transform`}>
        <i className={icon}></i>
      </div>
      <div className="text-left">
        <p className="font-black text-xl uppercase tracking-widest text-slate-950">{label}</p>
        <p className="text-[11px] text-slate-400 font-bold mt-2 tracking-[0.2em] uppercase">{subLabel}</p>
      </div>
    </div>
    <i className="fa-solid fa-chevron-right text-slate-200 text-2xl group-hover:translate-x-3 transition-transform"></i>
  </a>
);

const CheckActionCard: React.FC<{ icon: string, title: string, label: string, desc: string, color: string, bg: string, onClick: () => void }> = ({ icon, title, label, desc, color, bg, onClick }) => (
  <button 
    onClick={onClick} 
    className="bg-white p-12 rounded-[4.5rem] border border-slate-100 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.12)] text-left group hover:ring-[12px] hover:ring-sky-500/5 transition-all"
  >
    <div className="flex justify-between items-start mb-10">
      <div className={`w-20 h-20 ${bg} ${color} rounded-[2.25rem] flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform`}>
        <i className={`fa-solid fa-${icon} text-4xl`}></i>
      </div>
      <span className={`${color} text-[11px] font-black uppercase tracking-[0.5em] mt-4`}>{label}</span>
    </div>
    <h3 className="font-black text-5xl text-slate-950 mb-4 tracking-tighter">{title}</h3>
    <p className="text-slate-400 text-sm leading-relaxed font-medium line-clamp-2 pr-6">{desc}</p>
  </button>
);

export default App;
