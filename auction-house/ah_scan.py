import os
import requests
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get the OAuth token from the environment variable
oauth_token = os.getenv('BNET_ACCESS_TOKEN')

# Define the API endpoint
api_endpoint = 'https://us.api.blizzard.com/data/wow/auctions/commodities'

# Set up the headers with the OAuth token
headers = {
    'Authorization': f'Bearer {oauth_token}'
}

# Make the API request
response = requests.get(api_endpoint, headers=headers)

# Check the response status and print the result
if response.status_code == 200:
    print('Success:', response.json())
else:
    print('Error:', response.status_code, response.text)