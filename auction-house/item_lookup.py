import os
import json
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()


def get_item_data(access_token, region, item_id):
    url = f"https://{region}.api.blizzard.com/data/wow/item/{item_id}"
    params = {
        "namespace": "static-us",
        "locale": "en_US",  # You can change this to any other supported locale
        "access_token": access_token,
    }

    response = requests.get(url, params=params)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"API request failed: {response.status_code}, {response.text}")

def search_item_by_name(access_token, region, item_name, page=1):
    url = f"https://{region}.api.blizzard.com/data/wow/search/item"
    params = {
        "access_token": access_token,
        "namespace": "static-us",
        "name.en_US": item_name,
        "orderby": "name",
        "_pageSize": 10,
        "_page": page,
    }

    response = requests.get(url, params=params)

    if response.status_code == 200:
        data = response.json()
        if data['results']:
            return data['results']
        else:
            raise Exception("Item not found")
    else:
        raise Exception(f"API request failed: {response.status_code}, {response.text}")


def item_exists_in_db(collection, item_id):
    return collection.find_one({"id": item_id})


def insert_item_data(collection, item_data):
    collection.insert_one(item_data)


if __name__ == "__main__":

    token = os.getenv("BNET_ACCESS_TOKEN")
    input_item = input("Enter the item name to search: ")
    items = search_item_by_name(token, "us", input_item)
    for item in items:
        print(item["data"]["name"]["en_US"])
