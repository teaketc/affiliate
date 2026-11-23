import type { LogLevel } from '../config/env';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

export interface Logger {
	debug(msg: string, fields?: LogFields): void;
	info(msg: string, fields?: LogFields): void;
	warn(msg: string, fields?: LogFields): void;
	error(msg: string, fields?: LogFields): void;
	child(fields: LogFields): Logger;
}

function serializeError(value: unknown): unknown {
	if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
	return value;
}

/** Structured JSON-lines logger (one JSON object per line on stdout/stderr). */
export function createLogger(level: LogLevel = 'info', base: LogFields = {}): Logger {
	const threshold = LEVELS[level];
	const write = (lvl: LogLevel, msg: string, fields?: LogFields) => {
		if (LEVELS[lvl] < threshold) return;
		const entry: LogFields = { time: new Date().toISOString(), level: lvl, msg, ...base };
		if (fields) for (const [k, v] of Object.entries(fields)) entry[k] = serializeError(v);
		const line = JSON.stringify(entry);
		if (lvl === 'error' || lvl === 'warn') process.stderr.write(line + '\n');
		else process.stdout.write(line + '\n');
	};
	return {
		debug: (m, f) => write('debug', m, f),
		info: (m, f) => write('info', m, f),
		warn: (m, f) => write('warn', m, f),
		error: (m, f) => write('error', m, f),
		child: (fields) => createLogger(level, { ...base, ...fields })
	};
}

export const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger
};
