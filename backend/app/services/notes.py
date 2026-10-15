"""Rules for note bodies. Pure functions; no HTTP, no database."""

import nh3

# TRD 11.3: notes up to 100 KB.
MAX_NOTE_BYTES = 100 * 1024

# What the editor can produce. Everything else is stripped, along with all other attributes.
ALLOWED_TAGS = {
    "p",
    "br",
    "hr",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "a",
}
ALLOWED_ATTRIBUTES = {"a": {"href"}}
ALLOWED_URL_SCHEMES = {"http", "https", "mailto"}


def is_too_large(body: str) -> bool:
    return len(body.encode("utf-8")) > MAX_NOTE_BYTES


def sanitize_note_html(html: str) -> str:
    """Strip scripts, event handlers, styles, unknown tags and unsafe link schemes.

    Defence in depth: the editor only emits the tags above, but the API accepts any string, and
    note HTML is later rendered in the page. Links get rel="noopener noreferrer".
    """
    return nh3.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_URL_SCHEMES,
        link_rel="noopener noreferrer",
        strip_comments=True,
    )
