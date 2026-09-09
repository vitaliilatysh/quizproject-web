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
// First, and deliberately: this installs the window that react-dom measures on
// the import below. Moving it after react-dom breaks every controlled field in
// the suite — see browser-globals.ts.
import { installBrowserGlobals } from "./browser-globals.js";

import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";

// React refuses to run act() unless it is told the environment is a test one.
// Declared as well as set: it is not part of any published type, and an
// undeclared global assignment is exactly what the compiler should object to.
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface ActiveBrowser {
  window: Window;
  roots: Root[];
}

let active: ActiveBrowser | null = null;

/**
 * Install a fresh window. Fresh, not reused, because these tests are about
 * state that outlives a render — sessionStorage drafts, a hash route, the
 * server-clock offset — and a window carried between tests would carry that
 * state with it.
 */
export function openBrowser({ url = "http://localhost:4173/" } = {}): Window {
  closeBrowser();

  const window = new Window({ url });
  active = { window, roots: [] };
  installBrowserGlobals(window);
  return window;
}

export function closeBrowser(): void {
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
 * What {@link render} hands back: the mounted DOM and the ways to drive it.
 *
 * `find` insists the element is there and `query` allows it not to be. They
 * used to be one method returning `Element | null`, which meant every call site
 * either checked a null it knew could not happen or dereferenced one the
 * compiler had to be told about. Splitting them says which of the two a given
 * assertion actually means: three call sites in this suite are asserting
 * absence, and the rest would be broken tests if the element were missing.
 *
 * Both are generic so a test that needs `.checked` or `.disabled` can ask for
 * the element type that has it, rather than casting at the point of use.
 */
export interface Rendered<P> {
  container: HTMLElement;
  rerender: (nextProps: P) => void;
  unmount: () => void;
  html: () => string;
  text: () => string;
  find: <E extends Element = HTMLElement>(selector: string) => E;
  query: <E extends Element = HTMLElement>(selector: string) => E | null;
  findAll: <E extends Element = HTMLElement>(selector: string) => E[];
  /**
   * The nth match, insisting there is one. Destructuring `findAll` gives
   * `E | undefined` for every element, and a test that reaches for the second
   * pager button when only one exists is a failing test, not a case to handle.
   */
  at: <E extends Element = HTMLElement>(selector: string, index: number) => E;
}

/**
 * Mount a component and return its container plus the tools to drive it.
 * Everything that changes React state goes through act(), so effects have run
 * and the DOM has settled by the time the call returns.
 */
export function render<P extends object>(component: ComponentType<P>, props: P = {} as P): Rendered<P> {
  if (!active) openBrowser();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  active?.roots.push(root);

  act(() => root.render(createElement(component, props)));

  return {
    container,
    rerender: nextProps => act(() => root.render(createElement(component, nextProps))),
    unmount: () => act(() => root.unmount()),
    html: () => container.innerHTML,
    text: () => container.textContent ?? "",
    find: <E extends Element = HTMLElement>(selector: string): E => {
      const found = container.querySelector<E>(selector);
      if (!found) throw new Error(`Nothing matched ${selector} in the rendered output`);
      return found;
    },
    query: <E extends Element = HTMLElement>(selector: string): E | null =>
      container.querySelector<E>(selector),
    findAll: <E extends Element = HTMLElement>(selector: string): E[] =>
      [...container.querySelectorAll<E>(selector)],
    at: <E extends Element = HTMLElement>(selector: string, index: number): E => {
      const found = container.querySelectorAll<E>(selector)[index];
      if (!found) throw new Error(`${selector} has no match at index ${index}`);
      return found;
    }
  };
}

// Clicks the way a reader does: a real event, bubbling to React's listener on
// the container, inside act() so the resulting render is finished on return.
export function click(element: Element | null | undefined): void {
  if (!element) throw new Error("click() was given nothing to click");
  act(() => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/**
 * Types into a field the way a reader does.
 *
 * The value goes in through the prototype's own setter rather than through the
 * element, because React replaces the element's `value` property with a tracked
 * one: assigning to that records the new value as already seen and the change
 * event never fires. Taking the setter off the element's own prototype rather
 * than off HTMLInputElement matters too — a <textarea> given the input
 * element's setter throws, and the question editor is a textarea.
 */
export function type(input: Element | null | undefined, value: string): void {
  if (!input) throw new Error("type() was given nothing to type into");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    if (setter) setter.call(input, value);
    else (input as HTMLInputElement).value = value;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

// Submits a form the way pressing its button does, and waits for the handler.
// Every submit handler in this app is async — it calls the API — so a dispatch
// that only ran the synchronous part would assert against a half-finished
// render. `settle` here is what makes a submit mean "and then it happened".
export async function submit(form: Element | null | undefined): Promise<void> {
  if (!form) throw new Error("submit() was given nothing to submit");
  act(() => {
    form.dispatchEvent(new window.SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

// A <select> changed the way a reader changes it. React listens for "change" on
// a select rather than the "input" that drives a text field, which is why this
// cannot share an implementation with type().
export function select(element: Element | null | undefined, value: string): void {
  if (!element) throw new Error("select() was given nothing to choose from");
  act(() => {
    (element as HTMLSelectElement).value = value;
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

/**
 * Lets pending promises settle and React flush what they caused.
 *
 * Each pass yields to the macrotask queue, which drains every microtask behind
 * it — so one pass finishes a whole await chain rather than advancing it by a
 * single link. Counting microtasks was the earlier approach and it made the
 * count part of the test: a handler that awaited one step more than the count
 * allowed failed on the assertion after it, reported as the component not
 * having done its work. This is still not a timeout — nothing here waits for
 * elapsed time, so a slow machine cannot turn a passing test into a failing
 * one.
 */
export async function settle(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  }
}

export { act };
