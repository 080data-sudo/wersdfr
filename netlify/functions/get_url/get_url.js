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
    const { Innertube } = await import("youtubei.js");

    const yt = await Innertube.create({ generate_session_locally: true });

    // Android-клиент — меньше ограничений на сервере
    const info = await yt.getBasicInfo(videoId, "ANDROID");

    const status = info.playability_status?.status;
    if (status && status !== "OK") {
      const reason = info.playability_status?.reason || status;
      return respond(500, { error: `YouTube: ${reason}` }, headers);
    }

    const formats = [
      ...(info.streaming_data?.formats || []),
      ...(info.streaming_data?.adaptive_formats || []),
    ];

    if (!formats.length) {
      return respond(500, { error: "Нет доступных форматов (возможно, блокировка по IP)" }, headers);
    }

    // Прогрессивный формат (видео + аудио)
    const progressive = formats
      .filter(f => f.has_video && f.has_audio)
      .sort((a, b) => (b.width || 0) - (a.width || 0));

    const format = progressive[0] || formats[0];
    const downloadUrl = format.decipher(yt.session.player);

    if (!downloadUrl) {
      return respond(500, { error: "Не удалось расшифровать URL (IP заблокирован YouTube)" }, headers);
    }

    return respond(200, {
      title: info.basic_info?.title || "Видео",
      url: downloadUrl,
      thumbnail: info.basic_info?.thumbnail?.[0]?.url || "",
      duration: info.basic_info?.duration || 0,
      quality: format.quality_label || "",
    }, headers);

  } catch (err) {
    // Возвращаем реальную ошибку для диагностики
    return respond(500, { error: err.message || "Неизвестная ошибка" }, headers);
  }
};

function respond(code, data, headers) {
  return { statusCode: code, headers, body: JSON.stringify(data) };
}
