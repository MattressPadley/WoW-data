import requests
import os
from requests.auth import HTTPBasicAuth
from dotenv import load_dotenv

load_dotenv()

# Replace these values with your client ID, client secret, and token URL
client_id = os.getenv('BNET_CLIENT_ID')
client_secret = os.getenv('BNET_CLIENT_SECRET')
token_url = "https://oauth.battle.net/token"

def get_oauth_token(client_id, client_secret, token_url):
    auth = HTTPBasicAuth(client_id, client_secret)
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    data = {'grant_type': 'client_credentials'}

    response = requests.post(token_url, auth=auth, headers=headers, data=data)

    if response.status_code == 200:
        return response.json().get('access_token')
    else:
        raise Exception(f"Failed to obtain token: {response.status_code} {response.text}")

if __name__ == "__main__":
    try:
        token = get_oauth_token(client_id, client_secret, token_url)
        print(f"Access Token: {token}")
        with open('.env', 'a') as env_file:
            env_file.write(f'\nBNET_ACCESS_TOKEN={token}')
    except Exception as e:
        print(f"Error: {e}")
