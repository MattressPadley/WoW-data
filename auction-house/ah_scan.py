import requests
import os
from dotenv import load_dotenv
import pandas as pd


load_dotenv()


def get_ah_commodities_data(access_token, region, namespace="dynamic-us"):
    url = f"https://{region}.api.blizzard.com/data/wow/auctions/commodities"
    params = {
        "namespace": namespace,
        "locale": "en_US",  # You can change this to any other supported locale
        "access_token": access_token,
    }

    response = requests.get(url, params=params)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"API request failed: {response.status_code}, {response.text}")


if __name__ == "__main__":
    # Get the access token
    try:
        token = os.getenv("BNET_ACCESS_TOKEN")
        # Fetch WoW instance data
        commodites_data = get_ah_commodities_data(token, "us")
        # Convert the commodities data to a DataFrame
        commodities_df = pd.DataFrame(commodites_data['auctions'])

        # Print the DataFrame as a table
        pd.set_option('display.max_rows', None)
        pd.set_option('display.max_columns', None)
        pd.set_option('display.width', None)
        pd.set_option('display.max_colwidth', None)
        print(commodities_df)

    except Exception as e:
        print(f"Error: {str(e)}")
