'use strict';
/**
 * Loads every file of src/ into one shared global scope, the way Apps Script
 * does, with small stand-ins for the Apps Script services.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SRC = path.join(__dirname, '..', 'src');

/** A response for the UrlFetchApp stub. */
function response(code, body, headers) {
  return {
    getResponseCode: () => code,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)),
    getHeaders: () => headers || {}
  };
}

function memoryStore() {
  const map = new Map();
  return {
    map,
    get: (k) => (map.has(k) ? map.get(k) : null),
    put: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    getProperty: (k) => (map.has(k) ? map.get(k) : null),
    setProperty: (k, v) => void map.set(k, v),
    deleteProperty: (k) => void map.delete(k)
  };
}

/** A chainable builder: every setX(value) records `x` on the object. */
function builder(target) {
  return new Proxy(target, {
    get(obj, prop, proxy) {
      if (prop in obj || typeof prop !== 'string' || !prop.startsWith('set')) return obj[prop];
      return (value) => {
        obj[prop[3].toLowerCase() + prop.slice(4)] = value;
        return proxy;
      };
    }
  });
}

function communityConnector() {
  const enumOf = (...names) => Object.fromEntries(names.map((n) => [n, n]));
  return {
    AuthType: enumOf('KEY', 'NONE', 'OAUTH2', 'USER_PASS', 'USER_TOKEN', 'PATH_KEY', 'PATH_USER_PASS'),
    FieldType: enumOf('TEXT', 'NUMBER', 'BOOLEAN', 'YEAR_MONTH_DAY'),
    AggregationType: enumOf('SUM', 'AVG', 'COUNT'),
    newAuthTypeResponse: () => builder({ build() { return { type: this.authType }; } }),
    getConfig() {
      const config = { inputs: [], dateRangeRequired: false };
      const add = (kind) => () => {
        const item = { kind };
        config.inputs.push(item);
        return builder(item);
      };
      return builder({
        newInfo: add('INFO'),
        newTextInput: add('TEXTINPUT'),
        newTextArea: add('TEXTAREA'),
        build() { return { configParams: config.inputs, dateRangeRequired: !!this.dateRangeRequired }; }
      });
    },
    getFields() {
      const list = [];
      const add = (concept) => () => {
        const field = { concept };
        list.push(field);
        return builder(field);
      };
      return { newDimension: add('DIMENSION'), newMetric: add('METRIC'), build: () => list };
    },
    newUserError: () => builder({
      throwException() {
        const error = new Error(this.text);
        error.isLookerUserError = true;
        throw error;
      }
    })
  };
}

/**
 * Returns the connector's global scope. `fetch(url, params)` answers the
 * requests; every call is recorded in `calls`.
 */
function loadConnector(fetch) {
  const calls = [];
  const userCache = memoryStore();
  const userProperties = memoryStore();
  const context = vm.createContext({
    console,
    UrlFetchApp: {
      fetch(url, params) {
        calls.push({ url, params });
        return fetch(url, params);
      }
    },
    CacheService: { getUserCache: () => userCache },
    PropertiesService: { getUserProperties: () => userProperties },
    DataStudioApp: { createCommunityConnector: communityConnector },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, text) => [...crypto.createHash(algorithm).update(text).digest()],
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64')
    }
  });
  for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context, { filename: file });
  }
  return { app: context, calls, userCache, userProperties };
}

module.exports = { loadConnector, response };
