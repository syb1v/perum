/*
 * Logger wrapper.
 * In production (NODE_ENV=production) debug/info are no-ops so they tree-shake
 * and the bundle stays free of chatty logs. warn/error always go through so
 * Sentry + ops can still see real failures.
 */

const isProd = process.env.NODE_ENV === 'production';

type LogArgs = unknown[];

export const logger = {
    debug: (...args: LogArgs) => {
        if (!isProd) console.debug(...args);
    },
    info: (...args: LogArgs) => {
        if (!isProd) console.info(...args);
    },
    warn: (...args: LogArgs) => {
        console.warn(...args);
    },
    error: (...args: LogArgs) => {
        console.error(...args);
    },
};
