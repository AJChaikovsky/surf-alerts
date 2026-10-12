import asyncio
import os
from pathlib import Path

import resend
from dotenv import load_dotenv


# Load environment variables from backend/.env
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(env_path)


async def send_email(to: str, subject: str, html: str):
    resend.api_key = os.environ["RESEND_API_KEY"]

    params: resend.Emails.SendParams = {
        "from": os.environ["EMAIL_FROM"],
        "to": [to],
        "subject": subject,
        "html": html,
    }

    response = await resend.Emails.send_async(params)

    return response


async def main():
    recipient = os.environ["TEST_EMAIL_TO"]

    result = await send_email(
        to=recipient,
        subject="Surf Alerts - First Test Email",
        html="""
        <h2>Surf Alerts is working!</h2>
        <p>Your backend can now send email notifications.</p>
        <p>Next stop: automated surf forecasts!</p>
        """
    )

    print(f"Email request accepted: {result}")


if __name__ == "__main__":
    asyncio.run(main())
