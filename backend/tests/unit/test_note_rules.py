import pytest

from app.services.notes import (
    MAX_NOTE_BYTES,
    is_too_large,
    note_snippet,
    note_title,
    plain_text_lines,
    sanitize_note_html,
)


@pytest.mark.parametrize(
    "html",
    [
        "<p>Plain paragraph</p>",
        "<p><strong>Bold</strong> <em>italic</em> <u>underline</u> <s>strike</s></p>",
        "<h1>Title</h1><h2>Sub</h2><h3>Sub-sub</h3>",
        "<ul><li><p>one</p></li><li><p>two</p></li></ul>",
        "<ol><li><p>first</p></li></ol>",
        "<blockquote><p>quoted</p></blockquote>",
        "<pre><code>x = 1</code></pre>",
        "<p>a<br>b</p><hr>",
        "<p>Café — naïve 日本語 🙂</p>",
    ],
)
def test_everything_the_editor_can_produce_is_kept(html: str) -> None:
    assert sanitize_note_html(html) == html


@pytest.mark.parametrize(
    ("dirty", "must_not_contain"),
    [
        ("<p>hi</p><script>alert(1)</script>", "<script"),
        ('<p onclick="steal()">hi</p>', "onclick"),
        ('<img src=x onerror="alert(1)">', "<img"),
        ('<p style="position:fixed">hi</p>', "style"),
        ('<iframe src="https://evil.example"></iframe>', "<iframe"),
        ('<a href="javascript:alert(1)">click</a>', "javascript:"),
        ('<a href="JaVaScRiPt:alert(1)">click</a>', "javascript:"),
        ('<a href="data:text/html;base64,PHNjcmlwdD4=">click</a>', "data:"),
        ('<a href="vbscript:msgbox(1)">click</a>', "vbscript:"),
        ("<p>hi</p><!-- secret -->", "<!--"),
        ("<svg onload=alert(1)><circle/></svg>", "<svg"),
        ('<form action="https://evil.example"><input></form>', "<form"),
        ('<object data="x"></object>', "<object"),
        ('<a href="https://ok.example" onmouseover="x()">link</a>', "onmouseover"),
    ],
)
def test_dangerous_markup_is_removed(dirty: str, must_not_contain: str) -> None:
    assert must_not_contain.lower() not in sanitize_note_html(dirty).lower()


def test_script_content_is_not_left_behind_as_text() -> None:
    cleaned = sanitize_note_html("<p>hi</p><script>alert(1)</script>")
    assert "alert" not in cleaned
    assert "<p>hi</p>" in cleaned


@pytest.mark.parametrize(
    "href", ["https://example.test/page", "http://example.test", "mailto:ada@example.test"]
)
def test_safe_links_survive_and_get_rel(href: str) -> None:
    cleaned = sanitize_note_html(f'<a href="{href}">link</a>')
    assert f'href="{href}"' in cleaned
    assert 'rel="noopener noreferrer"' in cleaned


def test_link_target_and_other_attributes_are_dropped() -> None:
    cleaned = sanitize_note_html('<a href="https://x.test" target="_blank" class="c">x</a>')
    assert "target" not in cleaned and "class" not in cleaned


def test_text_is_escaped_not_executed() -> None:
    cleaned = sanitize_note_html("<p>1 < 2 && 3 > 2</p>")
    assert "&lt;" in cleaned and "&amp;&amp;" in cleaned


def test_sanitising_is_idempotent() -> None:
    once = sanitize_note_html('<p>hi <a href="https://x.test">x</a><script>1</script></p>')
    assert sanitize_note_html(once) == once


def test_empty_stays_empty() -> None:
    assert sanitize_note_html("") == ""


def test_size_limit_is_measured_in_bytes() -> None:
    assert not is_too_large("a" * MAX_NOTE_BYTES)
    assert is_too_large("a" * (MAX_NOTE_BYTES + 1))
    # 3 bytes per character: 40,000 of them are 120,000 bytes, over the limit.
    assert is_too_large("日" * 40_000)
    assert not is_too_large("日" * 30_000)


# --- Titles and snippets for the notes list ---------------------------------------


def test_the_title_is_the_first_line_without_markup() -> None:
    html = "<h1>Binary <em>search</em></h1><p>Halve the range each step.</p>"
    assert note_title(html) == "Binary search"
    assert note_snippet(html) == "Halve the range each step."


def test_lines_come_from_paragraphs_list_items_and_breaks() -> None:
    html = "<p>First</p><ul><li>one</li><li>two</li></ul><p>a<br>b</p>"
    assert plain_text_lines(html) == ["First", "one", "two", "a", "b"]


def test_entities_are_decoded_and_whitespace_collapsed() -> None:
    assert note_title("<p>  Tom &amp;   Jerry &lt;3  </p>") == "Tom & Jerry <3"


def test_a_one_line_note_uses_that_line_as_its_snippet_too() -> None:
    assert note_title("<p>Only line</p>") == "Only line"
    assert note_snippet("<p>Only line</p>") == "Only line"


def test_long_text_is_shortened_with_an_ellipsis() -> None:
    long = "x" * 200
    assert note_title(f"<p>{long}</p>").endswith("…")
    assert len(note_title(f"<p>{long}</p>")) == 80
    assert len(note_snippet(f"<p>t</p><p>{long}</p>")) == 160


@pytest.mark.parametrize("html", ["", "<p></p>", "<p> <br> </p>", "<ul><li></li></ul>"])
def test_a_note_with_no_text_has_no_title(html: str) -> None:
    assert note_title(html) == ""
    assert note_snippet(html) == ""


def test_scripts_do_not_leak_into_the_text() -> None:
    assert note_title("<p>Safe</p><script>alert(1)</script>") == "Safe"
