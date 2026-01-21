export const defaultState = {
  command: "",
  href: "",
  x: 0,
  y: 0,
  elements: [],
};

/**
 * Check if an element is scrollable
 */
function isScrollable(element) {
  const hasScrollableContent =
    element.scrollHeight > element.clientHeight ||
    element.scrollWidth > element.clientWidth;

  if (!hasScrollableContent) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;

  return (
    overflowY === "scroll" ||
    overflowY === "auto" ||
    overflowX === "scroll" ||
    overflowX === "auto"
  );
}

/**
 * Get a unique selector for an element
 */
function getElementSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  // Build a path using tag names and nth-child
  const path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.className && typeof current.className === "string") {
      const classes = current.className.trim().split(/\s+/);
      if (classes.length > 0 && classes[0]) {
        selector += "." + classes.join(".");
      }
    }

    // Add nth-child if there are siblings with the same tag
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    path.unshift(selector);
    current = parent;
  }

  return path.join(" > ");
}

/**
 * Return the scroll state of the given window.
 *
 * @param {Window} window
 */
export function getState(window) {
  let scrollState;
  try {
    // Get window scroll position
    scrollState = {
      command: state.command,
      href: window.location.href,
      x: window.scrollX,
      y: window.scrollY,
      elements: [],
    };

    // Find all scrollable elements
    const allElements = window.document.querySelectorAll("*");
    for (const element of allElements) {
      if (isScrollable(element)) {
        // Save scroll position of a scrollable element that's actually scrolled
        const { scrollLeft, scrollTop } = element;
        if (scrollTop > 0 || scrollLeft > 0) {
          scrollState.elements.push({
            selector: getElementSelector(element),
            scrollTop,
            scrollLeft,
          });
        }
      }
    }
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
  const { x, y, elements = [] } = scrollState;
  try {
    // Restore window scroll position
    window.scrollTo(x, y);

    // Restore scroll position of each scrollable element
    for (const elementState of elements) {
      try {
        const element = window.document.querySelector(elementState.selector);
        if (element) {
          element.scrollTo(elementState.scrollLeft, elementState.scrollTop);
        }
      } catch (e) {
        // Element might not exist anymore, skip it
      }
    }
  } catch (e) {
    // Ignore errors (e.g., if iframe is cross-origin)
  }
}
