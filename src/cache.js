import fs from 'node:fs/promises';
import path from 'node:path';

// A small persistent key/value cache backed by one JSON file. Each record
// carries the time it was fetched so callers can decide what counts as stale.
export class JsonCache {
  constructor(file) {
    this.file = file;
    this.records = {};
    this.dirty = false;
  }

  async load() {
    try {
      this.records = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch {
      this.records = {};
    }
    return this;
  }

  get(key) {
    return this.records[key];
  }

  // True when there is a record younger than maxAgeMs.
  isFresh(key, maxAgeMs) {
    const record = this.records[key];
    return Boolean(record && Date.now() - record.fetchedAt < maxAgeMs);
  }

  set(key, value) {
    this.records[key] = { value, fetchedAt: Date.now() };
    this.dirty = true;
  }

  async save() {
    if (!this.dirty) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.records));
    await fs.rename(tmp, this.file);
    this.dirty = false;
  }
}
