import os
import requests
import datetime
import logging


# Create a logger for this module
logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

class WoWAPI:
    """
    A class to interact with the World of Warcraft API.

    This class provides methods to retrieve various data from the WoW API,
    including auction house commodities, item data, and item media.
    """

    def __init__(self, region="us"):
        """
        Initialize the WoWAPI instance.

        Args:
            region (str, optional): The region for API requests. Defaults to "us".
        """
        self.access_token = self._get_access_token()
        self.region = region
        self.base_url = f"https://{region}.api.blizzard.com"
        logger.info(f"WoWAPI initialized for region: {region}")

    @staticmethod
    def add_timestamp(item_data):
        """
        Add a timestamp to item data.

        Args:
            item_data (dict): The item data to add a timestamp to.

        Returns:
            dict: The item data with an added timestamp.
        """
        logger.debug("Adding timestamp to item data")
        item_data["ts"] = datetime.datetime.now(datetime.timezone.utc)

    def _get_access_token(self):
        """
        Retrieve the Blizzard API access token from environment variables.

        Returns:
            str: The access token.

        Raises:
            Exception: If the access token is not found in environment variables.
        """
        token = os.getenv("BNET_ACCESS_TOKEN")
        if not token:
            logger.error("Blizzard API access token not found in environment variables.")
            raise Exception("Blizzard API access token not found in environment variables.")
        logger.debug("Access token retrieved successfully")
        return token

    def _make_request(self, endpoint, params=None):
        """
        Make a request to the Blizzard API.

        Args:
            endpoint (str): The API endpoint to request.
            params (dict, optional): Additional parameters for the request. Defaults to None.

        Returns:
            dict: The JSON response from the API.

        Raises:
            requests.HTTPError: If the request fails.
        """
        if params is None:
            params = {}
        params['access_token'] = self.access_token
        url = f"{self.base_url}{endpoint}"
        logger.info(f"Making API request to: {url}")
        try:
            response = requests.get(url, params=params)
            response.raise_for_status()
            logger.debug(f"API request successful: {url}")
            return response.json()
        except requests.HTTPError as e:
            logger.error(f"API request failed: {url}. Error: {str(e)}")
            raise

    def _get_data(self, endpoint, namespace="static-us", locale="en_US", **extra_params):
        params = {
            "namespace": namespace,
            "locale": locale,
            **extra_params
        }
        return self._make_request(endpoint, params)

    # Auction House
    def get_ah_commodities_data(self):
        return self._get_data("/data/wow/auctions/commodities", namespace="dynamic-us")

    # Professions
    def get_professions_index(self):
        return self._get_data("/data/wow/profession/index")

    def get_profession(self, profession_id):
        return self._get_data(f"/data/wow/profession/{profession_id}")

    def get_profession_media(self, profession_id):
        return self._get_data(f"/data/wow/media/profession/{profession_id}")

    def get_profession_skill_tier(self, profession_id, skill_tier_id):
        return self._get_data(f"/data/wow/profession/{profession_id}/skill-tier/{skill_tier_id}")

    # Recipes
    def get_recipe(self, recipe_id):
        return self._get_data(f"/data/wow/recipe/{recipe_id}")

    def get_recipe_media(self, recipe_id):
        return self._get_data(f"/data/wow/media/recipe/{recipe_id}")

    # Item Classes
    def get_item_classes_index(self):
        return self._get_data("/data/wow/item-class/index")

    def get_item_class(self, item_class_id):
        return self._get_data(f"/data/wow/item-class/{item_class_id}")

    def get_item_subclass(self, item_class_id, item_subclass_id):
        return self._get_data(f"/data/wow/item-class/{item_class_id}/item-subclass/{item_subclass_id}")

    # Item Sets
    def get_item_sets_index(self):
        return self._get_data("/data/wow/item-set/index")

    def get_item_set(self, item_set_id):
        return self._get_data(f"/data/wow/item-set/{item_set_id}")

    # Items
    def search_items(self, search_term, _pagesize=100, _page=1):
        params = {
            "namespace": f"static-{self.region}",
            "name.en_US": search_term,
            "_pageSize": _pagesize,
            "_page": _page
        }
        return self._make_request("/data/wow/search/item", params)

    def get_item_data(self, item_id):
        return self._get_data(f"/data/wow/item/{item_id}")

    def get_item_media(self, item_id):
        return self._get_data(f"/data/wow/media/item/{item_id}")

    # Modified Crafting API
    def get_modified_crafting_index(self):
        return self._get_data("/data/wow/modified-crafting/index")

    def get_modified_crafting_category_index(self):
        return self._get_data("/data/wow/modified-crafting/category/index")

    def get_modified_crafting_category(self, category_id):
        return self._get_data(f"/data/wow/modified-crafting/category/{category_id}")

    def get_modified_crafting_reagent_slot_type_index(self):
        return self._get_data("/data/wow/modified-crafting/reagent-slot-type/index")

    def get_modified_crafting_reagent_slot_type(self, slot_type_id):
        return self._get_data(f"/data/wow/modified-crafting/reagent-slot-type/{slot_type_id}")
