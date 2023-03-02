import type {Dirent as NodeDirent, ObjectEncodingOptions} from "node:fs"
import {readdirSync} from "node:fs"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

/**
 * This is additional metadata about a dirent.
 */
export type DirentMetaData = {
	/** The depth of the directory being traversed. */
	readonly depth: number;
	/** The path of the dirent. */
	readonly path: string;
}

/**
 * These are options for constructing a WalkError.
 */
export type WalkErrorOptions = {
	/** Wrapped error */
	readonly error: unknown;
} & DirentMetaData

/**
 * If an error is thrown while traversing a directory, it is wrapped in a WalkError.
 * A WalkError contains the original error of an `unknown` type and the metadata defined in the type `DirentMetaData`.
 */
export class WalkError extends Error implements DirentMetaData {
	override get name() {
		return "WalkError"
	}

	readonly depth: number
	readonly path: string
	/** The original error */
	error: unknown
	constructor({depth, error, path}: WalkErrorOptions) {
		super(`Failed to walk path "${path}"`)
		this.error = error
		this.path = path
		this.depth = depth
	}
}

/**
 * These are options for constructing a Dirent.
 */
export type DirentOptions = {
	/** Wrapped dirent */
	readonly dirent: NodeDirent;
} & DirentMetaData

/**
 * This is a small wrapper around node's `Dirent` to provide it's absolute path.
 */
export class Dirent implements NodeDirent, DirentMetaData {
	readonly depth: number
	readonly name: string
	readonly path: string

	/** Internal dirent */
	readonly #dirent: NodeDirent

	constructor({depth, dirent, path}: DirentOptions) {
		this.path = path
		this.#dirent = dirent
		this.name = dirent.name
		this.depth = depth
	}

	isFile(): boolean {
		return this.#dirent.isFile()
	}

	isDirectory(): boolean {
		return this.#dirent.isDirectory()
	}

	isBlockDevice(): boolean {
		return this.#dirent.isBlockDevice()
	}

	isCharacterDevice(): boolean {
		return this.#dirent.isCharacterDevice()
	}

	isSymbolicLink(): boolean {
		return this.#dirent.isSymbolicLink()
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	isFIFO(): boolean {
		return this.#dirent.isFIFO()
	}

	isSocket(): boolean {
		return this.#dirent.isSocket()
	}
}

/**
 * These are options for the walk function.
 */
export type WalkOptions = {
	/** The path to the directory start traversing from. */
	rootPath: URL;
	/** The maximum depth to traverse. Providing a 0 means that it will only walk the given directory. */
	depthLimit?: number;
} & ObjectEncodingOptions

/**
 * These are options for the walk function.
 */
export type WalkInternalOptions = {
	/** The path to the directory start traversing from. */
	rootPath: string;
	/** The maximum depth to traverse. Providing a 0 means that it will only walk the given directory. */
	depthLimit?: number;
	/** The current depth where the function is at. It is used to stop the recursion. */
	currentDepth: number;
} & ObjectEncodingOptions

/**
 * Recursively traverse a directory and yield all it's dirents (files and directories) and errors.
 *
 * @param options Options for the walk function.
 */
export function walk(url: URL): IterableIterator<Dirent | WalkError>
export function walk(options: WalkOptions): IterableIterator<Dirent | WalkError>
export function * walk(
	options: WalkOptions | URL,
): IterableIterator<Dirent | WalkError> {
	let internalOptions: WalkInternalOptions
	if (options instanceof URL) {
		internalOptions = {
			rootPath: fileURLToPath(options), // On Windows: C:/Users/jan/Projekte to C:\Users\jan\Projekte
			currentDepth: 0,
		}
	} else {
		internalOptions = {
			...options,
			rootPath: fileURLToPath(options.rootPath), // On Windows: C:/Users/jan/Projekte to C:\Users\jan\Projekte
			currentDepth: 0,
		}
	}

	yield * walkInternal(internalOptions)
}

/**
 * This is the internal part of the walker function.
 * It is hidden to provide a good api for the user.
 *
 * @param options Options for the walk function.
 */
function * walkInternal(
	options: WalkInternalOptions,
): IterableIterator<Dirent | WalkError> {
	// This can throw an error if the path is not a string nor a URL.
	const currentPath = options.rootPath

	// Read files and directories
	let currentDirents: NodeDirent[] = []
	try {
		currentDirents = readdirSync(currentPath, {
			...options,
			withFileTypes: true,
		})
	} catch (error: unknown) {
		yield new WalkError({
			path: currentPath,
			error,
			depth: options.currentDepth,
		})
	}

	// Loop through all files and directories in the current directory
	for (const dirent of currentDirents) {
		// Yield dirent... can be file or directory
		const path = join(currentPath, dirent.name)
		yield new Dirent({
			path,
			dirent,
			depth: options.currentDepth,
		})
		// Recursively traverse the directory until the desired depth is reached
		// TODO: Follow symlinks should be configurable
		if (dirent.isDirectory() && (options.depthLimit === undefined || options.currentDepth < options.depthLimit)) {
			// The constant `path` is now the path to the next directory
			// Start recursion. Read the next directories and yield all following dirents
			// No need to wrap this call in a try-catch-block, since any error that can occur would already have been yielded by the first try-catch-block
			yield * walkInternal({
				...options,
				rootPath: path,
				currentDepth: options.currentDepth + 1,
			})
		}
	}
}
