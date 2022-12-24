import path from 'path'
import debos from '../debos.js'
export default ({
	Origin, // origin of overlay, here the export from other action may be used
	Source, // external path there overlay is
	Destination, // path inside of rootfs
	LogStart
}) => ({
		verify: context => debos.restrictedPath(context.rootdir, Destination),
		run: context => {
			// LogStart()
			const origin = context.recipeDir
			//Trying to get a filename from exports first
			if (Origin && origin && !context.origin(Origin)) return console.error('Origin not found ', Origin, ' in ', origin)
			const sourcedir = path.join(origin, Source)
			const destination = debos.restrictedPath(context.rootdir, Destination)
			console.log('Overlaying', sourcedir, 'on', destination)
			return debos.copyTree(sourcedir, destination)
		},
		preNoMachine: () => {},
		postMachine: () => {},
})
