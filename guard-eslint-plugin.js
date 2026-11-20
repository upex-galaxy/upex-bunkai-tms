/**
 * @fileoverview SYNCED. The inline GUARD plugin and its default layer map, in
 * their own module so ESLint (`eslint.config.base.js`) and Oxlint
 * (`.oxlintrc.base.json` `jsPlugins`) load the same file. The default export is
 * the plugin object, which is what an Oxlint JS plugin needs;
 * `eslint.config.base.js` re-exports it as `guardPlugin`.
 */

import { readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Default layer map: globs per layer, lowest first (platform < adapters <
 * features < app). An adopted app maps its own folders without moving files:
 * add a later block in its own `eslint.config.js`,
 *
 *   { settings: { guard: { layers: { adapters: ['db/**'], platform: ['lib/**'] } } } }
 *
 * Settings merge key by key, so name only the layers that differ; a layer's
 * value is replaced whole. A path that matches no layer is ignored.
 */
export const GUARD_LAYERS = {
  platform: ['src/platform/**'],
  adapters: ['src/adapters/**'],
  features: ['src/features/**'],
  app: ['src/app/**'],
};

const GUARD_ORDER = ['platform', 'adapters', 'features', 'app'];
const GUARD_ALIASES = { '@platform/': 'platform', '@adapters/': 'adapters', '@features/': 'features' };
const GUARD_DOC = 'agentic-dev-core/references/guard-architecture.md';
const GUARD_SOURCE_EXT = /\.[cm]?[jt]sx?$/;
const GUARD_DEFAULT_ALIASES = [['@/', 'src']];
const guardAliasCache = new Map();

/** Repo-relative POSIX path of a file or of an import resolved against it. */
function guardPosix(path) {
  return path.split('\\').join('/');
}

/** Folder part of a glob: everything before the first wildcard, with no trailing slash. */
function guardGlobFolder(glob) {
  const wildcard = glob.search(/[*?{[]/);
  return guardPosix(wildcard === -1 ? glob : glob.slice(0, wildcard)).replace(/\/+$/, '');
}

/** Layer of a repo-relative path and the matched folder, or `undefined`. */
function guardClassify(path, layers) {
  for (const layer of GUARD_ORDER) {
    for (const glob of [layers[layer] ?? []].flat()) {
      const folder = guardGlobFolder(glob);
      if (GUARD_SOURCE_EXT.test(folder)) {
        if (path.replace(GUARD_SOURCE_EXT, '') === folder.replace(GUARD_SOURCE_EXT, '')) {
          return { layer, folder: folder.split('/').slice(0, -1).join('/') };
        }
      }
      else if (folder === '' || path === folder || path.startsWith(`${folder}/`)) {
        return { layer, folder };
      }
    }
  }
  return undefined;
}

export function guardTsconfigAliases(text, tsconfigDir, cwd) {
  const json = text
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, match => (match.startsWith('"') ? match : ''))
    .replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, closer) => closer ?? match);
  const options = JSON.parse(json).compilerOptions ?? {};
  const base = resolve(tsconfigDir, options.baseUrl ?? '.');
  const aliases = Object.entries(options.paths ?? {})
    .filter(([key, targets]) => key.endsWith('/*') && typeof targets?.[0] === 'string' && /(?:^|\/)\*$/.test(targets[0]))
    .map(([key, targets]) => [key.slice(0, -1), guardPosix(relative(cwd, resolve(base, targets[0].slice(0, -1))))])
    .sort(([a], [b]) => b.length - a.length);
  return aliases.some(([prefix]) => prefix === '@/') ? aliases : [...aliases, ...GUARD_DEFAULT_ALIASES];
}

function guardAliases(cwd, settings) {
  if (settings?.aliases) {
    return Object.entries(settings.aliases)
      .map(([prefix, root]) => [prefix, guardPosix(root).replace(/^\.(?:\/|$)|\/+$/g, '')])
      .sort(([a], [b]) => b.length - a.length);
  }
  const file = join(cwd, 'tsconfig.json');
  let mtime;
  try { mtime = statSync(file).mtimeMs; }
  catch { return GUARD_DEFAULT_ALIASES; }
  const key = `${file}:${mtime}`;
  if (!guardAliasCache.has(key)) {
    try { guardAliasCache.set(key, guardTsconfigAliases(readFileSync(file, 'utf8'), cwd, cwd)); }
    catch (error) { throw new Error(`GUARD: cannot read compilerOptions.paths from ${file} (${error.message}); declare settings.guard.aliases instead`); }
  }
  return guardAliasCache.get(key);
}

/**
 * Where an import points: its layer plus the feature segment and the path
 * inside the feature, when it targets one. Relative paths resolve against the
 * importing file; `@platform/`, `@adapters/` and `@features/` name the layer
 * directly; every other alias resolves through the app's tsconfig.json `paths`
 * (`@/` is `src/` when it declares none). Anything else (packages) is ignored.
 */
function guardTarget(source, filePath, layers, aliases) {
  const alias = Object.keys(GUARD_ALIASES).find(prefix => source.startsWith(prefix));
  if (alias) {
    const layer = GUARD_ALIASES[alias];
    const [feature, ...rest] = source.slice(alias.length).split('/');
    return { layer, feature: layer === 'features' ? feature : undefined, inside: rest.join('/') };
  }
  let resolved;
  const mapped = aliases.find(([prefix]) => source.startsWith(prefix));
  if (mapped) { resolved = [mapped[1], source.slice(mapped[0].length)].filter(Boolean).join('/'); }
  else if (source.startsWith('.')) { resolved = guardPosix(relative('.', `${filePath.split('/').slice(0, -1).join('/') || '.'}/${source}`)); }
  else { return undefined; }
  const hit = guardClassify(resolved, layers);
  if (!hit) { return undefined; }
  const [feature, ...rest] = resolved.slice(hit.folder.length).replace(/^\//, '').split('/');
  return { layer: hit.layer, feature: hit.layer === 'features' ? feature.replace(GUARD_SOURCE_EXT, '') : undefined, inside: rest.join('/') };
}

/** Repo-relative POSIX path of the file ESLint is linting, plus the layer map in force. */
function guardContext(context) {
  const cwd = context.cwd ?? process.cwd();
  const filePath = guardPosix(relative(cwd, context.filename));
  const layers = context.settings?.guard?.layers ?? GUARD_LAYERS;
  return { filePath, layers, own: guardClassify(filePath, layers), aliases: guardAliases(cwd, context.settings?.guard) };
}

/**
 * Inline ESLint plugin `guard`: the GUARD layer rules a machine can check, with
 * messages that name the doctrine rule and the fix. Inline for the same reason
 * as `kata` in the QA boilerplate: two small rules do not justify a package.
 */
const guardPlugin = {
  meta: { name: 'guard' },
  rules: {
    'layer-imports': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          higher: `GUARD one direction (${GUARD_DOC}, R1): a {{from}} file never imports the {{to}} layer. Dependencies flow downward only (platform < adapters < features < app); move the call into a feature action or inject the dependency.`,
          appAdapters: `GUARD thin app (${GUARD_DOC}, R3): an app-layer file never imports adapters. Move the call into a feature action and import the feature through its index.ts.`,
        },
      },
      create(context) {
        const { filePath, layers, own, aliases } = guardContext(context);
        if (!own) { return {}; }
        const check = (node) => {
          const source = node.source?.value;
          if (typeof source !== 'string') { return; }
          const target = guardTarget(source, filePath, layers, aliases);
          if (!target) { return; }
          if (own.layer === 'app' && target.layer === 'adapters') {
            context.report({ node, messageId: 'appAdapters' });
          }
          else if (GUARD_ORDER.indexOf(target.layer) > GUARD_ORDER.indexOf(own.layer)) {
            context.report({ node, messageId: 'higher', data: { from: own.layer, to: target.layer } });
          }
        };
        return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
      },
    },

    'feature-door': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          deepImport: `GUARD one door (${GUARD_DOC}, R2): import feature {{feature}} only through its index.ts, never '{{source}}'. Export what you need from the index.ts of feature {{feature}}.`,
        },
      },
      create(context) {
        const { filePath, layers, own, aliases } = guardContext(context);
        const ownFeature = own?.layer === 'features' ? filePath.slice(own.folder.length).replace(/^\//, '').split('/')[0].replace(GUARD_SOURCE_EXT, '') : undefined;
        const check = (node) => {
          const source = node.source?.value;
          if (typeof source !== 'string') { return; }
          const target = guardTarget(source, filePath, layers, aliases);
          if (target?.layer !== 'features' || !target.feature || target.feature === ownFeature) { return; }
          if (target.inside === '' || /^index(?:\.[cm]?[jt]sx?)?$/.test(target.inside)) { return; }
          context.report({ node, messageId: 'deepImport', data: { feature: target.feature, source } });
        };
        return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
      },
    },
  },
};

export default guardPlugin;
