import path from 'path'

const tarOpts = {
	gz: 'z',
	bzip2: 'j',
	xz: 'J',
	none: ''
}

function NewPackAction({Compression='gz', File='', LogStart}) {
	return {
		Compression, File,
		Verify: () => {
			const compressionAvailable = tarOpts[d.Compression]
			if (compressionAvailable) return
			return console.error(`Option
				'compression' has an unsupported type: ${d.Compression}.
				Possible types are ${Object.keys(tarOpts).join(', ')}`)	
		},
		Run: context => {
				// LogStart()
				const outfile = path.join(context.Artifactdir, File)			
				const tarOpt = 'cf' + tarOpts[Compression]
				console.log('Compressing to', outfile)
				return debos.Command.Run('Packing', 'tar', tarOpt, outfile,
					'--xattrs', '--xattrs-include=*.*',
					'-C', context.Rootdir, '.')
		},
		PreNoMachine: () => {},
		PostMachine: () => {},
	}
}

export default NewPackAction
