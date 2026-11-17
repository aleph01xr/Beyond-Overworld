/// <reference types="vite/client" />

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module 'react' {
  export function useState<T>(initialState: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  export function StrictMode(props: { children?: unknown }): unknown;
}

declare module 'react/jsx-runtime' {
  export const Fragment: unknown;
  export function jsx(type: unknown, props: unknown, key?: string | number): unknown;
  export function jsxs(type: unknown, props: unknown, key?: string | number): unknown;
}

declare module 'react-dom/client' {
  export interface Root {
    render(children: unknown): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
}
