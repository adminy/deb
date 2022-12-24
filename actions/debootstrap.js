import fs from 'fs'
import path from 'path'
import debos from '../debos.js'
function NewDebootstrapAction(entry) {
	const d = {
		suite: '',
		mirror: 'http://deb.debian.org/debian',
		variant: '',
		keyringPackage: entry['keyring-package'],
		keyringFile: entry['keyring-file'],
		certificate: '',
		privateKey: entry['private-key'],
		components: ['main'], // Use main as default component
		mergedUsr: entry['merged-usr'] || true, // Use filesystem with merged '/usr' by default
		checkGpg: entry['check-gpg'] || true // Be secure by default
	}

	d.listOptionFiles = ({recipeDir}) => {
		const files = []
		for (const key of ['Certificate', 'PrivateKey', 'KeyringFile']) {
			d[key] && files.push(d[key] = path.join(recipeDir, d[key]))	
		}
		return files
	}
	d.verify = context => d.listOptionFiles(context).every(file => fs.existsSync(file))
	// Mount configuration files outside of recipes directory
	d.preMachine = (context, m, args) => d.listOptionFiles(context).every(mount => m.addVolume(path.dirname(mount)))
	d.runSecondStage = context => {
		const cmdline = ['/debootstrap/debootstrap', '--no-check-gpg', '--second-stage']
		d.components && cmdline.push('--components=' + d.components.join(','))
		const c = debos.newChrootCommandForContext(context)
		// Can't use nspawn for debootstrap as it wants to create device nodes
		c.chrootMethod = 'CHROOT_METHOD_CHROOT'
		const log = path.join(context.rootdir, 'debootstrap/debootstrap.log')
		c.run("Debootstrap (stage 2)", ...cmdline)
		debos.command.run("debootstrap.log", "cat", log)
	}
	d.run = context => {
		// d.logStart() // TODO: FIXME
		const cmdline = ['debootstrap']
		cmdline.push(d.mergedUsr ? '--merged-usr' : '--no-merged-usr')
		const keyring = !d.checkGpg ? '--no-check-gpg' : d.keyringFile ? '--keyring=' + d.keyringFile : ''
		keyring && cmdline.push(keyring)
		d.keyringPackage && cmdline.push('--include=' + d.keyringPackage)
		d.certificate && cmdline.push('--certificate=' + d.certificate)
		d.privateKey && cmdline.push('--private-key=' + d.privateKey)
		d.components && cmdline.push('--components=' + d.components.join(','))

		// TODO: FIXME drop the hardcoded amd64 assumption
		const foreign = context.architecture != 'amd64'
		foreign && cmdline.push('--foreign', '--arch=' + context.architecture)
		d.variant && cmdline.push('--variant=' + d.variant)
		cmdline.push('--exclude=usr-is-merged', d.suite, context.rootdir, d.mirror, '/usr/share/debootstrap/scripts/unstable')
		// Make sure /etc/apt/apt.conf.d exists inside the fakemachine otherwise
	   	// debootstrap prints a warning about the path not existing.
		process.env.IN_FAKE_MACHINE && fs.mkdirSync('/etc/apt/apt.conf.d', {mode: os.modePerm})
		if (debos.command.run("Debootstrap", ...cmdline)) return console.error('Error debootstrap')
		const log = path.join(context.rootdir, 'debootstrap/debootstrap.log')	
		debos.command.run("debootstrap.log", "cat", log)
		if (foreign && d.runSecondStage(context)) return console.error('Error Second Stage')

		// HACK
		const sources = path.join(context.rootdir, 'etc/apt/sources.list')
		const srclist = fs.existsSync(sources) && fs.readFileSync(sources).toString() || ''
		// TODO: FIXME
		//fs.writeFileSync(`${srclist}\ndeb ${d.mirror} ${d.suite} ${d.components.join(' ')}\n`, sources)

		// Cleanup resolv.conf after debootstrap
		const resolvconf = path.join(context.rootdir, '/etc/resolv.conf')
		fs.existsSync(resolvconf) && fs.unlinkSync(resolvconf)
		const c = debos.newChrootCommandForContext(context)
		return c.run('apt clean', '/usr/bin/apt-get', 'clean')
	}
	d.preNoMachine = () => {} // TODO: FIXME
	d.postMachine = () => {} // TODO: FIXME
	return d
}

export default NewDebootstrapAction
