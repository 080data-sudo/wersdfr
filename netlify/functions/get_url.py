import json
import os

def handler(event, context):
    # CORS headers
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
    }

    # Preflight
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Неверный формат запроса"}),
        }

    url = body.get("url", "").strip()
    quality = body.get("quality", "best[ext=mp4]/best")

    if not url:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "URL не указан"}),
        }

    # Basic URL validation
    if not ("youtube.com" in url or "youtu.be" in url):
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Поддерживаются только ссылки YouTube"}),
        }

    try:
        import yt_dlp

        ydl_opts = {
            "format": quality,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            # Не скачивать, только извлечь инфо
            "skip_download": True,
            # Таймаут для serverless окружения
            "socket_timeout": 15,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        if not info:
            raise ValueError("Не удалось получить информацию о видео")

        # Получаем прямую ссылку
        direct_url = info.get("url")

        # Для форматов с video+audio может быть requested_formats
        if not direct_url and info.get("requested_formats"):
            # Берём видео-формат (первый)
            direct_url = info["requested_formats"][0].get("url")

        if not direct_url:
            raise ValueError("Не удалось извлечь ссылку для скачивания")

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "title": info.get("title", ""),
                "url": direct_url,
                "thumbnail": info.get("thumbnail", ""),
                "duration": info.get("duration"),
                "uploader": info.get("uploader", ""),
                "ext": info.get("ext", "mp4"),
            }),
        }

    except Exception as e:
        error_msg = str(e)

        # Читаемые сообщения для частых ошибок
        if "Sign in" in error_msg or "age" in error_msg.lower():
            user_msg = "Видео ограничено по возрасту или требует авторизации"
        elif "Private" in error_msg or "private" in error_msg:
            user_msg = "Это приватное видео"
        elif "unavailable" in error_msg.lower() or "не доступно" in error_msg:
            user_msg = "Видео недоступно в вашем регионе или удалено"
        elif "copyright" in error_msg.lower():
            user_msg = "Видео заблокировано по авторским правам"
        else:
            user_msg = f"Ошибка: {error_msg[:200]}"

        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": user_msg}),
        }
