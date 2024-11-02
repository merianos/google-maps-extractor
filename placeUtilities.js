/**
 * Responsible to get a value from a nested arrays using the value path in the form of "$.[`indexNumber`][`indexNumber`]
 *
 * @example:
 * const myArray = [
 *     null,
 *     [
 *         null,
 *         [
 *             [
 *                 12,
 *                 11,
 *                 "Monday"
 *             ]
 *         ]
 *     ],
 *     null,
 *     null,
 *     []
 * ];
 * const value = getNestedValue(myArray, '$.[1].[1].[0].[3]');
 * console.log(value); // The result will be Monday
 *
 * @param {Array} array The array to search values in.
 * @param {String} path The path to search in.
 * @returns {*|null} The value if exists. Null otherwise.
 */
export const getNestedValue = (array, path) => {
    // Split the path into an array of indices
    const indices = path.match(/\d+/g).map(Number);

    let current = array;

    // Traverse the array following the path
    for (let i = 0; i < indices.length; i++) {
        if (current === null || current === undefined || !Array.isArray(current)) {
            return null;  // Return null if the path is invalid or the value is null
        }
        current = current[indices[i]];
    }

    // Return the value at the end of the path, or null if it's not found
    return current !== undefined ? current : null;
}

/**
 * This function is responsible to change the default width and height of the Google Maps provided street view image.
 *
 * The StreetView image URL looks like that:
 *
 * https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=jKmm-k1D5q4X0aYvXHH_ew&cb_client=search.gws-prod.gps&w=360&h=120&yaw=234.27156&pitch=0&thumbfov=100
 *
 * In the StreetView URL the w=360 indicates the image width.
 * In the StreetView URL the h=120 indicates the image height.
 *
 * With this function, we can set new Width and Height for the given StreetView image.
 *
 * @param {String} url The StreetView image URL.
 * @param {Number} width The new width of the image.
 * @param {Number} height The new height of the image.
 * @returns {null|*} Null if the url is null, otherwise the StreetView image URL with the new dimensions.
 */
export const optimizeStreetViewURL = (url, width = 1600, height = 1600) => {
    if (null === url) {
        return null;
    }

    return url.replace(/&w=\d+/, `&w=${width}`).replace(/&h=\d+/, `&h=${height}`);
}

/**
 * This function is responsible to change the default width and height of the Google Maps provided place image.
 *
 * The Place image URL looks like that:
 *
 * https://lh5.googleusercontent.com/p/AF1QipNL-5sIw0GyOxOfF2wOaZerQkmWDW5NdOWHADI=w140-h248-k-no
 *
 * In the Place image URL the w140 indicates the image width.
 * In the Place image URL the h248 indicates the image height.
 *
 * With this function, we can set new width and Height for the given Place image.
 *
 * @param {String} url The StreetView image URL.
 * @param {Number} width The new width of the image.
 * @param {Number} height The new height of the image.
 * @returns {null|*} Null if the url is null, otherwise the StreetView image URL with the new dimensions.
 */
export const optimizePlaceImageURL = (url, width = 1600, height = 1600) => {
    if (null === url) {
        return null;
    }

    return url.replace(/=w\d+-h\d+/, `=w${width}-h${height}`);
}

/**
 * This function is responsible to change the default size of the Google Maps provided place logo.
 *
 * The Place logo URL looks like that:
 *
 * https://lh4.googleusercontent.com/-oWPlACC9IXw/AAAAAAAAAAI/AAAAAAAAAAA/Q-NzVnv_bvk/s44-p-k-no-ns-nd/photo.jpg
 *
 * In the Place image URL the s44 indicates the image size.
 *
 * With this function, we can set new width and Height for the given Place image.
 *
 * @param {String} url The Logo image URL.
 * @param {Number} size The new size of the logo.
 * @returns {null|*} Null if the url is null, otherwise the logo image URL with the new size.
 */
export const optimizePlaceLogo = (url, size = 500) => {
    if (null === url) {
        return null;
    }

    return url.replace(/\/s\d+\-p/, `/s${size}-p`);
}

/**
 * This function is responsible to return a list of the provided delivery services of a place. The result of this
 * function will be an array of objects that contains the delivery service name, the delivery service logo and the
 * URL if the delivery service for the given place.
 *
 * @param {Array} deliveryData The delivery service data from Google Maps.
 * @returns {Array} An array of objects or null.
 */
export const getDeliveryServices = deliveryData => {
    if (null === deliveryData) {
        return [];
    }

    return deliveryData
        .map(
            service => {
                return {
                    serviceText: service?.[0]?.[2]?.[1] ?? service?.[0]?.[0] ?? null,
                    serviceLogo: service?.[0]?.[2]?.[0] ?? null,
                    serviceURL : service?.[1]?.[2]?.[0] ?? service?.[1]?.[2]?.[1]?.[0]
                }
            }
        );
}

/**
 * This function is responsible to extract the opening / closing hours of places.
 *
 * @param {Array} daysArray The working days array.
 * @param {Array} dayOrder The day names ordered in the same way you want the result to be ordered.
 * @returns {Array}
 */
export const processWorkingHours = (
    daysArray,
    dayOrder = [ "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή" ]
) => {
    if (null === daysArray) {
        return [];
    }

    const workingDays = daysArray
        .map(
            dayData => {
                if (null === dayData) {
                    return {
                        day         : null,
                        allDayOpen  : null,
                        allDayClosed: null,
                        workingHours: []
                    }
                }

                const dayName = dayData[0];
                const hoursArray = dayData[6];

                let allDayOpen = false;
                let allDayClosed = false;
                let workingHours = [];

                if (hoursArray === null) {
                    // If the hours are null, it means the place is closed
                    allDayClosed = true;
                } else if (hoursArray.length === 1 && hoursArray[0].every(value => value === 0)) {
                    // If the hours are all zeroes, the place is open all day
                    allDayOpen = true;
                } else {
                    // Otherwise, map over the hours and convert them to HHMM format
                    workingHours = hoursArray
                        .map(
                            time => {
                                const openingHour = time[0];
                                const openingMinute = time[1];
                                const closingHour = time[2];
                                const closingMinute = time[3];

                                // Format the opening and closing times as integers HHMM
                                const opening = openingHour + (openingMinute < 10 ? `0${openingMinute}` : openingMinute);
                                const closing = closingHour + (closingMinute < 10 ? `0${closingMinute}` : closingMinute);

                                return {
                                    opening     : parseInt(opening, 10),
                                    openingArray: [ time[0], time[1] ],
                                    closing     : parseInt(closing, 10),
                                    closingArray: [ time[2], time[3] ]
                                };
                            }
                        );
                }

                return {
                    day: dayName,
                    allDayOpen,
                    allDayClosed,
                    workingHours
                };
            }
        );

    return workingDays.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
}

/**
 * Responsible to return the place features as an array of objects.
 *
 * @param {Array|null} featuresArray The array of available features.
 * @returns {[]}
 */
export const processFeatures = featuresArray => {
    if (null === featuresArray) {
        return [];
    }

    const mergeDuplicateFeatures = featuresArray => {
        return featuresArray
            .map(
                feature => {
                    const featureMap = new Map();

                    feature
                        .features
                        .forEach(
                            f => {
                                if (featureMap.has(f.title)) {
                                    const existingFeature = featureMap.get(f.title);
                                    existingFeature.description = existingFeature.description || f.description;
                                    existingFeature.availableOptions = [
                                        ...new Set(
                                            [
                                                ...existingFeature.availableOptions,
                                                ...f.availableOptions
                                            ]
                                        )
                                    ];
                                } else {
                                    featureMap.set(f.title, { ...f });
                                }
                            }
                        );

                    return {
                        feature_slug : feature.feature_slug,
                        feature_title: feature.feature_title,
                        features     : Array.from(featureMap.values())
                    };
                }
            );
    }

    const features = featuresArray
        .map(
            feature => {
                const featureSlug = feature[0];
                const featureTitle = feature[1];
                const availableOptions = feature[2];

                const features = availableOptions
                    .map(
                        option => {
                            const title = option[1];
                            let description = option?.[2]?.[2]?.[3] ?? '';
                            let availableSubOptions = [];

                            // If option[4] is not null, extract available sub-options
                            if ("payments" === featureSlug && option?.[2]?.[4]?.[1]?.[0]?.[0]) {
                                availableSubOptions = option[2][4][1][0][0].map(subOption => subOption?.[2] ?? subOption?.[1]);
                            }

                            return {
                                title,
                                description,
                                availableOptions: availableSubOptions
                            };
                        }
                    );

                return {
                    feature_slug : featureSlug,
                    feature_title: featureTitle,
                    features
                };
            }
        );

    return mergeDuplicateFeatures(features);
}

/**
 * This function is responsible to extract the tickets options for a place.
 *
 * @param ticketServicesArray The list of tickets array
 * @returns {{name: string, services: *[]}|*[]}
 */
export const processTicketServices = ticketServicesArray => {
    if (null === ticketServicesArray) {
        return [];
    }

    const agentsList = {
        name    : '',
        services: []
    };

    for (let agency of ticketServicesArray) {
        agentsList.name = agency?.[0]?.[0] ?? null

        const services = agency?.[1] ?? null;

        if (null !== services) {
            for (let service of services) {
                const serviceItem = {
                    serviceName   : '',
                    serviceWebsite: '',
                    servicePrice  : ''
                }

                serviceItem.serviceName = service?.[2] ?? null;
                serviceItem.serviceWebsite = service?.[3]?.[0] ?? null;
                serviceItem.servicePrice = service?.[4] ?? null;

                agentsList.services.push(serviceItem);
            }
        }
    }

    return agentsList;
}

/**
 * Responsible to extract entrance tickets data.
 *
 * @param ticketServicesArray
 * @returns {{services: *[]}|*[]}
 */
export const processEntranceTicketServices = ticketServicesArray => {
    if (null === ticketServicesArray) {
        return [];
    }

    const agentsList = {
        services: []
    };

    for (let agency of ticketServicesArray) {
        const agencyName = agency?.[3]?.[0] ?? null

        const services = agency?.[2] ?? null;

        if (null !== services) {
            const serviceItem = {
                serviceName: agencyName,
                tickets    : []
            }

            for (let service of services) {
                const ticketItem = {
                    ticketName : null,
                    ticketLink : null,
                    ticketPrice: null
                }

                ticketItem.ticketName = service?.[1] ?? null;
                ticketItem.ticketLink = service?.[2]?.[0] ?? null;
                ticketItem.ticketPrice = service?.[4] ?? null;

                serviceItem.tickets.push(ticketItem);
            }

            agentsList.services.push(serviceItem);
        }
    }

    return agentsList;
}

/**
 * Responsible to extract the bus lanes and routes data.
 *
 * @param stopArrayData
 * @returns {(*&{routes})[]|null}
 */
export const extractBusStopData = stopArrayData => {
    if (null === stopArrayData) {
        return null;
    }

    let routeLanes = [];
    const routes = [];

    stopArrayData?.[16] &&
    stopArrayData[16]
        .forEach(
            transportTypeData => {
                const laneData = {
                    laneType: transportTypeData?.[0] ?? null,
                    lanes   : []
                }

                transportTypeData?.[2] &&
                transportTypeData[2]
                    .forEach(
                        lane => {
                            laneData
                                .lanes
                                .push(
                                    {
                                        name    : lane?.[5]?.[0]?.[1]?.[0],
                                        bgColor : lane?.[5]?.[0]?.[1]?.[2],
                                        txtColor: lane?.[5]?.[0]?.[1]?.[3]
                                    }
                                );
                        }
                    );

                routeLanes.push(laneData);
            }
        );

    stopArrayData?.[1] &&
    stopArrayData[1]
        .forEach(
            laneData => {
                const laneInfo = {
                    laneType: laneData[1],
                    routes  : []
                }

                laneData?.[2] &&
                laneData[2]
                    .forEach(
                        route => {
                            laneInfo
                                .routes
                                .push(
                                    {
                                        name    : route?.[1]?.[0]?.[0] ?? null,
                                        time    : route?.[1]?.[0]?.[3]?.[0]?.[0]?.[0]?.[2] ?? null,
                                        number  : route?.[5]?.[1]?.[1]?.[0] ?? null,
                                        bgColor : route?.[5]?.[1]?.[1]?.[2] ?? null,
                                        txtColor: route?.[5]?.[1]?.[1]?.[3] ?? null,
                                    }
                                );
                        }
                    );

                routes.push(laneInfo)
            }
        );

    const parseTime = time => {
        const [ timePart, modifier ] = time.split(' ');
        let [ hours, minutes ] = timePart.split(':');
        if (modifier === 'μ.μ.') {
            hours = (parseInt(hours) === 12) ? '12' : (parseInt(hours) + 12).toString(); // Convert PM hours
        } else if (modifier === 'π.μ.') {
            hours = (parseInt(hours) === 12) ? '00' : hours; // Convert AM hours (12 becomes 00)
        }

        return new Date(0, 0, 0, hours, minutes);
    }

    for (let routeIdx in routes) {
        routes[routeIdx]
            .routes
            .sort((a, b) => parseTime(a.time) - parseTime(b.time));
    }

    return routeLanes
        .map(
            routeLane => {
                const route = routes.find(routeEntry => routeEntry.laneType === routeLane.laneType);

                return {
                    ...routeLane,
                    routes: [ ...route.routes ]
                }
            }
        );
}
