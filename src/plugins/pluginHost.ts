/**
 * pluginHost.ts — Sandboxed plugin runtime (Phase 15-C)
 *
 * Plugins are CommonJS-style .js files placed in <project>/plugins/.
 * Each file must export a manifest object and zero or more hook functions.
 *
 * Plugin contract (what the plugin file must export):
 *   module.exports = {
 *     manifest: { name, version, description },
 *     hooks: {
 *       // Called with { rows } — return modified rows array
 *       onMedicinesRead?: (ctx) => ctx.rows,
 *       // Called with { row } — return true to include, false to exclude
 *       filterSale?: (ctx) => boolean,
 *       // Called with {} — return a report object
 *       generateReport?: (ctx) => object,
 *     }
 *   };
 *
 * Sandbox: plugins run in vm.runInNewContext() with only these globals:
 *   console (log/warn/error redirect to prefixed output)
 *   Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp
 *   db (read-only proxy: query(sql, params) → Promise<rows[]>)
 *
 * Plugins cannot: require(), import(), access process, fs, or network.
 */

import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbManager } from '../database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PLUGINS_DIR = path.resolve(__dirname, '..', '..', 'plugins');

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
}

interface LoadedPlugin {
  manifest: PluginManifest;
  hooks: Record<string, (...args: any[]) => any>;
  filePath: string;
  loadedAt: string;
  error: string | null;
}

const loadedPlugins: Map<string, LoadedPlugin> = new Map();

/**
 * Build a read-only DB proxy object for use inside the plugin sandbox.
 * Only SELECT statements are permitted.
 */
function makeDbProxy() {
  return {
    query: async (sql: string, params: any[] = []) => {
      const normalized = sql.trim().toLowerCase();
      if (!normalized.startsWith('select') && !normalized.startsWith('pragma')) {
        throw new Error('Plugin DB access is read-only: only SELECT and PRAGMA are allowed');
      }
      const db = await dbManager.getConnection();
      return db.all(sql, params);
    },
  };
}

/**
 * Build a safe console proxy that prefixes output with the plugin name.
 */
function makeConsoleProxy(name: string) {
  const prefix = `[Plugin:${name}]`;
  return {
    log:   (...a: any[]) => console.log(prefix, ...a),
    warn:  (...a: any[]) => console.warn(prefix, ...a),
    error: (...a: any[]) => console.error(prefix, ...a),
  };
}

/**
 * Load (or reload) all .js files from the plugins/ directory.
 * Errors are captured per-plugin; one bad plugin does not stop others.
 */
export function loadAllPlugins(): { loaded: number; errors: number } {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  }

  loadedPlugins.clear();

  const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
  let loaded = 0, errors = 0;

  for (const file of files) {
    const filePath = path.join(PLUGINS_DIR, file);
    const pluginName = path.basename(file, '.js');
    try {
      const src = fs.readFileSync(filePath, 'utf8');

      // Minimal module shim so plugins can use module.exports
      const moduleShim = { exports: {} as any };
      const sandbox = vm.createContext({
        module: moduleShim,
        exports: moduleShim.exports,
        Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp,
        Promise,
        console: makeConsoleProxy(pluginName),
        db: makeDbProxy(),
        setTimeout: undefined,
        setInterval: undefined,
        process: undefined,
        require: undefined,
        __filename: undefined,
        __dirname: undefined,
      });

      vm.runInContext(src, sandbox, { timeout: 2_000, filename: file });

      const exported = moduleShim.exports;
      const manifest: PluginManifest = exported?.manifest ?? { name: pluginName, version: '0.0.0' };
      const hooks: Record<string, (...args: any[]) => any> = exported?.hooks ?? {};

      loadedPlugins.set(pluginName, {
        manifest: { name: manifest.name ?? pluginName, version: manifest.version ?? '0.0.0', description: manifest.description },
        hooks,
        filePath,
        loadedAt: new Date().toISOString(),
        error: null,
      });
      loaded++;
      console.log(`[PluginHost] Loaded: ${pluginName} v${manifest.version}`);
    } catch (err: any) {
      errors++;
      console.error(`[PluginHost] Failed to load ${file}:`, err.message);
      loadedPlugins.set(pluginName, {
        manifest: { name: pluginName, version: '0.0.0' },
        hooks: {},
        filePath: path.join(PLUGINS_DIR, file),
        loadedAt: new Date().toISOString(),
        error: err.message,
      });
    }
  }

  return { loaded, errors };
}

/**
 * List all known plugins with status.
 */
export function listPlugins(): Array<PluginManifest & { filePath: string; loadedAt: string; error: string | null; hookNames: string[] }> {
  return Array.from(loadedPlugins.values()).map(p => ({
    ...p.manifest,
    filePath: p.filePath,
    loadedAt: p.loadedAt,
    error: p.error,
    hookNames: Object.keys(p.hooks),
  }));
}

/**
 * Run a named hook on all plugins that export it.
 * ctx is passed to each hook; the hook may return a modified ctx.
 * Errors from individual plugins are logged and skipped.
 */
export async function runHook(hookName: string, ctx: any): Promise<any> {
  let current = ctx;
  for (const [name, plugin] of loadedPlugins) {
    const hook = plugin.hooks[hookName];
    if (typeof hook !== 'function') continue;
    try {
      const result = await Promise.resolve(hook(current));
      if (result !== undefined) current = result;
    } catch (err: any) {
      console.error(`[PluginHost] Hook ${hookName} in ${name} threw:`, err.message);
    }
  }
  return current;
}
