import path from 'path'

export default function({Origin, Offset, Source, Path, Partition, LogStart}) {
	// New syntax is based on 'origin' and 'source'
	// Check if we do not mix new and old syntax
	// TODO: remove deprecated syntax verification
	if (Path?.length) {
		// Deprecated syntax based on 'source' and 'path'
		console.error("Usage of 'source' and 'path' properties is deprecated.")
		console.error("Please use 'origin' and 'source' properties.")
		if (Origin.length) return console.error("Can't mix 'origin' and 'path'(deprecated option) properties")
		if (!Source) return console.error("'source' and 'path' properties can't be empty")
		// Switch to new syntax
		Origin = Source
		Source = Path
		Path = ''
	}
	return {
		Verify: () => (!Origin || !Source) && console.error("'origin' and 'source' properties can't be empty"),
		Run: context => {
			// LogStart()
			const [origin, found] = context.Origin(Origin)
			if (!found) return console.error(`Origin ${Origin} doesn't exist`)
			const content = fs.readFileSync(path.join(Source, origin))
			let devicePath = ''
			if (Partition) {
				for (const p of context.ImagePartitions) {
					if (p.Name == Partition) {
						devicePath = p.DevicePath
						break
					}
				}
				if (!devicePath) return console.error(`Failed to find partition named ${Partition}`)
			} else {
				devicePath = context.Image
			}
			const off = Buffer.from(Offset)
			const offset = (off.readUInt32BE(0) << 8) + off.readUInt32BE(4)
			const target = fs.openSync(devicePath, 'w')
			fs.writeSync(target, content, offset, content.length, 0)
			fs.fdatasyncSync(target)
			fs.closeSync(target)
		},
		PreNoMachine: () => {},
		PostMachine: () => {},
	}

}

