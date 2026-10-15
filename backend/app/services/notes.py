"""Rules for note bodies. Pure functions; no HTTP, no database."""

import html as html_lib
import re

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


_BLOCK_END = re.compile(
    r"</(?:p|h[1-3]|li|blockquote|pre|ul|ol)>|<br\s*/?>|<hr\s*/?>", re.IGNORECASE
)
TITLE_CHARS = 80
SNIPPET_CHARS = 160


def plain_text_lines(note_html: str) -> list[str]:
    """The note's text, one entry per paragraph, heading or list item, with no markup."""
    separated = _BLOCK_END.sub("\n", note_html)
    text = html_lib.unescape(nh3.clean(separated, tags=set()))
    lines = (" ".join(line.split()) for line in text.split("\n"))
    return [line for line in lines if line]


def _shorten(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def note_title(note_html: str) -> str:
    """The first line of the note, for lists. Empty when the note has no text."""
    lines = plain_text_lines(note_html)
    return _shorten(lines[0], TITLE_CHARS) if lines else ""


def note_snippet(note_html: str) -> str:
    """The text after the first line (or the first line itself when it is all there is)."""
    lines = plain_text_lines(note_html)
    if not lines:
        return ""
    rest = " ".join(lines[1:]) or lines[0]
    return _shorten(rest, SNIPPET_CHARS)
