/**
 * Shared input validation for anything that ends up in a filesystem
 * path built from user input.
 *
 * dataStore.js builds report paths with `path.join(DATA_DIR,
 * `${domain}.json`)`, where `domain` comes straight from
 * `req.params.domain` (or the JSON body, for /api/gate). Express's
 * `:domain` route param can't contain a literal "/" -- but it CAN
 * contain a *percent-encoded* one ("%2F"), which Express decodes into
 * a real "/" before handing it to the route handler. That means a
 * request like `GET /api/audits/..%2F..%2Fsecrets` arrives at the
 * route with `req.params.domain === "../../secrets"`, a value the
 * route pattern itself never would have allowed through directly.
 * `path.join` happily resolves ".." segments, so without this check a
 * crafted domain could read (or, via POST /:domain/run's
 * saveAuditReport, overwrite) files outside server/data/ entirely.
 *
 * Real domain names in this app ("hiring", "lending",
 * "content_moderation") are all lowercase letters/digits/underscores,
 * so the allowlist below isn't a compromise -- anything legitimate
 * already fits it.
 */

const SAFE_DOMAIN_PATTERN = /^[a-z0-9_-]{1,64}$/;

/**
 * @param {unknown} domain
 * @returns {boolean} true only if `domain` is a non-empty string made
 *   entirely of lowercase letters, digits, underscores, or hyphens
 *   (max 64 chars) -- i.e. safe to interpolate into a filename.
 */
export function isSafeDomain(domain) {
  return typeof domain === "string" && SAFE_DOMAIN_PATTERN.test(domain);
}
