function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return html;
}

export function renderMarkdown(mdText) {
  const source = String(mdText || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let paragraphBuffer = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const content = paragraphBuffer.map((line) => renderInlineMarkdown(line)).join("<br>");
    out.push(`<p>${content}</p>`);
    paragraphBuffer = [];
  };

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine || "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      closeLists();
      if (!inCode) {
        inCode = true;
        out.push("<pre><code>");
      } else {
        inCode = false;
        out.push("</code></pre>");
      }
      return;
    }

    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      return;
    }

    if (!trimmed) {
      flushParagraph();
      closeLists();
      return;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${renderInlineMarkdown(ulMatch[1])}</li>`);
      return;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${renderInlineMarkdown(olMatch[1])}</li>`);
      return;
    }

    closeLists();
    paragraphBuffer.push(line);
  });

  flushParagraph();
  closeLists();
  if (inCode) {
    out.push("</code></pre>");
  }
  return out.join("");
}
