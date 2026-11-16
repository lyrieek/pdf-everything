import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom 不支持 matchMedia，需要手动 mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// jsdom 不支持 IntersectionObserver，需要手动 mock
class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn(() => [])
  root = null
  rootMargin = ''
  thresholds = []
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})
Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

// jsdom 不支持 ResizeObserver，需要手动 mock
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
})
Object.defineProperty(global, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
})

// jsdom 未实现 scrollTo
Object.defineProperty(Element.prototype, 'scrollTo', {
  writable: true,
  configurable: true,
  value: vi.fn(),
})
