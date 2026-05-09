(function () {
  const BASE_URL = (typeof manifest !== "undefined" && manifest.baseUrl)
    ? manifest.baseUrl
    : "https://altadefinizione.autos";

  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: BASE_URL + "/",
    Accept: "text/html,application/json,*/*",
  };

  function parseCards(html) {
    const items = [];
    // AltaDefinizione card pattern
    const cardRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let m;
    while ((m = cardRe.exec(html)) !== null) {
      const block = m[1];
      const linkM = block.match(/href="([^"]+)"/);
      const imgM = block.match(/<img[^>]+(?:src|data-src)="([^"]+)"/);
      const titleM = block.match(/<(?:h2|h3|span)[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\/(?:h2|h3|span)>/)
        || block.match(/title="([^"]+)"/);
      const yearM = block.match(/(\d{4})/);

      if (linkM && titleM) {
        const url = linkM[1].startsWith("http") ? linkM[1] : BASE_URL + linkM[1];
        const isSerial = /serial|serie/i.test(url);
        items.push(
          new MultimediaItem({
            title: titleM[1].trim(),
            url: url,
            posterUrl: imgM ? imgM[1] : "",
            type: isSerial ? "TvSeries" : "Movie",
            year: yearM ? yearM[1] : "",
          })
        );
      }
    }
    return items;
  }

  async function getHome(cb) {
    try {
      const pages = [
        { label: "Ultimi film", path: "/" },
        { label: "Serie TV", path: "/serietv/" },
        { label: "Cinema 2024", path: "/cinema/" },
      ];

      const result = {};
      for (const p of pages) {
        try {
          const res = await fetch(BASE_URL + p.path, { headers: HEADERS });
          const html = await res.text();
          const items = parseCards(html);
          if (items.length > 0) result[p.label] = items;
        } catch (_) {}
      }

      cb({ success: true, data: result });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function search(query, cb) {
    try {
      const res = await fetch(
        BASE_URL + "/?s=" + encodeURIComponent(query),
        { headers: HEADERS }
      );
      const html = await res.text();
      const items = parseCards(html);
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function load(url, cb) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      const html = await res.text();

      const titleM = html.match(/<h1[^>]*>([^<]+)<\/h1>/)
        || html.match(/property="og:title"\s+content="([^"]+)"/);
      const descM = html.match(/<div[^>]+class="[^"]*sinopsi[^"]*"[^>]*>([\s\S]*?)<\/div>/)
        || html.match(/<div[^>]+class="[^"]*trama[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      const posterM = html.match(/property="og:image"\s+content="([^"]+)"/)
        || html.match(/<img[^>]+class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/);
      const yearM = html.match(/Anno[:\s]+(\d{4})/);

      const item = new MultimediaItem({
        title: titleM ? titleM[1].trim() : "",
        url: url,
        posterUrl: posterM ? posterM[1] : "",
        type: url.includes("serial") || url.includes("serie") ? "TvSeries" : "Movie",
        description: descM ? descM[1].replace(/<[^>]+>/g, "").trim() : "",
        year: yearM ? yearM[1] : "",
      });

      // Episodes for TV series
      const episodes = [];
      const epRe = /<a[^>]+href="([^"]+episodio[^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let epM;
      while ((epM = epRe.exec(html)) !== null) {
        const epUrl = epM[1].startsWith("http") ? epM[1] : BASE_URL + epM[1];
        const nums = epM[2].match(/(\d+)/g);
        episodes.push(
          new Episode({
            title: epM[2].trim(),
            url: epUrl,
            season: nums && nums.length > 1 ? parseInt(nums[0]) : 1,
            episode: nums ? parseInt(nums[nums.length - 1]) : 1,
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

      // Try direct m3u8
      const m3u8 = html.match(/["'](https?:\/\/[^"']*\.m3u8[^"']*)['"]/);
      if (m3u8) {
        cb({
          success: true,
          data: [new StreamResult({ name: "AltaDefinizione", url: m3u8[1], headers: { Referer: BASE_URL + "/" } })],
        });
        return;
      }

      // Try mp4
      const mp4 = html.match(/["'](https?:\/\/[^"']*\.mp4[^"']*)['"]/);
      if (mp4) {
        cb({
          success: true,
          data: [new StreamResult({ name: "AltaDefinizione", url: mp4[1], headers: { Referer: BASE_URL + "/" } })],
        });
        return;
      }

      // Try iframes
      const iframes = [];
      const iframeRe = /src="(https?:\/\/[^"]+)"/gi;
      let ifM;
      while ((ifM = iframeRe.exec(html)) !== null) {
        const u = ifM[1];
        if (u.includes("embed") || u.includes("player") || u.includes("vixcloud")) {
          iframes.push(u);
        }
      }

      for (const iframeUrl of iframes.slice(0, 3)) {
        try {
          const ir = await fetch(iframeUrl, { headers: { ...HEADERS, Referer: BASE_URL + "/" } });
          const ih = await ir.text();
          const im = ih.match(/["'](https?:\/\/[^"']*\.m3u8[^"']*)['"]/);
          if (im) {
            cb({
              success: true,
              data: [new StreamResult({ name: "AltaDefinizione", url: im[1], headers: { Referer: iframeUrl } })],
            });
            return;
          }
        } catch (_) {}
      }

      cb({ success: false, error: "Nessuno stream trovato" });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
