'use strict';

class BoundedBuffer {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError('El límite del buffer debe ser un entero positivo');
    }
    this.limit = limit;
    this.items = [];
  }

  push(item) {
    if (this.items.length === this.limit) {
      this.items.shift();
    }
    this.items.push(item);
  }

  values() {
    return [...this.items];
  }

  clear() {
    this.items = [];
  }

  get length() {
    return this.items.length;
  }
}

module.exports = { BoundedBuffer };
