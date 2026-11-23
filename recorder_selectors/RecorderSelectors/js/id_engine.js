// Each part that finds its element by a CSS id alone, a frame's part too, is
// written with Browser's `id` engine, which needs no CSS escapes:
//
//   #oevd-iframe                          becomes   id=oevd-iframe
//   #APD_\:\:SalesOrderType-inner-vhi     becomes   id=APD_::SalesOrderType-inner-vhi
//
// `#x` and `id=x` find the same elements, so this needs no check in the page.

const { parse, print } = require("./selector.js");

// The Action with its selector's CSS ids written with the `id` engine, or
// undefined to keep it.
function run({ action }) {
  if (!action.selector) return undefined;
  const parts = parse(action.selector).parts;
  const rewritten = parts.map(withIdEngine);
  if (rewritten.every((part, i) => part === parts[i])) return undefined;
  return { ...action, selector: print(rewritten) };
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
