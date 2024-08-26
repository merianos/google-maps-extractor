// noinspection JSUnusedGlobalSymbols

const process = require("process");
const args = process.argv.slice(2);
const parsedOptions = args
    .reduce(
        (acc, arg, index, array) => {
            if (arg.startsWith("--")) {
                const key = arg.substring(2);
                if (!array[index + 1] || array[index + 1].startsWith("-")) {
                    acc[key] = true;
                }
            } else if (arg.startsWith("-") && !arg.startsWith("--")) {
                const key = arg.substring(1);
                if (array[index + 1] && !array[index + 1].startsWith("-")) {
                    acc[key] = array[index + 1];
                } else {
                    acc[key] = true;
                }
            }
            return acc;
        },
        {}
    );

/**
 * Responsible to check if app argument exists.
 *
 * @example
 *  bun run index.js --drop-db
 *  hasArgument('drop-db'); // return true
 * @param argument
 * @returns {boolean}
 */
export function hasArgument(argument) {
    return Object.hasOwnProperty.call(parsedOptions, argument);
}

/**
 * Responsible to check if app option exists.
 *
 * @example
 *  bun run index.js -c 12
 *  hasArgument('c'); // return true
 * @param option
 * @returns {boolean}
 */
export function hasOption(option) {
    return Object.keys(parsedOptions).some(key => key === option || parsedOptions[key] === option);
}

/**
 * Responsible to check if app option exists.
 *
 * @example
 *  bun run index.js -c 12
 *  getArgument('c'); // return 12
 * @param option
 * @returns {boolean}
 */
export function getOption(option) {
    return parsedOptions[option] || null;
}
