export const defaultState = {
  command: "",
  href: "",
  x: 0,
  y: 0,
};

/**
 * Return the scroll state of the given window.
 *
 * @param {Window} window
 */
export function getState(window) {
  let scrollState;
  try {
    scrollState = {
      command: state.command,
      href: window.location.href,
      x: window.scrollX,
      y: window.scrollY,
    };
  } catch (e) {
    // Ignore errors (e.g., if iframe is cross-origin)
    scrollState = defaultState;
  }
  return scrollState;
}

/**
 * Attempt to restore the scroll state of the given window.
 *
 * @param {Window} window
 * @param {*} scrollState
 */
export function restoreState(window, scrollState) {
  const { x, y } = scrollState;
  try {
    window.scrollTo(x, y);
  } catch (e) {
    // Ignore errors (e.g., if iframe is cross-origin)
  }
}
