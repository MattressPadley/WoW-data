import requests
import datetime
import os
from dotenv import load_dotenv
from pymongo import MongoClient


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


def add_timestamp(item_data):
    # Get current UTC datetime


    item_data["ts"] = datetime.datetime.now(datetime.timezone.utc)
    return item_data


if __name__ == "__main__":
    # Get the access token
    try:
        token = os.getenv("BNET_ACCESS_TOKEN")
        
        # Fetch WoW AH data
        commodites_data = get_ah_commodities_data(token, "us")

        # Connect to MongoDB
        client = MongoClient("mongodb://localhost:27017")
        db = client.get_database("wow")
        collection = db.get_collection("commodities")

        existing_ids = set(collection.distinct("id"))
        new_auctions = [auction for auction in commodites_data["auctions"] if auction["id"] not in existing_ids]
        
        if new_auctions is not None:

            ts_data = []
            for auction in new_auctions:
                ts_data.append(add_timestamp(auction))

            collection.insert_many(ts_data)
            print (f"Added {len(ts_data)} new auctions to the database.")
        else:
            print("No new auctions to add.")

    except Exception as e:
        print(f"Error: {str(e)}")
