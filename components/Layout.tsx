
import React from 'react';
import { Language } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  onBack?: () => void;
  lang: Language;
  onLanguageChange: (lang: Language) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, title, onBack, lang, onLanguageChange }) => {
  return (
    <div className="flex flex-col min-h-[100dvh] max-w-md mx-auto bg-white shadow-xl relative overflow-x-hidden">
      {/* Header - Mejorado para Mobile con z-index alto */}
      <header className="sticky top-0 z-[100] bg-sky-600 text-white px-4 shadow-md flex items-center h-16 shrink-0">
        <div className="flex items-center flex-1 min-w-0">
          {onBack && (
            <button onClick={onBack} className="mr-2 p-2 -ml-2 hover:bg-sky-700 rounded-full transition-colors shrink-0">
              <i className="fa-solid fa-chevron-left text-lg"></i>
            </button>
          )}
          <h1 className="font-bold text-base truncate pr-2">{title || 'GuestGuide'}</h1>
        </div>
        
        {/* Language Switcher - Con ancho fijo para evitar desaparición */}
        <div className="flex shrink-0 bg-sky-700 rounded-xl p-1 border border-sky-500/30 ml-2">
          <button 
            onClick={() => onLanguageChange('es')}
            className={`px-3 py-1 text-[11px] font-black rounded-lg transition-all ${lang === 'es' ? 'bg-white text-sky-700 shadow-sm' : 'text-sky-200 hover:text-white'}`}
          >
            ES
          </button>
          <button 
            onClick={() => onLanguageChange('en')}
            className={`px-3 py-1 text-[11px] font-black rounded-lg transition-all ${lang === 'en' ? 'bg-white text-sky-700 shadow-sm' : 'text-sky-200 hover:text-white'}`}
          >
            EN
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>

      {/* Optional Footer/Copyright */}
      <footer className="p-4 text-center text-[10px] text-gray-400 bg-gray-50 safe-bottom">
        &copy; {new Date().getFullYear()} GuestGuide - Digital Experience
      </footer>
    </div>
  );
};

export default Layout;
