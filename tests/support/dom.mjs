// A browser for the tests to run the components in.
//
// This is what the E2E suite has and the unit tests did not, and the gap showed:
// every bug these files shipped was in a hook — an effect that cleared a
// reader's drafts when it should not have, a Set rebuilt on every render so a
// checkbox reverted under the click that set it. None of that is visible to a
// renderer that only produces a string, and all of it is cheap to provoke with a
// real DOM and a real click.
//
// happy-dom rather than a browser: React needs somewhere to commit to and
// something to dispatch events at, not a rendering engine. The E2E suite still
// answers "does this work in Chromium", which is a different question.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";

// React refuses to run act() unless it is told the environment is a test one.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// FormData is on this list for a reason worth stating: Node has one of its own,
// and it refuses a form element that did not come from Node's own DOM. The
// login form reads itself with `new FormData(event.currentTarget)`, so without
// the window's version every sign-in in these tests throws inside React.
const COPIED_GLOBALS = [
  "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLFormElement",
  "SVGElement", "Event", "SubmitEvent", "CustomEvent", "MouseEvent",
  "KeyboardEvent", "MutationObserver", "DOMParser", "FormData", "Blob", "File",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "Text"
];

let active = null;

/**
 * Install a fresh window. Fresh, not reused, because these tests are about
 * state that outlives a render — sessionStorage drafts, a hash route, the
 * server-clock offset — and a window carried between tests would carry that
 * state with it.
 */
export function openBrowser({ url = "http://localhost:4173/" } = {}) {
  closeBrowser();

  const window = new Window({ url });
  active = { window, roots: [] };

  // defineProperty rather than assignment: Node already owns some of these
  // names — navigator is a getter with no setter — and assigning to them throws.
  const install = (name, value) =>
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });

  install("window", window);
  install("document", window.document);
  install("navigator", window.navigator);
  install("location", window.location);
  install("localStorage", window.localStorage);
  install("sessionStorage", window.sessionStorage);
  for (const name of COPIED_GLOBALS) install(name, window[name]);

  return window;
}

export function closeBrowser() {
  if (!active) return;
  for (const root of active.roots) {
    try {
      act(() => root.unmount());
    } catch {
      // A root whose window is already gone cannot be unmounted cleanly, and a
      // failure to tear down must not be reported as a failure of the test.
    }
  }
  active.roots.length = 0;
  active = null;
}

/**
 * Mount a component and return its container plus the tools to drive it.
 * Everything that changes React state goes through act(), so effects have run
 * and the DOM has settled by the time the call returns.
 */
export function render(component, props = {}) {
  if (!active) openBrowser();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  active.roots.push(root);

  act(() => root.render(createElement(component, props)));

  return {
    container,
    rerender: nextProps => act(() => root.render(createElement(component, nextProps))),
    unmount: () => act(() => root.unmount()),
    html: () => container.innerHTML,
    text: () => container.textContent,
    find: selector => container.querySelector(selector),
    findAll: selector => [...container.querySelectorAll(selector)]
  };
}

// Clicks the way a reader does: a real event, bubbling to React's listener on
// the container, inside act() so the resulting render is finished on return.
export function click(element) {
  if (!element) throw new Error("click() was given nothing to click");
  act(() => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

export function type(input, value) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter ? setter.call(input, value) : (input.value = value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

// Lets pending promises settle and React flush what they caused. Awaited rather
// than timed, so a slow machine cannot turn a passing test into a failing one.
export async function settle(times = 3) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

export { act };
