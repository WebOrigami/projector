export default class RecentSet {
  constructor(iterable, maxSize = 10) {
    this.maxSize = maxSize;
    this.items = [];
    for (const item of iterable) {
      this.add(item);
    }
  }

  add(item) {
    // Remove if already in set
    this.items = this.items.filter((i) => i !== item);

    // Add to end
    this.items.push(item);

    // Enforce max size
    if (this.items.length > this.maxSize) {
      this.items = this.items.slice(this.items.length - this.maxSize);
    }
  }

  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }

  clear() {
    this.items = [];
  }

  has(item) {
    return this.items.includes(item);
  }

  remove(item) {
    this.items = this.items.filter((i) => i !== item);
  }

  toJSON() {
    return this.items;
  }
}
