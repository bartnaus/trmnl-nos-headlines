function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function textFromHtml(value, maxLength) {
  const firstParagraph = String(value || "").match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const source = firstParagraph ? firstParagraph[1] : value;
  const clean = decodeEntities(source)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= maxLength) {
    return clean;
  }
  const shortened = clean.slice(0, maxLength + 1);
  const wordBoundary = shortened.lastIndexOf(" ");
  return shortened.slice(0, wordBoundary > maxLength * 0.7 ? wordBoundary : maxLength).trim() + "…";
}

function imageFor(item) {
  const enclosure = item.enclosure || {};
  return enclosure.url || "";
}

function articleId(value) {
  const source =
    typeof value === "string" ? value : JSON.stringify(value || "");
  const match = source.match(
    /nos\.nl\/(?:(?:artikel|liveblog)\/|l\/)(\d+)(?=\D|$)/i
  );
  return match ? match[1] : "";
}

function editorialIds(value) {
  const source =
    typeof value === "string" ? value : JSON.stringify(value || "");
  const matches = source.matchAll(
    /(?:https?:\/\/nos\.nl)?\/(?:artikel|liveblog)\/(\d+)(?:-[^"'\\\s<]*)?/gi
  );
  const ids = [];

  for (const match of matches) {
    if (!ids.includes(match[1])) {
      ids.push(match[1]);
    }
  }

  return ids;
}

function homepageCards(value) {
  const source =
    typeof value === "string" ? value : JSON.stringify(value || "");
  const matches = source.matchAll(
    /!\[[^\]]*\]\((https?:\/\/[^)]+)\)([\s\S]*?)\]\s*\(https?:\/\/nos\.nl\/(artikel|liveblog)\/(\d+)(?:-[^)]*)?\)/gi
  );
  const cards = new Map();

  for (const match of matches) {
    const text = decodeEntities(match[2])
      .replace(/\s+/g, " ")
      .trim();
    const heading = text.lastIndexOf("## ");
    const title = (heading >= 0 ? text.slice(heading + 3) : text).trim();

    if (title && !cards.has(match[4])) {
      cards.set(match[4], {
        title,
        description:
          match[3].toLowerCase() === "liveblog"
            ? "Volg dit liveblog in de NOS-app of op NOS.nl."
            : "Lees het volledige artikel in de NOS-app of op NOS.nl.",
        enclosure: { url: match[1] }
      });
    }
  }

  return cards;
}

function editorialOrder(items, homepage) {
  const byId = new Map();
  for (const item of items) {
    const id = articleId(item.link) || articleId(item.guid);
    if (id) {
      byId.set(id, item);
    }
  }

  const ids = editorialIds(homepage);
  const cards = homepageCards(homepage);
  const selected = ids
    .map((id, index) => byId.get(id) || (index < 3 ? cards.get(id) : null))
    .filter(Boolean);

  if (selected.length === 0) {
    return items;
  }

  const selectedItems = new Set(selected);
  return selected.concat(items.filter((item) => !selectedItems.has(item)));
}

function sectionFromTitle(value) {
  return textFromHtml(value, 40).replace(/^NOS\s+/i, "") || "Nieuws";
}

function itemForDisplay(item) {
  return {
    title: textFromHtml(item.title, 145),
    summary: textFromHtml(item.description || item.content, 420),
    image: imageFor(item)
  };
}

function transform(input) {
  // TRMNL parses the NOS RSS XML before this transform runs.
  // With multiple polling URLs the RSS feed is namespaced under IDX_0.
  const feed = input.IDX_0 || input;
  const channel = (feed.rss && feed.rss.channel) || {};
  let sourceItems = channel.item || [];
  if (!Array.isArray(sourceItems)) {
    sourceItems = sourceItems ? [sourceItems] : [];
  }

  const displaySettings =
    (input.trmnl &&
      input.trmnl.plugin_settings &&
      input.trmnl.plugin_settings.custom_fields_values) ||
    {};
  const selectedFeed = displaySettings.feed_url || "";
  const usesFrontpage =
    selectedFeed === "https://feeds.nos.nl/nosnieuwsalgemeen" ||
    selectedFeed ===
      "https://feeds.nos.nl/nosnieuwsalgemeen?trmnl_view=frontpage";

  if (usesFrontpage && input.IDX_1) {
    sourceItems = editorialOrder(sourceItems, input.IDX_1);
  }

  return {
    display_settings: displaySettings,
    utc_offset:
      (input.trmnl && input.trmnl.user && input.trmnl.user.utc_offset) || 0,
    status: input.status || "success",
    message: input.message || "",
    section_label: sectionFromTitle(channel.title),
    items: sourceItems.slice(0, 14).map(itemForDisplay)
  };
}

if (typeof module !== "undefined") {
  module.exports = { transform };
}
