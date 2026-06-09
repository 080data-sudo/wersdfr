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

  const { url = "" } = body;
  if (!url.trim()) return respond(400, { error: "URL не указан" }, headers);

  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (!match) return respond(400, { error: "Неверная ссылка YouTube" }, headers);

  const videoId = match[1];

  try {
    const { Innertube } = require("youtubei.js");

    const yt = await Innertube.create({ generate_session_locally: true });
    const info = await yt.getBasicInfo(videoId, "TV_EMBEDDED");

    const formats = info.streaming_data?.formats || [];
    const adaptiveFormats = info.streaming_data?.adaptive_formats || [];
    const allFormats = [...formats, ...adaptiveFormats];

    // Прогрессивный формат (видео + аудио вместе)
    const progressive = allFormats
      .filter(f => f.has_video && f.has_audio)
      .sort((a, b) => (b.width || 0) - (a.width || 0));

    const format = progressive[0] || allFormats[0];
    if (!format) return respond(500, { error: "Форматы не найдены" }, headers);

    const downloadUrl = format.decipher(yt.session.player);

    return respond(200, {
      title: info.basic_info?.title || "Видео",
      url: downloadUrl,
      thumbnail: info.basic_info?.thumbnail?.[0]?.url || "",
      duration: info.basic_info?.duration || 0,
      quality: format.quality_label || "",
    }, headers);

  } catch (err) {
    let msg = err.message || "Ошибка";
    if (msg.includes("private"))    msg = "Приватное видео";
    if (msg.includes("available"))  msg = "Видео недоступно";
    return respond(500, { error: msg }, headers);
  }
};

function respond(code, data, headers) {
  return { statusCode: code, headers, body: JSON.stringify(data) };
}
