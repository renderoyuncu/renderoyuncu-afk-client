'use strict';

const SITE = 'https://renderoyuncu.net';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function clean(html) {
  return decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** LeaderOS blog sayfasindaki haber kartlarini cozer. RSS/JSON ucu olmadigi icin HTML okunur. */
function parseNews(html) {
  const cards = html.split(/<div class="card card-hover[^"]*">/).slice(1);
  const items = [];
  for (const card of cards) {
    const title = card.match(/<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!title) continue;
    const image = card.match(/data-src="([^"]+)"/);
    const meta = card.match(/<a class="fs-sm[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span[^>]*>\s*-\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/);
    const excerpt = card.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    items.push({
      title: clean(title[2]),
      url: new URL(title[1], SITE).href,
      image: image ? new URL(image[1], SITE).href : null,
      category: meta ? clean(meta[1]) : 'Gündem',
      date: meta ? clean(meta[2]) : '',
      excerpt: excerpt ? clean(excerpt[1]) : '',
    });
  }
  return items;
}

module.exports = { SITE, parseNews };
