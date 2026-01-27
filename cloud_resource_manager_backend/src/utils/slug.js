/**
 * PUBLIC_INTERFACE
 * Convert a string into a URL-safe slug.
 * @param {string} value input string
 * @returns {string} slug
 */
function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // replace sequences with a hyphen
    .replace(/^-+|-+$/g, '') // trim hyphens
    .slice(0, 64);
}

module.exports = {
  slugify,
};
