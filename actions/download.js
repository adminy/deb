import path from 'path'

function DownloadAction({
	Url, // URL for downloading
	Filename, // File name, overrides the name from URL.
	Unpack, // Unpack downloaded file to directory dedicated for download
	Compression, // compression type
	Name, // exporting path to file or directory(in case of unpack)
	LogStart
}) {
	const validateUrl = url => {
		url.Parse(Url)
		if (!['http', 'https'].includes(url.Scheme))
			return console.error('Unsupported URL is provided:', url)
		return url
	}
	const validateFilename = (context, url) => {
		const filename = path.basename(Filename || url.Path)
		if (!filename) return console.error('Incorrect filename is provided for', Url)
		return path.join(context.Scratchdir, filename)
	}
	const archive = filename => {
		const archive = debos.NewArchive(filename)
		if (archive.Type() === debos.Tar) {
			Compression && archive.AddOption('tarcompression', Compression)
		}
		return archive
	}
	return {
		validateUrl,
		validateFilename,
		archive,
		Verify: context => {
			if (!Name) return console.error("Property 'name' is mandatory for download action")
			const url = validateUrl() // TODO: FIXME
			const filename = validateFilename(context, url)
			Unpack && archive(filename)
		},
		Run: context => {
			// LogStart()
			const url = validateUrl() // TODO: FIXME
			const filename = d.validateFilename(context, url)
			let originPath = filename
			['http', 'https'].includes(url.Scheme) && debos.DownloadHttpUrl(url.String(), filename)
			if (Unpack) {
				const archive = archive(filename)		
				const targetdir = filename + '.d'
				archive.RelaxedUnpack(targetdir)
				originPath = targetdir
			}
			context.Origins[Name] = originPath
		},
		PreNoMachine: () => {},
		PostMachine: () => {},
	}
}

export default DownloadAction
