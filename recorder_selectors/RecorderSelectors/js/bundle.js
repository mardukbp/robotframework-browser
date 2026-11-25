// Browser runs the `__rewriteAction` hook in the page, so the hook must be one
// function with nothing outside its body. `bundle` gives the source of one: an
// expression that defines the modules `entry` needs, each in the CommonJS form
// it has here, and evaluates to the export `name` of `entry`, a function.
// Only relative `require`s are followed; they are resolved here, when the
// bundle is made. Any other `require` fails in the page, with its name.

const fs = require("fs");
const path = require("path");

const RELATIVE_REQUIRE = /require\((["'])(\.{1,2}\/[^"']+)\1\)/g;

function bundle(entry, name, root = __dirname) {
  const modules = collect(entry, root, new Map());
  const definitions = [...modules].map(([key, { source, requires }]) =>
    [
      `${JSON.stringify(key)}: [function (module, exports, require) {`,
      source,
      `}, ${JSON.stringify(requires)}]`,
    ].join("\n"),
  );
  return [
    "(() => {",
    `const definitions = {\n${definitions.join(",\n")}\n};`,
    "const loaded = {};",
    "function load(key) {",
    "  if (loaded[key]) return loaded[key].exports;",
    "  const [define, requires] = definitions[key];",
    "  const module = { exports: {} };",
    "  loaded[key] = module;",
    "  define(module, module.exports, (request) => {",
    "    if (!(request in requires)) throw new Error(`${key} requires ${request}, which the bundle does not hold`);",
    "    return load(requires[request]);",
    "  });",
    "  return module.exports;",
    "}",
    `return load(${JSON.stringify(entry)})[${JSON.stringify(name)}];`,
    "})()",
  ].join("\n");
}

// The module `key`, a path relative to `root`, and every module it requires.
function collect(key, root, modules) {
  if (modules.has(key)) return modules;
  const source = fs.readFileSync(path.join(root, key), "utf8");
  const requires = {};
  modules.set(key, { source, requires });
  for (const [, , request] of source.matchAll(RELATIVE_REQUIRE)) {
    const required = path.posix.normalize(path.posix.join(path.posix.dirname(key), request));
    requires[request] = required;
    collect(required, root, modules);
  }
  return modules;
}

module.exports = { bundle };
