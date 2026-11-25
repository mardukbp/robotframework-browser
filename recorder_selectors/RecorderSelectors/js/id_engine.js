// Each part that finds its element by a CSS id alone is written with
// Playwright's `id` engine, which needs no CSS escapes:
//
//   #APD_\:\:SalesOrderType-inner-vhi     becomes   id=APD_::SalesOrderType-inner-vhi
//
// It runs in the page, on the selector inside the element's frame: the parts
// of the frames before it stay as Playwright recorded them.

const { parse, print } = require("./selector.js");

// `selector` with its CSS ids written with the `id` engine, or undefined to keep it.
function run({ selector }) {
  const parts = parse(selector).parts;
  const rewritten = parts.map(withIdEngine);
  if (rewritten.every((part, i) => part === parts[i])) return undefined;
  return print(rewritten);
}

// `part` with the `id` engine when it is a CSS id that engine can write: one
// without white space or quotes. Any other part as it is.
function withIdEngine(part) {
  const id = cssIdOf(part);
  if (id === undefined) return part;
  if (/[\s"]/.test(id)) return part;
  return { engine: "id", raw: `id=${id}` };
}

// `#` and a CSS identifier, with its escapes, and nothing else.
const CSS_ID = /^#((?:[\w-]|[^\x00-\x7f]|\\[0-9a-fA-F]{1,6} ?|\\[^0-9a-fA-F\r\n])+)$/;
const CSS_ESCAPE = /\\([0-9a-fA-F]{1,6}) ?|\\(.)/g;

// The id a `#...` part finds, without its CSS escapes; undefined for any other part.
function cssIdOf(part) {
  if (part.engine !== "id") return undefined;
  const match = CSS_ID.exec(part.raw);
  if (!match) return undefined;
  return match[1].replace(CSS_ESCAPE, unescape);
}

function unescape(_, hex, char) {
  if (hex) return String.fromCodePoint(parseInt(hex, 16));
  return char;
}

module.exports = { step: { name: "id_engine", run }, withIdEngine };
