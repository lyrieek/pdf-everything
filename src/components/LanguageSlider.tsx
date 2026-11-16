import { useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'

import { Slider } from './Slider'
import type { SliderOption } from './Slider'
import { setLanguage } from '../i18n'
import './LanguageSlider.css'

export type Language = 'zh' | 'en'

const LANGUAGE_OPTIONS: readonly SliderOption<Language>[] = [
  { value: 'zh', label: '中文', icon: <span className="language-slider__text">中</span> },
  { value: 'en', label: 'English', icon: <span className="language-slider__text">EN</span> },
]

/** 把 i18n 的语言标识归一化为支持的语言 */
function toLanguage(value: string): Language {
  return value.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** 中英文切换滑块 */
export function LanguageSlider() {
  const { t, i18n } = useTranslation()
  const [language, setLanguageState] = useState<Language>(() => toLanguage(i18n.language))

  const handleChange = (next: Language) => {
    if (next === language) return
    setLanguageState(next)
    setLanguage(next)
  }

  return (
    <Slider
      value={language}
      options={LANGUAGE_OPTIONS}
      onChange={handleChange}
      ariaLabel={t('aria.language')}
    />
  )
}
