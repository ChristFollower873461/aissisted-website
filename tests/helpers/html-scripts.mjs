import { parse } from "parse5";

// HTML parsing follows browser rules for malformed end tags, attribute quoting
// and character references. This is an inventory, not an HTML sanitizer.
export function htmlScripts(html) {
  const scripts = [];
  function visit(node) {
    if (node.tagName === "script") {
      scripts.push({
        src: node.attrs.find((attribute) => attribute.name === "src")?.value || "",
        body: (node.childNodes || []).filter((child) => child.nodeName === "#text")
          .map((child) => child.value).join("")
      });
    }
    for (const child of node.childNodes || []) visit(child);
    // Template contents are inert until inserted, but remain part of the source
    // inventory so a later insertion cannot bypass the marketing review.
    if (node.content) visit(node.content);
  }
  visit(parse(html));
  return scripts;
}
