/**
 * Given a maximum size, returns utility functions that add an item
 * to an array
 *
 * @param {number} maxSize
 */
export default function recent(maxSize) {
  const fns = {
    add(items, item) {
      // Remove if already in set
      items = fns.remove(items, item);

      // Add to end
      items.push(item);

      // Enforce max size
      if (items.length > maxSize) {
        items = items.slice(items.length - maxSize);
      }

      return items;
    },

    remove(items, item) {
      return items.filter((i) => i !== item);
    },
  };

  return fns;
}
