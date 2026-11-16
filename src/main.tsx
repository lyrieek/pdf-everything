import { render } from 'preact'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n' // 初始化 i18n
import './index.css'
import { App } from './app.tsx'

render(
  <I18nextProvider i18n={i18n}>
    <App />
  </I18nextProvider>,
  document.getElementById('app')!,
)
