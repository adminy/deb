import path from 'path'

function DownloadAction({
	url, // URL for downloading
	filename, // File name, overrides the name from URL.
	unpack, // Unpack downloaded file to directory dedicated for download
	compression, // compression type
	name, // exporting path to file or directory(in case of unpack)
	logStart
}) {
	const validateUrl = url => {
		url.parse(Url)
		if (!['http', 'https'].includes(url.scheme))
			return console.error('Unsupported URL is provided:', url)
		return url
	}
	const validateFilename = (context, url) => {
		const filename = path.basename(filename || url.path)
		if (!filename) return console.error('Incorrect filename is provided for', url)
		return path.join(context.scratchdir, filename)
	}
	const archive = filename => {
		const archive = debos.newArchive(filename)
		if (archive.type() === debos.tar) {
			compression && archive.addOption('tarcompression', compression)
		}
		return archive
	}
	return {
		validateUrl,
		validateFilename,
		archive,
		verify: context => {
			if (!Name) return console.error("Property 'name' is mandatory for download action")
			const url = validateUrl() // TODO: FIXME
			const filename = validateFilename(context, url)
			unpack && archive(filename)
		},
		run: context => {
			// LogStart()
			const url = validateUrl() // TODO: FIXME
			const filename = d.validateFilename(context, url)
			let originPath = filename
			['http', 'https'].includes(url.scheme) && debos.downloadHttpUrl(url.string(), filename)
			if (Unpack) {
				const archive = archive(filename)		
				const targetdir = filename + '.d'
				archive.relaxedUnpack(targetdir)
				originPath = targetdir
			}
			context.origins[Name] = originPath
		},
		preNoMachine: () => {},
		postMachine: () => {},
	}
}

export default DownloadAction
