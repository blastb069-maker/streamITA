(function () {
  const BASE_URL = (typeof manifest !== "undefined" && manifest.baseUrl)
    ? manifest.baseUrl
    : "https://uno.direttecommunity.online";

  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: BASE_URL + "/",
    Accept: "text/html,*/*",
  };

  function parseEvents(html) {
    const items = [];
    const re = /<div[^>]+class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/;
    const timeRe = /(\d{2}:\d{2})/;
    let m;
    while ((m = re.exec(html)) !== null) {
      const block = m[1];
      const linkM = block.match(linkRe);
      const timeM = block.match(timeRe);
      if (linkM) {
        const url = linkM[1].startsWith("http") ? linkM[1] : BASE_URL + linkM[1];
        items.push(
          new MultimediaItem({
            title: linkM[2].trim() + (timeM ? " (" + timeM[1] + ")" : ""),
            url: url,
            type: "Live",
            posterUrl: "",
          })
        );
      }
    }
    return items;
  }

  async function getHome(cb) {
    try {
      const res = await fetch(BASE_URL, { headers: HEADERS });
      const html = await res.text();
      const items = parseEvents(html);

      // Also try to find match sections
      const sections = { "Partite di oggi": items.length > 0 ? items : [] };

      // Try match grid
      if (items.length === 0) {
        const cardRe = /<a[^>]+href="([^"]+match[^"]*|[^"]+partita[^"]*)"[^>]*>([^<]+)<\/a>/gi;
        let cM;
        const fallback = [];
        while ((cM = cardRe.exec(html)) !== null) {
          const url = cM[1].startsWith("http") ? cM[1] : BASE_URL + cM[1];
          fallback.push(new MultimediaItem({ title: cM[2].trim(), url, type: "Live" }));
        }
        if (fallback.length > 0) sections["Partite di oggi"] = fallback;
      }

      cb({ success: true, data: sections });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function search(query, cb) {
    try {
      const res = await fetch(BASE_URL + "/?s=" + encodeURIComponent(query), { headers: HEADERS });
      const html = await res.text();
      const items = parseEvents(html);
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

      const item = new MultimediaItem({
        title: titleM ? titleM[1].trim() : "Live",
        url: url,
        type: "Live",
        posterUrl: "",
        description: "Live stream da CalcioStreaming",
      });

      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function loadStreams(url, cb) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      const html = await res.text();

      const streams = [];

      // Look for m3u8 directly
      const m3u8Re = /["'](https?:\/\/[^"']*\.m3u8[^"']*)['"]/g;
      let m3u8M;
      while ((m3u8M = m3u8Re.exec(html)) !== null) {
        streams.push(new StreamResult({
          name: "CalcioStreaming - Stream " + (streams.length + 1),
          url: m3u8M[1],
          headers: { Referer: BASE_URL + "/" },
        }));
      }

      if (streams.length > 0) {
        cb({ success: true, data: streams });
        return;
      }

      // Look for iframes and extract from them
      const iframeRe = /(?:src|data-src)="(https?:\/\/[^"]+)"/gi;
      let ifM;
      const iframes = [];
      while ((ifM = iframeRe.exec(html)) !== null) {
        const u = ifM[1];
        if (u.includes("embed") || u.includes("player") || u.includes("stream") || u.includes("live")) {
          iframes.push(u);
        }
      }

      for (const iframeUrl of iframes.slice(0, 5)) {
        try {
          const ir = await fetch(iframeUrl, { headers: { ...HEADERS, Referer: url } });
          const ih = await ir.text();
          const im3u8Re = /["'](https?:\/\/[^"']*\.m3u8[^"']*)['"]/g;
          let im;
          while ((im = im3u8Re.exec(ih)) !== null) {
            streams.push(new StreamResult({
              name: "CalcioStreaming - Server " + (streams.length + 1),
              url: im[1],
              headers: { Referer: iframeUrl },
            }));
          }
        } catch (_) {}
      }

      if (streams.length > 0) {
        cb({ success: true, data: streams });
      } else {
        cb({ success: false, error: "Nessun live stream trovato. Potrebbe non essere ancora iniziato." });
      }
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
