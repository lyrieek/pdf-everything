import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zh from './locales/zh.json'

const resources = {
  en: { translation: en },
  zh: { translation: zh },
}

// 获取浏览器语言或本地存储的语言
const getInitialLanguage = (): 'en' | 'zh' => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('language') as 'en' | 'zh' | null
    if (stored && (stored === 'en' || stored === 'zh')) {
      return stored
    }
    const browserLang = navigator.language.toLowerCase()
    if (browserLang.startsWith('zh')) {
      return 'zh'
    }
  }
  return 'en'
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

export function setLanguage(lang: 'en' | 'zh') {
  i18n.changeLanguage(lang)
  if (typeof window !== 'undefined') {
    localStorage.setItem('language', lang)
  }
}

export function getCurrentLanguage(): 'en' | 'zh' {
  return i18n.language as 'en' | 'zh'
}

export default i18n
