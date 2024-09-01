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

export const optimizeStreetViewURL = url => null === url ? null : url.replace(/&w=\d+/, '&w=1600').replace(
    /&h=\d+/,
    '&h=1600'
);
export const optimizePlaceImageURL = url => null === url ? null : url.replace(/=w\d+-h\d+/, '=w1600-h1600');

export const getDeliveryServices = deliveryData => {
    if (null === deliveryData) {
        return null;
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
