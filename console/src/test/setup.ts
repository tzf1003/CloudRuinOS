import '@testing-library/jest-dom'
import { expect, afterEach, beforeEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Configure React Testing Library for better React 18 compatibility
configure({
  testIdAttribute: 'data-testid',
})

// Setup DOM environment for React 18
beforeEach(() => {
  // Clear any existing content first
  if (document.body) {
    document.body.innerHTML = '';
  }
  
  // Ensure we have a proper DOM structure
  if (!document.documentElement) {
    const html = document.createElement('html');
    document.appendChild(html);
  }
  
  if (!document.body) {
    const body = document.createElement('body');
    document.documentElement.appendChild(body);
  }
  
  // Add a root container for React
  const container = document.createElement('div');
  container.id = 'test-root';
  document.body.appendChild(container);
});

// Cleanup after each test case
afterEach(() => {
  cleanup()
  // Clear DOM content
  if (document.body) {
    document.body.innerHTML = '';
  }
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}

// Mock WebSocket
global.WebSocket = class WebSocket {
  constructor(url: string) {
    this.url = url
  }
  url: string
  readyState = 1
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true }
}