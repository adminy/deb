import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'
import fs from 'fs'
import {tmpdir} from 'os'
import debos from './debos.js'
import Parse from './actions/index.js'

const checkForHost = ([k, v]) => {
	const isLocal = ['localhost', '127.0.0.1', '::1'].find(ip => v.includes(ip))
	isLocal && console.warn(
		`WARNING: Environment variable ${k} contains a reference to ${v}.
		This may not work when running from fakemachine.
		Consider using an address that is valid on your network.`
	)
	return isLocal
}

const options = yargs(hideBin(process.argv))
	.option('backend', {
		aliases: ['-fakemachine-backend', 'b'],
		describe: 'Fakemachine backend to use',
		choices: ['kvm', 'qemu', 'uml', 'auto'],
		default: 'auto'
	})
	.option('artifactDir', { describe: 'Directory for packed archives and ostree repositories', default: process.cwd()})
	.option('internalImage', {hidden: true})
	.option('templateVars', {alias: 't', describe: 'Template variables (use -t VARIABLE:VALUE syntax)', default: []})
	.option('debugShell', {describe: 'Fall into interactive shell on error', default: false})
	.option('shell', {alias: 's', describe: 'Redefine interactive shell binary', default: '/bin/bash'})
	.option('scratchSize', {describe: 'Size of disk backed scratch space'})
	.option('cpus', {alias: 'c', describe: 'Number of CPUs to use for build VM', default: 2})
	.option('memory', {alias: 'm', describe: 'Amount of memory for build VM in Megabytes (MB)', default: 2 * 1024})
	.option('showBoot', {describe: 'Show boot/console messages from the fake machine'})
	.option('environVars', {alias: 'e', describe: 'Environment variables (use -e VARIABLE:VALUE syntax)'})
	.option('verbose', {alias: 'v', describe: 'Verbose output', default: true})
	.option('printRecipe', {describe: 'Print final recipe', default: false})
	.option('dryRun', {describe: 'Compose final recipe to build but without any real work started', default: false})
	.option('disableFakeMachine', {describe: 'Do not use fakemachine.', default: true})
	.argv
const context = {}

// These are the environment variables that will be detected on the
// host and propagated to fakemachine. These are listed lower case, but
// they are detected and configured in both lower case and upper case.
const environ_vars = [ 'http_proxy', 'https_proxy', 'ftp_proxy', 'rsync_proxy', 'all_proxy', 'no_proxy' ]

const main = () => {

	if (!options._.length) return console.error('No recipe given!')

	if (options.disableFakeMachine && options.backend != 'auto')
		return console.error('--disable-fakemachine and --fakemachine-backend are mutually exclusive')

	// Set interactive shell binary only if '--debug-shell' options passed
	if (options.debugShell) {
		context.debugShell = options.shell
	}

	if (options.printRecipe) {
		context.printRecipe = options.printRecipe
	}

	if (options.verbose) {
		context.verbose = options.verbose
	}

	const file = path.resolve(...options._)
	const r = Parse(file, options.printRecipe, options.verbose, options.templateVars)

	/* If fakemachine is used the outer fake machine will never use the
		* scratchdir, so just set it to /scratch as a dummy to prevent the
		* outer debos creating a temporary directory */
	context.scratchdir = '/scratch'

	let runInFakeMachine = true
	let m;
	if (options.disableFakeMachine || process.env.IN_FAKE_MACHINE) {
		runInFakeMachine = false
	} else {
		// attempt to create a fakemachine
		m = fakemachine.newMachineWithBackend(options.backend)
		// fallback to running on the host unless the user has chosen a specific backend
		runInFakeMachine = false
		if (!m || options.backend != 'auto') return console.error('error creating fakemachine')
	}

	// if running on the host create a scratchdir
	if (!runInFakeMachine && !process.env.IN_FAKE_MACHINE) {
		console.warn('fakemachine not supported, running on the host!')
		context.scratchdir = tmpdir('.debos-')		
	}

	context.rootdir = path.join(context.scratchdir, 'root')
	context.image = options.internalImage
	context.recipeDir = path.dirname(file)
	context.artifactDir = options.artifactDir
	if (!context.artifactDir) {
		context.artifactDir = path.resolve(process.cwd())
	}

	// Initialise origins map
	context.origins = {
		artifacts: context.artifactDir,
		filesystem: context.rootdir,
		recipe: context.recipeDir
	}
	context.architecture = r.architecture
	context.state = debos.success
	// Initialize environment variables map
	context.environVars = {}
	// First add variables from host
	for (const key in environ_vars) {
		const lowerKey = key.toLowerCase() // lowercase not really needed
		const lowerVal = process.env[lowerKey]
		if (lowerVal) {
			context.environVars[lowerVar] = lowerVal
		}
		const upperKey = key.toUpperCase()
		const upperVal = process.env[upperKey]
		if (upperVal) {
			context.environVars[upperVar] = upperVal
		}

	}
	// Then add/overwrite with variables from command line
	options.environVars = {...process.env}
	for (const [k, v] of Object.entries(options.environVars)) {
		// Allows the user to unset environ variables with -e
		!v && delete context.environVars[k]
		if (v) {
			context.environVars[k] = v
		}
	}

	const everyAction = cb => r.actions.map(action => cb(action))

	everyAction(action => action.verify(context))

	if (options.dryRun) return console.log('==== Recipe done (Dry run) ====')
	if (runInFakeMachine) {
		const args = []
		m.setMemory(options.memory)
		m.setNumCPUs(options.cpus)
		options.scratchSize && m.setScratch(options.scratchSize, "")
		m.setShowBoot(options.showBoot)
		// Puts in a format that is compatible with output of os.environ()
		const envsExist = Object.keys(context.environVars).length
		envsExist && m.setEnviron(Object.entries(context.environVars)
			.filter(checkForHost).map(([k, v]) => `${k}="${v}"`).join('\n'))
		m.addVolume(context.artifactDir)
		args.push('--artifactdir', context.artifactDir)
		for (const [k, v] of Object.entries(options.templateVars)) {
			args.push('--template-var', `${k}:"${v}"`)
		}
		for (const [k, v] of Object.entries(options.environVars)) {
			args.push('--environ-var', `${k}:"${v}"`)
		}
		m.addVolume(context.recipeDir)
		args.push(file)
		options.debugShell && args.push('--debug-shell', '--shell', options.shell)
		everyAction(action => action.preMachine(context, m, args))
		m.runInMachineWithArgs(args)
		everyAction(action => action.postMachine(context))
		return console.log('==== Recipe done ====')
	}

	!process.env.IN_FAKE_MACHINE && everyAction(action => action.preNoMachine(context))

	// Create Rootdir
	!fs.existsSync(context.rootdir) && fs.mkdirSync(context.rootdir, { mode: 0o755 })
	everyAction(action => action.run(context))
	!process.env.IN_FAKE_MACHINE &&
		everyAction(action => action.postMachine(context)) && 
		console.log('==== Recipe done ====')

}
main()
