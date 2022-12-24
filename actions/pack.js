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
		verify: () => {
			const compressionAvailable = tarOpts[d.compression]
			if (compressionAvailable) return
			return console.error(`Option
				'compression' has an unsupported type: ${d.compression}.
				Possible types are ${Object.keys(tarOpts).join(', ')}`)	
		},
		run: context => {
				// LogStart()
				const outfile = path.join(context.artifactDir, File)			
				const tarOpt = 'cf' + tarOpts[Compression]
				console.log('Compressing to', outfile)
				return debos.command.run('Packing', 'tar', tarOpt, outfile,
					'--xattrs', '--xattrs-include=*.*',
					'-C', context.rootdir, '.')
		},
		preNoMachine: () => {},
		postMachine: () => {},
	}
}

export default NewPackAction
