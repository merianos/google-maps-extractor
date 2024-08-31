# Google Maps Extractor

**Google Maps Extractor** is a JavaScript application designed to extract and collect data from Google Maps.

This tool allows users to define a specific geographic area by setting boundary coordinates and then select the desired categories of points of interest (POIs) within that region.

By systematically traversing the specified area, the scraper efficiently gathers detailed information about the identified POIs, such as their names, locations, and associated attributes.

## Dependencies

### Project Dependencies

To run this project, you will need the following dependencies installed:

- Docker or a MySQL Server.
- [Bun](https://bun.sh/) JavaScript runtime.

Note: These dependencies can be installed on most modern operating systems. Please refer to the official documentation for Docker, MySQL, and Bun for specific installation instructions.

### Dependencies installation
```bash
bun install
```

### Database

For the database you should run either the provided `docker-compose.yaml` or run a MySQL Server your self and provide it's credentials and database name in the `.env` file of the project.

_(Project contains a `.env.example` file. Rename it to `.env` and provide the MySQL information to the new file)_.

### Docker

If you decide to run the project using the `docker-compose-yaml` of the project, you should run in the root directory of this project the following command:

```bash
docker-compose up
```

## Operations

### Database Preparation

```bash
bun run loadURL
```

### Places URL Scrapper

```bash
bun run placesURLS
```

## Configuration

This project is designed to scrap data from pre-defined geo-fenced areas. To achieve that, the project comes with an `appconfig.js` file, that is letting the end user to define the maps area that needs to be scanned.

The JSON structure is as following:

```json
{
    "areas": [
        {
            "active": true,
            "name": "Corfu",
            "mapConfig": {
                "zoomLevel": 16,
                "divideLng": 9,
                "divideLat": 32
            },
            "geoFencing": [
                {
                    "lat": 39.838965,
                    "lng": 19.847241
                },
                {
                    "lat": 39.778709,
                    "lng": 19.972972
                },
                // ...
                {
                    "lat": 39.838965,
                    "lng": 19.847241
                }
            ]
        }
    ]
}
```
### Config Explanation

- **areas**: An array with all the configuration objects of the areas to be scrapped.
- **name**: The name of the area for distinction purposes.
- **mapConfig**: Configurations for the map scrapping process.
  - **zoomLevel**: At what zoom level the map should be scrapped
  - **divideLng**: How many times should geo-fenced area scrolled to the right to cover the whole scrapped area.
  - **divideLat**: How many times should geo-fenced area scrolled to the bottom to cover the whole scrapped area.
- **geoFencing**: An array of Lat/Lng objects representing points around the area that should be scrapped.

### mapConfig

Here you will find information on how I setup the mapConfig.

Let's suppose I want to scrap the following are on the map:

![Full area to scrap](img/total-area-to-scrap.png "Full Area To Scrap")

To fetch as many places as possible, I zoom in in a reasonable zoom level and I set the `mapConfig.zoomLevel` to this value.

For my example, a reasonable zoom level is a `19.63`.

![Zoom Level Value](img/zoom-level-value.png "Zoom Level Value")

Now, keeping this zoom level active, I manually scroll from left to right until I cover the whole area of the island and I count the times I scrolled from Left to Right in order to set the number value to the `mapConfig.divideLng`.


https://github.com/user-attachments/assets/1f8fa742-5d21-47f8-b783-782afbcda646
