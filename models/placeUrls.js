export const PlaceUrls = (sequelize, DataTypes) => {
    return sequelize.define(
        'PlaceUrls',
        {
            id      : {
                type        : DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey  : true,
            },
            hash    : {
                type     : DataTypes.STRING,
                allowNull: false
            },
            url     : {
                type     : DataTypes.TEXT,
                allowNull: false
            },
            area    : {
                type     : DataTypes.STRING,
                allowNull: false
            },
            category: {
                type     : DataTypes.STRING,
                allowNull: false
            },
            lat     : {
                type     : DataTypes.FLOAT,
                allowNull: false
            },
            lng     : {
                type     : DataTypes.FLOAT,
                allowNull: false
            },
            scrapped: {
                type     : DataTypes.BOOLEAN,
                allowNull: false
            }
        },
        {
            indexes: [
                {
                    unique: true,
                    fields: [
                        'hash',
                        {
                            attribute: 'url',
                            length: 191
                        }
                    ]
                },
                {
                    name  : 'url',
                    fields: [
                        {
                            attribute: 'url',
                            length: 191
                        }
                    ]
                },
                {
                    name  : 'area',
                    fields: [
                        'area'
                    ]
                },
                {
                    name  : 'category',
                    fields: [
                        'category'
                    ]
                },
                {
                    name  : 'lat',
                    fields: [
                        'lat'
                    ]
                },
                {
                    name  : 'lng',
                    fields: [
                        'lng'
                    ]
                },
                {
                    name: 'scrapped',
                    fields: [
                        'scrapped'
                    ]
                }
            ]
        }
    );
}
