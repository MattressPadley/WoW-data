import json
import inspect
from wowapi.WoWapi import WoWAPI
from dotenv import load_dotenv
from pylog import get_logger
import logging
import os
from datetime import datetime

load_dotenv()

api_logger = get_logger(
    "wowapi.WoWapi",
    console=False,
    file=False,
    mongo_uri="mongodb://localhost:27018",
    mongo_db_name="logs",
    mongo_collection_name="testing",
    log_level=logging.DEBUG,
    app_name="WowAPI Test Script",
)

script_logger = get_logger(
    "api-test",
    console=True,
    file=False,
    mongo_uri="mongodb://localhost:27018",
    mongo_db_name="logs",
    mongo_collection_name="testing",
    log_level=logging.DEBUG,
    app_name="WowAPI Test Script",
)

def print_json(data):
    """Print JSON data in a readable format."""
    print(json.dumps(data, indent=2))

def save_result_to_json(method_name, result):
    """Save the API result to a JSON file in the results folder."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{method_name}_{timestamp}.json"

    # Create the results directory if it doesn't exist
    os.makedirs("results", exist_ok=True)

    filepath = os.path.join("results", filename)
    with open(filepath, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Result saved to {filepath}")

def test_endpoint(api, method_name, *args, **kwargs):
    """Test a specific endpoint, print the result, and save it to a JSON file."""
    method = getattr(api, method_name, None)
    if not method:
        print(f"Error: Method '{method_name}' not found in WoWAPI class.")
        return

    try:
        result = method(*args, **kwargs)
        print(f"\nResult from {method_name}:")
        print(f"Arguments: {args}")
        print(f"Keyword Arguments: {kwargs}")
        print_json(result)
        save_result_to_json(method_name, result)
    except Exception as e:
        print(f"Error occurred while calling {method_name}: {str(e)}")

def get_api_methods():
    """Get all public methods from the WoWAPI class."""
    return [name for name, func in inspect.getmembers(WoWAPI, predicate=inspect.isfunction)
            if not name.startswith('_')]

def prompt_for_args(method):
    """Prompt the user for arguments based on the method's signature."""
    sig = inspect.signature(method)
    args = []
    kwargs = {}
    for param_name, param in sig.parameters.items():
        if param_name == 'self':
            continue
        if param_name == 'search_term':
            value = input(f"Enter {param_name}: ")
            args.append(value)
        elif param_name == '_pagesize':
            value = input(f"Enter {param_name} (default 100): ")
            if value:
                kwargs['_pagesize'] = int(value)
        elif param_name == '_page':
            value = input(f"Enter {param_name} (default 1): ")
            if value:
                kwargs['_page'] = int(value)
        elif param.default == inspect.Parameter.empty:
            value = input(f"Enter {param_name}: ")
            args.append(int(value) if param.annotation == int else value)
        else:
            value = input(f"Enter {param_name} (default {param.default}): ")
            if value:
                kwargs[param_name] = int(value) if param.annotation == int else value
    return args, kwargs

def main():
    api = WoWAPI()
    methods = get_api_methods()

    while True:
        print("\nAvailable methods:")
        for i, method in enumerate(methods, 1):
            print(f"{i}. {method}")
        print("0. Exit")

        choice = input("Enter the number of the method you want to test (0 to exit): ")

        if choice == '0':
            break

        try:
            method_index = int(choice) - 1
            if 0 <= method_index < len(methods):
                method_name = methods[method_index]
                method = getattr(api, method_name)
                args, kwargs = prompt_for_args(method)
                test_endpoint(api, method_name, *args, **kwargs)
            else:
                print("Invalid choice. Please try again.")
        except ValueError:
            print("Invalid input. Please enter a number.")

if __name__ == "__main__":
    main()
