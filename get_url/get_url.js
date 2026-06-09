onst ytdl = require("@distube/ytdl-core");
 
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
 
// Качество → itag или фильтр
const QUALITY_MAP = {
  "best":    null,                    // лучшее видео+аудио
  "1080p":   { quality: "highestvideo", filter: f => f.height <= 1080 && f.hasVideo },
  "720p":    { quality: "highestvideo", filter: f => f.height <= 720  && f.hasVideo },
  "480p":    { quality: "highestvideo", filter: f => f.height <= 480  && f.hasVideo },
  "audio":   { quality: "highestaudio", filter: f => !f.hasVideo && f.hasAudio },
};
 
exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: HEADERS, body: "" };
  }
 
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "Неверный формат запроса" });
  }
 
  const { url = "", quality = "best" } = body;
 
  if (!url.trim()) {
    return respond(400, { error: "URL не указан" });
  }
 
  if (!ytdl.validateURL(url)) {
    return respond(400, { error: "Это не ссылка YouTube" });
  }
 
  try {
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
 
    // Выбираем формат
    let format;
    const q = quality.replace(/[^a-z0-9]/g, "");
 
    if (q === "audio") {
      format = ytdl.chooseFormat(info.formats, {
        quality: "highestaudio",
        filter: "audioonly",
      });
    } else if (q === "1080p" || q === "720p" || q === "480p") {
      const maxH = parseInt(q);
      // Ищем прогрессивный (видео+аудио) формат с нужным разрешением
      const candidates = info.formats.filter(
        f => f.hasVideo && f.hasAudio && f.height && f.height <= maxH
      ).sort((a, b) => b.height - a.height);
 
      format = candidates[0] || ytdl.chooseFormat(info.formats, { quality: "highestvideo" });
    } else {
      // Лучшее прогрессивное (видео+аудио в одном файле)
      const progressive = info.formats.filter(f => f.hasVideo && f.hasAudio);
      progressive.sort((a, b) => (b.height || 0) - (a.height || 0));
      format = progressive[0] || ytdl.chooseFormat(info.formats, { quality: "highest" });
    }
 
    if (!format || !format.url) {
      return respond(500, { error: "Не удалось найти подходящий формат" });
    }
 
    return respond(200, {
      title:     videoDetails.title,
      url:       format.url,
      thumbnail: videoDetails.thumbnails?.at(-1)?.url || "",
      duration:  parseInt(videoDetails.lengthSeconds) || 0,
      quality:   format.qualityLabel || format.audioQuality || "",
      ext:       format.container || "mp4",
    });
 
  } catch (err) {
    let msg = err.message || "Неизвестная ошибка";
    if (msg.includes("Private"))              msg = "Это приватное видео";
    else if (msg.includes("not available"))   msg = "Видео недоступно или удалено";
    else if (msg.includes("age"))             msg = "Видео с возрастным ограничением";
    else if (msg.includes("copyright"))       msg = "Видео заблокировано по авторским правам";
 
    return respond(500, { error: msg });
  }
};
 
function respond(statusCode, data) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(data),
  };
}
 
