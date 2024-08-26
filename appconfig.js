export default class AppConfig {
    constructor(filePath) {
        this.filePath = filePath;
    }

    async getActiveAreas() {
        try {
            const file = Bun.file(this.filePath);
            const json = await file.json();
            return json.areas.filter(area => area.active);
        } catch (error) {
            console.error(`Error reading or parsing the file ${this.filePath}: `, error);
            return []; // Return an empty array in case of error
        }
    }

    async getGeoFenceDataFromAreaName() {
        try {
            const json = await this.getActiveAreas();
            return json.map(area => area.geoFencing);
        } catch (error) {
            console.error(`Error reading or parsing the file ${this.filePath}: `, error);
            return []; // Return an empty array in case of error
        }
    }
}
