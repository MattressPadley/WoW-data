import requests
import os
from dotenv import load_dotenv
from flask import Flask, request, redirect
import uuid

load_dotenv()

client_id = os.getenv("BNET_CLIENT_ID")
client_secret = os.getenv("BNET_CLIENT_SECRET")


def save_token(token):
    lines = []
    with open(".env", "r") as env_file:
        lines = env_file.readlines()

    with open(".env", "w") as env_file:
        token_written = False
        for line in lines:
            if line.startswith("BNET_ACCESS_TOKEN="):
                env_file.write(f"BNET_ACCESS_TOKEN={token}\n")
                token_written = True
            else:
                env_file.write(line)
        if not token_written:
            env_file.write(f"BNET_ACCESS_TOKEN={token}\n")


app = Flask(__name__)


@app.route("/auth")
def auth():
    # This route initiates the authentication process
    redirect_uri = "http://localhost:8000/callback"
    scope = ""
    state = str(uuid.uuid4())
    auth_url = f"https://oauth.battle.net/authorize?client_id={client_id}&redirect_uri={redirect_uri}&response_type=code&scope={scope}&state={state}"
    return redirect(auth_url)


@app.route("/callback")
def callback():
    code = request.args.get("code")
    token = request_token_from_bnet(code, client_id, client_secret)
    save_token(token)
    return "Authentication successful!"


def request_token_from_bnet(code, client_id, client_secret):
    url = "https://oauth.battle.net/token"
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": "http://localhost:8000/callback",
    }
    response = requests.post(url, data=payload)
    response_data = response.json()
    return response_data["access_token"]


if __name__ == "__main__":
    app.run(debug=True, port=8000)
