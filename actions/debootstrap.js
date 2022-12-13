import fs from 'fs'
import path from 'path'
import debos from '../debos.js'
function NewDebootstrapAction(entry) {
	const d = {
		Suite: '',
		Mirror: 'http://deb.debian.org/debian',
		Variant: '',
		KeyringPackage: entry['keyring-package'],
		KeyringFile: entry['keyring-file'],
		Certificate: '',
		PrivateKey: entry['private-key'],
		Components: ['main'], // Use main as default component
		MergedUsr: entry['merged-usr'] || true, // Use filesystem with merged '/usr' by default
		CheckGpg: entry['check-gpg'] || true // Be secure by default
	}

	d.listOptionFiles = ({RecipeDir}) => {
		const files = []
		for (const key of ['Certificate', 'PrivateKey', 'KeyringFile']) {
			d[key] && files.push(d[key] = path.join(RecipeDir, d[key]))	
		}
		return files
	}
	d.Verify = context => d.listOptionFiles(context).every(file => fs.existsSync(file))
	// Mount configuration files outside of recipes directory
	d.PreMachine = (context, m, args) => d.listOptionFiles(context).every(mount => m.AddVolume(path.dirname(mount)))
	d.RunSecondStage = context => {
		const cmdline = ['/debootstrap/debootstrap', '--no-check-gpg', '--second-stage']
		d.Components && cmdline.push('--components=' + d.Components.join(','))
		const c = debos.NewChrootCommandForContext(context)
		// Can't use nspawn for debootstrap as it wants to create device nodes
		c.ChrootMethod = 'CHROOT_METHOD_CHROOT'
		const log = path.join(context.Rootdir, 'debootstrap/debootstrap.log')
		c.Run("Debootstrap (stage 2)", ...cmdline)
		debos.Command.Run("debootstrap.log", "cat", log)
	}
	d.Run = context => {
		// d.LogStart() // TODO: FIXME
		const cmdline = ['debootstrap']
		cmdline.push(d.MergedUsr ? '--merged-usr' : '--no-merged-usr')
		const keyring = !d.CheckGpg ? '--no-check-gpg' : d.KeyringFile ? '--keyring=' + d.KeyringFile : ''
		keyring && cmdline.push(keyring)
		d.KeyringPackage && cmdline.push('--include=' + d.KeyringPackage)
		d.Certificate && cmdline.push('--certificate=' + d.Certificate)
		d.PrivateKey && cmdline.push('--private-key=' + d.PrivateKey)
		d.Components && cmdline.push('--components=' + d.Components.join(','))

		// TODO: FIXME drop the hardcoded amd64 assumption
		const foreign = context.Architecture != 'amd64'
		foreign && cmdline.push('--foreign', '--arch=' + context.Architecture)
		d.Variant && cmdline.push('--variant=' + d.Variant)
		cmdline.push('--exclude=usr-is-merged', d.Suite, context.Rootdir, d.Mirror, '/usr/share/debootstrap/scripts/unstable')
		// Make sure /etc/apt/apt.conf.d exists inside the fakemachine otherwise
	   	// debootstrap prints a warning about the path not existing.
		process.env.IN_FAKE_MACHINE && fs.mkdirSync('/etc/apt/apt.conf.d', {mode: os.ModePerm})
		if (debos.Command.Run("Debootstrap", ...cmdline)) return console.error('Error debootstrap')
		const log = path.join(context.Rootdir, 'debootstrap/debootstrap.log')	
		debos.Command.Run("debootstrap.log", "cat", log)
		if (foreign && d.RunSecondStage(context)) return console.error('Error Second Stage')

		// HACK
		const sources = path.join(context.Rootdir, 'etc/apt/sources.list')
		const srclist = fs.existsSync(sources) && fs.readFileSync(sources).toString() || ''
		// TODO: FIXME
		//fs.writeFileSync(`${srclist}\ndeb ${d.Mirror} ${d.Suite} ${d.Components.join(' ')}\n`, sources)

		// Cleanup resolv.conf after debootstrap
		const resolvconf = path.join(context.Rootdir, '/etc/resolv.conf')
		fs.existsSync(resolvconf) && fs.unlinkSync(resolvconf)
		const c = debos.NewChrootCommandForContext(context)
		return c.Run('apt clean', '/usr/bin/apt-get', 'clean')
	}
	d.PreNoMachine = () => {} // TODO: FIXME
	d.PostMachine = () => {} // TODO: FIXME
	return d
}

export default NewDebootstrapAction
