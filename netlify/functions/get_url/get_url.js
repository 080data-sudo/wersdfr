exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return respond(400, { error: "Неверный запрос" }, headers); }

  const { url = "", quality = "best" } = body;
  if (!url.trim()) return respond(400, { error: "URL не указан" }, headers);

  const qualityMap = {
    "best[ext=mp4]/best": "max",
    "bestvideo[height<=1080]": "1080",
    "bestvideo[height<=720]": "720",
    "bestvideo[height<=480]": "480",
    "bestaudio": "max",
  };
  const videoQuality = qualityMap[quality] || "720";
  const isAudio = quality.includes("audio");

  try {
    const cobaltRes = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        url,
        videoQuality,
        downloadMode: isAudio ? "audio" : "auto",
        audioFormat: isAudio ? "mp3" : "best",
        filenameStyle: "basic",
      }),
    });

    const data = await cobaltRes.json();

    if (data.status === "error") {
      return respond(500, { error: data.error?.code || "Ошибка сервиса" }, headers);
    }

    if (data.status === "redirect" || data.status === "tunnel") {
      // Берём метаданные через YouTube oEmbed (работает всегда)
      let title = "Видео", thumbnail = "";
      try {
        const oe = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        const meta = await oe.json();
        title = meta.title || "Видео";
        thumbnail = meta.thumbnail_url || "";
      } catch {}

      return respond(200, { title, url: data.url, thumbnail, duration: 0, quality: videoQuality }, headers);
    }

    return respond(500, { error: `Неожиданный ответ: ${data.status}` }, headers);

  } catch (err) {
    return respond(500, { error: err.message }, headers);
  }
};

function respond(code, data, headers) {
  return { statusCode: code, headers, body: JSON.stringify(data) };
}
