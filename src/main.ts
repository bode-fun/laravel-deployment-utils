import {pathToFileURL} from "node:url"
import {chmodSync, chownSync, lstatSync, type Mode} from "node:fs"
import {argv, getuid, getgid, env} from "node:process"

import mri from "mri"
import {resolve} from "pathe"

import {Dirent, walk} from "./walk/index.js"

type ParsedArgs = {
	dry: boolean;
	uid: number;
	gid: number;
}

const parsedArgs = transformTypes(mri<ParsedArgs>(argv.slice(2), {
	boolean: ["dry"],
	alias: {
		dry: "d",
	},
	default: {
		uid: getuid?.().toString(),
		gid: getgid?.().toString(),
		dry: env["NODE_ENV"] === "development",
	},
}))

function transformTypes<T extends ParsedArgs>(object: T): T {
	object.uid = Number.parseInt(object.uid as unknown as string, 10)
	if (Number.isNaN(object.uid)) {
		throw new TypeError(`Could not convert ${object.uid} to a number.`)
	}

	object.gid = Number.parseInt(object.gid as unknown as string, 10)
	if (Number.isNaN(object.gid)) {
		throw new TypeError(`Could not convert ${object.gid} to a number.`)
	}

	return object
}

for (const path of parsedArgs._) {
	const absolutePath = resolve(path)
	const url = pathToFileURL(absolutePath)

	for (const dirent of walk(url)) {
		if (dirent instanceof Dirent) {
			// Since every file gets accessed, there is no need to follow symlinks.
			const {mode, gid, uid} = lstatSync(dirent.path)
			const adjustedMode = calculateGroupPermissions(mode)

			if (adjustedMode !== mode) {
				updateMode({mode: adjustedMode, path: dirent.path, dry: parsedArgs.dry})
			}

			if (gid !== parsedArgs.gid || uid !== parsedArgs.uid) {
				updateOwner({gid: parsedArgs.gid, uid: parsedArgs.uid, path: dirent.path, dry: parsedArgs.dry})
			}
		} else {
			throw dirent
		}
	}
}

function calculateGroupPermissions(mode: Mode): Mode {
	const modeInOctal = mode.toString(8)

	const ownerPermissionsPosition = 3
	const groupPermissionsPosition = 4
	const ownerPermissions = modeInOctal.at(ownerPermissionsPosition)!

	const newMode = modeInOctal.split("")
	newMode[groupPermissionsPosition] = ownerPermissions

	const newModeInOctal = newMode.join("")

	const newModeInDecimal = Number.parseInt(newModeInOctal, 8) as Mode
	if (Number.isNaN(newModeInDecimal)) {
		throw new TypeError(`Could not convert ${newModeInOctal} to a number.`)
	}

	return newModeInDecimal
}

type UpdateModeOptions = {
	dry: boolean;
	mode: Mode;
	path: string;
}

function updateMode({mode, path, dry}: UpdateModeOptions): void {
	if (dry) {
		console.log(`chmod ${mode} ${path}`)
	} else {
		chmodSync(path, mode)
	}
}

type UpdateOwnerOptions = {
	dry: boolean;
	gid: number;
	uid: number;
	path: string;
}

function updateOwner({dry, gid, uid, path}: UpdateOwnerOptions): void {
	if (dry) {
		console.log(`chown ${uid}:${gid} ${path}`)
	} else {
		chownSync(path, uid, gid)
	}
}
