/**
 * A small, non-validating XML reader for OXS files (G-028). OXS is flat, attribute-only data, so this reads start, end
 * and self-closing tags with their attributes and ignores text. It runs identically in the browser and in Node tests,
 * and streams a 47 MB, 750,000-element file without building a DOM. DOCTYPE is refused, so no entity can expand.
 * See D119.
 */

export interface XmlTag {
  /** Element name as written. */
  name: string;
  /** Attribute names as written; values with entities decoded. */
  attributes: Record<string, string>;
  /** True for `<name ... />`. */
  selfClosing: boolean;
  /** Names of the open ancestors, outermost first, excluding this element. */
  path: readonly string[];
}

const NAME = /[A-Za-z_:][\w.:-]*/y;
const ATTRIBUTE = /\s*([A-Za-z_:][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;
const MAX_DEPTH = 64;

export class XmlReadError extends Error {}

/** XML 1.0's Char production: what a document may contain, literally or by reference. */
function isXmlChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

const INVALID_LITERAL = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/u;

/** Decodes the five predefined entities and numeric character references; any other entity is an error. */
export function decodeXmlEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);|&/g, (match, body: string | undefined) => {
    if (body === undefined) throw new XmlReadError("The file contains a stray '&' in an attribute value.");
    switch (body) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
    }
    if (body.startsWith("#")) {
      const code = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || !isXmlChar(code)) {
        throw new XmlReadError(`The file contains an invalid character reference (${match}).`);
      }
      return String.fromCodePoint(code);
    }
    throw new XmlReadError(`The file uses an entity this reader doesn't support (${match}).`);
  });
}

/**
 * Calls `onTag` for every start or self-closing tag, in document order. Throws `XmlReadError` on markup that isn't
 * well-formed enough to trust: unclosed or mismatched tags, a DOCTYPE, malformed attributes, or nesting deeper than
 * any OXS file needs.
 */
export function readXmlTags(text: string, onTag: (tag: XmlTag) => void): void {
  const stack: string[] = [];
  let position = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let sawRoot = false;

  while (position < text.length) {
    const open = text.indexOf("<", position);
    if (open < 0) break;
    if (text.startsWith("<!--", open)) {
      const end = text.indexOf("-->", open + 4);
      if (end < 0) throw new XmlReadError("The file ends inside a comment.");
      position = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", open)) {
      const end = text.indexOf("]]>", open + 9);
      if (end < 0) throw new XmlReadError("The file ends inside a CDATA section.");
      position = end + 3;
      continue;
    }
    if (text.startsWith("<!", open)) {
      throw new XmlReadError("The file contains a DOCTYPE or other declaration, which OXS files don't use.");
    }
    if (text.startsWith("<?", open)) {
      const end = text.indexOf("?>", open + 2);
      if (end < 0) throw new XmlReadError("The file ends inside a processing instruction.");
      position = end + 2;
      continue;
    }

    if (text[open + 1] === "/") {
      NAME.lastIndex = open + 2;
      const nameMatch = NAME.exec(text);
      const close = text.indexOf(">", open + 2);
      if (!nameMatch || close < 0 || text.slice(NAME.lastIndex, close).trim() !== "")
        throw new XmlReadError("The file contains a malformed closing tag.");
      const expected = stack.pop();
      if (expected !== nameMatch[0]) {
        throw new XmlReadError(
          expected
            ? `The file closes <${nameMatch[0]}> where <${expected}> is open.`
            : `The file closes <${nameMatch[0]}>, which was never opened.`
        );
      }
      position = close + 1;
      continue;
    }

    NAME.lastIndex = open + 1;
    const nameMatch = NAME.exec(text);
    if (!nameMatch) throw new XmlReadError("The file contains a malformed tag.");
    const name = nameMatch[0];
    if (stack.length === 0 && sawRoot) throw new XmlReadError("The file has more than one root element.");

    const attributes: Record<string, string> = {};
    let cursor = NAME.lastIndex;
    for (;;) {
      ATTRIBUTE.lastIndex = cursor;
      const attribute = ATTRIBUTE.exec(text);
      if (!attribute) break;
      const attributeName = attribute[1];
      if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) {
        throw new XmlReadError(`The file repeats the attribute "${attributeName}" on <${name}>.`);
      }
      const raw = attribute[3] ?? attribute[4];
      if (raw.includes("<")) throw new XmlReadError(`The file has a literal "<" inside the attribute "${attributeName}" on <${name}>.`);
      if (INVALID_LITERAL.test(raw))
        throw new XmlReadError(`The file has a character XML doesn't allow inside the attribute "${attributeName}" on <${name}>.`);
      attributes[attributeName] = decodeXmlEntities(raw);
      cursor = ATTRIBUTE.lastIndex;
    }
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
    let selfClosing = false;
    if (text[cursor] === "/" && text[cursor + 1] === ">") {
      selfClosing = true;
      cursor += 2;
    } else if (text[cursor] === ">") {
      cursor += 1;
    } else {
      throw new XmlReadError(`The file contains a malformed <${name}> tag.`);
    }

    onTag({ name, attributes, selfClosing, path: stack.slice() });
    sawRoot = true;
    if (!selfClosing) {
      stack.push(name);
      if (stack.length > MAX_DEPTH) throw new XmlReadError("The file's elements are nested far deeper than an OXS file needs.");
    }
    position = cursor;
  }

  if (stack.length > 0) throw new XmlReadError(`The file ends before <${stack[stack.length - 1]}> is closed.`);
  if (!sawRoot) throw new XmlReadError("The file contains no XML elements.");
}

/** Escapes a value for a double-quoted attribute and removes characters XML 1.0 can't contain. */
export function escapeXmlAttribute(value: string): string {
  return value
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\t/g, "&#9;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;");
}
