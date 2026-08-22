/* db.js — couche d'accès IndexedDB, sans dépendance externe */

const DB_NAME = 'sport-app-db';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('planned')) {
        // séances planifiées dans le calendrier
        const store = db.createObjectStore('planned', { keyPath: 'id' });
        store.createIndex('by_date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('kv')) {
        // stockage clé/valeur générique : version, session active, etc.
        db.createObjectStore('kv', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  // ---- templates (séances pré-définies) ----
  async getAllTemplates() {
    const store = await tx('templates', 'readonly');
    return wrapRequest(store.getAll());
  },
  async getTemplate(id) {
    const store = await tx('templates', 'readonly');
    return wrapRequest(store.get(id));
  },
  async saveTemplate(template) {
    const store = await tx('templates', 'readwrite');
    return wrapRequest(store.put(template));
  },
  async deleteTemplate(id) {
    const store = await tx('templates', 'readwrite');
    return wrapRequest(store.delete(id));
  },

  // ---- séances planifiées dans le calendrier ----
  async getPlannedForRange(startDate, endDate) {
    const store = await tx('planned', 'readonly');
    const all = await wrapRequest(store.getAll());
    return all.filter(p => p.date >= startDate && p.date <= endDate);
  },
  async getPlannedForDate(date) {
    const store = await tx('planned', 'readonly');
    const all = await wrapRequest(store.getAll());
    return all.filter(p => p.date === date);
  },
  async savePlanned(entry) {
    const store = await tx('planned', 'readwrite');
    return wrapRequest(store.put(entry));
  },
  async deletePlanned(id) {
    const store = await tx('planned', 'readwrite');
    return wrapRequest(store.delete(id));
  },

  // ---- clé / valeur (version, session active) ----
  async getKV(key) {
    const store = await tx('kv', 'readonly');
    const res = await wrapRequest(store.get(key));
    return res ? res.value : undefined;
  },
  async setKV(key, value) {
    const store = await tx('kv', 'readwrite');
    return wrapRequest(store.put({ key, value }));
  },
  async deleteKV(key) {
    const store = await tx('kv', 'readwrite');
    return wrapRequest(store.delete(key));
  },
};

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
