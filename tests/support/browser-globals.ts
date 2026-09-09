// The browser has to exist before react-dom is imported.
//
// react-dom measures its host once, at module evaluation, and one of the things
// it measures is whether `input` events are fired at all. Imported into a bare
// Node process it finds no document, records "no", and from then on routes
// every text field through the fallback it keeps for hosts that do not have the
// event — which listens for focus and property changes instead. The field's
// `input` event then reaches an `onInput` handler and never reaches `onChange`.
//
// That is not a hypothetical: it is what this suite was doing. Typing into a
// controlled field updated the DOM node and left the component's state empty,
// so the only tests that could pass were the ones over uncontrolled forms —
// which is exactly the set of tests that existed. The whole administration
// panel is controlled fields.
//
// So the window is installed here, in a module with no other imports, and
// dom.ts imports this one first. ES modules are evaluated in import order, so
// by the time react-dom runs there is a document for it to measure.
import { Window } from "happy-dom";

// FormData is on this list for a reason worth stating: Node has one of its own,
// and it refuses a form element that did not come from Node's own DOM. The
// login form reads itself with `new FormData(event.currentTarget)`, so without
// the window's version every sign-in in these tests throws inside React.
const COPIED_GLOBALS = [
  "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLFormElement",
  "SVGElement", "Event", "InputEvent", "SubmitEvent", "CustomEvent", "MouseEvent",
  "KeyboardEvent", "MutationObserver", "DOMParser", "FormData", "Blob", "File",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "Text"
] as const;

/**
 * Publish one window's globals as this process's globals.
 *
 * defineProperty rather than assignment: Node already owns some of these names
 * — navigator is a getter with no setter — and assigning to them throws.
 */
export function installBrowserGlobals(window: Window): void {
  const install = (name: string, value: unknown): void => {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  };

  install("window", window);
  install("document", window.document);
  install("navigator", window.navigator);
  install("location", window.location);
  install("localStorage", window.localStorage);
  install("sessionStorage", window.sessionStorage);
  for (const name of COPIED_GLOBALS) {
    install(name, (window as unknown as Record<string, unknown>)[name]);
  }
}

// The window react-dom measures. Every test gets a fresh one from openBrowser();
// this one exists only so that the measurement has something to measure.
installBrowserGlobals(new Window({ url: "http://localhost:4173/" }));
