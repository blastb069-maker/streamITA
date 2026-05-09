(function () {
  const BASE_URL = "https://www.animeunity.so";
  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: BASE_URL + "/",
    Accept: "application/json, */*",
  };

  function buildItem(anime) {
    return new MultimediaItem({
      title: anime.title_eng || anime.title,
      url: BASE_URL + "/anime/" + anime.id + "-" + anime.slug,
      posterUrl: anime.imageurl || anime.cover || "",
      type: anime.type === "Movie" ? "AnimeMovie" : "Anime",
      description: anime.plot || "",
      year: anime.date ? anime.date.substring(0, 4) : "",
      rating: anime.score || "",
    });
  }

  async function getHome(cb) {
    try {
      const categories = [
        { label: "In corso", path: "/api/anime?status=Airing&order=Popolarità" },
        { label: "Popolari", path: "/api/anime?order=Popolarità" },
        { label: "Ultimi aggiornamenti", path: "/api/archive?order=newest" },
      ];

      const result = {};
      for (const cat of categories) {
        try {
          const res = await fetch(BASE_URL + cat.path, { headers: HEADERS });
          const json = await res.json();
          const list = json.data || json || [];
          const items = list.map(buildItem);
          if (items.length > 0) result[cat.label] = items;
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
        BASE_URL + "/api/anime?title=" + encodeURIComponent(query),
        { headers: HEADERS }
      );
      const json = await res.json();
      const list = json.data || json || [];
      cb({ success: true, data: list.map(buildItem) });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function load(url, cb) {
    try {
      const idMatch = url.match(/\/anime\/(\d+)/);
      if (!idMatch) { cb({ success: false, error: "URL non valido" }); return; }
      const animeId = idMatch[1];

      const res = await fetch(BASE_URL + "/api/anime/" + animeId, { headers: HEADERS });
      const data = await res.json();
      const anime = data.data || data;

      const item = new MultimediaItem({
        title: anime.title_eng || anime.title,
        url: url,
        posterUrl: anime.imageurl || anime.cover || "",
        type: anime.type === "Movie" ? "AnimeMovie" : "Anime",
        description: anime.plot || "",
        year: anime.date ? anime.date.substring(0, 4) : "",
        rating: anime.score || "",
        genres: anime.genres ? anime.genres.map((g) => g.name) : [],
      });

      // Fetch episodes
      const epRes = await fetch(
        BASE_URL + "/api/anime/" + animeId + "/episodes",
        { headers: HEADERS }
      );
      const epData = await epRes.json();
      const episodes = epData.data || epData || [];

      item.episodes = episodes.map((ep) =>
        new Episode({
          title: ep.title || "Episodio " + ep.number,
          url: BASE_URL + "/anime/" + animeId + "-" + (anime.slug || "") + "/" + ep.id,
          season: 1,
          episode: ep.number,
          thumbnailUrl: ep.imageurl || "",
          description: ep.plot || "",
        })
      );

      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  async function loadStreams(url, cb) {
    try {
      const epIdMatch = url.match(/\/(\d+)$/);
      if (!epIdMatch) { cb({ success: false, error: "URL episodio non valido" }); return; }
      const epId = epIdMatch[1];

      // AnimeUnity returns a video URL in the episode data
      const res = await fetch(
        BASE_URL + "/api/episode/" + epId,
        { headers: HEADERS }
      );
      const data = await res.json();
      const ep = data.data || data;
      const videoUrl = ep.videoUrl || ep.stream_url || ep.link;

      if (!videoUrl) {
        // Try scraping the watch page
        const pageRes = await fetch(url, { headers: HEADERS });
        const html = await pageRes.text();
        const m3u8 = html.match(/["'](https?:\/\/[^"']*\.m3u8[^"']*)['"]/);
        if (m3u8) {
          cb({
            success: true,
            data: [new StreamResult({ name: "AnimeUnity", url: m3u8[1], headers: { Referer: BASE_URL + "/" } })],
          });
          return;
        }
        cb({ success: false, error: "Stream non trovato" });
        return;
      }

      cb({
        success: true,
        data: [new StreamResult({ name: "AnimeUnity", url: videoUrl, headers: { Referer: BASE_URL + "/" } })],
      });
    } catch (e) {
      cb({ success: false, error: e.toString() });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
