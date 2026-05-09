(function () {
  const BASE_URL = "https://www.animeworld.ac";
  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: BASE_URL + "/",
    Accept: "text/html,application/json,*/*",
  };

  function parsePoster(html, baseUrl) {
    const m = html.match(/<img[^>]+class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/i)
      || html.match(/property="og:image"\s+content="([^"]+)"/);
    return m ? m[1] : "";
  }

  // AnimeWorld doesn't have a public JSON API — we scrape HTML
  function parseSearchResults(html) {
    const items = [];
    const re = /<div[^>]+class="[^"]*film-list[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    const cardRe = /<a[^>]+href="(\/anime\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<span[^>]+class="[^"]*name[^"]*"[^>]*>([^<]+)<\/span>/gi;
    let m;
    while ((m = cardRe.exec(html)) !== null) {
      items.push(
        new MultimediaItem({
          title: m[3].trim(),
          url: BASE_URL + m[1],
          posterUrl: m[2],
          type: "Anime",
        })
      );
    }
    return items;
  }

  async function getHome(cb) {
    try {
      const res = await fetch(BASE_URL, { headers: HEADERS });
      const html = await res.text();

      // Parse sections from homepage
      const sections = {};
      const sectionRe = /<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<div[^>]+class="[^"]*film-list[^"]*">([\s\S]*?)<\/div>/gi;
      const cardRe = /<a[^>]+href="(\/anime\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<span[^>]+class="[^"]*name[^"]*"[^>]*>([^<]+)<\/span>/gi;

      let sMatch;
      while ((sMatch = sectionRe.exec(html)) !== null) {
        const label = sMatch[1].trim();
        const block = sMatch[2];
        const items = [];
        let cMatch;
        while ((cMatch = cardRe.exec(block)) !== null) {
          items.push(new MultimediaItem({
            title: cMatch[3].trim(),
            url: BASE_URL + cMatch[1],
            posterUrl: cMatch[2],
            type: "Anime",
          }));
        }
        if (items.length > 0) sections[label] = items;
      }

      // Fallback if regex found nothing
      if (Object.keys(sections).length === 0) {
        const items = parseSearchResults(html);
        if (items.length > 0) sections["Anime"] = items;
      }

      cb({ success: true, data: sections });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function search(query, cb) {
    try {
      const res = await fetch(
        BASE_URL + "/search?keyword=" + encodeURIComponent(query),
        { headers: HEADERS }
      );
      const html = await res.text();
      const items = parseSearchResults(html);
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function load(url, cb) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      const html = await res.text();

      const titleM = html.match(/<h1[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/)
        || html.match(/property="og:title"\s+content="([^"]+)"/);
      const descM = html.match(/<div[^>]+class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      const posterM = html.match(/property="og:image"\s+content="([^"]+)"/);

      const item = new MultimediaItem({
        title: titleM ? titleM[1].trim() : "",
        url: url,
        posterUrl: posterM ? posterM[1] : "",
        type: "Anime",
        description: descM ? descM[1].replace(/<[^>]+>/g, "").trim() : "",
      });

      // Parse episodes list
      const episodes = [];
      const epRe = /<a[^>]+href="(\/play\/[^"]+)"[^>]*>[\s\S]*?(?:Ep\.\s*(\d+)|Episode\s*(\d+))/gi;
      let epM;
      while ((epM = epRe.exec(html)) !== null) {
        const epNum = parseInt(epM[2] || epM[3] || "1");
        episodes.push(
          new Episode({
            title: "Episodio " + epNum,
            url: BASE_URL + epM[1],
            season: 1,
            episode: epNum,
          })
        );
      }
      item.episodes = episodes;

      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function loadStreams(url, cb) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      const html = await res.text();

      // Look for direct video or m3u8
      const m3u8 = html.match(/["'](https?:\/\/[^"']*\.m3u8[^"']*)['"]/);
      if (m3u8) {
        cb({
          success: true,
          data: [new StreamResult({ name: "AnimeWorld", url: m3u8[1], headers: { Referer: BASE_URL + "/" } })],
        });
        return;
      }

      // Look for mp4
      const mp4 = html.match(/["'](https?:\/\/[^"']*\.mp4[^"']*)['"]/);
      if (mp4) {
        cb({
          success: true,
          data: [new StreamResult({ name: "AnimeWorld", url: mp4[1], headers: { Referer: BASE_URL + "/" } })],
        });
        return;
      }

      // Try embed
      const iframeM = html.match(/src="(https?:\/\/[^"]*(?:embed|player)[^"]*)"/);
      if (iframeM) {
        const embedRes = await fetch(iframeM[1], { headers: { ...HEADERS, Referer: BASE_URL + "/" } });
        const embedHtml = await embedRes.text();
        const em3u8 = embedHtml.match(/["'](https?:\/\/[^"']*\.m3u8[^"']*)['"]/);
        if (em3u8) {
          cb({
            success: true,
            data: [new StreamResult({ name: "AnimeWorld", url: em3u8[1], headers: { Referer: iframeM[1] } })],
          });
          return;
        }
      }

      cb({ success: false, error: "Stream non trovato" });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
