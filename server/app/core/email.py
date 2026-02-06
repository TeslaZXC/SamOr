import aiosmtplib
from email.message import EmailMessage
from app.core.config import settings

async def send_email(to_email: str, subject: str, body: str):
    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.MAIL_SERVER,
            port=settings.MAIL_PORT,
            username=settings.MAIL_USERNAME,
            password=settings.MAIL_PASSWORD,
            use_tls=(settings.MAIL_PORT == 465),
            start_tls=(settings.MAIL_PORT != 465),
            timeout=5
        )
        return True
    except Exception:
        # Silently fail for dev/demo purposes (SMTP ports often blocked)
        # The main loop already prints the code to the console.
        return False
