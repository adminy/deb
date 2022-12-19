export default ({Compression, Origin, File, LogStart}) => ({
	Verify: context => {
		if (!Origin && !File) return console.error("Filename can't be empty. Please add 'file' and/or 'origin' property.")	
		const archive = debos.NewArchive(File)
		if (Compression) {
			if (archive.Type() != debos.Tar) return console.error("Option 'compression' is supported for Tar archives only.")
			archive.AddOption('tarcompression', pf.Compression)
		}
	},
	Run: context => {
		// LogStart()
		const origin = Origin && context.Origin(Origin) || context.artifactDir	
		const infile = debos.RestrictedPath(origin, File)
		const archive = debos.NewArchive(infile)
		Compression && archive.AddOption('tarcompression', Compression)	
		return archive.Unpack(context.Rootdir)
	},
	PreNoMachine: () => {},
	PostMachine: () => {},
})
