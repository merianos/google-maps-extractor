import { isPointInPolygon } from "./pageUtilities.js";

export const getTileGrid = (geoFencing, divideLat, divideLng) => {
    // LNG = WIDTH  count from small to large numbers
    // LAT = HEIGHT count from large to small numbers

    // Get min and max latitudes and longitudes from the geofencing data
    const minLat = Math.min(...geoFencing.map(point => point.lat)); // Bottom Value
    const maxLat = Math.max(...geoFencing.map(point => point.lat)); // Top Value
    const minLng = Math.min(...geoFencing.map(point => point.lng)); // Left Value
    const maxLng = Math.max(...geoFencing.map(point => point.lng)); // Right Value

    const tileHeight = parseFloat((Math.abs(maxLat - minLat) / divideLat).toFixed(7));
    const tileWidth = parseFloat((Math.abs(maxLng - minLng) / divideLng).toFixed(7));

    // Generate the tile centers, starting from top-left to bottom-right
    let tiles = [];
    for (let lat = (maxLat + (tileHeight / 2)); lat >= (minLat + (tileHeight / 2)); lat -= tileHeight) {
        for (let lng = (minLng - (tileWidth / 2)); lng <= (maxLng - (tileWidth / 2)); lng += tileWidth) {
            let latRounded = parseFloat((lat - tileHeight)).toFixed(7);
            let lngRounded = parseFloat((lng + tileWidth)).toFixed(7);

            if (isPointInPolygon({ lat: latRounded, lng: lngRounded }, geoFencing)) {
                tiles
                    .push(
                        {
                            lat: parseFloat(latRounded),
                            lng: parseFloat(lngRounded)
                        }
                    );
            }
        }
    }

    return tiles;
}

// Example usage:
// const geoFencingData = [
//     { lat: 39.872301, lng: 19.430380 },
//     { lat: 39.862857, lng: 19.438504 },
//     { lat: 39.832972, lng: 19.412773 },
//     { lat: 39.836082, lng: 19.371029 },
//     { lat: 39.870822, lng: 19.372362 },
//     { lat: 39.872301, lng: 19.430380 }
// ];

// const topLeftTile = { lat: 39.833348, lng: 19.614566 };
// const bottomRightTile = { lat: 39.351372, lng: 20.140808 };
//
// const tiles = getTileGrid(geoFencingData, topLeftTile, bottomRightTile);
// console.log(tiles);
