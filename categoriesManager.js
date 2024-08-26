export default class CategoriesManager {
    constructor(filePath) {
        this.filePath = filePath;
    }

    async getCategories(all = false) {
        try {
            const file = Bun.file(this.filePath);
            let categories = await file.json();

            if ( true === all ) {
                return categories;
            }

            return categories
                .filter(
                    category => true !== category.Exclude
                );
        } catch (error) {
            console.error(`Error reading or parsing the file ${this.filePath}: `, error);
            return []; // Return an empty array in case of error
        }
    }
}
