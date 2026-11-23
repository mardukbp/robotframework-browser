// A part that finds its element by id alone, in CSS, is written with Browser's
// `id` engine, which needs no CSS escapes: `#oevd-iframe` becomes
// `id=oevd-iframe`, and `#APD_\:\:SalesOrderType-inner-vhi` becomes
// `id=APD_::SalesOrderType-inner-vhi`. Frames are found by id like any element.

// `#` and a CSS identifier, with its escapes, and nothing else.
const CSS_ID = /^#((?:[\w-]|[^\x00-\x7f]|\\[0-9a-fA-F]{1,6} ?|\\[^0-9a-fA-F\r\n])+)$/;
const CSS_ESCAPE = /\\([0-9a-fA-F]{1,6}) ?|\\(.)/g;

// Only a chain with a CSS id in it.
function skip({ parts }) {
  return !parts.some(cssId);
}

function skipPart(part) {
  return !cssId(part);
}

function eachPart({ part }) {
  const id = cssId(part);
  if (/[\s"]/.test(id)) return [];
  return [{ engine: "id", raw: `id=${id}` }];
}

// The id a `#...` part finds, without its CSS escapes; undefined for any other part.
function cssId(part) {
  if (part.engine !== "id") return undefined;
  const match = CSS_ID.exec(part.raw);
  if (!match) return undefined;
  return match[1].replace(CSS_ESCAPE, unescape);
}

function unescape(_, hex, char) {
  if (hex) return String.fromCodePoint(parseInt(hex, 16));
  return char;
}

module.exports = { name: "id_engine", skip, skipPart, eachPart };
