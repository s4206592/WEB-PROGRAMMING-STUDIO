const sanitizeHtml = require('sanitize-html');

/**
 * Rich text is sanitised BEFORE insert, not escaped at render.
 * Stored XSS is the classic failure mode for projects with a text editor.
 */
const OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
                'blockquote', 'code', 'pre', 'h2', 'h3', 'h4', 'a', 'img', 'hr'],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener', target: '_blank' })
  }
};

function cleanHtml(dirty) {
  return sanitizeHtml(String(dirty || ''), OPTIONS);
}

/** Plain-text bodies from a <textarea> → safe paragraphs. */
function textToHtml(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function stripHtml(html) {
  return sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} });
}

module.exports = { cleanHtml, textToHtml, stripHtml };
