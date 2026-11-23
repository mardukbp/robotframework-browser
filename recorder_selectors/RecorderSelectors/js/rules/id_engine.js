// Each part that finds its element by a CSS id alone is written with Browser's
// `id` engine, which needs no CSS escapes, the part of a frame too:
//
//   #oevd-iframe                          becomes   id=oevd-iframe
//   #APD_\:\:SalesOrderType-inner-vhi     becomes   id=APD_::SalesOrderType-inner-vhi

module.exports = {
  name: "id_engine",
  forEachPart: {
    when: [isCssId],
    tryInOrder: ({ part }) => [idPart(cssIdOf(part))],
  },
};

// `#` and a CSS identifier, with its escapes, and nothing else.
const CSS_ID = /^#((?:[\w-]|[^\x00-\x7f]|\\[0-9a-fA-F]{1,6} ?|\\[^0-9a-fA-F\r\n])+)$/;
const CSS_ESCAPE = /\\([0-9a-fA-F]{1,6}) ?|\\(.)/g;

// A CSS id the `id` engine can write: without white space or quotes.
function isCssId(part) {
  const id = cssIdOf(part);
  return id !== undefined && !/[\s"]/.test(id);
}

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

function idPart(id) {
  return { engine: "id", raw: `id=${id}` };
}
