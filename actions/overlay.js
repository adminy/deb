import path from 'path'

export default ({
	Origin, // origin of overlay, here the export from other action may be used
	Source, // external path there overlay is
	Destination, // path inside of rootfs
	LogStart
}) => ({
		Verify: context => debos.RestrictedPath(context.Rootdir, Destination),
		Run: context => {
			// LogStart()
			const origin = context.RecipeDir
			//Trying to get a filename from exports first
			if (Origin && origin && !context.Origin(Origin)) return console.error('Origin not found ', Origin, ' in ', origin)
			const sourcedir = path.join(origin, Source)
			const destination = debos.RestrictedPath(context.Rootdir, Destination)
			console.log('Overlaying', sourcedir, 'on', destination)
			return debos.CopyTree(sourcedir, destination)
		},
		PreNoMachine: () => {},
		PostMachine: () => {},
})
