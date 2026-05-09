(function () {
  // ─── MANIFEST ──────────────────────────────────────────────────────────────
  // Il dominio di StreamingCommunity cambia spesso.
  // SkyStream passerà manifest.baseUrl se configurato dall'utente,
  // altrimenti usiamo il fallback qui sotto.
  const FALLBACK_DOMAIN = "streamingcommunity.computer";
  const BASE_URL = (typeof manifest !== "undefined" && manifest.baseUrl)
    ? manifest.baseUrl
    : "https://" + FALLBACK_DOMAIN;

  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": BASE_URL + "/",
    "Accept": "application/json, text/html, */*",
  };

  // ─── HELPERS ───────────────────────────────────────────────────────────────
  function posterUrl(filename) {
    return BASE_URL + "/storage/" + filename;
  }

  function mapType(type) {
    if (!type) return "Movie";
    const t = type.toLowerCase();
    if (t === "movie") return "Movie";
    if (t === "tv") return "TvSeries";
    return "Movie";
  }

  function buildItem(title) {
    const poster = title.images
      ? (title.images.find((i) => i.type === "poster") ||
         title.images.find((i) => i.type === "cover") ||
         title.images[0])
      : null;

    return new MultimediaItem({
      title: title.name || title.title,
      url: BASE_URL + "/titles/" + title.id + "-" + (title.slug || ""),
      posterUrl: poster ? posterUrl(poster.filename) : "",
      type: mapType(title.type),
      description: title.plot || "",
      year: title.last_air_date ? title.last_air_date.substring(0, 4) : "",
      rating: title.score || "",
    });
  }

  // ─── getHome ───────────────────────────────────────────────────────────────
  async function getHome(cb) {
    try {
      const endpoints = [
        { label: "In tendenza", path: "/api/titles/trending" },
        { label: "Ultimi film", path: "/api/titles?order=updated_at&type=movie" },
        { label: "Ultime serie", path: "/api/titles?order=updated_at&type=tv" },
      ];

      const result = {};

      for (const ep of endpoints) {
        try {
          const res = await fetch(BASE_URL + ep.path, { headers: HEADERS });
          const json = await res.json();
          const items = (json.data || json || []).map(buildItem);
          if (items.length > 0) result[ep.label] = items;
        } catch (_) {
          // skip category if it fails
        }
      }

      cb({ success: true, data: result });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  // ─── search ────────────────────────────────────────────────────────────────
  async function search(query, cb) {
    try {
      const res = await fetch(
        BASE_URL + "/api/search?q=" + encodeURIComponent(query),
        { headers: HEADERS }
      );
      const json = await res.json();
      const titles = json.data || json || [];
      const items = titles.map(buildItem);
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  // ─── load ──────────────────────────────────────────────────────────────────
  async function load(url, cb) {
    try {
      // Extract title ID from URL: /titles/1234-slug
      const idMatch = url.match(/\/titles\/(\d+)/);
      if (!idMatch) {
        cb({ success: false, error: "URL non valido" });
        return;
      }
      const titleId = idMatch[1];

      const res = await fetch(BASE_URL + "/api/titles/" + titleId, {
        headers: HEADERS,
      });
      const data = await res.json();
      const title = data.data || data;

      const poster = title.images
        ? (title.images.find((i) => i.type === "poster") ||
           title.images.find((i) => i.type === "cover") ||
           title.images[0])
        : null;

      const background = title.images
        ? title.images.find((i) => i.type === "background")
        : null;

      const item = new MultimediaItem({
        title: title.name || title.title,
        url: url,
        posterUrl: poster ? posterUrl(poster.filename) : "",
        backdropUrl: background ? posterUrl(background.filename) : "",
        type: mapType(title.type),
        description: title.plot || "",
        year: title.last_air_date ? title.last_air_date.substring(0, 4) : "",
        rating: title.score || "",
        genres: title.genres ? title.genres.map((g) => g.name) : [],
      });

      // If TV series — fetch seasons and episodes
      if (title.type === "tv" && title.seasons_count > 0) {
        item.episodes = [];
        for (let s = 1; s <= title.seasons_count; s++) {
          try {
            const epRes = await fetch(
              BASE_URL + "/api/titles/" + titleId + "/season/" + s,
              { headers: HEADERS }
            );
            const epData = await epRes.json();
            const episodes = epData.data || epData || [];
            for (const ep of episodes) {
              const epPoster = ep.images && ep.images[0]
                ? posterUrl(ep.images[0].filename)
                : "";
              item.episodes.push(
                new Episode({
                  title: ep.name || "Episodio " + ep.number,
                  url: BASE_URL + "/watch/" + titleId + "?e=" + ep.id,
                  season: s,
                  episode: ep.number || ep.episode,
                  description: ep.description || ep.plot || "",
                  thumbnailUrl: epPoster,
                  duration: ep.duration || 0,
                })
              );
            }
          } catch (_) {}
        }
      }

      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  // ─── loadStreams ────────────────────────────────────────────────────────────
  async function loadStreams(url, cb) {
    try {
      // Extract IDs from watch URL: /watch/1234?e=5678
      const titleMatch = url.match(/\/watch\/(\d+)/);
      const epMatch = url.match(/[?&]e=(\d+)/);
      if (!titleMatch) {
        cb({ success: false, error: "URL stream non valido" });
        return;
      }

      const titleId = titleMatch[1];
      const epId = epMatch ? epMatch[1] : null;

      // Get the embed iframe URL
      const watchRes = await fetch(url, { headers: HEADERS });
      const html = await watchRes.text();

      // Extract vixcloud embed URL from the page
      const iframeMatch = html.match(/src="(https:\/\/[^"]*vixcloud[^"]*)"/);
      if (!iframeMatch) {
        // Fallback: try via API
        const apiPath = epId
          ? BASE_URL + "/api/iframe/" + titleId + "?episode_id=" + epId
          : BASE_URL + "/api/iframe/" + titleId;
        const apiRes = await fetch(apiPath, { headers: HEADERS });
        const apiData = await apiRes.json();
        const embedUrl = apiData.url || apiData.embed_url;
        if (!embedUrl) {
          cb({ success: false, error: "Impossibile trovare lo stream" });
          return;
        }
        await extractFromEmbed(embedUrl, cb);
        return;
      }

      await extractFromEmbed(iframeMatch[1], cb);
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function extractFromEmbed(embedUrl, cb) {
    try {
      const embedRes = await fetch(embedUrl, {
        headers: {
          ...HEADERS,
          Referer: BASE_URL + "/",
        },
      });
      const embedHtml = await embedRes.text();

      // Extract m3u8 from the embed page
      const m3u8Match = embedHtml.match(
        /["'](https?:\/\/[^"']*\.m3u8[^"']*)['"]/
      );
      if (m3u8Match) {
        const streams = [
          new StreamResult({
            name: "StreamingCommunity - Auto",
            url: m3u8Match[1],
            headers: {
              Referer: new URL(embedUrl).origin + "/",
              "User-Agent": HEADERS["User-Agent"],
            },
          }),
        ];
        cb({ success: true, data: streams });
        return;
      }

      // Try to find a window.masterPlaylist or similar
      const masterMatch = embedHtml.match(/masterPlaylist['":\s]+"([^"]+)"/);
      if (masterMatch) {
        cb({
          success: true,
          data: [
            new StreamResult({
              name: "StreamingCommunity - Master",
              url: masterMatch[1],
              headers: { Referer: new URL(embedUrl).origin + "/" },
            }),
          ],
        });
        return;
      }

      cb({ success: false, error: "Stream m3u8 non trovato nell'embed" });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
