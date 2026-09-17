from datetime import UTC, datetime

from backend.services.google_news import parse_feed


def test_parse_feed_exposes_metadata_and_link_without_copying_description():
    xml = b"""<?xml version="1.0" encoding="UTF-8"?>
    <rss><channel><item>
      <title>PM2.5 update - Thai News</title>
      <link>https://news.google.com/rss/articles/example</link>
      <guid>story-1</guid>
      <pubDate>Thu, 17 Sep 2026 07:32:16 GMT</pubDate>
      <description>copyrighted article summary must not be copied</description>
      <source url="https://example.com">Thai News</source>
    </item></channel></rss>"""

    result = parse_feed(xml, now=datetime(2026, 9, 17, 10, tzinfo=UTC))

    assert len(result) == 1
    assert result[0]["title"] == "PM2.5 update - Thai News"
    assert result[0]["source_name"] == "Thai News"
    assert result[0]["source_url"].startswith("https://news.google.com/")
    assert result[0]["external"] is True
    assert "copyrighted" not in result[0]["body"]


def test_parse_feed_rejects_old_duplicate_and_future_items():
    xml = b"""<rss><channel>
    <item><title>Old</title><link>https://example.com/old</link><guid>old</guid>
      <pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item>
    <item><title>Future</title><link>https://example.com/future</link><guid>future</guid>
      <pubDate>Fri, 18 Sep 2026 00:00:00 GMT</pubDate></item>
    <item><title>Fresh</title><link>https://example.com/fresh</link><guid>fresh</guid>
      <pubDate>Thu, 17 Sep 2026 08:00:00 GMT</pubDate></item>
    <item><title>Duplicate</title><link>https://example.com/fresh-2</link><guid>fresh</guid>
      <pubDate>Thu, 17 Sep 2026 08:01:00 GMT</pubDate></item>
    </channel></rss>"""

    result = parse_feed(xml, now=datetime(2026, 9, 17, 10, tzinfo=UTC))
    assert [item["title"] for item in result] == ["Fresh"]
