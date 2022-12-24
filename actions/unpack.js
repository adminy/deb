export default ({Compression, Origin, File, LogStart}) => ({
	verify: context => {
		if (!Origin && !File) return console.error("Filename can't be empty. Please add 'file' and/or 'origin' property.")	
		const archive = debos.newArchive(File)
		if (Compression) {
			if (archive.type() != debos.tar) return console.error("Option 'compression' is supported for Tar archives only.")
			archive.addOption('tarcompression', pf.compression)
		}
	},
	run: context => {
		// LogStart()
		const origin = Origin && context.origin(Origin) || context.artifactDir	
		const infile = debos.restrictedPath(origin, File)
		const archive = debos.newArchive(infile)
		Compression && archive.addOption('tarcompression', Compression)	
		return archive.unpack(context.rootdir)
	},
	preNoMachine: () => {},
	postMachine: () => {},
})
